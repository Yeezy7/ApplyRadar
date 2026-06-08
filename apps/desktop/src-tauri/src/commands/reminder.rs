use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::command;
use tauri::{AppHandle, Emitter};
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
    pub notified_at: Option<String>,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, sqlx::FromRow)]
struct ReminderDueRow {
    pub id: String,
    pub application_id: Option<String>,
    pub title: String,
    pub content: Option<String>,
    pub remind_at: String,
    pub company_name: Option<String>,
    pub job_title: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReminderDueNotify {
    pub title: String,
    pub body: String,
    pub reminder_id: String,
    pub application_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateReminderInput {
    pub application_id: Option<String>,
    pub title: String,
    pub content: Option<String>,
    pub reminder_type: Option<String>,
    pub remind_at: String,
    pub notified_at: Option<String>,
}

fn is_valid_reminder_type(reminder_type: &str) -> bool {
    matches!(
        reminder_type,
        "interview"
            | "assessment_deadline"
            | "offer_deadline"
            | "follow_up"
            | "document_required"
            | "custom"
    )
}

fn validate_rfc3339(value: &str, field_label: &str) -> Result<(), String> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|_| ())
        .map_err(|_| format!("{}时间格式无效", field_label))
}

async fn validate_create_reminder_input(pool: &SqlitePool, input: &CreateReminderInput) -> Result<(), String> {
    if input.title.trim().is_empty() {
        return Err("提醒标题不能为空".to_string());
    }
    validate_rfc3339(&input.remind_at, "提醒")?;
    if let Some(notified_at) = input.notified_at.as_deref() {
        validate_rfc3339(notified_at, "通知")?;
    }
    if let Some(reminder_type) = input.reminder_type.as_deref() {
        if !is_valid_reminder_type(reminder_type) {
            return Err(format!("Unsupported reminder type: {}", reminder_type));
        }
    }
    if let Some(application_id) = input.application_id.as_deref() {
        let exists = sqlx::query_scalar::<_, i64>("SELECT 1 FROM applications WHERE id = ?")
            .bind(application_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .is_some();
        if !exists {
            return Err("Application not found".to_string());
        }
    }
    Ok(())
}

#[command]
pub async fn create_reminder(
    state: State<'_, AppState>,
    input: CreateReminderInput,
) -> Result<Reminder, String> {
    let pool = &state.db;
    validate_create_reminder_input(pool, &input).await?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO reminders (id, application_id, title, content, reminder_type, remind_at, notified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&input.application_id)
    .bind(input.title.trim())
    .bind(&input.content)
    .bind(&input.reminder_type)
    .bind(&input.remind_at)
    .bind(&input.notified_at)
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

    let result = sqlx::query("UPDATE reminders SET is_done = 1, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        return Err("Reminder not found".to_string());
    }

    Ok(())
}

#[command]
pub async fn delete_reminder(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let result = sqlx::query("DELETE FROM reminders WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    if result.rows_affected() == 0 {
        return Err("Reminder not found".to_string());
    }
    Ok(())
}

pub async fn emit_due_reminder_notifications(
    app_handle: &AppHandle,
    pool: &SqlitePool,
) -> Result<usize, String> {
    let rows = sqlx::query_as::<_, ReminderDueRow>(
        r#"
        SELECT
            r.id,
            r.application_id,
            r.title,
            r.content,
            r.remind_at,
            a.company_name,
            a.job_title
        FROM reminders r
        LEFT JOIN applications a ON a.id = r.application_id
        WHERE r.is_done = 0
          AND r.notified_at IS NULL
        ORDER BY r.remind_at ASC
        LIMIT 20
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now();
    let now_str = now.to_rfc3339();
    let mut notified = 0usize;

    for row in rows {
        let remind_at = match chrono::DateTime::parse_from_rfc3339(&row.remind_at) {
            Ok(dt) => dt.with_timezone(&chrono::Utc),
            Err(_) => continue,
        };

        if remind_at > now {
            continue;
        }

        let app_label = match (row.company_name.as_deref(), row.job_title.as_deref()) {
            (Some(company), Some(job)) => Some(format!("{} - {}", company, job)),
            (Some(company), None) => Some(company.to_string()),
            _ => None,
        };

        let body = match (app_label, row.content.as_deref().filter(|content| !content.trim().is_empty())) {
            (Some(app), Some(content)) => format!("{} · {}", app, content.trim()),
            (Some(app), None) => app,
            (None, Some(content)) => content.trim().to_string(),
            (None, None) => "到时间了".to_string(),
        };

        let payload = ReminderDueNotify {
            title: format!("提醒：{}", row.title),
            body,
            reminder_id: row.id.clone(),
            application_id: row.application_id.clone(),
        };

        app_handle
            .emit("reminder:due", payload)
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE reminders SET notified_at = ?, updated_at = ? WHERE id = ? AND notified_at IS NULL")
            .bind(&now_str)
            .bind(&now_str)
            .bind(&row.id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

        notified += 1;
    }

    Ok(notified)
}
