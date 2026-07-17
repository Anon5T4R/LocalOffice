use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

mod app_cmds;
mod fonts;
mod io;
mod llm;
mod pandoc;
mod versions;

use llm::LlmState;
use versions::VersionStore;

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
        .manage(VersionStore::default())
        // Ctrl+F: o WebView2 tem uma barra nativa de "Localizar na página" que
        // varre o DOM inteiro (botões, painéis — não só o documento) e que o
        // preventDefault do JS NÃO consegue suprimir: é uma "browser
        // accelerator key", tratada no processo do navegador antes da página.
        // Desligar essas teclas faz o Ctrl+F chegar só na busca própria do app
        // (SearchBar/SearchExtension, que busca no modelo do ProseMirror) — o
        // evento de teclado continua propagando pro conteúdo web normalmente.
        // Também desativa F5/Ctrl+P/F3 nativos, que aqui só atrapalham (recarga
        // perde estado; o app tem zoom, impressão/PDF e busca próprios).
        .setup(|app| {
            #[cfg(windows)]
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.with_webview(|webview| {
                    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
                    use windows_core::Interface;
                    let result: windows_core::Result<()> = (|| unsafe {
                        webview
                            .controller()
                            .CoreWebView2()?
                            .Settings()?
                            .cast::<ICoreWebView2Settings3>()?
                            .SetAreBrowserAcceleratorKeysEnabled(false)
                    })();
                    if let Err(e) = result {
                        eprintln!("aviso: não deu pra desligar as accelerator keys do WebView2: {e}");
                    }
                });
            }
            Ok(())
        })
        // Intercept the window close: keep the app open and ask the frontend to
        // confirm (it knows which tabs are unsaved). The frontend then calls exit_app.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("close-requested", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            io::read_text_file,
            io::read_file_base64,
            io::write_text_file,
            io::remove_file,
            pandoc::import_via_pandoc,
            pandoc::export_via_pandoc,
            pandoc::import_bibliography,
            llm::list_models,
            llm::start_llm,
            llm::stop_llm,
            llm::llm_status,
            app_cmds::get_startup_file,
            app_cmds::exit_app,
            fonts::list_system_fonts,
            fonts::import_font,
            versions::save_version,
            versions::list_versions,
            versions::load_version,
            versions::delete_version
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Ensure the llama-server child is killed when the app exits.
            if let tauri::RunEvent::Exit = event {
                llm::kill_llm_on_exit(app_handle);
            }
        });
}
