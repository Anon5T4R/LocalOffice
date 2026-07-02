use std::path::PathBuf;
use tauri::{Manager, State};

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
pub(crate) struct VersionInfo {
    id: String,
    name: String,
    ts: u64,
    has_content: bool,
}

/// Serializes access to the shared per-document meta file. Version commands do a
/// read-modify-write on it; without this lock two concurrent saves could each
/// read the same meta, add their entry, and the later write would drop the
/// other's. An async mutex because the guard is held across `await`s. Reads
/// take it too, so a listing never sees a half-written file.
#[derive(Default)]
pub(crate) struct VersionStore(tokio::sync::Mutex<()>);

/// Snapshots per document. On overflow the oldest one is pruned (standard
/// version-history behavior) so app_data can't grow without bound.
const MAX_VERSIONS_PER_DOC: usize = 50;

fn versions_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // Pure path builder (no I/O). Writers call `ensure_versions_dir` first;
    // readers tolerate the directory being absent.
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("data dir: {}", e))?
        .join("versions"))
}

async fn ensure_versions_dir(app: &tauri::AppHandle) -> Result<(), String> {
    tokio::fs::create_dir_all(versions_dir(app)?)
        .await
        .map_err(|e| format!("criar versions dir: {}", e))
}

/// Stable filename slug for a document's version store.
///
/// FNV-1a, spelled out explicitly: unlike `DefaultHasher` (whose algorithm is
/// deliberately unspecified and may change between Rust releases), this yields
/// the same slug forever, so a toolchain upgrade can never orphan a user's
/// saved version history.
fn version_slug(doc_path: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in doc_path.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("v_{:016x}", hash)
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

async fn read_meta(app: &tauri::AppHandle, doc_path: &str) -> Result<VersionMeta, String> {
    let path = version_meta_path(app, doc_path)?;
    match tokio::fs::read_to_string(&path).await {
        Ok(raw) => serde_json::from_str(&raw).map_err(|e| format!("parse meta: {}", e)),
        // First version of this doc — no meta file yet.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(VersionMeta { doc_path: doc_path.to_string(), versions: Vec::new() })
        }
        Err(e) => Err(format!("ler meta: {}", e)),
    }
}

async fn write_meta(app: &tauri::AppHandle, meta: &VersionMeta) -> Result<(), String> {
    ensure_versions_dir(app).await?;
    let path = version_meta_path(app, &meta.doc_path)?;
    let raw = serde_json::to_string_pretty(meta).map_err(|e| format!("serializar meta: {}", e))?;
    tokio::fs::write(&path, raw)
        .await
        .map_err(|e| format!("salvar meta: {}", e))
}

/// Save a named version of the document.
#[tauri::command]
pub(crate) async fn save_version(
    app: tauri::AppHandle,
    store: State<'_, VersionStore>,
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
    ensure_versions_dir(&app).await?;
    let cpath = version_content_path(&app, &doc_path, &id)?;
    tokio::fs::write(&cpath, &content)
        .await
        .map_err(|e| format!("salvar versão: {}", e))?;

    // Update meta under the store lock so concurrent saves don't clobber it.
    let _guard = store.0.lock().await;
    let mut meta = read_meta(&app, &doc_path).await?;
    meta.versions.push(VersionEntry { id, name, ts });

    // Prune the oldest snapshots past the cap (entries are pushed in
    // chronological order, so draining from the front removes the oldest).
    while meta.versions.len() > MAX_VERSIONS_PER_DOC {
        let victim = meta.versions.remove(0);
        if let Ok(cpath) = version_content_path(&app, &doc_path, &victim.id) {
            let _ = tokio::fs::remove_file(&cpath).await; // best-effort
        }
    }

    write_meta(&app, &meta).await?;
    Ok(())
}

/// List all versions of a document.
#[tauri::command]
pub(crate) async fn list_versions(
    app: tauri::AppHandle,
    store: State<'_, VersionStore>,
    doc_path: String,
) -> Result<Vec<VersionInfo>, String> {
    let _guard = store.0.lock().await;
    let meta = read_meta(&app, &doc_path).await?;
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
    out.sort_by_key(|v| std::cmp::Reverse(v.ts)); // newest first
    Ok(out)
}

/// Load a specific version's content.
#[tauri::command]
pub(crate) async fn load_version(
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
pub(crate) async fn delete_version(
    app: tauri::AppHandle,
    store: State<'_, VersionStore>,
    doc_path: String,
    version_id: String,
) -> Result<(), String> {
    // Delete content file
    let cpath = version_content_path(&app, &doc_path, &version_id)?;
    let _ = tokio::fs::remove_file(&cpath).await;
    // Remove from meta under the store lock.
    let _guard = store.0.lock().await;
    let mut meta = read_meta(&app, &doc_path).await?;
    meta.versions.retain(|v| v.id != version_id);
    write_meta(&app, &meta).await
}
