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

/// Write a UTF-8 text file to disk, creating parent dirs if needed.
#[tauri::command]
pub(crate) async fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Falha ao criar diretório '{}': {}", parent.display(), e))?;
        }
    }
    tokio::fs::write(&path, contents)
        .await
        .map_err(|e| format!("Falha ao salvar '{}': {}", path, e))
}
