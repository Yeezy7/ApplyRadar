use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::State;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ApplicationEvent {
    pub id: String,
    pub application_id: String,
    pub event_type: String,
    pub title: String,
    pub content: Option<String>,
    pub old_status: Option<String>,
    pub new_status: Option<String>,
    pub event_time: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateEventInput {
    pub application_id: String,
    pub event_type: String,
    pub title: String,
    pub content: Option<String>,
    pub old_status: Option<String>,
    pub new_status: Option<String>,
}

#[command]
pub async fn create_event(
    state: State<'_, AppState>,
    input: CreateEventInput,
) -> Result<ApplicationEvent, String> {
    let pool = &state.db;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO application_events (id, application_id, event_type, title, content, old_status, new_status, event_time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&input.application_id)
    .bind(&input.event_type)
    .bind(&input.title)
    .bind(&input.content)
    .bind(&input.old_status)
    .bind(&input.new_status)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = sqlx::query_as::<_, ApplicationEvent>("SELECT * FROM application_events WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(row)
}

#[command]
pub async fn list_events_by_application(
    state: State<'_, AppState>,
    application_id: String,
) -> Result<Vec<ApplicationEvent>, String> {
    let rows = sqlx::query_as::<_, ApplicationEvent>(
        "SELECT * FROM application_events WHERE application_id = ? ORDER BY event_time DESC"
    )
    .bind(&application_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}
