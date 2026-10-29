//! One-time migration of the secrets the Electron app kept in `secrets.json`.
//!
//! On Windows, Electron's `safeStorage` seals each value with AES-256-GCM as
//! `"v10"` + 12-byte nonce + ciphertext + tag, under a key that `Local State`
//! keeps wrapped by DPAPI (`os_crypt.encrypted_key`, `"DPAPI"` + blob). Each
//! value that opens moves into the vault. One that does not stays out of it,
//! so the UI shows it as not stored (`hasStoredSecret: false`) and asks for it
//! again. `secrets.json` is never changed or deleted, and no value is ever
//! written in plain text.

use crate::secrets::SecretVault;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;
use serde_json::{Map, Value};
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

/// Written once the migration ran; while it exists the migration is skipped.
pub const REPORT: &str = "secrets-migration.json";
const LEGACY_SECRETS: &str = "secrets.json";
const LOCAL_STATE: &str = "Local State";
const KEY_PREFIX: &[u8] = b"DPAPI";
const BLOB_PREFIX: &[u8] = b"v10";
const NONCE_LEN: usize = 12;

/// The ids that moved into the vault and the ones that must be set again.
#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub struct SecretMigration {
    pub migrated: Vec<String>,
    pub failed: Vec<String>,
}

/// The AES key of `Local State`, unwrapped by DPAPI for the current user.
pub fn unwrap_key(local_state: &[u8]) -> Option<[u8; 32]> {
    let state: Value = serde_json::from_slice(local_state).ok()?;
    let encoded = state.get("os_crypt")?.get("encrypted_key")?.as_str()?;
    let wrapped = STANDARD.decode(encoded).ok()?;
    dpapi::unprotect(wrapped.strip_prefix(KEY_PREFIX)?)?.try_into().ok()
}

/// Opens one base64 value of `secrets.json`; `None` if it is not a `v10`
/// blob sealed with `key`.
pub fn open_blob(key: &[u8; 32], encoded: &str) -> Option<String> {
    let bytes = STANDARD.decode(encoded).ok()?;
    let rest = bytes.strip_prefix(BLOB_PREFIX)?;
    if rest.len() < NONCE_LEN {
        return None;
    }
    let (nonce, sealed) = rest.split_at(NONCE_LEN);
    let plain = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key)).decrypt(Nonce::from_slice(nonce), sealed).ok()?;
    String::from_utf8(plain).ok()
}

/// Moves the secrets of the copied `secrets.json` in `data_dir` into `vault`,
/// with the key from `legacy_dir/Local State`. Returns `None` when the
/// migration already ran or there is no `secrets.json`. When the vault cannot
/// be written (no keychain) it fails without a report, so the next start tries
/// again.
pub fn migrate_secrets(legacy_dir: &Path, data_dir: &Path, vault: &SecretVault) -> Result<Option<SecretMigration>, String> {
    if data_dir.join(REPORT).exists() {
        return Ok(None);
    }
    let key = fs::read(legacy_dir.join(LOCAL_STATE)).ok().and_then(|state| unwrap_key(&state));
    migrate_with_key(data_dir, key, vault)
}

fn migrate_with_key(data_dir: &Path, key: Option<[u8; 32]>, vault: &SecretVault) -> Result<Option<SecretMigration>, String> {
    let report = data_dir.join(REPORT);
    if report.exists() {
        return Ok(None);
    }
    let bytes = match fs::read(data_dir.join(LEGACY_SECRETS)) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("{LEGACY_SECRETS} could not be read: {error}")),
    };
    let secrets: Map<String, Value> = serde_json::from_slice(&bytes).map_err(|error| format!("{LEGACY_SECRETS} is not valid: {error}"))?;
    let mut result = SecretMigration::default();
    for (id, encoded) in &secrets {
        // A value set in Reqora already wins over the Electron one.
        if vault.has(id).map_err(|error| error.message)? {
            result.migrated.push(id.clone());
            continue;
        }
        match (key.as_ref(), encoded.as_str()) {
            (Some(key), Some(encoded)) => match open_blob(key, encoded) {
                Some(value) => {
                    vault.set(id, &value).map_err(|error| error.message)?;
                    result.migrated.push(id.clone());
                }
                None => result.failed.push(id.clone()),
            },
            _ => result.failed.push(id.clone()),
        }
    }
    let text = serde_json::to_vec_pretty(&result).map_err(|error| error.to_string())?;
    fs::write(&report, text).map_err(|error| format!("{REPORT} could not be written: {error}"))?;
    Ok(Some(result))
}

#[cfg(windows)]
mod dpapi {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB};

    pub(super) fn blob(data: &[u8]) -> Option<CRYPT_INTEGER_BLOB> {
        Some(CRYPT_INTEGER_BLOB { cbData: u32::try_from(data.len()).ok()?, pbData: data.as_ptr().cast_mut() })
    }

    /// Copies a buffer that DPAPI allocated and frees it.
    ///
    /// # Safety
    /// `out` must come from a successful DPAPI call.
    pub(super) unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        let bytes = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        LocalFree(out.pbData.cast());
        bytes
    }

    pub fn unprotect(data: &[u8]) -> Option<Vec<u8>> {
        let input = blob(data)?;
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        // SAFETY: `input` borrows `data` for the call; DPAPI only reads it and
        // allocates `out`, which `take` frees.
        let ok = unsafe {
            CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        };
        // SAFETY: the call succeeded, so `out` is a DPAPI buffer.
        (ok != 0).then(|| unsafe { take(out) })
    }

    /// What Chromium does to write `os_crypt.encrypted_key`.
    #[cfg(test)]
    pub fn protect(data: &[u8]) -> Vec<u8> {
        use windows_sys::Win32::Security::Cryptography::CryptProtectData;
        let input = blob(data).unwrap();
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        // SAFETY: as in `unprotect`.
        let ok = unsafe {
            CryptProtectData(&input, std::ptr::null(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        };
        assert_ne!(ok, 0, "CryptProtectData failed");
        // SAFETY: the call succeeded.
        unsafe { take(out) }
    }
}

/// Electron's other platforms use other schemes (backlog); every secret
/// there is marked to be set again.
#[cfg(not(windows))]
mod dpapi {
    pub fn unprotect(_: &[u8]) -> Option<Vec<u8>> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::secrets::{annotate_secrets, MemoryKeyProvider};
    use serde_json::json;
    use std::collections::{BTreeMap, HashSet};

    // Produced by Electron 44.8.0 `safeStorage` with
    // `scripts/fixtures/electron-secrets.cjs`; the key belongs to that
    // throwaway profile and was unwrapped from its `Local State` with DPAPI.
    const SECRETS: &str = include_str!("../../tests/fixtures/electron-secrets/secrets.json");
    const EXPECTED: &str = include_str!("../../tests/fixtures/electron-secrets/expected.json");
    const KEY_HEX: &str = include_str!("../../tests/fixtures/electron-secrets/aes-key.hex");

    fn fixture_key() -> [u8; 32] {
        let hex = KEY_HEX.trim();
        let bytes: Vec<u8> = (0..hex.len()).step_by(2).map(|at| u8::from_str_radix(&hex[at..at + 2], 16).unwrap()).collect();
        bytes.try_into().unwrap()
    }

    fn expected() -> BTreeMap<String, String> {
        serde_json::from_value(serde_json::from_str::<Value>(EXPECTED).unwrap()["values"].take()).unwrap()
    }

    fn secrets() -> Map<String, Value> {
        serde_json::from_str(SECRETS).unwrap()
    }

    fn vault(dir: &Path) -> SecretVault {
        SecretVault::new(dir, Box::new(MemoryKeyProvider::new()))
    }

    /// A data dir holding `secrets.json` with `entries`.
    fn data_dir(entries: &Map<String, Value>) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(LEGACY_SECRETS), serde_json::to_vec(entries).unwrap()).unwrap();
        dir
    }

    fn tampered(encoded: &str) -> String {
        let mut bytes = STANDARD.decode(encoded).unwrap();
        *bytes.last_mut().unwrap() ^= 1;
        STANDARD.encode(bytes)
    }

    #[test]
    fn opens_the_blobs_of_the_real_electron() {
        let key = fixture_key();
        let secrets = secrets();
        let expected = expected();
        assert_eq!(secrets.len(), expected.len());
        for (id, value) in &expected {
            assert_eq!(open_blob(&key, secrets[id].as_str().unwrap()).as_deref(), Some(value.as_str()), "{id}");
        }
    }

    #[test]
    fn rejects_tampered_foreign_and_malformed_blobs() {
        let key = fixture_key();
        let plain = secrets()["var-plain"].as_str().unwrap().to_owned();
        let mut other_key = key;
        other_key[0] ^= 1;
        let mut v11 = STANDARD.decode(&plain).unwrap();
        v11[2] = b'1';
        for (case, encoded) in [
            ("tampered tag", tampered(&plain)),
            ("unknown prefix", STANDARD.encode(v11)),
            ("too short", STANDARD.encode(b"v10short")),
            ("not base64", "not base64!".to_owned()),
            ("empty", String::new()),
        ] {
            assert_eq!(open_blob(&key, &encoded), None, "{case}");
        }
        assert_eq!(open_blob(&other_key, &plain), None, "other key");
    }

    #[test]
    fn migrates_every_value_and_keeps_secrets_json() {
        let dir = data_dir(&secrets());
        let before = fs::read(dir.path().join(LEGACY_SECRETS)).unwrap();
        let vault = vault(dir.path());
        let mut result = migrate_with_key(dir.path(), Some(fixture_key()), &vault).unwrap().unwrap();
        result.migrated.sort();
        let expected = expected();
        assert_eq!(result, SecretMigration { migrated: expected.keys().cloned().collect(), failed: vec![] });
        for (id, value) in &expected {
            assert_eq!(vault.get(id).unwrap().as_deref(), Some(value.as_str()), "{id}");
        }
        assert_eq!(fs::read(dir.path().join(LEGACY_SECRETS)).unwrap(), before);
        let report: Value = serde_json::from_slice(&fs::read(dir.path().join(REPORT)).unwrap()).unwrap();
        assert_eq!(report["failed"], json!([]));
        // Runs once.
        assert_eq!(migrate_with_key(dir.path(), Some(fixture_key()), &vault).unwrap(), None);
    }

    #[test]
    fn a_failed_secret_is_marked_to_be_set_again_and_never_deleted() {
        let mut entries = secrets();
        let broken = tampered(entries["var-plain"].as_str().unwrap());
        entries.insert("var-plain".into(), Value::from(broken));
        entries.insert("var-number".into(), json!(42));
        let dir = data_dir(&entries);
        let before = fs::read(dir.path().join(LEGACY_SECRETS)).unwrap();
        let vault = vault(dir.path());
        let result = migrate_with_key(dir.path(), Some(fixture_key()), &vault).unwrap().unwrap();
        assert_eq!(result.failed, ["var-plain", "var-number"]);
        assert_eq!(vault.get("var-plain").unwrap(), None);
        assert_eq!(vault.get("var-unicode").unwrap().as_deref(), Some("senha çãõ ✓ 🔑"));
        assert_eq!(fs::read(dir.path().join(LEGACY_SECRETS)).unwrap(), before);

        let mut workspace = json!({ "projects": [{ "globals": [
            { "id": "var-plain", "secret": true, "value": "" },
            { "id": "var-unicode", "secret": true, "value": "" }
        ] }] });
        annotate_secrets(&mut workspace, &vault.ids().unwrap());
        assert_eq!(workspace["projects"][0]["globals"][0]["hasStoredSecret"], json!(false));
        assert_eq!(workspace["projects"][0]["globals"][1]["hasStoredSecret"], json!(true));
    }

    #[test]
    fn without_the_key_every_secret_fails_and_nothing_is_lost() {
        let dir = data_dir(&secrets());
        let before = fs::read(dir.path().join(LEGACY_SECRETS)).unwrap();
        let vault = vault(dir.path());
        // No `Local State` in the legacy dir.
        let legacy = tempfile::tempdir().unwrap();
        let result = migrate_secrets(legacy.path(), dir.path(), &vault).unwrap().unwrap();
        assert!(result.migrated.is_empty());
        assert_eq!(result.failed.len(), expected().len());
        assert!(vault.ids().unwrap().is_empty());
        assert_eq!(fs::read(dir.path().join(LEGACY_SECRETS)).unwrap(), before);
    }

    #[test]
    fn without_secrets_json_there_is_nothing_to_migrate() {
        let dir = tempfile::tempdir().unwrap();
        let vault = vault(dir.path());
        assert_eq!(migrate_with_key(dir.path(), Some(fixture_key()), &vault).unwrap(), None);
        assert!(!dir.path().join(REPORT).exists());
        assert!(!vault.file().exists());
    }

    #[test]
    fn an_unreadable_secrets_json_is_left_for_the_next_start() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(LEGACY_SECRETS), b"{ not json").unwrap();
        assert!(migrate_with_key(dir.path(), Some(fixture_key()), &vault(dir.path())).is_err());
        assert!(!dir.path().join(REPORT).exists());
    }

    #[test]
    fn without_a_keychain_it_retries_on_the_next_start() {
        let dir = data_dir(&secrets());
        let locked = SecretVault::new(dir.path(), Box::new(MemoryKeyProvider::unavailable()));
        assert!(migrate_with_key(dir.path(), Some(fixture_key()), &locked).is_err());
        assert!(!dir.path().join(REPORT).exists());
        let vault = vault(dir.path());
        let result = migrate_with_key(dir.path(), Some(fixture_key()), &vault).unwrap().unwrap();
        assert!(result.failed.is_empty());
    }

    #[test]
    fn a_value_already_in_the_vault_is_kept() {
        let dir = data_dir(&secrets());
        let vault = vault(dir.path());
        vault.set("var-plain", "set in Reqora").unwrap();
        let result = migrate_with_key(dir.path(), Some(fixture_key()), &vault).unwrap().unwrap();
        assert!(result.migrated.contains(&"var-plain".to_owned()));
        assert_eq!(vault.get("var-plain").unwrap().as_deref(), Some("set in Reqora"));
    }

    #[test]
    fn local_state_without_a_dpapi_key_gives_no_key() {
        for state in [&b"{ not json"[..], br#"{}"#, br#"{"os_crypt":{"encrypted_key":"bm9wZQ=="}}"#] {
            assert_eq!(unwrap_key(state), None);
        }
    }

    #[cfg(windows)]
    #[test]
    fn unwraps_a_dpapi_key_and_migrates_from_the_legacy_profile() {
        let key = fixture_key();
        let wrapped = [KEY_PREFIX, &dpapi::protect(&key)].concat();
        let state = json!({ "os_crypt": { "encrypted_key": STANDARD.encode(wrapped) } });
        assert_eq!(unwrap_key(state.to_string().as_bytes()), Some(key));

        let legacy = tempfile::tempdir().unwrap();
        fs::write(legacy.path().join(LOCAL_STATE), state.to_string()).unwrap();
        let dir = data_dir(&secrets());
        let vault = vault(dir.path());
        let result = migrate_secrets(legacy.path(), dir.path(), &vault).unwrap().unwrap();
        assert!(result.failed.is_empty());
        assert_eq!(vault.ids().unwrap(), expected().keys().cloned().collect::<HashSet<_>>());
    }

    /// End to end against a profile freshly written by Electron:
    /// `REQORA_ELECTRON_PROFILE=<dir> cargo test -- --ignored`, where `<dir>`
    /// came from `scripts/fixtures/electron-secrets.cjs` for the current user.
    #[test]
    #[ignore = "needs a profile written by Electron for this user"]
    fn migrates_a_real_electron_profile() {
        let profile = std::path::PathBuf::from(std::env::var("REQORA_ELECTRON_PROFILE").expect("REQORA_ELECTRON_PROFILE"));
        let dir = tempfile::tempdir().unwrap();
        fs::copy(profile.join(LEGACY_SECRETS), dir.path().join(LEGACY_SECRETS)).unwrap();
        let expected: Value = serde_json::from_slice(&fs::read(profile.join("expected.json")).unwrap()).unwrap();
        let vault = vault(dir.path());
        let result = migrate_secrets(&profile, dir.path(), &vault).unwrap().unwrap();
        assert!(result.failed.is_empty(), "{result:?}");
        for (id, value) in expected["values"].as_object().unwrap() {
            assert_eq!(vault.get(id).unwrap().as_deref(), value.as_str(), "{id}");
        }
    }
}
