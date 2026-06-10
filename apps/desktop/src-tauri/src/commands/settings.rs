use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::command;
use tauri::State;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub api_key: String,
    pub api_base_url: String,
    pub model: String,
    pub check_frequency: String,
    pub notifications_enabled: bool,
    pub auto_check_enabled: bool,
    pub smtp_host: String,
    pub smtp_port: String,
    pub smtp_username: String,
    pub smtp_password: String,
    pub smtp_recipient: String,
    pub email_report_enabled: bool,
    pub email_report_time: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            api_base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
            check_frequency: "daily".to_string(),
            notifications_enabled: true,
            auto_check_enabled: true,
            smtp_host: String::new(),
            smtp_port: "465".to_string(),
            smtp_username: String::new(),
            smtp_password: String::new(),
            smtp_recipient: String::new(),
            email_report_enabled: false,
            email_report_time: "09:00".to_string(),
        }
    }
}

pub async fn get_setting_raw(pool: &SqlitePool, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

pub async fn save_setting_raw(pool: &SqlitePool, key: &str, value: &str) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(key)
    .bind(value)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to save setting '{}': {}", key, e))?;
    Ok(())
}

#[command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let pool = &state.db;
    Ok(AppSettings {
        api_key: get_setting_raw(pool, "api_key").await.unwrap_or_default(),
        api_base_url: get_setting_raw(pool, "api_base_url").await
            .unwrap_or_else(|| "https://api.openai.com/v1".to_string()),
        model: get_setting_raw(pool, "model").await
            .unwrap_or_else(|| "gpt-4o-mini".to_string()),
        check_frequency: get_setting_raw(pool, "check_frequency").await
            .unwrap_or_else(|| "daily".to_string()),
        notifications_enabled: get_setting_raw(pool, "notifications_enabled").await
            .map(|v| v == "true")
            .unwrap_or(true),
        auto_check_enabled: get_setting_raw(pool, "auto_check_enabled").await
            .map(|v| v == "true")
            .unwrap_or(true),
        smtp_host: get_setting_raw(pool, "smtp_host").await.unwrap_or_default(),
        smtp_port: get_setting_raw(pool, "smtp_port").await
            .unwrap_or_else(|| "465".to_string()),
        smtp_username: get_setting_raw(pool, "smtp_username").await.unwrap_or_default(),
        smtp_password: get_setting_raw(pool, "smtp_password").await.unwrap_or_default(),
        smtp_recipient: get_setting_raw(pool, "smtp_recipient").await.unwrap_or_default(),
        email_report_enabled: get_setting_raw(pool, "email_report_enabled").await
            .map(|v| v == "true")
            .unwrap_or(false),
        email_report_time: get_setting_raw(pool, "email_report_time").await
            .unwrap_or_else(|| "09:00".to_string()),
    })
}

#[command]
pub async fn save_settings(state: State<'_, AppState>, settings: AppSettings) -> Result<(), String> {
    let pool = &state.db;
    save_setting_raw(pool, "api_key", &settings.api_key).await?;
    save_setting_raw(pool, "api_base_url", &settings.api_base_url).await?;
    save_setting_raw(pool, "model", &settings.model).await?;
    save_setting_raw(pool, "check_frequency", &settings.check_frequency).await?;
    save_setting_raw(pool, "notifications_enabled", &settings.notifications_enabled.to_string()).await?;
    save_setting_raw(pool, "auto_check_enabled", &settings.auto_check_enabled.to_string()).await?;
    save_setting_raw(pool, "smtp_host", &settings.smtp_host).await?;
    save_setting_raw(pool, "smtp_port", &settings.smtp_port).await?;
    save_setting_raw(pool, "smtp_username", &settings.smtp_username).await?;
    save_setting_raw(pool, "smtp_password", &settings.smtp_password).await?;
    save_setting_raw(pool, "smtp_recipient", &settings.smtp_recipient).await?;
    save_setting_raw(pool, "email_report_enabled", &settings.email_report_enabled.to_string()).await?;
    save_setting_raw(pool, "email_report_time", &settings.email_report_time).await?;
    Ok(())
}

#[command]
pub async fn is_ai_configured(state: State<'_, AppState>) -> Result<bool, String> {
    let pool = &state.db;
    let key = get_setting_raw(pool, "api_key").await.unwrap_or_default();
    Ok(!key.is_empty())
}

// Helper to check if auto check is enabled
pub async fn is_auto_check_enabled(pool: &SqlitePool) -> bool {
    get_setting_raw(pool, "auto_check_enabled").await
        .map(|v| v == "true")
        .unwrap_or(true)
}

// Helper used by AI commands to read settings from DB
pub async fn get_ai_settings(pool: &SqlitePool) -> (String, String, String) {
    let api_key = get_setting_raw(pool, "api_key").await.unwrap_or_default();
    let base_url = get_setting_raw(pool, "api_base_url").await
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string());
    let model = get_setting_raw(pool, "model").await
        .unwrap_or_else(|| "gpt-4o-mini".to_string());
    (api_key, base_url, model)
}
