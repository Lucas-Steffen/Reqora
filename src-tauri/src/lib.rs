pub mod commands;
pub mod ipc;
pub mod migrate;
pub mod secrets;
pub mod store;

use secrets::{KeyringKeyProvider, SecretVault};
use std::sync::Arc;
use store::workspace::WorkspaceStore;
use tauri::Manager;

/// Starts the Tauri host. The window, CSP and capabilities live in
/// `tauri.conf.json` and `capabilities/`. On start the Electron profile is
/// copied once into the app data directory (see `migrate::legacy`).
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let paths = app.path();
            let data_dir = paths.app_data_dir()?;
            let store = match paths.config_dir() {
                Ok(config) => match migrate::legacy::import_legacy(&config.join("reqora"), &data_dir) {
                    Ok(_) => WorkspaceStore::new(&data_dir),
                    // Never fall back to the demo over data that is still in the old profile.
                    Err(error) => WorkspaceStore::failed(&data_dir, format!("The Electron workspace could not be imported: {error}")),
                },
                Err(_) => WorkspaceStore::new(&data_dir),
            };
            // The master key lives in the OS keychain; values in `secrets.v2.json`.
            let vault = Arc::new(SecretVault::new(&data_dir, Box::new(KeyringKeyProvider)));
            app.manage(store.with_secrets(vault));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workspace::workspace_load, commands::workspace::workspace_save, commands::workspace::secret_reveal
        ])
        .run(tauri::generate_context!())
        .expect("error while running Reqora");
}
