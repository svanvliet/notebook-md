//! Integration tests for AI generation using real API credentials.
//!
//! These tests make real API calls and require valid credentials.
//! They are intended to be run manually during development, not in CI.
//!
//! To run:
//!   cd apps/desktop/src-tauri
//!   AZURE_TEST_ENDPOINT="https://..." \
//!   AZURE_TEST_API_KEY="..." \
//!   AZURE_TEST_MODEL="gpt-4.1-nano" \
//!   AZURE_TEST_API_VERSION="2024-12-01-preview" \
//!   OPENAI_TEST_API_KEY="sk-..." \
//!   OPENAI_TEST_MODEL="gpt-4o-mini" \
//!   cargo test --test ai_integration -- --nocapture
//!
//! Individual tests:
//!   cargo test --test ai_integration test_azure -- --nocapture
//!   cargo test --test ai_integration test_openai -- --nocapture

use futures::StreamExt;
use reqwest::Client;
use std::env;

/// Helper: build URL and headers from settings, replicating the logic in ai.rs
fn build_request(
    provider: &str,
    endpoint: &str,
    api_key: &str,
    model: &str,
    api_version: &str,
) -> (String, Vec<(String, String)>) {
    let endpoint = endpoint.trim_end_matches('/');
    if provider == "azure" {
        let url = format!(
            "{}/openai/deployments/{}/chat/completions?api-version={}",
            endpoint, model, api_version
        );
        let headers = vec![
            ("Content-Type".into(), "application/json".into()),
            ("api-key".into(), api_key.into()),
        ];
        (url, headers)
    } else {
        let url = format!("{}/chat/completions", endpoint);
        let headers = vec![
            ("Content-Type".into(), "application/json".into()),
            ("Authorization".into(), format!("Bearer {}", api_key)),
        ];
        (url, headers)
    }
}

/// Helper: make a streaming request and collect tokens
async fn stream_generation(
    provider: &str,
    endpoint: &str,
    api_key: &str,
    model: &str,
    api_version: &str,
    prompt: &str,
) -> Result<String, String> {
    let (url, headers) = build_request(provider, endpoint, api_key, model, api_version);

    let mut body = serde_json::json!({
        "messages": [
            {"role": "system", "content": "You are a helpful assistant. Reply concisely."},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": 50,
        "temperature": 0.7,
        "stream": true,
    });

    if provider != "azure" {
        body["model"] = serde_json::json!(model);
    }

    let client = Client::new();
    let mut req = client.post(&url).json(&body);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }

    let response = req.send().await.map_err(|e| format!("Request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API error {status}: {}", &text[..text.len().min(300)]));
    }

    let mut byte_stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut collected = String::new();
    let mut token_count = 0;

    while let Some(chunk) = byte_stream.next().await {
        let bytes = chunk.map_err(|e| format!("Stream error: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].to_string();
            buffer = buffer[pos + 1..].to_string();

            if !line.starts_with("data: ") {
                continue;
            }
            let data = line[6..].trim();
            if data == "[DONE]" {
                return Ok(collected);
            }
            if data.is_empty() {
                continue;
            }

            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                    collected.push_str(delta);
                    token_count += 1;
                }
            }
        }
    }

    if token_count == 0 {
        Err("No tokens received".into())
    } else {
        Ok(collected)
    }
}

/// Helper: make a non-streaming request (for connection test)
async fn test_connection(
    provider: &str,
    endpoint: &str,
    api_key: &str,
    model: &str,
    api_version: &str,
) -> Result<String, String> {
    let (url, headers) = build_request(provider, endpoint, api_key, model, api_version);

    let mut body = serde_json::json!({
        "messages": [{"role": "user", "content": "Say hello in one word."}],
        "max_tokens": 5,
        "stream": false,
    });

    if provider != "azure" {
        body["model"] = serde_json::json!(model);
    }

    let client = Client::new();
    let mut req = client.post(&url).json(&body);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }

    let res = req.send().await.map_err(|e| format!("Connection failed: {e}"))?;

    if res.status().is_success() {
        let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        let content = body["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("(no content)");
        Ok(format!("Success: {content}"))
    } else {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        Err(format!("API returned {status}: {}", &text[..text.len().min(200)]))
    }
}

// ---------------------------------------------------------------------------
// Azure OpenAI tests
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_azure_connection() {
    let endpoint = env::var("AZURE_TEST_ENDPOINT").expect("AZURE_TEST_ENDPOINT not set");
    let api_key = env::var("AZURE_TEST_API_KEY").expect("AZURE_TEST_API_KEY not set");
    let model = env::var("AZURE_TEST_MODEL").unwrap_or_else(|_| "gpt-4.1-nano".into());
    let api_version =
        env::var("AZURE_TEST_API_VERSION").unwrap_or_else(|_| "2024-12-01-preview".into());

    let result = test_connection("azure", &endpoint, &api_key, &model, &api_version).await;
    println!("Azure connection test: {:?}", result);
    assert!(result.is_ok(), "Azure connection failed: {:?}", result.err());
}

#[tokio::test]
async fn test_azure_streaming() {
    let endpoint = env::var("AZURE_TEST_ENDPOINT").expect("AZURE_TEST_ENDPOINT not set");
    let api_key = env::var("AZURE_TEST_API_KEY").expect("AZURE_TEST_API_KEY not set");
    let model = env::var("AZURE_TEST_MODEL").unwrap_or_else(|_| "gpt-4.1-nano".into());
    let api_version =
        env::var("AZURE_TEST_API_VERSION").unwrap_or_else(|_| "2024-12-01-preview".into());

    let result = stream_generation(
        "azure",
        &endpoint,
        &api_key,
        &model,
        &api_version,
        "What is 2+2? Answer in one word.",
    )
    .await;

    println!("Azure streaming result: {:?}", result);
    assert!(result.is_ok(), "Azure streaming failed: {:?}", result.err());
    let content = result.unwrap();
    assert!(!content.is_empty(), "Azure returned empty content");
    println!("Azure generated: {content}");
}

#[tokio::test]
async fn test_azure_invalid_key() {
    let endpoint = env::var("AZURE_TEST_ENDPOINT").expect("AZURE_TEST_ENDPOINT not set");
    let model = env::var("AZURE_TEST_MODEL").unwrap_or_else(|_| "gpt-4.1-nano".into());
    let api_version =
        env::var("AZURE_TEST_API_VERSION").unwrap_or_else(|_| "2024-12-01-preview".into());

    let result =
        test_connection("azure", &endpoint, "invalid-key-12345", &model, &api_version).await;
    println!("Azure invalid key result: {:?}", result);
    assert!(result.is_err(), "Expected error for invalid key");
}

// ---------------------------------------------------------------------------
// OpenAI tests
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_openai_connection() {
    let api_key = env::var("OPENAI_TEST_API_KEY").expect("OPENAI_TEST_API_KEY not set");
    let model = env::var("OPENAI_TEST_MODEL").unwrap_or_else(|_| "gpt-4o-mini".into());

    let result =
        test_connection("openai", "https://api.openai.com/v1", &api_key, &model, "").await;
    println!("OpenAI connection test: {:?}", result);
    assert!(
        result.is_ok(),
        "OpenAI connection failed: {:?}",
        result.err()
    );
}

#[tokio::test]
async fn test_openai_streaming() {
    let api_key = env::var("OPENAI_TEST_API_KEY").expect("OPENAI_TEST_API_KEY not set");
    let model = env::var("OPENAI_TEST_MODEL").unwrap_or_else(|_| "gpt-4o-mini".into());

    let result = stream_generation(
        "openai",
        "https://api.openai.com/v1",
        &api_key,
        &model,
        "",
        "What is 2+2? Answer in one word.",
    )
    .await;

    println!("OpenAI streaming result: {:?}", result);
    assert!(
        result.is_ok(),
        "OpenAI streaming failed: {:?}",
        result.err()
    );
    let content = result.unwrap();
    assert!(!content.is_empty(), "OpenAI returned empty content");
    println!("OpenAI generated: {content}");
}

#[tokio::test]
async fn test_openai_invalid_key() {
    let result = test_connection(
        "openai",
        "https://api.openai.com/v1",
        "sk-invalid-key-12345",
        "gpt-4o-mini",
        "",
    )
    .await;
    println!("OpenAI invalid key result: {:?}", result);
    assert!(result.is_err(), "Expected error for invalid key");
}
