//! `workspace_load` and `workspace_save`: thin wrappers over [`WorkspaceStore`].
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
