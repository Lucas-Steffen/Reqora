//! `request_send` and `request_cancel` (ADR-010). The WebView prepares the
//! request with placeholders where secrets go; here every placeholder is
//! checked against the stored workspace of the project, replaced by its value,
//! and the values are masked out of the response and of errors.

use crate::http::secrets::{encode_form, encode_uri_component, is_placeholder, mask, substitute};
use crate::http::{Http, Prepared, ResponseView, SendError, SEND_LIMITS};
use crate::ipc::{ErrorCode, IpcError};
use crate::store::workspace::WorkspaceStore;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendInput {
    pub project_id: String,
    pub prepared: Prepared,
    /// Placeholder → id of the secret variable it stands for.
    #[serde(default)]
    pub secret_refs: BTreeMap<String, String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct SendOutcome {
    pub response: ResponseView,
    /// Keys of secrets whose value did not open; they were sent as `{{key}}`.
    pub unresolved: Vec<String>,
}

/// Either rejection; both reach the renderer as `{ code, message }`.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum SendFailure {
    Send(SendError),
    Ipc(IpcError),
}

const BAD_PLACEHOLDER: &str = "A secret reference of the request is malformed.";

/// The placeholders with their values, the keys that did not open, and the
/// values to mask.
type Resolved = (Vec<(String, String)>, Vec<String>, Vec<String>);

fn resolve(store: &WorkspaceStore, input: &SendInput) -> Result<Resolved, IpcError> {
    if input.secret_refs.keys().any(|placeholder| !is_placeholder(placeholder)) {
        return Err(IpcError::new(ErrorCode::Invalid, BAD_PLACEHOLDER));
    }
    let ids: Vec<String> = input.secret_refs.values().cloned().collect();
    let found = store.send_secrets(&input.project_id, &ids)?;
    let (mut values, mut unresolved, mut secrets) = (Vec::new(), Vec::new(), Vec::new());
    for (placeholder, (key, value)) in input.secret_refs.keys().zip(found) {
        match value {
            Some(value) => {
                // Servers often echo the URL or a form body back in encoded form.
                for shown in [encode_uri_component(&value), encode_form(&value), value.clone()] {
                    if !shown.is_empty() && !secrets.contains(&shown) {
                        secrets.push(shown);
                    }
                }
                values.push((placeholder.clone(), value));
            }
            None => {
                values.push((placeholder.clone(), format!("{{{{{key}}}}}")));
                if !unresolved.contains(&key) {
                    unresolved.push(key);
                }
            }
        }
    }
    Ok((values, unresolved, secrets))
}

/// Everything of `send` but the Tauri state, so tests drive it directly.
pub async fn send(store: &WorkspaceStore, http: &Http, input: SendInput) -> Result<SendOutcome, SendFailure> {
    let (values, unresolved, secrets) = resolve(store, &input).map_err(SendFailure::Ipc)?;
    let request = substitute(&input.prepared, &values);
    match http.send(&request, SEND_LIMITS).await {
        Ok(response) => Ok(SendOutcome { response: mask_response(response, &secrets), unresolved }),
        Err(error) => Err(SendFailure::Send(SendError { message: mask(&error.message, &secrets), ..error })),
    }
}

fn mask_response(response: ResponseView, secrets: &[String]) -> ResponseView {
    if secrets.is_empty() {
        return response;
    }
    ResponseView {
        status_text: mask(&response.status_text, secrets),
        headers: response.headers.iter().map(|(name, value)| (mask(name, secrets), mask(value, secrets))).collect(),
        body: mask(&response.body, secrets),
        url: mask(&response.url, secrets),
        ..response
    }
}

#[tauri::command]
pub async fn request_send(store: State<'_, WorkspaceStore>, http: State<'_, Http>, input: SendInput) -> Result<SendOutcome, SendFailure> {
    send(&store, &http, input).await
}

#[tauri::command]
pub fn request_cancel(http: State<'_, Http>) {
    http.cancel();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::loopback::{response, serve};
    use crate::http::secrets::MASK;
    use crate::http::{Body, SendErrorCode};
    use crate::secrets::{MemoryKeyProvider, SecretVault};
    use serde_json::{json, Value};
    use std::collections::HashSet;
    use std::sync::Arc;

    const SECRET: &str = "s3cr3t value/&";

    fn placeholder(index: usize) -> String {
        format!("rqs_{}_{index}", "0123456789abcdef".repeat(2))
    }

    fn workspace() -> Value {
        let project = |id: &str, variable: &str, value: &str| {
            json!({ "id": id, "name": id, "folders": [], "endpoints": [], "resources": [], "importSources": [], "activeEnvironmentId": "env",
                "environments": [{ "id": "env", "name": "Dev", "variables": [{ "id": variable, "key": "token", "value": value, "secret": true, "enabled": true }] }] })
        };
        json!({ "version": 2, "revision": 0, "activeProjectId": "project-1",
            "projects": [project("project-1", "v_token", SECRET), project("project-2", "v_other", "foreign-value")] })
    }

    fn stores(dir: &std::path::Path) -> (Arc<SecretVault>, WorkspaceStore) {
        let vault = Arc::new(SecretVault::new(dir, Box::new(MemoryKeyProvider::new())));
        let store = WorkspaceStore::new(dir).with_secrets(vault.clone());
        store.save(workspace()).unwrap();
        (vault, store)
    }

    fn input(project_id: &str, prepared: Prepared, refs: &[(String, &str)]) -> SendInput {
        SendInput {
            project_id: project_id.into(),
            prepared,
            secret_refs: refs.iter().map(|(placeholder, id)| (placeholder.clone(), id.to_string())).collect(),
        }
    }

    /// Echoes the request target, the auth header and the body.
    async fn echo() -> String {
        serve(|received| {
            let echo = format!("{}|{}|{}", received.target(), received.header("authorization").unwrap_or("-"), received.body);
            response("200 OK", &[("x-echo", &echo)], echo.as_bytes())
        })
        .await
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn sends_the_real_value_and_masks_it_in_the_response() {
        let dir = tempfile::tempdir().unwrap();
        let (_, store) = stores(dir.path());
        let base = echo().await;
        let token = placeholder(0);
        let prepared = Prepared {
            method: "POST".into(),
            url: format!("{base}/pets?key={token}"),
            headers: vec![("Authorization".into(), format!("Bearer {token}")), ("Content-Type".into(), "application/x-www-form-urlencoded".into())],
            body: Some(Body::Text { text: format!("secret={token}") }),
        };
        // What the server really received, before masking.
        let raw = Http::new().unwrap().send(&substitute(&prepared, &[(token.clone(), SECRET.into())]), SEND_LIMITS).await.unwrap();
        assert_eq!(raw.body, "/pets?key=s3cr3t%20value%2F%26|Bearer s3cr3t value/&|secret=s3cr3t+value%2F%26");

        let outcome = send(&store, &Http::new().unwrap(), input("project-1", prepared, &[(token, "v_token")])).await.unwrap();
        assert!(outcome.unresolved.is_empty());
        assert_eq!(outcome.response.body, format!("/pets?key={MASK}|Bearer {MASK}|secret={MASK}"));
        assert!(!outcome.response.url.contains("s3cr3t"), "{}", outcome.response.url);
        let header = &outcome.response.headers.iter().find(|(name, _)| name == "x-echo").unwrap().1;
        assert!(!header.contains("s3cr3t"), "{header}");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn masks_secrets_in_transport_errors() {
        let dir = tempfile::tempdir().unwrap();
        let (_, store) = stores(dir.path());
        let token = placeholder(0);
        let prepared = Prepared { method: "GET".into(), url: format!("/relative/{token}"), headers: Vec::new(), body: None };
        let Err(SendFailure::Send(error)) = send(&store, &Http::new().unwrap(), input("project-1", prepared, &[(token, "v_token")])).await else {
            panic!("expected a send error")
        };
        assert_eq!(error.code, SendErrorCode::InvalidUrl);
        assert!(!error.message.contains("s3cr3t"), "{}", error.message);
        assert!(error.message.contains(MASK), "{}", error.message);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn refuses_malformed_placeholders_and_secrets_of_another_project() {
        let dir = tempfile::tempdir().unwrap();
        let (_, store) = stores(dir.path());
        let base = echo().await;
        let get = || Prepared { method: "GET".into(), url: base.clone(), headers: Vec::new(), body: None };
        let http = Http::new().unwrap();
        let invalid = |result: Result<SendOutcome, SendFailure>| match result {
            Err(SendFailure::Ipc(error)) => error.code == ErrorCode::Invalid,
            _ => false,
        };
        assert!(invalid(send(&store, &http, input("project-1", get(), &[("rqs_bad".into(), "v_token")])).await));
        assert!(invalid(send(&store, &http, input("project-1", get(), &[(placeholder(0), "v_other")])).await));
        assert!(invalid(send(&store, &http, input("project-9", get(), &[(placeholder(0), "v_token")])).await));
        assert!(send(&store, &http, input("project-2", get(), &[(placeholder(0), "v_other")])).await.is_ok());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_value_that_does_not_open_goes_as_its_key_and_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        let (vault, store) = stores(dir.path());
        vault.retain_only(&HashSet::new()).unwrap();
        let base = echo().await;
        let token = placeholder(0);
        let prepared = Prepared { method: "GET".into(), url: base, headers: vec![("Authorization".into(), token.clone())], body: None };
        let outcome = send(&store, &Http::new().unwrap(), input("project-1", prepared, &[(token, "v_token")])).await.unwrap();
        assert_eq!(outcome.unresolved, vec!["token".to_owned()]);
        assert_eq!(outcome.response.body, "/|{{token}}|");
    }

    #[test]
    fn reads_the_input_the_adapter_sends() {
        let input: SendInput = serde_json::from_value(json!({
            "projectId": "project-1",
            "prepared": { "method": "GET", "url": "http://x", "headers": [["a", "b"]], "body": { "kind": "form-data", "fields": [["k", "v"]] } },
            "secretRefs": { (placeholder(1)): "v_token" }
        }))
        .unwrap();
        assert_eq!(input.project_id, "project-1");
        assert_eq!(input.secret_refs.get(&placeholder(1)).map(String::as_str), Some("v_token"));
        assert!(matches!(input.prepared.body, Some(Body::FormData { .. })));
    }
}
