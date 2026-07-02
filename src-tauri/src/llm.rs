use std::fs;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, State};
use tokio::net::TcpStream;
use tokio::time::sleep;

#[derive(Default)]
pub(crate) struct LlmState {
    child: Option<Child>,
    port: u16,
    model: String,
}

/// Lock the LLM state even if a previous holder panicked. The state is just an
/// `Option<Child>` plus plain values — it can't be left logically inconsistent,
/// so recovering from a poisoned lock is always safe (and crashing the command
/// over it would take the whole backend down with it).
pub(crate) fn lock_llm(m: &Mutex<LlmState>) -> std::sync::MutexGuard<'_, LlmState> {
    m.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// Kill the llama-server child on app exit (best-effort, no reaping).
pub(crate) fn kill_llm_on_exit(app_handle: &tauri::AppHandle) {
    if let Some(state) = app_handle.try_state::<Mutex<LlmState>>() {
        if let Some(child) = lock_llm(&state).child.as_mut() {
            let _ = child.kill();
        }
    }
}

/// Kill a llama-server child and reap it. `wait` blocks until process teardown
/// finishes, so this runs off the async runtime threads.
async fn kill_llm_child(mut child: Child) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let _ = child.kill();
        let _ = child.wait();
    })
    .await
    .map_err(|e| format!("falha ao encerrar llama-server: {}", e))
}

#[derive(serde::Serialize)]
pub(crate) struct ModelInfo {
    name: String,
    path: String,
    size_gb: f64,
    is_projector: bool,
}

#[derive(serde::Serialize)]
pub(crate) struct LlmStatus {
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
pub(crate) async fn list_models(dir: String) -> Result<Vec<ModelInfo>, String> {
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

/// Block until OUR llama-server accepts a connection on the port, or fail.
///
/// Checks the child's liveness before every connect attempt: if another
/// program already owns the port, llama-server dies at bind — but a plain
/// port probe would connect to the foreign listener and report success,
/// and the app would then stream document text to whatever process that
/// is. A dead child also fails fast on bad models / OOM instead of
/// spinning out the full timeout.
async fn wait_for_llm(state: &Mutex<LlmState>, port: u16, secs: u64) -> Result<(), String> {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    let attempts = secs * 4;
    for _ in 0..attempts {
        {
            let mut s = lock_llm(state);
            match s.child.as_mut() {
                None => return Err("llama-server foi encerrado durante a inicialização".into()),
                Some(child) => {
                    if let Ok(Some(status)) = child.try_wait() {
                        s.child = None;
                        return Err(format!(
                            "llama-server encerrou ao iniciar ({}). A porta {} pode estar em uso por outro programa, ou o modelo é inválido.",
                            status, port
                        ));
                    }
                }
            }
        }
        if let Ok(Ok(_)) = tokio::time::timeout(Duration::from_millis(200), TcpStream::connect(addr)).await {
            return Ok(());
        }
        sleep(Duration::from_millis(250)).await;
    }
    Err("llama-server não respondeu a tempo".into())
}

/// Start (or restart) llama-server with the chosen model. Returns the port.
#[tauri::command]
pub(crate) async fn start_llm(
    app: tauri::AppHandle,
    state: State<'_, Mutex<LlmState>>,
    model_path: String,
    n_gpu_layers: i32,
    ctx_size: u32,
) -> Result<u16, String> {
    // Stop any running instance first.
    let old = lock_llm(&state).child.take();
    if let Some(child) = old {
        kill_llm_child(child).await?;
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
        let mut s = lock_llm(&state);
        s.child = Some(child);
        s.port = port;
        s.model = model_path;
    }

    wait_for_llm(&state, port, 180).await?;
    Ok(port)
}

/// Stop the running llama-server, if any.
#[tauri::command]
pub(crate) async fn stop_llm(state: State<'_, Mutex<LlmState>>) -> Result<(), String> {
    let child = {
        let mut s = lock_llm(&state);
        s.model.clear();
        s.child.take()
    };
    if let Some(child) = child {
        kill_llm_child(child).await?;
    }
    Ok(())
}

/// Report whether llama-server is currently running.
#[tauri::command]
pub(crate) fn llm_status(state: State<'_, Mutex<LlmState>>) -> LlmStatus {
    let mut s = lock_llm(&state);
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
