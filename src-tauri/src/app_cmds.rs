use std::path::Path;

/// File path passed at launch (e.g. when opening a document with the app), if any.
/// Async so the `is_file()` stat (which can touch a network drive or a cloud
/// placeholder like OneDrive) never runs on the main thread.
#[tauri::command]
pub(crate) async fn get_startup_file() -> Option<String> {
    tokio::task::spawn_blocking(|| {
        std::env::args()
            .skip(1)
            .find(|a| !a.starts_with('-') && Path::new(a).is_file())
    })
    .await
    .ok()
    .flatten()
}

/// Actually quit the app (called by the frontend after confirming unsaved changes).
#[tauri::command]
pub(crate) fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}
