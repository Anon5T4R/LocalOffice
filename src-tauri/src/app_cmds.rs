use std::path::Path;

/// File path passed at launch (e.g. when opening a document with the app), if any.
#[tauri::command]
pub(crate) fn get_startup_file() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-') && Path::new(a).is_file())
}

/// Actually quit the app (called by the frontend after confirming unsaved changes).
#[tauri::command]
pub(crate) fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}
