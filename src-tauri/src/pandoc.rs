use tauri_plugin_shell::ShellExt;

/// Convert a binary document (docx/odt) into editor HTML via the bundled pandoc sidecar.
#[tauri::command]
pub(crate) async fn import_via_pandoc(
    app: tauri::AppHandle,
    path: String,
    from: String,
) -> Result<String, String> {
    let output = app
        .shell()
        .sidecar("pandoc")
        .map_err(|e| format!("sidecar pandoc indisponível: {}", e))?
        // --track-changes=all keeps Word comments and tracked changes as spans
        // (the JS side maps them to review marks).
        .args([path.as_str(), "-f", from.as_str(), "-t", "html", "--wrap=none", "--track-changes=all"])
        .output()
        .await
        .map_err(|e| format!("falha ao executar pandoc: {}", e))?;
    if !output.status.success() {
        return Err(format!("pandoc (import) falhou: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Convert a BibTeX/BibLaTeX bibliography into CSL-JSON via the pandoc sidecar.
/// (CSL-JSON files are read directly on the JS side; this is only for .bib.)
#[tauri::command]
pub(crate) async fn import_bibliography(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let output = app
        .shell()
        .sidecar("pandoc")
        .map_err(|e| format!("sidecar pandoc indisponível: {}", e))?
        .args([path.as_str(), "-f", "biblatex", "-t", "csljson"])
        .output()
        .await
        .map_err(|e| format!("falha ao executar pandoc: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "pandoc (bibliografia) falhou: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Convert editor content into a binary document (docx/odt) at `path` via pandoc.
/// `from` is the source format ("html" for plain docs, "markdown" when the doc
/// has footnotes so pandoc emits native Word/ODT notes).
#[tauri::command]
pub(crate) async fn export_via_pandoc(
    app: tauri::AppHandle,
    path: String,
    content: String,
    from: String,
    to: String,
) -> Result<(), String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let ext = if from == "markdown" { "md" } else { "html" };
    let tmp = std::env::temp_dir().join(format!("writer-export-{}.{}", stamp, ext));
    tokio::fs::write(&tmp, &content)
        .await
        .map_err(|e| format!("falha ao gravar temp: {}", e))?;
    let tmp_str = tmp.to_string_lossy().to_string();

    let result = app
        .shell()
        .sidecar("pandoc")
        .map_err(|e| format!("sidecar pandoc indisponível: {}", e))?
        .args([tmp_str.as_str(), "-f", from.as_str(), "-t", to.as_str(), "-o", path.as_str()])
        .output()
        .await;

    let _ = tokio::fs::remove_file(&tmp).await;

    let output = result.map_err(|e| format!("falha ao executar pandoc: {}", e))?;
    if !output.status.success() {
        return Err(format!("pandoc (export) falhou: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}
