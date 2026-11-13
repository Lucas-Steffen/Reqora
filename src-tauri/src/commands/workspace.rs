//! `workspace_load`, `workspace_save` and `secret_reveal`: thin wrappers over [`WorkspaceStore`].
//! Load answers `null` on first run so the renderer seeds the demo; save
//! answers the `SaveOutcome` success shape and rejects with `{ code, message }`.

use crate::ipc::IpcError;
use crate::store::workspace::WorkspaceStore;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command(async)]
pub fn workspace_load(store: State<'_, WorkspaceStore>) -> Result<Option<Value>, IpcError> {
    store.load()
}

#[tauri::command(async)]
pub fn workspace_save(store: State<'_, WorkspaceStore>, workspace: Value) -> Result<Value, IpcError> {
    let saved = store.save(workspace)?;
    Ok(json!({ "ok": true, "workspace": saved }))
}

/// `secrets.reveal`: the stored value of a secret variable, or `null`. Like the
/// Electron handler, anything but a string id under 200 UTF-16 units is `null`.
#[tauri::command(async)]
pub fn secret_reveal(store: State<'_, WorkspaceStore>, variable_id: Value) -> Result<Option<String>, IpcError> {
    match variable_id.as_str() {
        Some(id) if id.encode_utf16().count() < 200 => store.reveal(id),
        _ => Ok(None),
    }
}
