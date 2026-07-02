use std::path::Path;

/// Read a UTF-8 text file from disk (used for .md, .txt, .html).
#[tauri::command]
pub(crate) async fn read_text_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Falha ao ler '{}': {}", path, e))
}

/// Read any file and return its contents base64-encoded (used to embed images).
#[tauri::command]
pub(crate) async fn read_file_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Falha ao ler '{}': {}", path, e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Atomic text write, shared by every persistence path (documents here,
/// version snapshots/meta in versions.rs).
///
/// Writes to a sibling `.tmp` file and renames it into place: a rename is
/// atomic on both NTFS and POSIX filesystems, so a process killed mid-write
/// (window force-closed, `exit_app` racing the write) leaves either the old
/// file intact or the new one complete — never a truncated partial write.
pub(crate) async fn write_atomic(path: &str, contents: &str) -> Result<(), String> {
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Falha ao criar diretório '{}': {}", parent.display(), e))?;
        }
    }
    let tmp_path = format!("{}.tmp", path);
    tokio::fs::write(&tmp_path, contents)
        .await
        .map_err(|e| format!("Falha ao salvar '{}': {}", path, e))?;
    tokio::fs::rename(&tmp_path, path)
        .await
        .map_err(|e| format!("Falha ao salvar '{}': {}", path, e))
}

/// Write a UTF-8 text file to disk, creating parent dirs if needed (atomic).
#[tauri::command]
pub(crate) async fn write_text_file(path: String, contents: String) -> Result<(), String> {
    write_atomic(&path, &contents).await
}

/// Delete a file if it exists; a no-op if it doesn't.
#[tauri::command]
pub(crate) async fn remove_file(path: String) -> Result<(), String> {
    match tokio::fs::remove_file(&path).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Falha ao remover '{}': {}", path, e)),
    }
}
