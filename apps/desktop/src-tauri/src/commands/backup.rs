use serde::Serialize;
use sqlx::SqlitePool;
use tauri::command;
use tauri::State;

use crate::AppState;
use super::application::Application;
use super::event::ApplicationEvent;
use super::reminder::Reminder;
use super::tracker::TrackingTarget;

#[derive(Debug, Serialize, sqlx::FromRow)]
struct SettingRow {
    pub key: String,
    pub value: String,
}

async fn build_export_data(pool: &SqlitePool) -> Result<serde_json::Value, String> {
    let applications = sqlx::query_as::<_, Application>("SELECT * FROM applications")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to query applications: {}", e))?;

    let events = sqlx::query_as::<_, ApplicationEvent>("SELECT * FROM application_events")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to query events: {}", e))?;

    let reminders = sqlx::query_as::<_, Reminder>("SELECT * FROM reminders")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to query reminders: {}", e))?;

    let tracking_targets = sqlx::query_as::<_, TrackingTarget>("SELECT * FROM tracking_targets")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to query tracking_targets: {}", e))?;

    let settings = sqlx::query_as::<_, SettingRow>("SELECT key, value FROM settings")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to query settings: {}", e))?;

    Ok(serde_json::json!({
        "version": "1.0",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "applications": applications,
        "events": events,
        "reminders": reminders,
        "tracking_targets": tracking_targets,
        "settings": settings,
    }))
}

#[command]
pub async fn export_data(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    build_export_data(&state.db).await
}

#[command]
pub async fn export_data_to_file(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let data = build_export_data(&state.db).await?;
    let json = serde_json::to_string_pretty(&data).map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}
