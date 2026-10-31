//! Ports the transport cases of `src/main/sending.main.test.ts` and checks the
//! limits against a loopback server.

use super::loopback::{response, serve};
use super::*;
use std::io::Write;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;

fn get(url: &str) -> Prepared {
    Prepared { method: "GET".into(), url: url.into(), headers: Vec::new(), body: None }
}

fn limits(timeout_ms: u64, max_response_bytes: usize) -> Limits {
    Limits { timeout: Duration::from_millis(timeout_ms), max_response_bytes }
}

/// Accepts connections and keeps them open without answering.
async fn hang() -> (String, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move {
        let mut open = Vec::new();
        while let Ok((socket, _)) = listener.accept().await {
            open.push(socket);
        }
    });
    (format!("http://{address}"), task)
}

#[tokio::test(flavor = "multi_thread")]
async fn sends_method_headers_and_body_and_reads_the_response() {
    let base = serve(|received| {
        let echo = format!("{} {} {}|{}", received.head.lines().next().unwrap(), received.header("x-trace").unwrap_or("-"), received.header("content-type").unwrap_or("-"), received.body);
        response("201 Created", &[("x-mock", "yes"), ("set-cookie", "a=1"), ("set-cookie", "b=2")], echo.as_bytes())
    })
    .await;
    let request = Prepared {
        method: "POST".into(),
        url: format!("{base}/api/pets?limit=5"),
        headers: vec![("X-Trace".into(), " t-1 ".into()), ("Content-Type".into(), "application/json".into())],
        body: Some(Body::Text { text: "{\"name\":\"Rex\"}".into() }),
    };
    let http = Http::new().unwrap();
    let view = http.send(&request, SEND_LIMITS).await.unwrap();
    assert_eq!(view.status, 201);
    assert_eq!(view.status_text, "Created");
    assert_eq!(view.body, "POST /api/pets?limit=5 HTTP/1.1 t-1 application/json|{\"name\":\"Rex\"}");
    assert_eq!(view.url, format!("{base}/api/pets?limit=5"));
    assert!(view.headers.contains(&("x-mock".into(), "yes".into())));
    assert_eq!(view.headers.iter().filter(|(name, _)| name == "set-cookie").count(), 2);
    assert_eq!(view.size_bytes, view.body.len() as u64);
    assert!(!view.truncated);

    // A text body without a content type goes as text/plain, as with fetch.
    let plain = Prepared { headers: Vec::new(), ..request };
    assert!(http.send(&plain, SEND_LIMITS).await.unwrap().body.contains("text/plain;charset=UTF-8"));
}

#[tokio::test(flavor = "multi_thread")]
async fn sends_form_data_as_multipart() {
    let base = serve(|received| response("200 OK", &[], format!("{}\n{}", received.header("content-type").unwrap_or("-"), received.body).as_bytes())).await;
    let request = Prepared { method: "POST".into(), body: Some(Body::FormData { fields: vec![("name".into(), "Rex".into())] }), ..get(&base) };
    let view = Http::new().unwrap().send(&request, SEND_LIMITS).await.unwrap();
    assert!(view.body.starts_with("multipart/form-data; boundary="), "{}", view.body);
    assert!(view.body.contains("name=\"name\"\r\n\r\nRex\r\n"), "{}", view.body);
}

#[tokio::test(flavor = "multi_thread")]
async fn cuts_the_body_at_the_exact_limit() {
    let base = serve(|_| response("200 OK", &[], &[b'x'; 5000])).await;
    let http = Http::new().unwrap();
    let view = http.send(&get(&base), limits(5000, 1000)).await.unwrap();
    assert!(view.truncated);
    assert_eq!(view.body.len(), 1000);
    assert!(view.size_bytes > 1000 && view.size_bytes <= 5000, "{}", view.size_bytes);

    let exact = http.send(&get(&base), limits(5000, 5000)).await.unwrap();
    assert!(!exact.truncated);
    assert_eq!(exact.body.len(), 5000);
}

#[tokio::test(flavor = "multi_thread")]
async fn decompresses_gzip_and_drops_a_bom() {
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    encoder.write_all("\u{feff}{\"ok\":true}".as_bytes()).unwrap();
    let gzipped = Arc::new(encoder.finish().unwrap());
    let base = serve(move |received| {
        assert!(received.header("accept-encoding").is_some_and(|value| value.contains("gzip")));
        response("200 OK", &[("content-encoding", "gzip"), ("content-type", "application/json")], &gzipped)
    })
    .await;
    let view = Http::new().unwrap().send(&get(&base), SEND_LIMITS).await.unwrap();
    assert_eq!(view.body, "{\"ok\":true}");
}

#[tokio::test(flavor = "multi_thread")]
async fn follows_redirects_and_reports_the_final_url() {
    let base = serve(|received| match received.target() {
        "/start" => response("302 Found", &[("location", "/final")], b""),
        _ => response("200 OK", &[], received.target().as_bytes()),
    })
    .await;
    let view = Http::new().unwrap().send(&get(&format!("{base}/start")), SEND_LIMITS).await.unwrap();
    assert_eq!(view.body, "/final");
    assert_eq!(view.url, format!("{base}/final"));
}

#[tokio::test(flavor = "multi_thread")]
async fn stops_after_twenty_redirects() {
    let base = serve(|_| response("302 Found", &[("location", "/again")], b"")).await;
    let error = Http::new().unwrap().send(&get(&base), SEND_LIMITS).await.unwrap_err();
    assert_eq!(error.code, SendErrorCode::Network);
}

#[tokio::test(flavor = "multi_thread")]
async fn rejects_urls_it_cannot_send() {
    let http = Http::new().unwrap();
    assert_eq!(
        http.send(&get("/pets"), SEND_LIMITS).await.unwrap_err(),
        SendError::new(SendErrorCode::InvalidUrl, "\"/pets\" is not a complete URL. Select an environment with a base URL or enter an absolute URL.")
    );
    assert_eq!(
        http.send(&get("file:///etc/passwd"), SEND_LIMITS).await.unwrap_err(),
        SendError::new(SendErrorCode::InvalidUrl, "Only http:// and https:// requests can be sent (got file:).")
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn reports_a_real_refused_connection_and_a_real_timeout() {
    let closed = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = closed.local_addr().unwrap().port();
    drop(closed);
    let http = Http::new().unwrap();
    let refused = http.send(&get(&format!("http://127.0.0.1:{port}/")), limits(5000, 100)).await.unwrap_err();
    assert_eq!(
        refused,
        SendError::new(SendErrorCode::Refused, format!("Connection refused by 127.0.0.1:{port}: nothing is listening there. Is the server running and is the port right?"))
    );

    let (base, server) = hang().await;
    let timeout = http.send(&get(&base), limits(150, 100)).await.unwrap_err();
    assert_eq!(timeout, SendError::new(SendErrorCode::Timeout, "No response within 0.15 seconds."));
    server.abort();
}

#[tokio::test(flavor = "multi_thread")]
async fn cancel_stops_the_sends_in_flight_only() {
    let (base, server) = hang().await;
    let http = Arc::new(Http::new().unwrap());
    let pending = tokio::spawn({
        let http = http.clone();
        async move { http.send(&get(&base), limits(10_000, 100)).await }
    });
    tokio::time::sleep(Duration::from_millis(200)).await;
    http.cancel();
    let error = tokio::time::timeout(Duration::from_secs(2), pending).await.unwrap().unwrap().unwrap_err();
    assert_eq!(error, SendError::new(SendErrorCode::Canceled, "The request was canceled."));
    server.abort();

    let ok = serve(|_| response("200 OK", &[], b"later")).await;
    assert_eq!(http.send(&get(&ok), SEND_LIMITS).await.unwrap().body, "later");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_connection_closed_mid_response_is_a_reset() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            let _ = socket.write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 100\r\n\r\npartial").await;
            let _ = socket.shutdown().await;
        }
    });
    let error = Http::new().unwrap().send(&get(&format!("http://{address}/")), SEND_LIMITS).await.unwrap_err();
    assert!(matches!(error.code, SendErrorCode::Reset | SendErrorCode::Network), "{error:?}");
}

#[tokio::test(flavor = "multi_thread")]
async fn https_against_a_plain_server_is_a_tls_error() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            let _ = socket.write_all(b"HTTP/1.1 400 Bad Request\r\ncontent-length: 0\r\n\r\n").await;
            let _ = socket.shutdown().await;
        }
    });
    let error = Http::new().unwrap().send(&get(&format!("https://{address}/")), limits(5000, 100)).await.unwrap_err();
    assert_eq!(error.code, SendErrorCode::Tls, "{error:?}");
    assert_eq!(
        error.message,
        format!("TLS/certificate error for {address} (ERR_TLS_HANDSHAKE). The server's certificate is not trusted for this host.")
    );
}

#[test]
fn classifies_system_errors_found_anywhere_in_the_chain() {
    let url = Url::parse("https://api.example.invalid:8443/x").unwrap();
    #[derive(Debug)]
    struct Wrapper(io::Error);
    impl std::fmt::Display for Wrapper {
        fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("client error (Connect)")
        }
    }
    impl Error for Wrapper {
        fn source(&self) -> Option<&(dyn Error + 'static)> {
            Some(&self.0)
        }
    }
    let wrapped = |kind: io::ErrorKind| Wrapper(io::Error::other(io::Error::from(kind)));
    let cases = [
        (io::ErrorKind::ConnectionRefused, SendErrorCode::Refused, "Connection refused by api.example.invalid:8443"),
        (io::ErrorKind::ConnectionReset, SendErrorCode::Reset, "closed unexpectedly (ECONNRESET)"),
        (io::ErrorKind::BrokenPipe, SendErrorCode::Reset, "closed unexpectedly (EPIPE)"),
        (io::ErrorKind::TimedOut, SendErrorCode::Timeout, "Connecting to api.example.invalid:8443 timed out (ETIMEDOUT)."),
        (io::ErrorKind::PermissionDenied, SendErrorCode::Network, "Could not reach api.example.invalid:8443."),
    ];
    for (kind, code, message) in cases {
        let error = classify(&wrapped(kind), &url);
        assert_eq!(error.code, code, "{kind:?}");
        assert!(error.message.contains(message), "{kind:?}: {}", error.message);
    }

    #[derive(Debug)]
    struct Dns;
    impl std::fmt::Display for Dns {
        fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("dns error: no such host")
        }
    }
    impl Error for Dns {}
    assert_eq!(
        classify(&Dns, &url).message,
        "DNS lookup failed: \"api.example.invalid\" could not be resolved (ENOTFOUND). Check the host name and your network."
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn an_unknown_host_is_a_dns_error() {
    let error = Http::new().unwrap().send(&get("http://reqora-unknown-host.invalid/"), limits(10_000, 100)).await.unwrap_err();
    assert_eq!(error.code, SendErrorCode::Dns, "{error:?}");
}
