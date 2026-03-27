use crate::ai_settings::{AiSettings, AiSettingsState};
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{Emitter, State};
use tokio_stream::wrappers::ReceiverStream;

// ---------------------------------------------------------------------------
// Constants — mirrored from apps/api/src/services/ai.ts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT: &str = r#"You are a content writer for a Markdown document editor called Notebook.md.
Generate well-structured content in Markdown format based on the user's prompt.

Rules:
- Use proper Markdown syntax: headings (#, ##, ###), lists (-, 1.), bold (**), italic (*), code blocks (```), tables, blockquotes (>), and horizontal rules (---)
- Structure content with clear headings and logical sections
- Keep responses focused and relevant to the user's request
- Do not include meta-commentary about the generation process
- Do not wrap the entire response in a code block — return raw Markdown
- Use GFM (GitHub Flavored Markdown) extensions where appropriate: task lists (- [ ]), tables, strikethrough (~~)"#;

const LENGTH_GUIDANCE_SHORT: &str = "Keep the response concise — a few paragraphs at most.";
const LENGTH_GUIDANCE_MEDIUM: &str =
    "Provide a moderately detailed response — roughly 1–2 pages.";
const LENGTH_GUIDANCE_LONG: &str =
    "Provide a comprehensive, detailed response — up to several pages.";

const MAX_CONTEXT_LENGTH: usize = 100_000;

fn max_tokens_for_length(length: &str) -> u32 {
    match length {
        "short" => 1024,
        "medium" => 2048,
        "long" => 16384,
        _ => 2048,
    }
}

fn length_guidance(length: &str) -> &'static str {
    match length {
        "short" => LENGTH_GUIDANCE_SHORT,
        "medium" => LENGTH_GUIDANCE_MEDIUM,
        "long" => LENGTH_GUIDANCE_LONG,
        _ => LENGTH_GUIDANCE_MEDIUM,
    }
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerateParams {
    pub prompt: String,
    pub length: String,
    pub document_context: Option<String>,
    pub cursor_context: Option<String>,
    pub web_search: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build the full API URL and auth headers based on provider type.
pub fn build_request_url_and_headers(settings: &AiSettings) -> (String, Vec<(String, String)>) {
    let endpoint = settings.ai_endpoint.trim_end_matches('/');

    if settings.provider_type == "azure" {
        let url = format!(
            "{}/openai/deployments/{}/chat/completions?api-version={}",
            endpoint, settings.ai_model, settings.api_version
        );
        let headers = vec![
            ("Content-Type".into(), "application/json".into()),
            ("api-key".into(), settings.ai_api_key.clone()),
        ];
        (url, headers)
    } else {
        // OpenAI-compatible
        let url = format!("{}/chat/completions", endpoint);
        let headers = vec![
            ("Content-Type".into(), "application/json".into()),
            (
                "Authorization".into(),
                format!("Bearer {}", settings.ai_api_key),
            ),
        ];
        (url, headers)
    }
}

/// Build the messages array (mirrors buildMessages in apps/api/src/services/ai.ts).
pub fn build_messages(
    prompt: &str,
    length: &str,
    document_context: Option<&str>,
    _cursor_context: Option<&str>,
) -> Vec<serde_json::Value> {
    let system_content = format!("{}\n\n{}", SYSTEM_PROMPT, length_guidance(length));

    let mut user_content = String::new();

    if let Some(context) = document_context {
        let mut ctx = context.to_string();
        let mut truncated = false;

        if ctx.len() > MAX_CONTEXT_LENGTH {
            if let Some(marker_idx) = ctx.find("[INSERT HERE]") {
                let half = MAX_CONTEXT_LENGTH / 2;
                let start = marker_idx.saturating_sub(half);
                let end = (marker_idx + half).min(ctx.len());
                ctx = ctx[start..end].to_string();
            } else {
                ctx.truncate(MAX_CONTEXT_LENGTH);
            }
            truncated = true;
        }

        user_content.push_str("Here is the existing document content for context. The marker [INSERT HERE] indicates where the new content will be inserted. Generate content that fits naturally at that position.\n");
        if truncated {
            user_content.push_str("Note: The document has been truncated for length.\n");
        }
        user_content.push_str(&format!("\n---\n<document>\n{}\n</document>\n---\n\n", ctx));
    }

    user_content.push_str(&format!("User's request: {}", prompt));

    vec![
        serde_json::json!({"role": "system", "content": system_content}),
        serde_json::json!({"role": "user", "content": user_content}),
    ]
}

/// Fetch web search results from Brave Search API.
async fn fetch_web_search_results(query: &str, api_key: &str) -> Option<String> {
    let url = format!(
        "https://api.search.brave.com/res/v1/web/search?q={}&count=5",
        urlencoding::encode(query)
    );

    let client = Client::new();
    let res = client
        .get(&url)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "gzip")
        .header("X-Subscription-Token", api_key)
        .send()
        .await
        .ok()?;

    if !res.status().is_success() {
        return None;
    }

    let data: serde_json::Value = res.json().await.ok()?;
    let results = data["web"]["results"].as_array()?;

    if results.is_empty() {
        return None;
    }

    let formatted: Vec<String> = results
        .iter()
        .enumerate()
        .filter_map(|(i, r)| {
            let title = r["title"].as_str()?;
            let url = r["url"].as_str()?;
            let desc = r["description"].as_str()?;
            Some(format!("[{}] {}\n{}\n{}", i + 1, title, url, desc))
        })
        .collect();

    Some(formatted.join("\n\n"))
}

// ---------------------------------------------------------------------------
// Generation counter — each ai_generate call gets a unique ID.
// A new call implicitly cancels any previous generation.
// ---------------------------------------------------------------------------

static GENERATION_ID: std::sync::LazyLock<Arc<AtomicU64>> =
    std::sync::LazyLock::new(|| Arc::new(AtomicU64::new(0)));

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn ai_generate(
    params: AiGenerateParams,
    state: State<'_, AiSettingsState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let settings = state.get();

    if !settings.is_configured() {
        let _ = app.emit(
            "ai:error",
            AiEvent {
                event_type: "error".into(),
                content: None,
                message: Some(
                    "AI is not configured. Open Settings to add your API key.".into(),
                ),
            },
        );
        return Ok(());
    }

    // Bump generation counter — any previous generation with a different ID will stop
    let my_id = GENERATION_ID.fetch_add(1, Ordering::SeqCst) + 1;
    let gen_id = Arc::clone(&GENERATION_ID);

    let (url, headers) = build_request_url_and_headers(&settings);

    let mut messages = build_messages(
        &params.prompt,
        &params.length,
        params.document_context.as_deref(),
        params.cursor_context.as_deref(),
    );

    // Web search
    if params.web_search.unwrap_or(false) && !settings.brave_search_api_key.is_empty() {
        if let Some(search_results) =
            fetch_web_search_results(&params.prompt, &settings.brave_search_api_key).await
        {
            let search_msg = serde_json::json!({
                "role": "system",
                "content": format!(
                    "The following web search results may help you provide accurate, up-to-date information. Use them if relevant, and cite sources where appropriate using [Source Title](URL) format.\n\n{}",
                    search_results
                )
            });
            messages.insert(1, search_msg);
        }
    }

    let max_tokens = max_tokens_for_length(&params.length);

    let mut body = serde_json::json!({
        "messages": messages,
        "max_completion_tokens": max_tokens,
        "temperature": 0.7,
        "stream": true,
    });

    // For OpenAI-compatible providers, include model in body
    if settings.provider_type != "azure" {
        body["model"] = serde_json::json!(settings.ai_model);
    }

    let client = Client::new();
    let mut req = client.post(&url).json(&body);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }

    let response = match req.send().await {
        Ok(res) => res,
        Err(e) => {
            let _ = app.emit(
                "ai:error",
                AiEvent {
                    event_type: "error".into(),
                    content: None,
                    message: Some(format!("Network error: {e}")),
                },
            );
            return Ok(());
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        let _ = app.emit(
            "ai:error",
            AiEvent {
                event_type: "error".into(),
                content: None,
                message: Some(format!(
                    "AI service returned {}: {}",
                    status,
                    body_text.chars().take(200).collect::<String>()
                )),
            },
        );
        return Ok(());
    }

    // Stream SSE response
    let (tx, rx) = tokio::sync::mpsc::channel::<bytes::Bytes>(64);
    let stream_app = app.clone();

    // Spawn a task to read the response body into a channel
    let byte_stream = response.bytes_stream();
    tokio::spawn(async move {
        futures::pin_mut!(byte_stream);
        while let Some(chunk) = byte_stream.next().await {
            match chunk {
                Ok(bytes) => {
                    if tx.send(bytes).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // Process SSE events from the channel
    let mut receiver_stream = ReceiverStream::new(rx);
    let mut buffer = String::new();

    while let Some(bytes) = receiver_stream.next().await {
        // If a newer generation has started, silently stop this one
        if gen_id.load(Ordering::SeqCst) != my_id {
            return Ok(());
        }

        buffer.push_str(&String::from_utf8_lossy(&bytes));

        // Parse SSE lines
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if !line.starts_with("data: ") {
                continue;
            }

            let data = line[6..].trim();
            if data == "[DONE]" {
                let _ = stream_app.emit(
                    "ai:done",
                    AiEvent {
                        event_type: "done".into(),
                        content: None,
                        message: None,
                    },
                );
                return Ok(());
            }

            if data.is_empty() {
                continue;
            }

            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                    if !delta.is_empty() {
                        let _ = stream_app.emit(
                            "ai:token",
                            AiEvent {
                                event_type: "token".into(),
                                content: Some(delta.to_string()),
                                message: None,
                            },
                        );
                    }
                }
            }
        }
    }

    // Stream ended without [DONE]
    let _ = app.emit(
        "ai:done",
        AiEvent {
            event_type: "done".into(),
            content: None,
            message: None,
        },
    );

    Ok(())
}

#[tauri::command]
pub async fn ai_cancel() -> Result<(), String> {
    // Bump the generation counter so any running generation stops
    GENERATION_ID.fetch_add(1, Ordering::SeqCst);
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_azure_url() {
        let settings = AiSettings {
            provider_type: "azure".into(),
            ai_endpoint: "https://eastus.api.cognitive.microsoft.com/".into(),
            ai_api_key: "test-key".into(),
            ai_model: "gpt-4.1-nano".into(),
            api_version: "2024-12-01-preview".into(),
            brave_search_api_key: String::new(),
        };
        let (url, headers) = build_request_url_and_headers(&settings);
        assert_eq!(
            url,
            "https://eastus.api.cognitive.microsoft.com/openai/deployments/gpt-4.1-nano/chat/completions?api-version=2024-12-01-preview"
        );
        assert!(headers.iter().any(|(k, v)| k == "api-key" && v == "test-key"));
    }

    #[test]
    fn build_openai_url() {
        let settings = AiSettings {
            provider_type: "openai".into(),
            ai_endpoint: "https://api.openai.com/v1".into(),
            ai_api_key: "sk-test".into(),
            ai_model: "gpt-4o-mini".into(),
            api_version: String::new(),
            brave_search_api_key: String::new(),
        };
        let (url, headers) = build_request_url_and_headers(&settings);
        assert_eq!(url, "https://api.openai.com/v1/chat/completions");
        assert!(headers
            .iter()
            .any(|(k, v)| k == "Authorization" && v == "Bearer sk-test"));
    }

    #[test]
    fn build_messages_simple() {
        let msgs = build_messages("Write a poem", "short", None, None);
        assert_eq!(msgs.len(), 2);
        assert!(msgs[0]["content"]
            .as_str()
            .unwrap()
            .contains("content writer"));
        assert!(msgs[0]["content"]
            .as_str()
            .unwrap()
            .contains("concise"));
        assert!(msgs[1]["content"]
            .as_str()
            .unwrap()
            .contains("Write a poem"));
    }

    #[test]
    fn build_messages_with_context() {
        let doc = "# Hello\n\n[INSERT HERE]\n\nWorld";
        let msgs = build_messages("Add intro", "medium", Some(doc), None);
        assert_eq!(msgs.len(), 2);
        let user_msg = msgs[1]["content"].as_str().unwrap();
        assert!(user_msg.contains("[INSERT HERE]"));
        assert!(user_msg.contains("Add intro"));
    }

    #[test]
    fn build_messages_truncates_long_context() {
        let long_ctx = "a".repeat(MAX_CONTEXT_LENGTH + 1000);
        let msgs = build_messages("test", "short", Some(&long_ctx), None);
        let user_msg = msgs[1]["content"].as_str().unwrap();
        assert!(user_msg.contains("truncated"));
    }
}
