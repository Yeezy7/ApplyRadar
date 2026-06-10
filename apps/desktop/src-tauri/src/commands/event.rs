use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::command;
use tauri::State;

use crate::AppState;
use super::validation::is_valid_application_status;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ApplicationEvent {
    pub id: String,
    pub application_id: String,
    pub event_type: String,
    pub title: String,
    pub content: Option<String>,
    pub old_status: Option<String>,
    pub new_status: Option<String>,
    pub handled_at: Option<String>,
    pub handled_action: Option<String>,
    pub event_time: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct ResolveEventInput {
    pub action: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateEventInput {
    pub application_id: String,
    pub event_type: String,
    pub title: String,
    pub content: Option<String>,
    pub old_status: Option<String>,
    pub new_status: Option<String>,
    pub handled_at: Option<String>,
    pub handled_action: Option<String>,
}

fn is_valid_event_action(action: &str) -> bool {
    matches!(action, "accepted" | "dismissed")
}

fn validate_optional_status(status: &Option<String>) -> Result<(), String> {
    if let Some(status) = status {
        if !is_valid_application_status(status) {
            return Err(format!("Unsupported application status: {}", status));
        }
    }
    Ok(())
}

fn validate_event_input(input: &CreateEventInput) -> Result<(), String> {
    validate_optional_status(&input.old_status)?;
    validate_optional_status(&input.new_status)?;

    if let Some(action) = input.handled_action.as_deref() {
        if !is_valid_event_action(action) {
            return Err("Unsupported event action".to_string());
        }
        if input.handled_at.is_none() {
            return Err("handled_at is required when handled_action is set".to_string());
        }
    }

    Ok(())
}

fn is_resolvable_status_event(event: &ApplicationEvent) -> bool {
    event.event_type == "note_added"
        && matches!(event.title.as_str(), "AI 识别待确认" | "规则识别待确认")
        && event.new_status.is_some()
}

pub async fn create_event_inner(pool: &SqlitePool, input: &CreateEventInput) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO application_events (id, application_id, event_type, title, content, old_status, new_status, handled_at, handled_action, event_time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&input.application_id)
    .bind(&input.event_type)
    .bind(&input.title)
    .bind(&input.content)
    .bind(&input.old_status)
    .bind(&input.new_status)
    .bind(&input.handled_at)
    .bind(&input.handled_action)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(id)
}

#[command]
pub async fn create_event(
    state: State<'_, AppState>,
    input: CreateEventInput,
) -> Result<ApplicationEvent, String> {
    validate_event_input(&input)?;

    let pool = &state.db;
    let id = create_event_inner(pool, &input).await?;

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

#[command]
pub async fn resolve_application_event(
    state: State<'_, AppState>,
    event_id: String,
    input: ResolveEventInput,
) -> Result<ApplicationEvent, String> {
    let pool = &state.db;
    if !is_valid_event_action(&input.action) {
        return Err("Unsupported event action".to_string());
    }

    resolve_application_event_inner(pool, &event_id, &input.action).await
}

async fn resolve_application_event_inner(
    pool: &SqlitePool,
    event_id: &str,
    action: &str,
) -> Result<ApplicationEvent, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let event = sqlx::query_as::<_, ApplicationEvent>("SELECT * FROM application_events WHERE id = ?")
        .bind(&event_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Event not found".to_string())?;

    if event.handled_at.is_some() {
        tx.commit().await.map_err(|e| e.to_string())?;
        return Ok(event);
    }

    if !is_resolvable_status_event(&event) {
        return Err("Only pending status events can be resolved".to_string());
    }

    let new_status = event
        .new_status
        .clone()
        .ok_or_else(|| "Pending status event has no status".to_string())?;
    if !is_valid_application_status(&new_status) {
        return Err(format!("Unsupported application status: {}", new_status));
    }

    let now = chrono::Utc::now().to_rfc3339();
    let updated = sqlx::query(
        "UPDATE application_events SET handled_at = ?, handled_action = ? WHERE id = ? AND handled_at IS NULL"
    )
    .bind(&now)
    .bind(action)
    .bind(event_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if updated.rows_affected() == 0 {
        let row = sqlx::query_as::<_, ApplicationEvent>("SELECT * FROM application_events WHERE id = ?")
            .bind(event_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
        return Ok(row);
    }

    if action == "accepted" {
        let old_status = sqlx::query_scalar::<_, String>("SELECT status FROM applications WHERE id = ?")
            .bind(&event.application_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Application not found".to_string())?;

        sqlx::query("UPDATE applications SET status = ?, updated_at = ? WHERE id = ?")
            .bind(&new_status)
            .bind(&now)
            .bind(&event.application_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        if old_status != "unknown" && old_status != new_status {
            sqlx::query("UPDATE tracking_targets SET current_status = ?, last_status = ?, updated_at = ? WHERE application_id = ?")
                .bind(&new_status)
                .bind(&old_status)
                .bind(&now)
                .bind(&event.application_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        } else {
            sqlx::query("UPDATE tracking_targets SET current_status = ?, updated_at = ? WHERE application_id = ?")
                .bind(&new_status)
                .bind(&now)
                .bind(&event.application_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }

        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO application_events (id, application_id, event_type, title, content, old_status, new_status, handled_at, handled_action, event_time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(&event.application_id)
        .bind("status_change")
        .bind(if event.title == "规则识别待确认" { "手动确认规则识别" } else { "手动确认 AI 识别" })
        .bind(event.content.clone())
        .bind(&old_status)
        .bind(&new_status)
        .bind(None::<String>)
        .bind(None::<String>)
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    let row = sqlx::query_as::<_, ApplicationEvent>("SELECT * FROM application_events WHERE id = ?")
        .bind(event_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(row)
}
