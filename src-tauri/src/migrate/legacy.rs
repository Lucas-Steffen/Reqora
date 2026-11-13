//! One-time copy of the Electron profile (`%APPDATA%\reqora`) into the Tauri
//! data directory. The originals are never touched; each copy is checked by
//! SHA-256 and listed in `legacy-import.json`, and `workspace.json` goes last
//! so an interrupted copy is retried on the next start.

use serde_json::json;
use sha2::{Digest, Sha256};
use std::fs;
use std::io;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub const MANIFEST: &str = "legacy-import.json";
const WORKSPACE: &str = "workspace.json";
const COMPANIONS: &[&str] = &["secrets.json", "preferences.json"];

#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    /// The data directory already has a workspace (or there is nothing to copy).
    Skipped,
    /// The listed files were copied.
    Imported(Vec<String>),
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Copies the legacy profile when `data_dir` has no workspace yet and
/// `legacy_dir` has one.
pub fn import_legacy(legacy_dir: &Path, data_dir: &Path) -> io::Result<Outcome> {
    if data_dir.join(WORKSPACE).exists() || !legacy_dir.join(WORKSPACE).is_file() {
        return Ok(Outcome::Skipped);
    }
    let mut names: Vec<String> = COMPANIONS.iter().map(|name| name.to_string()).filter(|name| legacy_dir.join(name).is_file()).collect();
    let mut backups: Vec<String> = fs::read_dir(legacy_dir)?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.starts_with("workspace.") && name.ends_with(".backup.json"))
        .collect();
    backups.sort();
    names.extend(backups);
    names.push(WORKSPACE.to_string());

    fs::create_dir_all(data_dir)?;
    let mut files = Vec::new();
    for name in &names {
        let bytes = fs::read(legacy_dir.join(name))?;
        let target = data_dir.join(name);
        let temporary = data_dir.join(format!("{name}.legacy.tmp"));
        fs::write(&temporary, &bytes)?;
        let expected = sha256_hex(&bytes);
        if sha256_hex(&fs::read(&temporary)?) != expected {
            let _ = fs::remove_file(&temporary);
            return Err(io::Error::other(format!("{name} changed while it was copied")));
        }
        fs::rename(&temporary, &target)?;
        files.push(json!({ "name": name, "sha256": expected, "bytes": bytes.len() }));
    }
    let imported_at = SystemTime::now().duration_since(UNIX_EPOCH).map(|elapsed| elapsed.as_millis() as u64).unwrap_or(0);
    let manifest = json!({ "source": legacy_dir.to_string_lossy(), "importedAtMs": imported_at, "files": files });
    fs::write(data_dir.join(MANIFEST), serde_json::to_vec_pretty(&manifest)?)?;
    Ok(Outcome::Imported(names))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn legacy_profile() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("workspace.json"), r#"{"version":2,"revision":7}"#).unwrap();
        fs::write(dir.path().join("secrets.json"), r#"{"version":1,"values":{}}"#).unwrap();
        fs::write(dir.path().join("workspace.v1.backup.json"), "old").unwrap();
        fs::write(dir.path().join("workspace.json.corrupt-1700000000000"), "{ broken").unwrap();
        fs::write(dir.path().join("Local State"), "{}").unwrap();
        dir
    }

    fn snapshot(dir: &Path) -> Vec<(String, Vec<u8>)> {
        let mut entries: Vec<_> = fs::read_dir(dir).unwrap().map(|entry| {
            let entry = entry.unwrap();
            (entry.file_name().into_string().unwrap(), fs::read(entry.path()).unwrap())
        }).collect();
        entries.sort();
        entries
    }

    #[test]
    fn copies_the_profile_with_hashes_and_leaves_the_originals() {
        let legacy = legacy_profile();
        let before = snapshot(legacy.path());
        let data = tempfile::tempdir().unwrap();
        let target = data.path().join("com.reqora.app");
        let outcome = import_legacy(legacy.path(), &target).unwrap();
        assert_eq!(outcome, Outcome::Imported(vec!["secrets.json".into(), "workspace.v1.backup.json".into(), "workspace.json".into()]));
        assert_eq!(snapshot(legacy.path()), before, "originals unchanged");
        for name in ["workspace.json", "secrets.json", "workspace.v1.backup.json"] {
            assert_eq!(fs::read(target.join(name)).unwrap(), fs::read(legacy.path().join(name)).unwrap(), "{name}");
        }
        assert!(!target.join("workspace.json.corrupt-1700000000000").exists());
        assert!(!target.join("Local State").exists());
        let manifest: Value = serde_json::from_slice(&fs::read(target.join(MANIFEST)).unwrap()).unwrap();
        assert_eq!(manifest["source"], json!(legacy.path().to_string_lossy()));
        let workspace = manifest["files"].as_array().unwrap().iter().find(|file| file["name"] == "workspace.json").unwrap();
        assert_eq!(workspace["sha256"], json!(sha256_hex(br#"{"version":2,"revision":7}"#)));
        assert_eq!(workspace["bytes"], json!(26));
        let leftovers = fs::read_dir(&target).unwrap().filter(|entry| entry.as_ref().unwrap().file_name().to_string_lossy().ends_with(".tmp")).count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn skips_when_the_data_directory_already_has_a_workspace() {
        let legacy = legacy_profile();
        let data = tempfile::tempdir().unwrap();
        fs::write(data.path().join("workspace.json"), "mine").unwrap();
        assert_eq!(import_legacy(legacy.path(), data.path()).unwrap(), Outcome::Skipped);
        assert_eq!(fs::read_to_string(data.path().join("workspace.json")).unwrap(), "mine");
        assert!(!data.path().join("secrets.json").exists());
    }

    #[test]
    fn skips_without_a_legacy_workspace() {
        let legacy = tempfile::tempdir().unwrap();
        fs::write(legacy.path().join("secrets.json"), "{}").unwrap();
        let data = tempfile::tempdir().unwrap();
        assert_eq!(import_legacy(&legacy.path().join("missing"), data.path()).unwrap(), Outcome::Skipped);
        assert_eq!(import_legacy(legacy.path(), data.path()).unwrap(), Outcome::Skipped);
        assert_eq!(fs::read_dir(data.path()).unwrap().count(), 0);
    }

    #[test]
    fn runs_once() {
        let legacy = legacy_profile();
        let data = tempfile::tempdir().unwrap();
        assert!(matches!(import_legacy(legacy.path(), data.path()).unwrap(), Outcome::Imported(_)));
        fs::write(legacy.path().join("workspace.json"), "changed later in Electron").unwrap();
        assert_eq!(import_legacy(legacy.path(), data.path()).unwrap(), Outcome::Skipped);
        assert_eq!(fs::read_to_string(data.path().join("workspace.json")).unwrap(), r#"{"version":2,"revision":7}"#);
    }
}
