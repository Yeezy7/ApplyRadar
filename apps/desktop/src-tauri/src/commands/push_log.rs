use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::command;
use tauri::State;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PushLog {
    pub id: String,
    pub push_type: String,
    pub title: String,
    pub detail: Option<String>,
    pub channel: String,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
}

pub async fn insert_push_log(
    pool: &SqlitePool,
    push_type: &str,
    title: &str,
    detail: Option<&str>,
    channel: &str,
    status: &str,
    error_message: Option<&str>,
) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Local::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO push_logs (id, push_type, title, detail, channel, status, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(push_type)
    .bind(title)
    .bind(detail)
    .bind(channel)
    .bind(status)
    .bind(error_message)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to insert push log: {}", e))?;

    Ok(())
}

#[command]
pub async fn list_push_logs(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<PushLog>, String> {
    let pool = &state.db;
    let limit = limit.unwrap_or(200);

    let rows = sqlx::query_as::<_, PushLog>(
        "SELECT * FROM push_logs ORDER BY created_at DESC LIMIT ?"
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[command]
pub async fn clear_push_logs(state: State<'_, AppState>) -> Result<(), String> {
    sqlx::query("DELETE FROM push_logs")
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
