use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// Metadata for a single notebook, persisted in notebooks.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookMeta {
    pub id: String,
    pub name: String,
    pub source_type: String,
    pub source_config: serde_json::Value,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

/// A file or folder entry returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub notebook_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub entry_type: String,
    pub parent_path: String,
    pub content: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Shared application state managed by Tauri.
pub struct AppState {
    /// Path to the Tauri app data directory (notebooks.json lives here).
    pub app_data_dir: PathBuf,
    /// Default root for new notebooks: ~/Documents/Notebook.md/
    pub notebooks_root: PathBuf,
    /// In-memory cache of notebook metadata, protected by a Mutex.
    pub notebooks: Mutex<Vec<NotebookMeta>>,
}

impl AppState {
    /// Initialise state, loading notebooks.json if it exists.
    pub fn new(app_data_dir: PathBuf, notebooks_root: PathBuf) -> Self {
        fs::create_dir_all(&app_data_dir).ok();
        fs::create_dir_all(&notebooks_root).ok();

        let manifest = app_data_dir.join("notebooks.json");
        let notebooks: Vec<NotebookMeta> = if manifest.exists() {
            let data = fs::read_to_string(&manifest).unwrap_or_default();
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            Vec::new()
        };

        Self {
            app_data_dir,
            notebooks_root,
            notebooks: Mutex::new(notebooks),
        }
    }

    /// Persist the in-memory notebooks list to notebooks.json.
    pub fn save_manifest(&self) -> Result<(), String> {
        let manifest = self.app_data_dir.join("notebooks.json");
        let nbs = self.notebooks.lock().map_err(|e| e.to_string())?;
        let json = serde_json::to_string_pretty(&*nbs).map_err(|e| e.to_string())?;
        fs::write(&manifest, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Resolve a notebook's root directory on disk.
    /// For 'local' notebooks, sourceConfig.path overrides the default root.
    pub fn notebook_dir(&self, notebook: &NotebookMeta) -> PathBuf {
        if let Some(path) = notebook.source_config.get("path").and_then(|v| v.as_str()) {
            PathBuf::from(path)
        } else {
            self.notebooks_root.join(&notebook.id)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_state() -> (AppState, TempDir) {
        let tmp = TempDir::new().unwrap();
        let app_data = tmp.path().join("app_data");
        let nb_root = tmp.path().join("notebooks");
        let state = AppState::new(app_data, nb_root);
        (state, tmp)
    }

    fn sample_notebook(id: &str) -> NotebookMeta {
        NotebookMeta {
            id: id.to_string(),
            name: "Test".into(),
            source_type: "local".into(),
            source_config: serde_json::json!({}),
            sort_order: 0,
            created_at: 1000,
            updated_at: 1000,
        }
    }

    #[test]
    fn creates_dirs_on_init() {
        let (state, _tmp) = test_state();
        assert!(state.app_data_dir.exists());
        assert!(state.notebooks_root.exists());
    }

    #[test]
    fn save_and_reload_manifest() {
        let (state, _tmp) = test_state();
        {
            let mut nbs = state.notebooks.lock().unwrap();
            nbs.push(sample_notebook("nb-1"));
        }
        state.save_manifest().unwrap();

        // Reload
        let state2 = AppState::new(
            state.app_data_dir.clone(),
            state.notebooks_root.clone(),
        );
        let nbs2 = state2.notebooks.lock().unwrap();
        assert_eq!(nbs2.len(), 1);
        assert_eq!(nbs2[0].id, "nb-1");
    }

    #[test]
    fn notebook_dir_uses_default_root() {
        let (state, _tmp) = test_state();
        let nb = sample_notebook("abc");
        let dir = state.notebook_dir(&nb);
        assert_eq!(dir, state.notebooks_root.join("abc"));
    }

    #[test]
    fn notebook_dir_uses_source_config_path() {
        let (state, _tmp) = test_state();
        let mut nb = sample_notebook("abc");
        nb.source_config = serde_json::json!({ "path": "/custom/path" });
        let dir = state.notebook_dir(&nb);
        assert_eq!(dir, PathBuf::from("/custom/path"));
    }
}
