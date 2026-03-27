#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;
mod ai_settings;
mod commands;
mod menu;
mod state;
mod watcher;

use ai_settings::AiSettingsState;
use state::AppState;
use std::path::PathBuf;
use tauri::{Emitter, Manager};
use watcher::WatcherRegistry;

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Resolve the Tauri app data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));

            // Default notebook root: ~/Documents/Notebook.md/
            let notebooks_root = dirs_next()
                .unwrap_or_else(|| app_data_dir.join("notebooks"));

            let ai_settings = AiSettingsState::new(&app_data_dir);
            let app_state = AppState::new(app_data_dir, notebooks_root);
            app.manage(app_state);
            app.manage(ai_settings);
            app.manage(WatcherRegistry::new());

            // Build and attach native menu bar
            let handle = app.handle().clone();
            let native_menu = menu::build_menu(&handle)
                .map_err(|e| e.to_string())?;
            app.set_menu(native_menu)
                .map_err(|e| e.to_string())?;

            // Listen for menu events
            let handle2 = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                menu::handle_menu_event(&handle2, event.id().as_ref());
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_notebook,
            commands::upsert_notebook,
            commands::list_notebooks,
            commands::rename_notebook,
            commands::delete_notebook,
            commands::reorder_notebooks,
            commands::create_file,
            commands::get_file,
            commands::list_notebook_files,
            commands::list_children,
            commands::write_file,
            commands::rename_file,
            commands::delete_file,
            commands::move_file,
            commands::ensure_assets_folder,
            commands::open_folder_as_notebook,
            commands::read_standalone_file,
            commands::write_standalone_file,
            watcher::watch_directory,
            watcher::unwatch_directory,
            ai_settings::get_ai_settings,
            ai_settings::is_ai_configured,
            ai_settings::save_ai_settings,
            ai_settings::test_ai_connection,
            ai::ai_generate,
            ai::ai_cancel,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Notebook.md");

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::Opened { urls } = &event {
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    let path_str = path.to_string_lossy().to_string();
                    let _ = _app_handle.emit("file-open", path_str);
                }
            }
        }
    });
}

/// Resolve the default notebooks directory: ~/Documents/Notebook.md/
fn dirs_next() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        std::env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join("Documents").join("Notebook.md"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE")
            .ok()
            .map(|h| PathBuf::from(h).join("Documents").join("Notebook.md"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join("Documents").join("Notebook.md"))
    }
}
