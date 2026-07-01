use std::collections::HashSet;
use std::fs;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;
use tokio::net::TcpStream;
use tokio::time::sleep;

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/// Read a UTF-8 text file from disk (used for .md, .txt, .html).
#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Falha ao ler '{}': {}", path, e))
}

/// Read any file and return its contents base64-encoded (used to embed images).
#[tauri::command]
async fn read_file_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Falha ao ler '{}': {}", path, e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Write a UTF-8 text file to disk, creating parent dirs if needed.
#[tauri::command]
async fn write_text_file(path: String, contents: String) -> Result<(), String> {
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

// ---------------------------------------------------------------------------
// DOCX/ODT via pandoc sidecar
// ---------------------------------------------------------------------------

/// Convert a binary document (docx/odt) into editor HTML via the bundled pandoc sidecar.
#[tauri::command]
async fn import_via_pandoc(app: tauri::AppHandle, path: String, from: String) -> Result<String, String> {
    let output = app
        .shell()
        .sidecar("pandoc")
        .map_err(|e| format!("sidecar pandoc indisponível: {}", e))?
        .args([path.as_str(), "-f", from.as_str(), "-t", "html", "--wrap=none"])
        .output()
        .await
        .map_err(|e| format!("falha ao executar pandoc: {}", e))?;
    if !output.status.success() {
        return Err(format!("pandoc (import) falhou: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Convert editor HTML into a binary document (docx/odt) at `path` via pandoc.
#[tauri::command]
async fn export_via_pandoc(
    app: tauri::AppHandle,
    path: String,
    html: String,
    to: String,
) -> Result<(), String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let tmp = std::env::temp_dir().join(format!("writer-export-{}.html", stamp));
    fs::write(&tmp, &html).map_err(|e| format!("falha ao gravar temp: {}", e))?;
    let tmp_str = tmp.to_string_lossy().to_string();

    let result = app
        .shell()
        .sidecar("pandoc")
        .map_err(|e| format!("sidecar pandoc indisponível: {}", e))?
        .args([tmp_str.as_str(), "-f", "html", "-t", to.as_str(), "-o", path.as_str()])
        .output()
        .await;

    let _ = fs::remove_file(&tmp);

    let output = result.map_err(|e| format!("falha ao executar pandoc: {}", e))?;
    if !output.status.success() {
        return Err(format!("pandoc (export) falhou: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Local AI: llama-server lifecycle
// ---------------------------------------------------------------------------

#[derive(Default)]
struct LlmState {
    child: Option<Child>,
    port: u16,
    model: String,
}

#[derive(serde::Serialize)]
struct ModelInfo {
    name: String,
    path: String,
    size_gb: f64,
    is_projector: bool,
}

#[derive(serde::Serialize)]
struct LlmStatus {
    running: bool,
    port: u16,
    model: String,
}

fn collect_gguf(dir: &Path, base: &Path, out: &mut Vec<ModelInfo>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_gguf(&path, base, out);
        } else if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("gguf"))
            .unwrap_or(false)
        {
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            out.push(ModelInfo {
                name: path.strip_prefix(base).unwrap_or(&path).to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                size_gb: (size as f64) / 1_000_000_000.0,
                is_projector: file_name.to_lowercase().starts_with("mmproj"),
            });
        }
    }
}

/// List all .gguf models found (recursively) under `dir`.
#[tauri::command]
async fn list_models(dir: String) -> Result<Vec<ModelInfo>, String> {
    let base = PathBuf::from(&dir);
    if !base.exists() {
        return Err(format!("Pasta de modelos não encontrada: {}", dir));
    }
    let base_for_blocking = base.clone();
    let out = tokio::task::spawn_blocking(move || {
        let mut out = Vec::new();
        collect_gguf(&base_for_blocking, &base_for_blocking, &mut out);
        out.sort_by(|a, b| a.size_gb.partial_cmp(&b.size_gb).unwrap_or(std::cmp::Ordering::Equal));
        out
    })
    .await
    .map_err(|e| format!("erro ao escanear modelos: {}", e))?;
    Ok(out)
}

/// Platform-specific name of the llama.cpp server binary.
const LLAMA_SERVER_BIN: &str = if cfg!(windows) { "llama-server.exe" } else { "llama-server" };

/// Locate the bundled llama-server.
/// Dev: cwd/binaries/llama. Prod: Tauri resource dir.
fn resolve_llama_server(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let rel = format!("binaries/llama/{}", LLAMA_SERVER_BIN);
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join(&rel));
    }
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join(&rel));
        candidates.push(res.join(format!("llama/{}", LLAMA_SERVER_BIN)));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(&rel));
            candidates.push(dir.join(format!("llama/{}", LLAMA_SERVER_BIN)));
        }
    }
    for c in candidates {
        if c.exists() {
            return Ok(c);
        }
    }
    Err("llama-server não encontrado (runtime de IA ausente)".into())
}

/// File path passed at launch (e.g. when opening a document with the app), if any.
#[tauri::command]
fn get_startup_file() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-') && Path::new(a).is_file())
}

/// Actually quit the app (called by the frontend after confirming unsaved changes).
#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Block until the given TCP port accepts a connection, or time out.
async fn wait_for_port(port: u16, secs: u64) -> Result<(), String> {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    let attempts = secs * 4;
    for _ in 0..attempts {
        match tokio::time::timeout(Duration::from_millis(200), TcpStream::connect(addr)).await {
            Ok(Ok(_)) => return Ok(()),
            _ => {}
        }
        sleep(Duration::from_millis(250)).await;
    }
    Err("llama-server não respondeu a tempo".into())
}

/// Start (or restart) llama-server with the chosen model. Returns the port.
#[tauri::command]
async fn start_llm(
    app: tauri::AppHandle,
    state: State<'_, Mutex<LlmState>>,
    model_path: String,
    n_gpu_layers: i32,
    ctx_size: u32,
) -> Result<u16, String> {
    // Stop any running instance first.
    {
        let mut s = state.lock().map_err(|_| "estado da IA corrompido")?;
        if let Some(child) = s.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        s.child = None;
    }

    let exe = resolve_llama_server(&app)?;
    let dir = exe.parent().ok_or("diretório do llama inválido")?.to_path_buf();
    let port: u16 = 8088;

    let mut cmd = Command::new(&exe);
    cmd.current_dir(&dir).args([
        "--model",
        &model_path,
        "--host",
        "127.0.0.1",
        "--port",
        &port.to_string(),
        "-ngl",
        &n_gpu_layers.to_string(),
        "-c",
        &ctx_size.to_string(),
        "--no-webui",
    ]);

    // Don't pop a console window on Windows (CREATE_NO_WINDOW).
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("falha ao iniciar llama-server: {}", e))?;

    {
        let mut s = state.lock().map_err(|_| "estado da IA corrompido")?;
        s.child = Some(child);
        s.port = port;
        s.model = model_path;
    }

    wait_for_port(port, 180).await?;
    Ok(port)
}

/// Stop the running llama-server, if any.
#[tauri::command]
fn stop_llm(state: State<'_, Mutex<LlmState>>) -> Result<(), String> {
    let mut s = state.lock().map_err(|_| "estado da IA corrompido")?;
    if let Some(child) = s.child.as_mut() {
        let _ = child.kill();
        let _ = child.wait();
    }
    s.child = None;
    s.model.clear();
    Ok(())
}

// ---------------------------------------------------------------------------
// Font management
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
struct FontInfo {
    name: String,
    base64: String,
}

/// Scan standard system font directories and return unique font family names.
#[tauri::command]
async fn list_system_fonts() -> Result<Vec<String>, String> {
    let dirs = font_search_dirs();
    let mut names = HashSet::new();
    for dir in dirs {
        scan_font_dir(&dir, &mut names);
    }
    let mut sorted: Vec<_> = names.into_iter().collect();
    sorted.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Ok(sorted)
}

/// Read a font file, extract its family name, and return base64 data + name.
#[tauri::command]
async fn import_font(path: String) -> Result<FontInfo, String> {
    use base64::Engine;
    let data = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Falha ao ler fonte '{}': {}", path, e))?;
    let name = extract_font_name(&data)
        .unwrap_or_else(|| {
            Path::new(&path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Fonte")
                .to_string()
        });
    let base64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(FontInfo { name, base64 })
}

fn font_search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    // Windows
    if cfg!(windows) {
        let win_dir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
        dirs.push(PathBuf::from(&win_dir).join("Fonts"));
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            dirs.push(PathBuf::from(local).join(r"Microsoft\Windows\Fonts"));
        }
    }
    // macOS
    if cfg!(target_os = "macos") {
        dirs.push(PathBuf::from("/System/Library/Fonts"));
        dirs.push(PathBuf::from("/Library/Fonts"));
        if let Ok(home) = std::env::var("HOME") {
            dirs.push(PathBuf::from(&home).join("Library/Fonts"));
        }
    }
    // Linux
    if cfg!(unix) && !cfg!(target_os = "macos") {
        dirs.push(PathBuf::from("/usr/share/fonts"));
        dirs.push(PathBuf::from("/usr/local/share/fonts"));
        if let Ok(home) = std::env::var("HOME") {
            dirs.push(PathBuf::from(&home).join(".fonts"));
            dirs.push(PathBuf::from(&home).join(".local/share/fonts"));
        }
    }
    dirs
}

fn scan_font_dir(dir: &Path, names: &mut HashSet<String>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_font_dir(&path, names);
        } else {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();
            if ext != "ttf" && ext != "otf" && ext != "ttc" {
                continue;
            }
            let data = match fs::read(&path) {
                Ok(d) => d,
                Err(_) => continue,
            };
            if let Some(name) = extract_font_name(&data) {
                names.insert(name);
            }
        }
    }
}

fn extract_font_name(data: &[u8]) -> Option<String> {
    let face = ttf_parser::Face::parse(data, 0).ok()?;
    for name in face.names() {
        let id = name.name_id;
        if id == ttf_parser::name_id::FULL_NAME
            || id == ttf_parser::name_id::FAMILY
        {
            if let Some(s) = name.to_string() {
                if !s.is_empty() {
                    return Some(s);
                }
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Document versioning
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct VersionEntry {
    id: String,
    name: String,
    ts: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct VersionMeta {
    doc_path: String,
    versions: Vec<VersionEntry>,
}

#[derive(serde::Serialize)]
struct VersionInfo {
    id: String,
    name: String,
    ts: u64,
    has_content: bool,
}

fn versions_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("data dir: {}", e))?
        .join("versions");
    fs::create_dir_all(&dir).map_err(|e| format!("criar versions dir: {}", e))?;
    Ok(dir)
}

fn version_slug(doc_path: &str) -> String {
    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;
    let mut h = DefaultHasher::new();
    doc_path.hash(&mut h);
    format!("v_{:x}", h.finish())
}

fn version_meta_path(app: &tauri::AppHandle, doc_path: &str) -> Result<PathBuf, String> {
    Ok(versions_dir(app)?.join(format!("{}.json", version_slug(doc_path))))
}

fn version_content_path(
    app: &tauri::AppHandle,
    doc_path: &str,
    version_id: &str,
) -> Result<PathBuf, String> {
    Ok(versions_dir(app)?
        .join(format!("{}_{}.json", version_slug(doc_path), version_id)))
}

fn read_meta(app: &tauri::AppHandle, doc_path: &str) -> Result<VersionMeta, String> {
    let path = version_meta_path(app, doc_path)?;
    if !path.exists() {
        return Ok(VersionMeta { doc_path: doc_path.to_string(), versions: Vec::new() });
    }
    let raw =
        fs::read_to_string(&path).map_err(|e| format!("ler meta: {}", e))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse meta: {}", e))
}

fn write_meta(app: &tauri::AppHandle, meta: &VersionMeta) -> Result<(), String> {
    let path = version_meta_path(app, &meta.doc_path)?;
    let raw = serde_json::to_string_pretty(meta).map_err(|e| format!("serializar meta: {}", e))?;
    fs::write(&path, raw).map_err(|e| format!("salvar meta: {}", e))
}

/// Save a named version of the document.
#[tauri::command]
async fn save_version(
    app: tauri::AppHandle,
    doc_path: String,
    name: String,
    content: String,
) -> Result<(), String> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let id = format!("v_{}", ts);

    // Save content
    let cpath = version_content_path(&app, &doc_path, &id)?;
    tokio::fs::write(&cpath, &content)
        .await
        .map_err(|e| format!("salvar versão: {}", e))?;

    // Update meta
    let mut meta = read_meta(&app, &doc_path)?;
    meta.versions.push(VersionEntry {
        id: id.clone(),
        name,
        ts,
    });
    write_meta(&app, &meta)?;
    Ok(())
}

/// List all versions of a document.
#[tauri::command]
async fn list_versions(
    app: tauri::AppHandle,
    doc_path: String,
) -> Result<Vec<VersionInfo>, String> {
    let meta = read_meta(&app, &doc_path)?;
    let mut out: Vec<VersionInfo> = meta
        .versions
        .into_iter()
        .map(|v| {
            let cpath = version_content_path(&app, &doc_path, &v.id).ok();
            let has = cpath.as_ref().map(|p| p.exists()).unwrap_or(false);
            VersionInfo {
                id: v.id,
                name: v.name,
                ts: v.ts,
                has_content: has,
            }
        })
        .collect();
    out.sort_by(|a, b| b.ts.cmp(&a.ts)); // newest first
    Ok(out)
}

/// Load a specific version's content.
#[tauri::command]
async fn load_version(
    app: tauri::AppHandle,
    doc_path: String,
    version_id: String,
) -> Result<String, String> {
    let cpath = version_content_path(&app, &doc_path, &version_id)?;
    tokio::fs::read_to_string(&cpath)
        .await
        .map_err(|e| format!("ler versão: {}", e))
}

/// Delete a specific version.
#[tauri::command]
async fn delete_version(
    app: tauri::AppHandle,
    doc_path: String,
    version_id: String,
) -> Result<(), String> {
    // Delete content file
    let cpath = version_content_path(&app, &doc_path, &version_id)?;
    let _ = tokio::fs::remove_file(&cpath).await;
    // Remove from meta
    let mut meta = read_meta(&app, &doc_path)?;
    meta.versions.retain(|v| v.id != version_id);
    write_meta(&app, &meta)
}

/// Report whether llama-server is currently running.
#[tauri::command]
fn llm_status(state: State<'_, Mutex<LlmState>>) -> LlmStatus {
    let mut s = state.lock().expect("estado da IA");
    let running = match s.child.as_mut() {
        Some(child) => matches!(child.try_wait(), Ok(None)),
        None => false,
    };
    LlmStatus {
        running,
        port: s.port,
        model: s.model.clone(),
    }
}

// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single-instance must be registered first: a 2nd launch (e.g. "open with")
        // forwards the file path to the running window instead of starting a new app.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(file) = argv.iter().skip(1).find(|a| Path::new(a).is_file()) {
                let _ = app.emit("open-file", file.clone());
            }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(LlmState::default()))
        // Intercept the window close: keep the app open and ask the frontend to
        // confirm (it knows which tabs are unsaved). The frontend then calls exit_app.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("close-requested", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            read_file_base64,
            write_text_file,
            import_via_pandoc,
            export_via_pandoc,
            list_models,
            start_llm,
            stop_llm,
            llm_status,
            get_startup_file,
            exit_app,
            list_system_fonts,
            import_font,
            save_version,
            list_versions,
            load_version,
            delete_version
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Ensure the llama-server child is killed when the app exits.
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<Mutex<LlmState>>() {
                    if let Ok(mut s) = state.lock() {
                        if let Some(child) = s.child.as_mut() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
