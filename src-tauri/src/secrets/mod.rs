//! The secret vault (ADR-004), with the rules of `src/main/secretStore.ts` and
//! `secretVariables.ts`. A random 256-bit master key lives in the OS keychain;
//! values are AES-256-GCM encrypted with a fresh nonce each and kept in
//! `secrets.v2.json`. Plain text never reaches disk: without the key, writes
//! fail. The legacy `secrets.json` is never touched (its migration is TASK-011).

use crate::ipc::{ErrorCode, IpcError};
use crate::store::workspace::write_new;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use rand::RngCore;
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const SECRET_UNAVAILABLE: &str =
    "Secure storage is not available on this system, so secret values cannot be saved. Unmark the variable as secret or enable the OS keychain.";
const SAVE_FAILED: &str = "The secret values could not be saved.";
const VAULT_VERSION: u64 = 1;

fn unavailable() -> IpcError {
    IpcError::new(ErrorCode::Io, SECRET_UNAVAILABLE)
}

/// Supplies the master key; `None` means secure storage is unavailable.
pub trait KeyProvider: Send + Sync {
    fn master_key(&self) -> Option<[u8; 32]>;
}

/// The master key in the OS keychain (Credential Manager, Keychain, Secret
/// Service), created on first use.
pub struct KeyringKeyProvider;

impl KeyringKeyProvider {
    const SERVICE: &'static str = "reqora";
    const USER: &'static str = "master-key";
}

impl KeyProvider for KeyringKeyProvider {
    fn master_key(&self) -> Option<[u8; 32]> {
        let entry = keyring::Entry::new(Self::SERVICE, Self::USER).ok()?;
        match entry.get_secret() {
            Ok(bytes) => bytes.try_into().ok(),
            Err(keyring::Error::NoEntry) => {
                let mut key = [0u8; 32];
                rand::rng().fill_bytes(&mut key);
                entry.set_secret(&key).ok()?;
                // Read back, so a store that drops writes counts as unavailable.
                entry.get_secret().ok()?.try_into().ok()
            }
            Err(_) => None,
        }
    }
}

/// A fixed key for tests, or none to simulate a missing keychain.
#[derive(Clone)]
pub struct MemoryKeyProvider(Option<[u8; 32]>);

impl MemoryKeyProvider {
    pub fn new() -> Self {
        let mut key = [0u8; 32];
        rand::rng().fill_bytes(&mut key);
        Self(Some(key))
    }

    pub fn unavailable() -> Self {
        Self(None)
    }
}

impl Default for MemoryKeyProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl KeyProvider for MemoryKeyProvider {
    fn master_key(&self) -> Option<[u8; 32]> {
        self.0
    }
}

#[derive(Clone)]
struct Sealed {
    nonce: String,
    ciphertext: String,
}

/// Encrypted values by variable id. Operations are serialized by one lock.
pub struct SecretVault {
    dir: PathBuf,
    keys: Box<dyn KeyProvider>,
    /// `None` until the file was read; ids keep a stable order on disk.
    cache: Mutex<Option<BTreeMap<String, Sealed>>>,
}

impl SecretVault {
    pub fn new(dir: impl Into<PathBuf>, keys: Box<dyn KeyProvider>) -> Self {
        Self { dir: dir.into(), keys, cache: Mutex::new(None) }
    }

    pub fn file(&self) -> PathBuf {
        self.dir.join("secrets.v2.json")
    }

    fn with<T>(&self, task: impl FnOnce(&Self, &mut BTreeMap<String, Sealed>) -> Result<T, IpcError>) -> Result<T, IpcError> {
        let mut cache = self.cache.lock().map_err(|_| IpcError::new(ErrorCode::Io, SAVE_FAILED))?;
        let entries = cache.get_or_insert_with(|| read_file(&self.file()));
        task(self, entries)
    }

    pub fn has(&self, id: &str) -> Result<bool, IpcError> {
        self.with(|_, entries| Ok(entries.contains_key(id)))
    }

    pub fn ids(&self) -> Result<HashSet<String>, IpcError> {
        self.with(|_, entries| Ok(entries.keys().cloned().collect()))
    }

    /// The plain value, `None` if the id has no secret.
    pub fn get(&self, id: &str) -> Result<Option<String>, IpcError> {
        self.with(|vault, entries| {
            let Some(sealed) = entries.get(id) else { return Ok(None) };
            let key = vault.keys.master_key().ok_or_else(unavailable)?;
            open(&key, sealed).map(Some).ok_or_else(unavailable)
        })
    }

    pub fn set(&self, id: &str, value: &str) -> Result<(), IpcError> {
        self.with(|vault, entries| {
            let key = vault.keys.master_key().ok_or_else(unavailable)?;
            let mut next = entries.clone();
            next.insert(id.to_owned(), seal(&key, value)?);
            vault.persist(&next)?;
            *entries = next;
            Ok(())
        })
    }

    pub fn delete(&self, id: &str) -> Result<(), IpcError> {
        self.with(|vault, entries| {
            if !entries.contains_key(id) {
                return Ok(());
            }
            let mut next = entries.clone();
            next.remove(id);
            vault.persist(&next)?;
            *entries = next;
            Ok(())
        })
    }

    /// Deletes every secret whose id is not in `keep`.
    pub fn retain_only(&self, keep: &HashSet<String>) -> Result<(), IpcError> {
        self.with(|vault, entries| {
            let next: BTreeMap<String, Sealed> = entries.iter().filter(|(id, _)| keep.contains(*id)).map(|(id, sealed)| (id.clone(), sealed.clone())).collect();
            if next.len() != entries.len() {
                vault.persist(&next)?;
                *entries = next;
            }
            Ok(())
        })
    }

    fn persist(&self, entries: &BTreeMap<String, Sealed>) -> Result<(), IpcError> {
        let secrets: Map<String, Value> = entries.iter().map(|(id, sealed)| (id.clone(), json!({ "nonce": sealed.nonce, "ciphertext": sealed.ciphertext }))).collect();
        let text = serde_json::to_vec(&json!({ "version": VAULT_VERSION, "secrets": secrets })).map_err(|_| IpcError::new(ErrorCode::Io, SAVE_FAILED))?;
        fs::create_dir_all(&self.dir).map_err(|_| IpcError::new(ErrorCode::Io, SAVE_FAILED))?;
        let file = self.file();
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|elapsed| elapsed.as_nanos()).unwrap_or(0);
        let temporary = self.dir.join(format!("secrets.v2.json.{}.{nanos}.tmp", std::process::id()));
        if write_new(&temporary, &text).and_then(|()| fs::rename(&temporary, &file)).is_err() {
            let _ = fs::remove_file(&temporary);
            return Err(IpcError::new(ErrorCode::Io, SAVE_FAILED));
        }
        Ok(())
    }
}

/// An unreadable or unknown file counts as empty, as in the Electron store;
/// it is only replaced by the next write.
fn read_file(file: &Path) -> BTreeMap<String, Sealed> {
    let Ok(bytes) = fs::read(file) else { return BTreeMap::new() };
    let Ok(parsed) = serde_json::from_slice::<Value>(&bytes) else { return BTreeMap::new() };
    if parsed["version"].as_u64() != Some(VAULT_VERSION) {
        return BTreeMap::new();
    }
    let Some(secrets) = parsed["secrets"].as_object() else { return BTreeMap::new() };
    secrets
        .iter()
        .filter_map(|(id, entry)| {
            let nonce = entry["nonce"].as_str()?.to_owned();
            let ciphertext = entry["ciphertext"].as_str()?.to_owned();
            Some((id.clone(), Sealed { nonce, ciphertext }))
        })
        .collect()
}

fn seal(key: &[u8; 32], value: &str) -> Result<Sealed, IpcError> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce = [0u8; 12];
    rand::rng().fill_bytes(&mut nonce);
    let ciphertext = cipher.encrypt(Nonce::from_slice(&nonce), value.as_bytes()).map_err(|_| unavailable())?;
    Ok(Sealed { nonce: STANDARD.encode(nonce), ciphertext: STANDARD.encode(ciphertext) })
}

fn open(key: &[u8; 32], sealed: &Sealed) -> Option<String> {
    let nonce: [u8; 12] = STANDARD.decode(&sealed.nonce).ok()?.try_into().ok()?;
    let ciphertext = STANDARD.decode(&sealed.ciphertext).ok()?;
    let plain = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key)).decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref()).ok()?;
    String::from_utf8(plain).ok()
}

/// Every variable of every project: its `globals` and each environment's
/// `variables`. Missing arrays are skipped, as `normalizeWorkspace` fills them.
fn variables_mut(workspace: &mut Value) -> impl Iterator<Item = &mut Map<String, Value>> {
    let projects = workspace.get_mut("projects").and_then(Value::as_array_mut).map(|projects| projects.iter_mut()).into_iter().flatten();
    projects.flat_map(|project| {
        let project = project.as_object_mut();
        let mut lists: Vec<&mut Vec<Value>> = Vec::new();
        if let Some(project) = project {
            let (globals, environments): (Option<&mut Value>, Option<&mut Value>) = {
                let mut globals = None;
                let mut environments = None;
                for (key, value) in project.iter_mut() {
                    match key.as_str() {
                        "globals" => globals = Some(value),
                        "environments" => environments = Some(value),
                        _ => {}
                    }
                }
                (globals, environments)
            };
            if let Some(globals) = globals.and_then(Value::as_array_mut) {
                lists.push(globals);
            }
            if let Some(environments) = environments.and_then(Value::as_array_mut) {
                for environment in environments {
                    if let Some(variables) = environment.get_mut("variables").and_then(Value::as_array_mut) {
                        lists.push(variables);
                    }
                }
            }
        }
        lists.into_iter().flat_map(|list| list.iter_mut().filter_map(Value::as_object_mut))
    })
}

fn is_secret(variable: &Map<String, Value>) -> bool {
    variable.get("secret").is_some_and(|secret| secret.as_bool() == Some(true))
}

fn id_of(variable: &Map<String, Value>) -> Option<String> {
    variable.get("id").and_then(Value::as_str).map(str::to_owned)
}

/// A JS-truthy string `value` (the only kind a variable holds).
fn truthy_value(variable: &Map<String, Value>) -> Option<String> {
    variable.get("value").and_then(Value::as_str).filter(|value| !value.is_empty()).map(str::to_owned)
}

/// Blanks a secret variable and flags whether the vault holds its value.
fn blank(variable: &mut Map<String, Value>, stored: &HashSet<String>) {
    let has = id_of(variable).is_some_and(|id| stored.contains(&id));
    variable.insert("value".into(), Value::from(""));
    variable.insert("hasStoredSecret".into(), Value::from(has));
}

/// Runs before the workspace is written (`extractSecrets`). Secret values move
/// into the vault and are blanked; a non-secret variable loses any stored
/// secret; orphaned secrets (deleted variables) are removed. Afterwards the
/// workspace holds no secret plain text.
pub fn extract_secrets(workspace: &mut Value, vault: &SecretVault) -> Result<(), IpcError> {
    let mut keep = HashSet::new();
    for variable in variables_mut(workspace) {
        if !is_secret(variable) {
            continue;
        }
        let Some(id) = id_of(variable) else { continue };
        keep.insert(id.clone());
        if let Some(value) = truthy_value(variable) {
            vault.set(&id, &value)?;
        } else if let Some(source) = variable.get("copySecretFrom").and_then(Value::as_str).filter(|source| !source.is_empty()) {
            if !vault.has(&id)? {
                if let Some(copied) = vault.get(source)? {
                    vault.set(&id, &copied)?;
                }
            }
        }
    }
    vault.retain_only(&keep)?;
    let stored = vault.ids()?;
    for variable in variables_mut(workspace) {
        variable.shift_remove("copySecretFrom");
        variable.shift_remove("hasStoredSecret");
        if is_secret(variable) {
            blank(variable, &stored);
        }
    }
    Ok(())
}

/// Whether `id` names a secret variable of `workspace` (`isSecretVariable`).
pub fn is_secret_variable(workspace: &mut Value, id: &str) -> bool {
    variables_mut(workspace).any(|variable| is_secret(variable) && variable.get("id").and_then(Value::as_str) == Some(id))
}

/// Runs after load (`annotateSecrets`): blanks any secret value and flags
/// which secrets exist.
pub fn annotate_secrets(workspace: &mut Value, stored: &HashSet<String>) {
    for variable in variables_mut(workspace) {
        if is_secret(variable) {
            blank(variable, stored);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault(dir: &Path) -> SecretVault {
        SecretVault::new(dir, Box::new(MemoryKeyProvider::new()))
    }

    #[test]
    fn round_trips_values_with_a_fresh_nonce_each() {
        let dir = tempfile::tempdir().unwrap();
        let vault = vault(dir.path());
        assert_eq!(vault.get("a").unwrap(), None);
        vault.set("a", "s3cr3t").unwrap();
        vault.set("b", "s3cr3t").unwrap();
        assert_eq!(vault.get("a").unwrap().as_deref(), Some("s3cr3t"));
        let text = fs::read_to_string(vault.file()).unwrap();
        assert!(!text.contains("s3cr3t"), "no plain text on disk");
        let parsed: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed["version"], json!(1));
        assert_ne!(parsed["secrets"]["a"]["nonce"], parsed["secrets"]["b"]["nonce"]);
        assert_ne!(parsed["secrets"]["a"]["ciphertext"], parsed["secrets"]["b"]["ciphertext"]);
    }

    #[test]
    fn reads_back_after_reopening_with_the_same_key() {
        let dir = tempfile::tempdir().unwrap();
        let key = MemoryKeyProvider::new().0;
        SecretVault::new(dir.path(), Box::new(MemoryKeyProvider(key))).set("a", "v").unwrap();
        let reopened = SecretVault::new(dir.path(), Box::new(MemoryKeyProvider(key)));
        assert_eq!(reopened.get("a").unwrap().as_deref(), Some("v"));
        // Another key cannot open it, and says so instead of returning garbage.
        let other = vault(dir.path());
        assert_eq!(other.get("a").unwrap_err(), unavailable());
    }

    #[test]
    fn writes_nothing_when_nothing_changes() {
        let dir = tempfile::tempdir().unwrap();
        let vault = vault(dir.path());
        vault.delete("missing").unwrap();
        vault.retain_only(&HashSet::new()).unwrap();
        assert!(!vault.file().exists());
        vault.set("a", "v").unwrap();
        vault.retain_only(&HashSet::from(["a".to_owned()])).unwrap();
        vault.delete("a").unwrap();
        assert!(vault.ids().unwrap().is_empty());
        let leftovers: Vec<_> = fs::read_dir(dir.path()).unwrap().map(|entry| entry.unwrap().file_name()).collect();
        assert_eq!(leftovers, ["secrets.v2.json"], "no temporary files remain");
    }

    #[test]
    fn treats_an_unreadable_file_as_empty() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("secrets.v2.json"), "{ broken").unwrap();
        let vault = vault(dir.path());
        assert!(vault.ids().unwrap().is_empty());
        vault.set("a", "v").unwrap();
        assert_eq!(vault.get("a").unwrap().as_deref(), Some("v"));
    }

    #[test]
    fn fails_without_a_key_but_still_reports_missing_ids() {
        let dir = tempfile::tempdir().unwrap();
        let vault = SecretVault::new(dir.path(), Box::new(MemoryKeyProvider::unavailable()));
        assert_eq!(vault.get("a").unwrap(), None);
        assert_eq!(vault.set("a", "v").unwrap_err(), IpcError::new(ErrorCode::Io, SECRET_UNAVAILABLE));
        assert!(!vault.file().exists());
    }

    #[test]
    fn never_touches_the_legacy_file() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("secrets.json"), r#"{"a":"djEw"}"#).unwrap();
        let vault = vault(dir.path());
        assert!(vault.ids().unwrap().is_empty());
        vault.set("b", "v").unwrap();
        vault.retain_only(&HashSet::new()).unwrap();
        assert_eq!(fs::read_to_string(dir.path().join("secrets.json")).unwrap(), r#"{"a":"djEw"}"#);
    }

    #[test]
    fn tolerates_projects_without_variables() {
        let dir = tempfile::tempdir().unwrap();
        let vault = vault(dir.path());
        let mut workspace = json!({ "projects": [{ "id": "p" }, { "id": "q", "environments": [{ "id": "e" }] }] });
        let before = workspace.clone();
        extract_secrets(&mut workspace, &vault).unwrap();
        annotate_secrets(&mut workspace, &HashSet::new());
        assert_eq!(workspace, before);
    }
}
