//! Sends a prepared request (`src/runner/prepare.ts`) the way the Electron
//! host did (`src/main/http/sendRequest.ts`): one deadline for the whole
//! exchange, the body cut at an exact byte limit, 20 redirects, decompression,
//! and transport failures classified into the same codes and messages.

pub mod secrets;
#[cfg(test)]
pub(crate) mod loopback;

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use reqwest::multipart::Form;
use reqwest::redirect::Policy;
use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::io;
use std::time::{Duration, Instant};
use tokio::sync::Notify;

/// Electron's `SEND_LIMITS`.
pub const SEND_LIMITS: Limits = Limits { timeout: Duration::from_secs(30), max_response_bytes: 10 * 1024 * 1024 };
/// What `fetch` follows; reqwest's default is 10.
pub const MAX_REDIRECTS: usize = 20;

#[derive(Debug, Clone, Copy)]
pub struct Limits {
    /// Covers connecting, redirects and reading the body.
    pub timeout: Duration,
    pub max_response_bytes: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Body {
    Text { text: String },
    FormData { fields: Vec<(String, String)> },
}

/// The fields of `PreparedRequest` the transport reads; the rest are ignored.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Prepared {
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<Body>,
}

/// `HttpResponseView`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseView {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub truncated: bool,
    /// Bytes received, including the chunk that crossed the limit.
    pub size_bytes: u64,
    pub time_ms: u64,
    pub url: String,
}

/// `SendErrorCode`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SendErrorCode {
    InvalidUrl,
    Timeout,
    Dns,
    Refused,
    Reset,
    Tls,
    Network,
    Canceled,
}

/// A failed send; the renderer reads it as `{ code, message }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SendError {
    pub code: SendErrorCode,
    pub message: String,
}

impl SendError {
    pub fn new(code: SendErrorCode, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

/// The HTTP client plus the signal `request_cancel` raises.
pub struct Http {
    client: Client,
    cancel: Notify,
}

impl Http {
    pub fn new() -> reqwest::Result<Self> {
        let client = Client::builder()
            // The system proxy is not supported yet (backlog); fetch ignored it too.
            .no_proxy()
            .redirect(Policy::limited(MAX_REDIRECTS))
            .user_agent(concat!("reqora/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self { client, cancel: Notify::new() })
    }

    /// Cancels every send in flight; later sends are not affected.
    pub fn cancel(&self) {
        self.cancel.notify_waiters();
    }

    pub async fn send(&self, request: &Prepared, limits: Limits) -> Result<ResponseView, SendError> {
        let url = parse_url(&request.url)?;
        let canceled = self.cancel.notified();
        tokio::pin!(canceled);
        canceled.as_mut().enable();
        let exchange = async {
            tokio::select! {
                biased;
                _ = &mut canceled => Err(SendError::new(SendErrorCode::Canceled, "The request was canceled.")),
                result = self.exchange(request, &url, limits.max_response_bytes) => result,
            }
        };
        match tokio::time::timeout(limits.timeout, exchange).await {
            Ok(result) => result,
            Err(_) => Err(SendError::new(SendErrorCode::Timeout, format!("No response within {} seconds.", limits.timeout.as_secs_f64()))),
        }
    }

    async fn exchange(&self, request: &Prepared, url: &Url, max_bytes: usize) -> Result<ResponseView, SendError> {
        let started = Instant::now();
        // fetch rejects a bad method or header with a TypeError, which it reports without a code.
        let method = Method::from_bytes(request.method.as_bytes()).map_err(|_| network(url, None))?;
        let mut headers = HeaderMap::new();
        for (name, value) in &request.headers {
            let name = HeaderName::from_bytes(name.trim().as_bytes()).map_err(|_| network(url, None))?;
            let value = HeaderValue::from_str(value.trim()).map_err(|_| network(url, None))?;
            headers.append(name, value);
        }
        let mut builder = self.client.request(method, url.clone());
        match &request.body {
            Some(Body::Text { text }) => {
                builder = builder.body(text.clone());
                if !headers.contains_key(CONTENT_TYPE) {
                    headers.insert(CONTENT_TYPE, HeaderValue::from_static("text/plain;charset=UTF-8"));
                }
            }
            Some(Body::FormData { fields }) => {
                let form = fields.iter().fold(Form::new(), |form, (name, value)| form.text(name.clone(), value.clone()));
                builder = builder.multipart(form);
            }
            None => {}
        }
        // After the body, so a content-type the user set wins as it does with fetch.
        builder = builder.headers(headers);

        let response = builder.send().await.map_err(|error| classify(&error, url))?;
        let status = response.status();
        let final_url = response.url().to_string();
        let headers = response_headers(response.headers());
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        let mut size = 0usize;
        let mut truncated = false;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|error| classify(&error, url))?;
            size += chunk.len();
            if size > max_bytes {
                truncated = true;
                let room = max_bytes - (size - chunk.len());
                bytes.extend_from_slice(&chunk[..room]);
                break;
            }
            bytes.extend_from_slice(&chunk);
        }
        // `TextDecoder` replaces invalid sequences and drops a leading BOM.
        let text = String::from_utf8_lossy(&bytes);
        let body = text.strip_prefix('\u{feff}').unwrap_or(&text).to_owned();
        Ok(ResponseView {
            status: status.as_u16(),
            status_text: status.canonical_reason().unwrap_or_default().to_owned(),
            headers,
            body,
            truncated,
            size_bytes: size as u64,
            time_ms: (started.elapsed().as_secs_f64() * 1000.0).round() as u64,
            url: final_url,
        })
    }
}

fn parse_url(text: &str) -> Result<Url, SendError> {
    let url = Url::parse(text).map_err(|_| {
        SendError::new(
            SendErrorCode::InvalidUrl,
            format!("\"{text}\" is not a complete URL. Select an environment with a base URL or enter an absolute URL."),
        )
    })?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(SendError::new(SendErrorCode::InvalidUrl, format!("Only http:// and https:// requests can be sent (got {}:).", url.scheme())));
    }
    Ok(url)
}

/// What `Headers.entries()` yields: lowercase names in order, repeated
/// values joined with ", ", except `set-cookie`, which stays one per entry.
fn response_headers(headers: &HeaderMap) -> Vec<(String, String)> {
    let mut names: Vec<&HeaderName> = headers.keys().collect();
    names.sort_by(|a, b| a.as_str().cmp(b.as_str()));
    let mut entries = Vec::new();
    for name in names {
        let values = headers.get_all(name).iter().map(|value| String::from_utf8_lossy(value.as_bytes()).into_owned());
        if name.as_str() == "set-cookie" {
            entries.extend(values.map(|value| (name.as_str().to_owned(), value)));
        } else {
            entries.push((name.as_str().to_owned(), values.collect::<Vec<_>>().join(", ")));
        }
    }
    entries
}

/// `url.host` in JS: the host plus a non-default port.
fn host(url: &Url) -> String {
    let host = url.host_str().unwrap_or_default();
    match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_owned(),
    }
}

fn network(url: &Url, code: Option<&str>) -> SendError {
    let code = code.map(|code| format!(" ({code})")).unwrap_or_default();
    SendError::new(SendErrorCode::Network, format!("Could not reach {}{code}.", host(url)))
}

/// Every error in the cause chain. `io::Error::source` skips the error it
/// wraps, so that one is visited explicitly.
fn causes<'a>(error: &'a (dyn Error + 'static)) -> Vec<&'a (dyn Error + 'static)> {
    let mut chain = Vec::new();
    let mut next = Some(error);
    while let Some(current) = next {
        if chain.len() >= 32 {
            break;
        }
        chain.push(current);
        next = match current.downcast_ref::<io::Error>().and_then(io::Error::get_ref) {
            Some(inner) => Some(inner as &(dyn Error + 'static)),
            None => current.source(),
        };
    }
    chain
}

/// The class and the Node-style code of one error of the chain.
fn system_code(error: &(dyn Error + 'static)) -> Option<(SendErrorCode, &'static str)> {
    if error.downcast_ref::<native_tls::Error>().is_some() {
        return Some((SendErrorCode::Tls, "ERR_TLS_HANDSHAKE"));
    }
    if let Some(error) = error.downcast_ref::<io::Error>() {
        let found = match error.kind() {
            io::ErrorKind::ConnectionRefused => (SendErrorCode::Refused, "ECONNREFUSED"),
            io::ErrorKind::ConnectionReset | io::ErrorKind::ConnectionAborted => (SendErrorCode::Reset, "ECONNRESET"),
            io::ErrorKind::BrokenPipe => (SendErrorCode::Reset, "EPIPE"),
            io::ErrorKind::TimedOut => (SendErrorCode::Timeout, "ETIMEDOUT"),
            _ => return None,
        };
        return Some(found);
    }
    // hyper-util and hyper only tell these apart by their messages.
    let message = error.to_string();
    if message.starts_with("dns error") {
        return Some((SendErrorCode::Dns, "ENOTFOUND"));
    }
    if message.contains("connection closed before message completed") {
        return Some((SendErrorCode::Reset, "ECONNRESET"));
    }
    None
}

/// `classifySendError`: a transport failure as a user-facing error naming the host.
pub fn classify(error: &(dyn Error + 'static), url: &Url) -> SendError {
    let found = causes(error).into_iter().find_map(system_code);
    let host = host(url);
    match found {
        Some((SendErrorCode::Dns, code)) => SendError::new(
            SendErrorCode::Dns,
            format!("DNS lookup failed: \"{}\" could not be resolved ({code}). Check the host name and your network.", url.host_str().unwrap_or_default()),
        ),
        Some((SendErrorCode::Refused, _)) => SendError::new(
            SendErrorCode::Refused,
            format!("Connection refused by {host}: nothing is listening there. Is the server running and is the port right?"),
        ),
        Some((SendErrorCode::Reset, code)) => SendError::new(SendErrorCode::Reset, format!("The connection to {host} was closed unexpectedly ({code}).")),
        Some((SendErrorCode::Timeout, code)) => SendError::new(SendErrorCode::Timeout, format!("Connecting to {host} timed out ({code}).")),
        Some((SendErrorCode::Tls, code)) => SendError::new(
            SendErrorCode::Tls,
            format!("TLS/certificate error for {host} ({code}). The server's certificate is not trusted for this host."),
        ),
        _ => network(url, None),
    }
}

#[cfg(test)]
mod tests;
