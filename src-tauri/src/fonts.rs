use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(serde::Serialize)]
pub(crate) struct FontInfo {
    name: String,
    base64: String,
}

/// Scan standard system font directories and return unique font family names.
#[tauri::command]
pub(crate) async fn list_system_fonts() -> Result<Vec<String>, String> {
    // Scanning font directories reads and parses every .ttf/.otf on disk, so
    // keep it off the async runtime threads.
    tokio::task::spawn_blocking(|| {
        let mut names = HashSet::new();
        for dir in font_search_dirs() {
            scan_font_dir(&dir, &mut names);
        }
        let mut sorted: Vec<_> = names.into_iter().collect();
        sorted.sort_by_key(|name| name.to_lowercase());
        sorted
    })
    .await
    .map_err(|e| format!("erro ao listar fontes: {}", e))
}

/// Read a font file, extract its family name, and return base64 data + name.
#[tauri::command]
pub(crate) async fn import_font(path: String) -> Result<FontInfo, String> {
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
