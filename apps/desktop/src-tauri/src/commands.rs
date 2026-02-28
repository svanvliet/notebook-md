use crate::state::{AppState, FileEntry, NotebookMeta};
use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;
use walkdir::WalkDir;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn fs_time_millis(time: std::io::Result<SystemTime>) -> i64 {
    time.ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or_else(now_millis)
}

/// Files / dirs to skip when walking a notebook directory.
fn should_skip(name: &str) -> bool {
    name.starts_with('.')
        || name == "node_modules"
        || name == "__pycache__"
        || name == "target"
}

fn find_notebook(state: &AppState, id: &str) -> Result<NotebookMeta, String> {
    let nbs = state.notebooks.lock().map_err(|e| e.to_string())?;
    nbs.iter()
        .find(|n| n.id == id)
        .cloned()
        .ok_or_else(|| format!("Notebook {id} not found"))
}

// ---------------------------------------------------------------------------
// Notebook CRUD
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn create_notebook(
    name: String,
    source_type: Option<String>,
    source_config: Option<serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<NotebookMeta, String> {
    let now = now_millis();
    let id = uuid::Uuid::new_v4().to_string();
    let src_type = source_type.unwrap_or_else(|| "local".into());
    let src_cfg = source_config.unwrap_or(serde_json::json!({}));

    let nb = NotebookMeta {
        id: id.clone(),
        name,
        source_type: src_type,
        source_config: src_cfg,
        sort_order: now,
        created_at: now,
        updated_at: now,
    };

    // Create the notebook directory
    let dir = state.notebook_dir(&nb);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    {
        let mut nbs = state.notebooks.lock().map_err(|e| e.to_string())?;
        nbs.push(nb.clone());
    }
    state.save_manifest()?;
    Ok(nb)
}

#[tauri::command]
pub async fn upsert_notebook(
    notebook: NotebookMeta,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut nbs = state.notebooks.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = nbs.iter_mut().find(|n| n.id == notebook.id) {
        *existing = notebook;
    } else {
        nbs.push(notebook);
    }
    drop(nbs);
    state.save_manifest()
}

#[tauri::command]
pub async fn list_notebooks(state: State<'_, AppState>) -> Result<Vec<NotebookMeta>, String> {
    let nbs = state.notebooks.lock().map_err(|e| e.to_string())?;
    let mut sorted = nbs.clone();
    sorted.sort_by_key(|n| n.sort_order);
    Ok(sorted)
}

#[tauri::command]
pub async fn rename_notebook(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut nbs = state.notebooks.lock().map_err(|e| e.to_string())?;
    let nb = nbs
        .iter_mut()
        .find(|n| n.id == id)
        .ok_or_else(|| format!("Notebook {id} not found"))?;
    nb.name = name;
    nb.updated_at = now_millis();
    drop(nbs);
    state.save_manifest()
}

#[tauri::command]
pub async fn delete_notebook(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let nb = find_notebook(&state, &id)?;
    let dir = state.notebook_dir(&nb);

    // Move to OS trash if the directory exists
    if dir.exists() {
        trash::delete(&dir).map_err(|e| e.to_string())?;
    }

    {
        let mut nbs = state.notebooks.lock().map_err(|e| e.to_string())?;
        nbs.retain(|n| n.id != id);
    }
    state.save_manifest()
}

#[tauri::command]
pub async fn reorder_notebooks(
    ordered_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut nbs = state.notebooks.lock().map_err(|e| e.to_string())?;
    for (i, id) in ordered_ids.iter().enumerate() {
        if let Some(nb) = nbs.iter_mut().find(|n| n.id == *id) {
            nb.sort_order = i as i64;
            nb.updated_at = now_millis();
        }
    }
    drop(nbs);
    state.save_manifest()
}

// ---------------------------------------------------------------------------
// File / Folder CRUD
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn create_file(
    notebook_id: String,
    parent_path: String,
    name: String,
    file_type: String,
    content: Option<String>,
    state: State<'_, AppState>,
) -> Result<FileEntry, String> {
    let nb = find_notebook(&state, &notebook_id)?;
    let root = state.notebook_dir(&nb);

    let rel = if parent_path.is_empty() {
        name.clone()
    } else {
        format!("{parent_path}/{name}")
    };

    let abs = root.join(&rel);
    let now = now_millis();

    if file_type == "folder" {
        fs::create_dir_all(&abs).map_err(|e| e.to_string())?;
    } else {
        if let Some(parent) = abs.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&abs, content.as_deref().unwrap_or("")).map_err(|e| e.to_string())?;
    }

    Ok(FileEntry {
        path: rel,
        notebook_id,
        name,
        entry_type: file_type,
        parent_path,
        content: content.unwrap_or_default(),
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn get_file(
    notebook_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<FileEntry, String> {
    let nb = find_notebook(&state, &notebook_id)?;
    let root = state.notebook_dir(&nb);
    let abs = root.join(&path);

    if !abs.exists() {
        return Err(format!("File not found: {path}"));
    }

    let meta = fs::metadata(&abs).map_err(|e| e.to_string())?;
    let name = abs
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let parent_path = Path::new(&path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let content = if meta.is_file() {
        fs::read_to_string(&abs).map_err(|e| e.to_string())?
    } else {
        String::new()
    };

    Ok(FileEntry {
        path,
        notebook_id,
        name,
        entry_type: if meta.is_dir() {
            "folder".into()
        } else {
            "file".into()
        },
        parent_path,
        content,
        created_at: fs_time_millis(meta.created()),
        updated_at: fs_time_millis(meta.modified()),
    })
}

#[tauri::command]
pub async fn list_notebook_files(
    notebook_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<FileEntry>, String> {
    let nb = find_notebook(&state, &notebook_id)?;
    let root = state.notebook_dir(&nb);

    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();

    for entry in WalkDir::new(&root)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| {
            e.file_name()
                .to_str()
                .map(|n| !should_skip(n))
                .unwrap_or(true)
        })
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let abs = entry.path();
        let rel = abs
            .strip_prefix(&root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string();

        // Use forward slashes for cross-platform consistency
        let rel = rel.replace('\\', "/");

        let name = entry.file_name().to_string_lossy().to_string();
        let parent_path = Path::new(&rel)
            .parent()
            .map(|p| p.to_string_lossy().to_string().replace('\\', "/"))
            .unwrap_or_default();

        let meta = entry.metadata().map_err(|e| e.to_string())?;

        entries.push(FileEntry {
            path: rel,
            notebook_id: notebook_id.clone(),
            name,
            entry_type: if meta.is_dir() {
                "folder".into()
            } else {
                "file".into()
            },
            parent_path,
            content: String::new(), // content loaded on demand
            created_at: fs_time_millis(meta.created()),
            updated_at: fs_time_millis(meta.modified()),
        });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn list_children(
    notebook_id: String,
    parent_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<FileEntry>, String> {
    let nb = find_notebook(&state, &notebook_id)?;
    let root = state.notebook_dir(&nb);
    let dir = if parent_path.is_empty() {
        root.clone()
    } else {
        root.join(&parent_path)
    };

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for item in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        let name = item.file_name().to_string_lossy().to_string();
        if should_skip(&name) {
            continue;
        }

        let meta = item.metadata().map_err(|e| e.to_string())?;
        let rel = if parent_path.is_empty() {
            name.clone()
        } else {
            format!("{parent_path}/{name}")
        };

        entries.push(FileEntry {
            path: rel,
            notebook_id: notebook_id.clone(),
            name,
            entry_type: if meta.is_dir() {
                "folder".into()
            } else {
                "file".into()
            },
            parent_path: parent_path.clone(),
            content: String::new(),
            created_at: fs_time_millis(meta.created()),
            updated_at: fs_time_millis(meta.modified()),
        });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn write_file(
    notebook_id: String,
    path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let nb = find_notebook(&state, &notebook_id)?;
    let root = state.notebook_dir(&nb);
    let abs = root.join(&path);

    // Atomic write: write to temp file then rename
    let parent = abs.parent().ok_or("Invalid file path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    tmp.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    tmp.persist(&abs).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn rename_file(
    notebook_id: String,
    old_path: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<FileEntry, String> {
    let nb = find_notebook(&state, &notebook_id)?;
    let root = state.notebook_dir(&nb);

    let old_abs = root.join(&old_path);
    if !old_abs.exists() {
        return Err(format!("File not found: {old_path}"));
    }

    let parent_path = Path::new(&old_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let new_rel = if parent_path.is_empty() {
        new_name.clone()
    } else {
        format!("{parent_path}/{new_name}")
    };
    let new_abs = root.join(&new_rel);

    fs::rename(&old_abs, &new_abs).map_err(|e| e.to_string())?;

    let meta = fs::metadata(&new_abs).map_err(|e| e.to_string())?;
    Ok(FileEntry {
        path: new_rel,
        notebook_id,
        name: new_name,
        entry_type: if meta.is_dir() {
            "folder".into()
        } else {
            "file".into()
        },
        parent_path,
        content: String::new(),
        created_at: fs_time_millis(meta.created()),
        updated_at: fs_time_millis(meta.modified()),
    })
}

#[tauri::command]
pub async fn delete_file(
    notebook_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let nb = find_notebook(&state, &notebook_id)?;
    let root = state.notebook_dir(&nb);
    let abs = root.join(&path);

    if abs.exists() {
        trash::delete(&abs).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn move_file(
    notebook_id: String,
    old_path: String,
    new_parent_path: String,
    state: State<'_, AppState>,
) -> Result<FileEntry, String> {
    let nb = find_notebook(&state, &notebook_id)?;
    let root = state.notebook_dir(&nb);

    let old_abs = root.join(&old_path);
    if !old_abs.exists() {
        return Err(format!("File not found: {old_path}"));
    }

    let name = Path::new(&old_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let new_rel = if new_parent_path.is_empty() {
        name.clone()
    } else {
        format!("{new_parent_path}/{name}")
    };
    let new_abs = root.join(&new_rel);

    if let Some(parent) = new_abs.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::rename(&old_abs, &new_abs).map_err(|e| e.to_string())?;

    let meta = fs::metadata(&new_abs).map_err(|e| e.to_string())?;
    Ok(FileEntry {
        path: new_rel,
        notebook_id,
        name,
        entry_type: if meta.is_dir() {
            "folder".into()
        } else {
            "file".into()
        },
        parent_path: new_parent_path,
        content: String::new(),
        created_at: fs_time_millis(meta.created()),
        updated_at: fs_time_millis(meta.modified()),
    })
}

#[tauri::command]
pub async fn ensure_assets_folder(
    notebook_id: String,
    parent_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let nb = find_notebook(&state, &notebook_id)?;
    let root = state.notebook_dir(&nb);

    let assets_rel = if parent_path.is_empty() {
        "assets".to_string()
    } else {
        format!("{parent_path}/assets")
    };

    let abs = root.join(&assets_rel);
    fs::create_dir_all(&abs).map_err(|e| e.to_string())?;

    Ok(assets_rel)
}

// ---------------------------------------------------------------------------
// Folder dialog — opens a native folder picker and creates a notebook
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn open_folder_as_notebook(
    path: String,
    state: State<'_, AppState>,
) -> Result<NotebookMeta, String> {
    let dir = std::path::PathBuf::from(&path);
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("Not a valid directory: {path}"));
    }

    let name = dir
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let now = now_millis();
    let id = uuid::Uuid::new_v4().to_string();

    let nb = NotebookMeta {
        id,
        name,
        source_type: "local".into(),
        source_config: serde_json::json!({ "path": path }),
        sort_order: now,
        created_at: now,
        updated_at: now,
    };

    {
        let mut nbs = state.notebooks.lock().map_err(|e| e.to_string())?;
        nbs.push(nb.clone());
    }
    state.save_manifest()?;
    Ok(nb)
}
