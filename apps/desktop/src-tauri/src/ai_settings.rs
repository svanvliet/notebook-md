use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// AI provider settings, persisted to ai-settings.json in the app data directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    /// "azure" (default) or "openai"
    pub provider_type: String,
    /// Active API endpoint URL (set from per-provider value on save)
    pub ai_endpoint: String,
    /// API key (stored as plaintext for v1)
    pub ai_api_key: String,
    /// Active model name / deployment ID (set from per-provider value on save)
    pub ai_model: String,
    /// Azure API version (only used when provider_type == "azure")
    pub api_version: String,
    /// Optional Brave Search API key for web search grounding
    #[serde(default)]
    pub brave_search_api_key: String,
    /// Saved Azure-specific endpoint (preserved when switching providers)
    #[serde(default = "default_azure_endpoint")]
    pub azure_endpoint: String,
    /// Saved Azure deployment name (preserved when switching providers)
    #[serde(default)]
    pub azure_model: String,
    /// Saved OpenAI-compatible endpoint (preserved when switching providers)
    #[serde(default = "default_openai_endpoint")]
    pub openai_endpoint: String,
    /// Saved OpenAI model name (preserved when switching providers)
    #[serde(default)]
    pub openai_model: String,
}

fn default_azure_endpoint() -> String {
    "https://eastus.api.cognitive.microsoft.com/".into()
}

fn default_openai_endpoint() -> String {
    "https://api.openai.com/v1".into()
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            provider_type: "azure".into(),
            ai_endpoint: "https://eastus.api.cognitive.microsoft.com/".into(),
            ai_api_key: String::new(),
            ai_model: String::new(),
            api_version: "2024-12-01-preview".into(),
            brave_search_api_key: String::new(),
            azure_endpoint: default_azure_endpoint(),
            azure_model: String::new(),
            openai_endpoint: default_openai_endpoint(),
            openai_model: String::new(),
        }
    }
}

impl AiSettings {
    /// Whether the user has configured an API key.
    pub fn is_configured(&self) -> bool {
        !self.ai_api_key.is_empty() && !self.ai_endpoint.is_empty()
    }

    /// Return a copy with API keys masked for safe display in the frontend.
    pub fn masked(&self) -> Self {
        Self {
            ai_api_key: mask_key(&self.ai_api_key),
            brave_search_api_key: mask_key(&self.brave_search_api_key),
            ..self.clone()
        }
    }
}

fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        if key.is_empty() {
            String::new()
        } else {
            "*".repeat(key.len())
        }
    } else {
        let visible = &key[key.len() - 4..];
        format!("{}...{}", "*".repeat(4), visible)
    }
}

/// Thread-safe wrapper for AI settings state.
pub struct AiSettingsState {
    settings: Mutex<AiSettings>,
    file_path: PathBuf,
}

impl AiSettingsState {
    /// Load settings from disk or create with defaults.
    pub fn new(app_data_dir: &PathBuf) -> Self {
        let file_path = app_data_dir.join("ai-settings.json");
        let settings = if file_path.exists() {
            let data = fs::read_to_string(&file_path).unwrap_or_default();
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            AiSettings::default()
        };

        Self {
            settings: Mutex::new(settings),
            file_path,
        }
    }

    /// Get a clone of current settings.
    pub fn get(&self) -> AiSettings {
        self.settings.lock().unwrap().clone()
    }

    /// Update and persist settings.
    pub fn save(&self, new_settings: AiSettings) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&new_settings).map_err(|e| e.to_string())?;
        fs::write(&self.file_path, json).map_err(|e| e.to_string())?;
        let mut current = self.settings.lock().map_err(|e| e.to_string())?;
        *current = new_settings;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Returns settings with API keys masked.
#[tauri::command]
pub async fn get_ai_settings(
    state: tauri::State<'_, AiSettingsState>,
) -> Result<AiSettings, String> {
    Ok(state.get().masked())
}

/// Returns whether AI is configured (has an API key set).
#[tauri::command]
pub async fn is_ai_configured(
    state: tauri::State<'_, AiSettingsState>,
) -> Result<bool, String> {
    Ok(state.get().is_configured())
}

/// Save new AI settings. Accepts full settings including raw API keys.
#[tauri::command]
pub async fn save_ai_settings(
    settings: AiSettings,
    state: tauri::State<'_, AiSettingsState>,
) -> Result<(), String> {
    // If the incoming key is masked (contains "..."), preserve the existing key
    let mut final_settings = settings;
    let current = state.get();

    if final_settings.ai_api_key.contains("...") || final_settings.ai_api_key.contains("****") {
        final_settings.ai_api_key = current.ai_api_key;
    }
    if final_settings.brave_search_api_key.contains("...")
        || final_settings.brave_search_api_key.contains("****")
    {
        final_settings.brave_search_api_key = current.brave_search_api_key;
    }

    state.save(final_settings)
}

/// Test the AI connection by making a minimal completions request.
#[tauri::command]
pub async fn test_ai_connection(
    state: tauri::State<'_, AiSettingsState>,
) -> Result<String, String> {
    let settings = state.get();

    if !settings.is_configured() {
        return Err("AI is not configured. Please enter an API endpoint and key.".into());
    }

    let (url, headers) = crate::ai::build_request_url_and_headers(&settings);

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "messages": [{"role": "user", "content": "Say hello in one word."}],
        "max_completion_tokens": 5,
        "stream": false,
    });

    let mut req = client.post(&url).json(&body);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }

    let res = req.send().await.map_err(|e| format!("Connection failed: {e}"))?;

    if res.status().is_success() {
        Ok("Connection successful!".into())
    } else {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        Err(format!("API returned {status}: {}", body.chars().take(200).collect::<String>()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mask_key_empty() {
        assert_eq!(mask_key(""), "");
    }

    #[test]
    fn mask_key_short() {
        assert_eq!(mask_key("abc"), "***");
    }

    #[test]
    fn mask_key_long() {
        assert_eq!(mask_key("sk-1234567890abcdef"), "****...cdef");
    }

    #[test]
    fn default_settings() {
        let s = AiSettings::default();
        assert_eq!(s.provider_type, "azure");
        assert_eq!(s.ai_endpoint, "https://eastus.api.cognitive.microsoft.com/");
        assert_eq!(s.ai_model, "gpt-4.1-nano");
        assert_eq!(s.api_version, "2024-12-01-preview");
        assert!(!s.is_configured());
    }

    #[test]
    fn settings_save_and_load() {
        let tmp = tempfile::TempDir::new().unwrap();
        let state = AiSettingsState::new(&tmp.path().to_path_buf());

        let mut settings = AiSettings::default();
        settings.ai_api_key = "test-key".into();
        state.save(settings).unwrap();

        let state2 = AiSettingsState::new(&tmp.path().to_path_buf());
        assert_eq!(state2.get().ai_api_key, "test-key");
    }

    #[test]
    fn save_preserves_masked_keys() {
        let tmp = tempfile::TempDir::new().unwrap();
        let state = AiSettingsState::new(&tmp.path().to_path_buf());

        // Save with real key
        let mut settings = AiSettings::default();
        settings.ai_api_key = "sk-real-secret-key-12345678".into();
        state.save(settings).unwrap();

        // Now "save" with masked key — should preserve original
        let mut update = state.get().masked();
        update.ai_model = "gpt-4o".into();

        // Simulate the save command logic
        let current = state.get();
        if update.ai_api_key.contains("...") || update.ai_api_key.contains("****") {
            update.ai_api_key = current.ai_api_key.clone();
        }
        state.save(update).unwrap();

        assert_eq!(state.get().ai_api_key, "sk-real-secret-key-12345678");
        assert_eq!(state.get().ai_model, "gpt-4o");
    }
}
