use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::command;
use tauri::State;

use crate::AppState;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Application {
    pub id: String,
    pub company_name: String,
    pub job_title: String,
    pub location: Option<String>,
    pub salary_range: Option<String>,
    pub job_url: Option<String>,
    pub status_url: Option<String>,
    pub source: Option<String>,
    pub status: String,
    pub priority: String,
    pub applied_at: Option<String>,
    pub deadline_at: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateApplicationInput {
    pub company_name: String,
    pub job_title: String,
    pub location: Option<String>,
    pub salary_range: Option<String>,
    pub job_url: Option<String>,
    pub status_url: Option<String>,
    pub source: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub applied_at: Option<String>,
    pub deadline_at: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateApplicationInput {
    pub company_name: Option<String>,
    pub job_title: Option<String>,
    pub location: Option<String>,
    pub salary_range: Option<String>,
    pub job_url: Option<String>,
    pub status_url: Option<String>,
    pub source: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub applied_at: Option<String>,
    pub deadline_at: Option<String>,
    pub notes: Option<String>,
}

#[command]
pub async fn create_application(
    state: State<'_, AppState>,
    input: CreateApplicationInput,
) -> Result<Application, String> {
    let pool = &state.db;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let status = input.status.unwrap_or_else(|| "unknown".to_string());
    let priority = input.priority.unwrap_or_else(|| "medium".to_string());

    sqlx::query(
        "INSERT INTO applications (id, company_name, job_title, location, salary_range, job_url, status_url, source, status, priority, applied_at, deadline_at, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&input.company_name)
    .bind(&input.job_title)
    .bind(&input.location)
    .bind(&input.salary_range)
    .bind(&input.job_url)
    .bind(&input.status_url)
    .bind(&input.source)
    .bind(&status)
    .bind(&priority)
    .bind(&input.applied_at)
    .bind(&input.deadline_at)
    .bind(&input.notes)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    get_application_inner(pool, &id).await
}

#[command]
pub async fn list_applications(
    state: State<'_, AppState>,
    search: Option<String>,
    status: Option<String>,
    source: Option<String>,
) -> Result<Vec<Application>, String> {
    let pool = &state.db;
    let mut sql = "SELECT * FROM applications WHERE 1=1".to_string();
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref s) = search {
        let pattern = format!("%{}%", s);
        sql += " AND (company_name LIKE ?1 OR job_title LIKE ?1)";
        binds.push(pattern);
    }
    if let Some(ref s) = status {
        sql += &format!(" AND status = ?{}", binds.len() + 1);
        binds.push(s.clone());
    }
    if let Some(ref s) = source {
        sql += &format!(" AND source = ?{}", binds.len() + 1);
        binds.push(s.clone());
    }

    sql += " ORDER BY updated_at DESC";

    let mut query = sqlx::query_as::<_, Application>(&sql);
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
pub async fn get_application(
    state: State<'_, AppState>,
    id: String,
) -> Result<Application, String> {
    get_application_inner(&state.db, &id).await
}

async fn get_application_inner(pool: &SqlitePool, id: &str) -> Result<Application, String> {
    let row = sqlx::query_as::<_, Application>("SELECT * FROM applications WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

    row.ok_or_else(|| "Application not found".to_string())
}

#[command]
pub async fn update_application(
    state: State<'_, AppState>,
    id: String,
    input: UpdateApplicationInput,
) -> Result<Application, String> {
    let pool = &state.db;
    let now = chrono::Utc::now().to_rfc3339();

    let mut sets = vec!["updated_at = ?".to_string()];
    let mut values: Vec<String> = vec![now];

    macro_rules! add_field {
        ($field:ident, $col:expr) => {
            if let Some(v) = input.$field {
                sets.push(format!("{} = ?", $col));
                values.push(v);
            }
        };
    }

    add_field!(company_name, "company_name");
    add_field!(job_title, "job_title");
    add_field!(location, "location");
    add_field!(salary_range, "salary_range");
    add_field!(job_url, "job_url");
    add_field!(status_url, "status_url");
    add_field!(source, "source");
    add_field!(status, "status");
    add_field!(priority, "priority");
    add_field!(applied_at, "applied_at");
    add_field!(deadline_at, "deadline_at");
    add_field!(notes, "notes");

    let sql = format!("UPDATE applications SET {} WHERE id = ?", sets.join(", "));
    let mut query = sqlx::query(&sql);
    for v in &values {
        query = query.bind(v);
    }
    query = query.bind(&id);

    query.execute(pool).await.map_err(|e| e.to_string())?;
    get_application_inner(pool, &id).await
}

#[command]
pub async fn delete_application(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    sqlx::query("DELETE FROM applications WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
