use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::command;
use tauri::{AppHandle, State};

use crate::AppState;
use super::settings::get_ai_settings;
use super::sidecar;

#[derive(Debug, Serialize, Deserialize)]
pub struct AIParseInput {
    pub url: String,
    pub page_title: String,
    pub visible_text: String,
    pub previous_status: Option<String>,
    pub known_company: Option<String>,
    pub known_job_title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AIParseOutput {
    pub company_name: Option<String>,
    pub job_title: Option<String>,
    pub raw_status: Option<String>,
    pub normalized_status: Option<String>,
    #[serde(default)]
    pub confidence: f64,
    pub login_state: Option<String>,
    #[serde(default)]
    pub status_changed: bool,
    pub next_action: Option<String>,
    pub deadline: Option<String>,
    #[serde(default)]
    pub should_notify: bool,
    pub reason: Option<String>,
    #[serde(default)]
    pub prompt_tokens: u32,
    #[serde(default)]
    pub completion_tokens: u32,
    #[serde(default)]
    pub total_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
    usage: Option<OpenAIUsage>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIChoice {
    message: OpenAIMessage,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIUsage {
    prompt_tokens: Option<u32>,
    completion_tokens: Option<u32>,
    total_tokens: Option<u32>,
}

const SYSTEM_PROMPT: &str = r#"You are a job application status parser. Given the visible text from a recruitment website's status page, extract the current application status.

You MUST return a valid JSON object with these exact fields (use snake_case):
{
  "company_name": "string or null",
  "job_title": "string or null",
  "raw_status": "the exact status text from the page, or null",
  "normalized_status": "one of: to_apply, applied, received, under_review, assessment, interview, final_interview, offer, rejected, withdrawn, unknown",
  "confidence": 0.0-1.0,
  "login_state": "one of: valid, expired, captcha_required, mfa_required, blocked, unknown",
  "status_changed": boolean,
  "next_action": "string describing what the user should do next, or null",
  "deadline": "ISO 8601 date string if a deadline is found, or null",
  "should_notify": boolean,
  "reason": "brief explanation of your determination"
}

Rules:
- You MUST always set normalized_status to one of the valid values. Do NOT return null for this field.
- If the page shows a login form, login expired message, captcha, or MFA prompt, set login_state accordingly and normalized_status to "unknown"
- confidence reflects how certain you are about the status extraction
- status_changed should be true if the normalized_status differs from previous_status
- should_notify should be true if status_changed is true AND confidence >= 0.60
- If the text is empty or unreadable, set confidence to 0 and normalized_status to "unknown""#;

#[command]
pub async fn parse_status(
    state: State<'_, AppState>,
    input: AIParseInput,
) -> Result<AIParseOutput, String> {
    parse_status_inner(&state.db, input).await
}

// Inner helper: same logic as parse_status but takes pool directly
pub async fn parse_status_inner(pool: &SqlitePool, input: AIParseInput) -> Result<AIParseOutput, String> {
    let (api_key, base_url, model_name) = get_ai_settings(pool).await;
    if api_key.is_empty() {
        return Err("AI API key not configured".to_string());
    }

    // Safe UTF-8 truncation
    let truncated_text = if input.visible_text.len() > 8000 {
        let mut end = 8000;
        while !input.visible_text.is_char_boundary(end) {
            end -= 1;
        }
        &input.visible_text[..end]
    } else {
        &input.visible_text
    };

    let user_prompt = format!(
        "URL: {}\nPage Title: {}\nPrevious Status: {}\nKnown Company: {}\nKnown Job Title: {}\n\nVisible Text:\n{}",
        input.url,
        input.page_title,
        input.previous_status.as_deref().unwrap_or("unknown"),
        input.known_company.as_deref().unwrap_or("unknown"),
        input.known_job_title.as_deref().unwrap_or("unknown"),
        truncated_text
    );

    let request = serde_json::json!({
        "model": model_name,
        "messages": [
            OpenAIMessage {
                role: "system".to_string(),
                content: SYSTEM_PROMPT.to_string(),
            },
            OpenAIMessage {
                role: "user".to_string(),
                content: user_prompt,
            },
        ],
        "response_format": Some(serde_json::json!({ "type": "json_object" })),
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let base_url_trimmed = base_url.trim_end_matches('/');
    let response = client
        .post(format!("{}/chat/completions", base_url_trimmed))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("AI request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("AI API error ({}): {}", status, body));
    }

    let openai_response: OpenAIResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse AI response: {}", e))?;

    let usage = openai_response.usage.as_ref();

    let content = openai_response
        .choices
        .first()
        .ok_or_else(|| "No response from AI".to_string())?
        .message
        .content
        .clone();

    let mut output: AIParseOutput = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse AI output as JSON: {}. Raw: {}", e, content.chars().take(500).collect::<String>()))?;

    if let Some(u) = usage {
        output.prompt_tokens = u.prompt_tokens.unwrap_or(0);
        output.completion_tokens = u.completion_tokens.unwrap_or(0);
        output.total_tokens = u.total_tokens.unwrap_or(0);
    }

    output.confidence = output.confidence.clamp(0.0, 1.0);

    let valid_statuses = [
        "to_apply", "applied", "received", "under_review", "assessment",
        "interview", "final_interview", "offer", "rejected", "withdrawn", "unknown",
    ];
    if let Some(ref status) = output.normalized_status {
        if !valid_statuses.contains(&status.as_str()) {
            output.normalized_status = Some("unknown".to_string());
        }
    }

    let valid_login_states = [
        "valid", "expired", "captcha_required", "mfa_required", "blocked", "unknown",
    ];
    if let Some(ref state) = output.login_state {
        if !valid_login_states.contains(&state.as_str()) {
            output.login_state = Some("unknown".to_string());
        }
    }

    Ok(output)
}

#[command]
pub async fn test_ai_connection(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let (api_key, base_url, model_name) = get_ai_settings(&state.db).await;
    if api_key.is_empty() {
        return Err("AI API key not configured. Please set it in Settings.".to_string());
    }
    let base_url_trimmed = base_url.trim_end_matches('/');

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .connect_timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let request = serde_json::json!({
        "model": model_name,
        "messages": [{"role": "user", "content": "Say OK"}],
        "max_tokens": 5
    });

    let response = client
        .post(format!("{}/chat/completions", base_url_trimmed))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API error ({}): {}", status, body.chars().take(200).collect::<String>()));
    }

    Ok("连接成功".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JobInfo {
    pub company_name: Option<String>,
    pub job_title: Option<String>,
    pub location: Option<String>,
    pub salary_range: Option<String>,
}

#[command]
pub async fn extract_job_info(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<JobInfo, String> {
    let (api_key, base_url, model_name) = get_ai_settings(&state.db).await;

    // Use sidecar (Playwright) to fetch page content for JS-rendered pages
    println!("[extract_job_info] Fetching page via sidecar: {}", url);
    let sidecar_resp = sidecar::run_sidecar_fetch_page(app_handle, url.clone()).await?;

    let text = if sidecar_resp.success {
        sidecar_resp.page_text.unwrap_or_default()
    } else {
        // Fallback to HTTP fetch
        println!("[extract_job_info] Sidecar failed, falling back to HTTP");
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .connect_timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get(&url)
            .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch URL: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("HTTP error: {}", response.status()));
        }

        let html = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

        // Simple HTML to text
        html.replace(|c: char| c == '<' || c == '>', " ")
            .split_whitespace()
            .collect::<Vec<&str>>()
            .join(" ")
    };

    println!("[extract_job_info] Text length: {}", text.len());
    let preview_end = text.char_indices()
        .nth(500)
        .map(|(i, _)| i)
        .unwrap_or(text.len());
    println!("[extract_job_info] Text preview: {}", &text[..preview_end]);

    // If AI is configured, use it to extract job info
    if !api_key.is_empty() {
        let base_url_trimmed = base_url.trim_end_matches('/');
        let truncate_end = text.char_indices()
            .nth(6000)
            .map(|(i, _)| i)
            .unwrap_or(text.len());
        let truncated = &text[..truncate_end];

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .connect_timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let prompt = format!(
            r#"你是一个职位信息提取器。从以下网页文本中提取职位信息，返回 JSON 对象。

要求：
- company_name: 公司名称（字符串，必填）
- job_title: 职位名称（字符串，必填）
- location: 工作地点（字符串或 null）
- salary_range: 薪资范围（字符串或 null）

如果文本中包含职位相关信息，请尽量提取。即使信息不完整，也要返回你能找到的内容。
只返回 JSON 对象，不要其他内容。

网页文本：
{}"#,
            truncated
        );

        let request = serde_json::json!({
            "model": model_name,
            "messages": [
                {"role": "system", "content": "你是职位信息提取器。从网页内容中提取结构化的职位数据。尽量提取所有能找到的字段，即使信息不完整也要返回。"},
                {"role": "user", "content": prompt}
            ],
            "response_format": {"type": "json_object"}
        });

        let ai_response = client
            .post(format!("{}/chat/completions", base_url_trimmed))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("AI request failed: {}", e))?;

        if ai_response.status().is_success() {
            let openai_resp: OpenAIResponse = ai_response
                .json()
                .await
                .map_err(|e| format!("Failed to parse AI response: {}", e))?;

            if let Some(choice) = openai_resp.choices.first() {
                if let Ok(info) = serde_json::from_str::<JobInfo>(&choice.message.content) {
                    return Ok(info);
                }
            }
        }
    }

    // Fallback: try to extract from URL patterns
    let url_lower = url.to_lowercase();
    let company = if url_lower.contains("greenhouse.io") {
        url.split('/').nth(4).map(|s| s.to_string())
    } else if url_lower.contains("lever.co") {
        url.split('/').nth(4).map(|s| s.to_string())
    } else {
        None
    };

    Ok(JobInfo {
        company_name: company,
        job_title: None,
        location: None,
        salary_range: None,
    })
}
