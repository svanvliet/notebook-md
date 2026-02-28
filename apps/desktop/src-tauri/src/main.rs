#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod state;
mod watcher;

use state::AppState;
use std::path::PathBuf;
use tauri::Manager;
use watcher::WatcherRegistry;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Resolve the Tauri app data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));

            // Default notebook root: ~/Documents/Notebook.md/
            let notebooks_root = dirs_next()
                .unwrap_or_else(|| app_data_dir.join("notebooks"));

            let app_state = AppState::new(app_data_dir, notebooks_root);
            app.manage(app_state);
            app.manage(WatcherRegistry::new());
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
            watcher::watch_directory,
            watcher::unwatch_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Notebook.md");
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
