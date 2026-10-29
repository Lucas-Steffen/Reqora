//! The workspace file, as `src/main/workspaceStore.ts` keeps it: one JSON file
//! replaced atomically, revisions that reject stale saves, a one-time backup of
//! an older format and `.corrupt-<ms>` for unreadable files. The workspace is
//! opaque JSON here: only the envelope is checked, and the schema (with the
//! v1 → v2 migration) stays in TypeScript.

use crate::ipc::{ErrorCode, IpcError};
use crate::store::json::{js_key_order, to_js_pretty};
use serde_json::Value;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_WORKSPACE_BYTES: usize = 64 * 1024 * 1024;
pub const WORKSPACE_VERSION: u64 = 2;

const READ_FAILED: &str = "The workspace file could not be read. Close other programs using it and restart Reqora.";
const INVALID: &str = "The workspace data is invalid and was not saved.";
const STALE: &str = "The workspace changed since it was loaded. Reload and try again.";
const TOO_LARGE: &str = "The workspace is too large to save.";
const SAVE_FAILED: &str = "The workspace could not be saved.";

/// Mirrors `isWorkspace` in `src/workspace/repository.ts`.
pub fn is_workspace(value: &Value) -> bool {
    let version = value.get("version").and_then(Value::as_f64);
    let projects = value.get("projects").and_then(Value::as_array);
    matches!(version, Some(v) if v == 1.0 || v == WORKSPACE_VERSION as f64)
        && value.get("revision").is_some_and(Value::is_number)
        && value.get("activeProjectId").is_some_and(Value::is_string)
        && projects.is_some_and(|projects| {
            !projects.is_empty()
                && projects.iter().all(|project| {
                    ["id", "name"].iter().all(|key| project.get(key).is_some_and(Value::is_string))
                        && ["folders", "endpoints", "resources", "importSources"].iter().all(|key| project.get(key).is_some_and(Value::is_array))
                })
        })
}

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|elapsed| elapsed.as_millis()).unwrap_or(0)
}

fn io_error(message: &str) -> IpcError {
    IpcError::new(ErrorCode::Io, message)
}

#[derive(Default)]
struct State {
    /// Revision of the file on disk; `None` until it was read.
    revision: Option<f64>,
    /// Original text of an older-format file, written once before the first save.
    pending_backup: Option<(String, String)>,
    /// Set when the store could not be prepared (e.g. the legacy import failed).
    failed: Option<String>,
}

/// File store in the app data directory. Saves hold the lock for the whole
/// operation, so revisions stay monotonic.
pub struct WorkspaceStore {
    dir: PathBuf,
    state: Mutex<State>,
}

impl WorkspaceStore {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into(), state: Mutex::new(State::default()) }
    }

    /// A store whose every call fails with `message`, so the renderer never
    /// seeds the demo over data it could not reach.
    pub fn failed(dir: impl Into<PathBuf>, message: impl Into<String>) -> Self {
        let store = Self::new(dir);
        store.state.lock().expect("store lock").failed = Some(message.into());
        store
    }

    pub fn file(&self) -> PathBuf {
        self.dir.join("workspace.json")
    }

    /// The workspace on disk, or `None` on first run (or after a corrupt file
    /// was set aside), in which case the renderer seeds the demo.
    pub fn load(&self) -> Result<Option<Value>, IpcError> {
        let mut state = self.state.lock().map_err(|_| io_error(READ_FAILED))?;
        self.read(&mut state)
    }

    /// Writes `incoming` with the next revision and returns what was written.
    pub fn save(&self, incoming: Value) -> Result<Value, IpcError> {
        let mut state = self.state.lock().map_err(|_| io_error(SAVE_FAILED))?;
        let current = match state.revision {
            Some(revision) if state.failed.is_none() => revision,
            _ => {
                self.read(&mut state)?;
                state.revision.unwrap_or(0.0)
            }
        };
        if !is_workspace(&incoming) {
            return Err(IpcError::new(ErrorCode::Invalid, INVALID));
        }
        if incoming["revision"].as_f64() != Some(current) {
            return Err(IpcError::new(ErrorCode::Stale, STALE));
        }
        let mut next = incoming;
        let revision = current + 1.0;
        next["revision"] = if revision.fract() == 0.0 && revision.abs() < 9007199254740992.0 {
            Value::from(revision as i64)
        } else {
            Value::from(revision)
        };
        js_key_order(&mut next);
        if let Some((version, text)) = &state.pending_backup {
            // Never overwrite an existing backup; failing to back up blocks the save.
            match write_new(&self.dir.join(format!("workspace.v{version}.backup.json")), text.as_bytes()) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                Err(_) => return Err(io_error(SAVE_FAILED)),
            }
            state.pending_backup = None;
        }
        self.persist(&next)?;
        state.revision = Some(revision);
        Ok(next)
    }

    fn read(&self, state: &mut State) -> Result<Option<Value>, IpcError> {
        if let Some(message) = &state.failed {
            return Err(io_error(message));
        }
        let file = self.file();
        let bytes = match fs::read(&file) {
            Ok(bytes) => bytes,
            // Only a missing file means "first run". Any other error (locks,
            // permissions) must not lead to the demo being saved over the data.
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                state.revision = Some(0.0);
                return Ok(None);
            }
            Err(_) => return Err(io_error(READ_FAILED)),
        };
        // `readFile(file, 'utf8')` replaces invalid sequences the same way.
        let text = String::from_utf8_lossy(&bytes).into_owned();
        let text_without_bom = text.strip_prefix('\u{feff}').unwrap_or(&text);
        let parsed = serde_json::from_str::<Value>(text_without_bom).ok().filter(is_workspace);
        let Some(mut workspace) = parsed else {
            // Keep the unreadable file for recovery instead of overwriting it on the next save.
            let _ = fs::rename(&file, corrupt_path(&file));
            state.revision = Some(0.0);
            return Ok(None);
        };
        let version = workspace["version"].as_f64().unwrap_or_default();
        if version != WORKSPACE_VERSION as f64 {
            state.pending_backup = Some((crate::store::json::js_number(version), text));
        }
        js_key_order(&mut workspace);
        state.revision = workspace["revision"].as_f64();
        Ok(Some(workspace))
    }

    fn persist(&self, workspace: &Value) -> Result<(), IpcError> {
        let text = to_js_pretty(workspace).map_err(|_| io_error(SAVE_FAILED))?;
        if text.len() > MAX_WORKSPACE_BYTES {
            return Err(io_error(TOO_LARGE));
        }
        fs::create_dir_all(&self.dir).map_err(|_| io_error(SAVE_FAILED))?;
        let file = self.file();
        let temporary = self.dir.join(format!("workspace.json.{}.{}.tmp", std::process::id(), now_ms()));
        let written = write_new(&temporary, &text).and_then(|()| fs::rename(&temporary, &file));
        if written.is_err() {
            let _ = fs::remove_file(&temporary);
            return Err(io_error(SAVE_FAILED));
        }
        Ok(())
    }
}

fn corrupt_path(file: &Path) -> PathBuf {
    let mut name = file.as_os_str().to_owned();
    name.push(format!(".corrupt-{}", now_ms()));
    PathBuf::from(name)
}

/// Creates `path` (failing if it exists) with owner-only access where the OS has modes.
fn write_new(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn demo() -> Value {
        json!({
            "version": 2,
            "revision": 0,
            "activeProjectId": "project-1",
            "projects": [{ "id": "project-1", "name": "Demo", "folders": [], "endpoints": [], "resources": [], "importSources": [] }]
        })
    }

    fn with_revision(mut workspace: Value, revision: u64) -> Value {
        workspace["revision"] = json!(revision);
        workspace
    }

    #[test]
    fn saves_atomically_with_revisions_and_reloads_from_disk() {
        let dir = tempfile::tempdir().unwrap();
        let store = WorkspaceStore::new(dir.path());
        assert_eq!(store.load().unwrap(), None);
        let mut renamed = demo();
        renamed["projects"][0]["name"] = json!("Renamed");
        let saved = store.save(renamed).unwrap();
        assert_eq!(saved["revision"], json!(1));
        assert_eq!(store.save(demo()).unwrap_err().code, ErrorCode::Stale);
        let invalid = store.save(json!({ "nope": true })).unwrap_err();
        assert_eq!(invalid, IpcError::new(ErrorCode::Invalid, INVALID));
        let reopened = WorkspaceStore::new(dir.path()).load().unwrap().unwrap();
        assert_eq!(reopened["projects"][0]["name"], json!("Renamed"));
        let on_disk: Value = serde_json::from_slice(&fs::read(dir.path().join("workspace.json")).unwrap()).unwrap();
        assert_eq!(on_disk["revision"], json!(1));
        let leftovers: Vec<_> = fs::read_dir(dir.path()).unwrap().map(|entry| entry.unwrap().file_name()).collect();
        assert_eq!(leftovers, ["workspace.json"], "no temporary files remain");
    }

    #[test]
    fn fails_to_load_instead_of_seeding_when_the_file_cannot_be_read() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("workspace.json")).unwrap(); // stands in for a locked file
        let store = WorkspaceStore::new(dir.path());
        let error = store.load().unwrap_err();
        assert_eq!(error.code, ErrorCode::Io);
        assert!(error.message.contains("could not be read"));
        assert!(store.save(demo()).unwrap_err().message.contains("could not be read"));
    }

    #[test]
    fn sets_a_corrupt_file_aside_and_falls_back_to_the_demo() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("workspace.json"), "{ broken").unwrap();
        assert_eq!(WorkspaceStore::new(dir.path()).load().unwrap(), None);
        let names: Vec<String> = fs::read_dir(dir.path()).unwrap().map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(names.len(), 1);
        assert!(names[0].starts_with("workspace.json.corrupt-"), "{names:?}");
        assert_eq!(fs::read_to_string(dir.path().join(&names[0])).unwrap(), "{ broken");
    }

    #[test]
    fn sets_a_non_workspace_file_aside() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("workspace.json"), r#"{"version":3,"revision":0}"#).unwrap();
        let store = WorkspaceStore::new(dir.path());
        assert_eq!(store.load().unwrap(), None);
        assert!(!dir.path().join("workspace.json").exists());
        assert_eq!(store.save(demo()).unwrap()["revision"], json!(1));
    }

    #[test]
    fn backs_up_an_older_format_once_on_the_first_save() {
        let dir = tempfile::tempdir().unwrap();
        let v1 = json!({
            "version": 1,
            "revision": 3,
            "activeProjectId": "project-1",
            "projects": [{ "id": "project-1", "name": "My existing API", "folders": [], "endpoints": [], "resources": [], "importSources": [] }]
        });
        let original = String::from_utf8(to_js_pretty(&v1).unwrap()).unwrap();
        fs::write(dir.path().join("workspace.json"), &original).unwrap();
        let store = WorkspaceStore::new(dir.path());
        assert_eq!(store.load().unwrap().unwrap(), v1, "loaded unchanged; the renderer migrates it");
        // The renderer sends the migrated (v2) workspace back.
        let mut migrated = v1.clone();
        migrated["version"] = json!(2);
        let saved = store.save(migrated).unwrap();
        assert_eq!(saved["version"], json!(2));
        assert_eq!(saved["revision"], json!(4));
        let backup = dir.path().join("workspace.v1.backup.json");
        assert_eq!(fs::read_to_string(&backup).unwrap(), original);
        // A second save does not touch the backup, nor does a reopened store.
        fs::write(&backup, "sentinel").unwrap();
        store.save(with_revision(saved.clone(), 4)).unwrap();
        assert_eq!(fs::read_to_string(&backup).unwrap(), "sentinel");
        let on_disk: Value = serde_json::from_slice(&fs::read(dir.path().join("workspace.json")).unwrap()).unwrap();
        assert_eq!((on_disk["version"].clone(), on_disk["revision"].clone()), (json!(2), json!(5)));
    }

    #[test]
    fn keeps_an_existing_backup_when_the_old_file_is_loaded_again() {
        let dir = tempfile::tempdir().unwrap();
        let mut v1 = demo();
        v1["version"] = json!(1);
        fs::write(dir.path().join("workspace.json"), to_js_pretty(&v1).unwrap()).unwrap();
        fs::write(dir.path().join("workspace.v1.backup.json"), "earlier").unwrap();
        let store = WorkspaceStore::new(dir.path());
        store.load().unwrap();
        store.save(demo()).unwrap();
        assert_eq!(fs::read_to_string(dir.path().join("workspace.v1.backup.json")).unwrap(), "earlier");
    }

    #[test]
    fn refuses_workspaces_over_the_size_limit() {
        let dir = tempfile::tempdir().unwrap();
        let store = WorkspaceStore::new(dir.path());
        let mut large = demo();
        large["projects"][0]["notes"] = json!("x".repeat(MAX_WORKSPACE_BYTES));
        assert_eq!(store.save(large).unwrap_err(), IpcError::new(ErrorCode::Io, TOO_LARGE));
        assert!(!dir.path().join("workspace.json").exists());
        assert_eq!(store.save(demo()).unwrap()["revision"], json!(1), "the revision is unchanged by a failed save");
    }

    #[test]
    fn a_failed_store_never_reads_or_writes() {
        let dir = tempfile::tempdir().unwrap();
        let store = WorkspaceStore::failed(dir.path(), "copy failed");
        assert_eq!(store.load().unwrap_err(), IpcError::new(ErrorCode::Io, "copy failed"));
        assert_eq!(store.save(demo()).unwrap_err(), IpcError::new(ErrorCode::Io, "copy failed"));
        assert!(!dir.path().join("workspace.json").exists());
    }

    #[test]
    fn checks_the_envelope_like_the_renderer() {
        assert!(is_workspace(&demo()));
        let mut empty = demo();
        empty["projects"] = json!([]);
        assert!(!is_workspace(&empty));
        let mut missing = demo();
        missing["projects"][0].as_object_mut().unwrap().remove("importSources");
        assert!(!is_workspace(&missing));
        let mut text_revision = demo();
        text_revision["revision"] = json!("1");
        assert!(!is_workspace(&text_revision));
        let mut version = demo();
        version["version"] = json!(1.0);
        assert!(is_workspace(&version));
    }

    #[test]
    fn writes_the_same_bytes_as_the_electron_store() {
        // Generated by src/main/workspaceStore.fixture.test.ts from the same input.
        let input = include_str!("../../../src/shared/contract/workspace-store/input.json");
        let expected = include_bytes!("../../../src/shared/contract/workspace-store/expected.json");
        let dir = tempfile::tempdir().unwrap();
        let store = WorkspaceStore::new(dir.path());
        assert_eq!(store.load().unwrap(), None);
        store.save(serde_json::from_str(input).unwrap()).unwrap();
        let written = fs::read(dir.path().join("workspace.json")).unwrap();
        assert_eq!(String::from_utf8_lossy(&written), String::from_utf8_lossy(expected));
    }
}
