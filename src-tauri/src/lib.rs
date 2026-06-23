use std::fs;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/// Read a UTF-8 text file from disk (used for .md, .txt, .html).
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Falha ao ler '{}': {}", path, e))
}

/// Read any file and return its contents base64-encoded (used to embed images).
#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = fs::read(&path).map_err(|e| format!("Falha ao ler '{}': {}", path, e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Write a UTF-8 text file to disk, creating parent dirs if needed.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Falha ao criar diretório '{}': {}", parent.display(), e))?;
        }
    }
    fs::write(&path, contents).map_err(|e| format!("Falha ao salvar '{}': {}", path, e))
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
fn list_models(dir: String) -> Result<Vec<ModelInfo>, String> {
    let base = PathBuf::from(&dir);
    if !base.exists() {
        return Err(format!("Pasta de modelos não encontrada: {}", dir));
    }
    let mut out = Vec::new();
    collect_gguf(&base, &base, &mut out);
    out.sort_by(|a, b| a.size_gb.partial_cmp(&b.size_gb).unwrap_or(std::cmp::Ordering::Equal));
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

/// Block until the given TCP port accepts a connection, or time out.
fn wait_for_port(port: u16, secs: u64) -> Result<(), String> {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    let attempts = secs * 4;
    for _ in 0..attempts {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err("llama-server não respondeu a tempo".into())
}

/// Start (or restart) llama-server with the chosen model. Returns the port.
#[tauri::command]
fn start_llm(
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

    wait_for_port(port, 180)?;
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
            get_startup_file
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
