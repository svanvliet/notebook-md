use crate::state::AppState;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// Payload emitted to the frontend on filesystem changes.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsChangeEvent {
    pub notebook_id: String,
    /// "create" | "modify" | "delete" | "rename"
    pub kind: String,
    /// Relative path within the notebook directory
    pub path: String,
}

/// Holds active watchers keyed by notebook ID.
pub struct WatcherRegistry {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

impl WatcherRegistry {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }
}

fn event_kind_str(kind: &EventKind) -> Option<&'static str> {
    match kind {
        EventKind::Create(_) => Some("create"),
        EventKind::Modify(_) => Some("modify"),
        EventKind::Remove(_) => Some("delete"),
        _ => None,
    }
}

#[tauri::command]
pub async fn watch_directory(
    notebook_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
    registry: State<'_, WatcherRegistry>,
) -> Result<(), String> {
    let nbs = state.notebooks.lock().map_err(|e| e.to_string())?;
    let nb = nbs
        .iter()
        .find(|n| n.id == notebook_id)
        .ok_or_else(|| format!("Notebook {notebook_id} not found"))?;
    let root = state.notebook_dir(nb);
    drop(nbs);

    if !root.exists() {
        return Err(format!("Directory does not exist: {}", root.display()));
    }

    let nb_id = notebook_id.clone();
    let root_clone = root.clone();

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if let Some(kind_str) = event_kind_str(&event.kind) {
                    for path in &event.paths {
                        if let Ok(rel) = path.strip_prefix(&root_clone) {
                            let rel_str = rel.to_string_lossy().replace('\\', "/");
                            // Skip hidden files / common ignores
                            if rel_str.starts_with('.')
                                || rel_str.contains("/.")
                                || rel_str.contains("node_modules")
                            {
                                continue;
                            }
                            let payload = FsChangeEvent {
                                notebook_id: nb_id.clone(),
                                kind: kind_str.to_string(),
                                path: rel_str,
                            };
                            let _ = app.emit("fs-change", &payload);
                        }
                    }
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let mut watchers = registry.watchers.lock().map_err(|e| e.to_string())?;
    watchers.insert(notebook_id, watcher);
    Ok(())
}

#[tauri::command]
pub async fn unwatch_directory(
    notebook_id: String,
    registry: State<'_, WatcherRegistry>,
) -> Result<(), String> {
    let mut watchers = registry.watchers.lock().map_err(|e| e.to_string())?;
    watchers.remove(&notebook_id);
    Ok(())
}
