use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::State;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Reminder {
    pub id: String,
    pub application_id: Option<String>,
    pub title: String,
    pub content: Option<String>,
    pub reminder_type: Option<String>,
    pub remind_at: String,
    pub is_done: i64,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateReminderInput {
    pub application_id: Option<String>,
    pub title: String,
    pub content: Option<String>,
    pub reminder_type: Option<String>,
    pub remind_at: String,
}

#[command]
pub async fn create_reminder(
    state: State<'_, AppState>,
    input: CreateReminderInput,
) -> Result<Reminder, String> {
    let pool = &state.db;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO reminders (id, application_id, title, content, reminder_type, remind_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&input.application_id)
    .bind(&input.title)
    .bind(&input.content)
    .bind(&input.reminder_type)
    .bind(&input.remind_at)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = sqlx::query_as::<_, Reminder>("SELECT * FROM reminders WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(row)
}

#[command]
pub async fn list_reminders(
    state: State<'_, AppState>,
    application_id: Option<String>,
    include_done: Option<bool>,
) -> Result<Vec<Reminder>, String> {
    let pool = &state.db;
    let mut sql = "SELECT * FROM reminders WHERE 1=1".to_string();
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref aid) = application_id {
        sql += " AND application_id = ?1";
        binds.push(aid.clone());
    }

    if !include_done.unwrap_or(false) {
        sql += " AND is_done = 0";
    }

    sql += " ORDER BY remind_at ASC";

    let mut query = sqlx::query_as::<_, Reminder>(&sql);
    for bind in &binds {
        query = query.bind(bind);
    }

    let rows = query
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[command]
pub async fn mark_reminder_done(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query("UPDATE reminders SET is_done = 1, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub async fn delete_reminder(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    sqlx::query("DELETE FROM reminders WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
