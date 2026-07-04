use tauri_plugin_shell::ShellExt;

/// Run the bundled pandoc sidecar with `args` and return its stdout.
/// `label` names the operation in error messages ("import", "export", …).
async fn run_pandoc(app: &tauri::AppHandle, args: &[&str], label: &str) -> Result<String, String> {
    let output = app
        .shell()
        .sidecar("pandoc")
        .map_err(|e| format!("sidecar pandoc indisponível: {}", e))?
        .args(args)
        .output()
        .await
        .map_err(|e| format!("falha ao executar pandoc: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "pandoc ({}) falhou: {}",
            label,
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Convert a binary document (docx/odt) into editor HTML via the bundled pandoc sidecar.
#[tauri::command]
pub(crate) async fn import_via_pandoc(
    app: tauri::AppHandle,
    path: String,
    from: String,
) -> Result<String, String> {
    // --track-changes=all keeps Word comments and tracked changes as spans
    // (the JS side maps them to review marks). --mathjax makes equations come
    // out as \(...\) with the TeX source intact (the default renders them to
    // lossy Unicode); the JS side maps those spans to math nodes.
    //
    // --extract-media + --embed-resources: without them pandoc emits
    // <img src="media/rIdN.png"> — a path INSIDE the zip that exists nowhere
    // on disk, so every embedded image comes in broken and is silently lost
    // on the next save. Extracting to a temp dir and embedding in the same
    // invocation turns them into data URIs (the app's native image storage;
    // documents stay self-contained). The temp dir is a side effect of the
    // conversion only — removed right after, success or failure.
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let media_dir = std::env::temp_dir().join(format!("writer-import-media-{}", stamp));
    let media_arg = format!("--extract-media={}", media_dir.to_string_lossy());

    let result = run_pandoc(
        &app,
        &[
            path.as_str(),
            "-f",
            from.as_str(),
            "-t",
            "html",
            "--wrap=none",
            "--track-changes=all",
            "--mathjax",
            media_arg.as_str(),
            "--embed-resources",
        ],
        "import",
    )
    .await;

    let _ = tokio::fs::remove_dir_all(&media_dir).await;
    result
}

/// Convert a BibTeX/BibLaTeX bibliography into CSL-JSON via the pandoc sidecar.
/// (CSL-JSON files are read directly on the JS side; this is only for .bib.)
#[tauri::command]
pub(crate) async fn import_bibliography(app: tauri::AppHandle, path: String) -> Result<String, String> {
    run_pandoc(&app, &[path.as_str(), "-f", "biblatex", "-t", "csljson"], "bibliografia").await
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

    // +raw_attribute lets markdown carry inline `<xml>`{=openxml} spans that
    // pandoc's docx writer passes through byte-for-byte (docxFields.ts uses
    // this for native SEQ/REF fields). No effect on documents that don't use
    // the syntax, so always-on for the markdown reader is safe.
    let from_arg = if from == "markdown" { "markdown+raw_attribute" } else { from.as_str() };

    // DOCX gets a reference doc whose Normal/heading styles are Times New Roman
    // 12pt, so the whole document uses the ABNT font (pandoc's default is
    // Calibri). The bytes are embedded in the binary and written to a temp file
    // per export — pandoc needs a path, and this avoids resource-dir lookups.
    // The alignment/indent of styled paragraphs comes through separately as raw
    // OOXML (exportPrep.ts); together they reproduce the template in Word.
    let reference_tmp = if to == "docx" {
        let rt = std::env::temp_dir().join(format!("writer-reference-{}.docx", stamp));
        let bytes: &[u8] = include_bytes!("../resources/reference-times.docx");
        match tokio::fs::write(&rt, bytes).await {
            Ok(_) => Some(rt),
            Err(_) => None, // fall back to pandoc's default font rather than fail
        }
    } else {
        None
    };

    let mut args: Vec<&str> = vec![tmp_str.as_str(), "-f", from_arg, "-t", to.as_str(), "-o", path.as_str()];
    let ref_arg;
    if let Some(rt) = &reference_tmp {
        ref_arg = format!("--reference-doc={}", rt.to_string_lossy());
        args.push(ref_arg.as_str());
    }

    let result = run_pandoc(&app, &args, "export").await;

    let _ = tokio::fs::remove_file(&tmp).await;
    if let Some(rt) = &reference_tmp {
        let _ = tokio::fs::remove_file(rt).await;
    }
    result.map(|_| ())
}
