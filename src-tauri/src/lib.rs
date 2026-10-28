/// Starts the Tauri host. The window, CSP and capabilities live in
/// `tauri.conf.json` and `capabilities/`; no commands are exposed yet, so the
/// renderer runs on the in-memory platform adapter.
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Reqora");
}
