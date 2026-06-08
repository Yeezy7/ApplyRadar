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
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub location: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub salary_range: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub job_url: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub status_url: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub source: Option<Option<String>>,
    pub status: Option<String>,
    pub priority: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub applied_at: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub deadline_at: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub notes: Option<Option<String>>,
}

fn deserialize_nullable_string<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct NullableStringVisitor;

    impl<'de> serde::de::Visitor<'de> for NullableStringVisitor {
        type Value = Option<Option<String>>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string, null, or an omitted field")
        }

        fn visit_none<E>(self) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(Some(None))
        }

        fn visit_unit<E>(self) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(Some(None))
        }

        fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
        where
            D: serde::Deserializer<'de>,
        {
            String::deserialize(deserializer).map(|value| Some(Some(value)))
        }
    }

    deserializer.deserialize_option(NullableStringVisitor)
}

fn is_valid_application_status(status: &str) -> bool {
    matches!(
        status,
        "to_apply"
            | "applied"
            | "received"
            | "under_review"
            | "assessment"
            | "interview"
            | "final_interview"
            | "offer"
            | "rejected"
            | "withdrawn"
            | "unknown"
    )
}

fn is_valid_priority(priority: &str) -> bool {
    matches!(priority, "low" | "medium" | "high")
}

fn is_valid_source(source: &str) -> bool {
    matches!(source, "official" | "email" | "referral" | "linkedin" | "boss" | "manual")
}

fn validate_non_empty(value: &str, field_label: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{}不能为空", field_label));
    }
    Ok(())
}

fn validate_http_url(value: &str, field_label: &str) -> Result<(), String> {
    validate_non_empty(value, field_label)?;
    let parsed = url::Url::parse(value).map_err(|_| format!("{}格式无效", field_label))?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err(format!("{}必须是有效的 http/https 地址", field_label));
    }
    Ok(())
}

fn validate_create_application_input(input: &CreateApplicationInput) -> Result<(), String> {
    validate_non_empty(&input.company_name, "公司名称")?;
    validate_non_empty(&input.job_title, "岗位名称")?;

    if let Some(status) = input.status.as_deref() {
        if !is_valid_application_status(status) {
            return Err(format!("Unsupported application status: {}", status));
        }
    }
    if let Some(priority) = input.priority.as_deref() {
        if !is_valid_priority(priority) {
            return Err(format!("Unsupported priority: {}", priority));
        }
    }
    if let Some(source) = input.source.as_deref() {
        if !is_valid_source(source) {
            return Err(format!("Unsupported source: {}", source));
        }
    }
    if let Some(job_url) = input.job_url.as_deref() {
        validate_http_url(job_url, "JD 链接")?;
    }
    if let Some(status_url) = input.status_url.as_deref() {
        validate_http_url(status_url, "状态页 URL")?;
    }

    Ok(())
}

fn validate_update_application_input(input: &UpdateApplicationInput) -> Result<(), String> {
    if let Some(company_name) = input.company_name.as_deref() {
        validate_non_empty(company_name, "公司名称")?;
    }
    if let Some(job_title) = input.job_title.as_deref() {
        validate_non_empty(job_title, "岗位名称")?;
    }
    if let Some(status) = input.status.as_deref() {
        if !is_valid_application_status(status) {
            return Err(format!("Unsupported application status: {}", status));
        }
    }
    if let Some(priority) = input.priority.as_deref() {
        if !is_valid_priority(priority) {
            return Err(format!("Unsupported priority: {}", priority));
        }
    }
    if let Some(Some(source)) = input.source.as_ref() {
        if !is_valid_source(source) {
            return Err(format!("Unsupported source: {}", source));
        }
    }
    if let Some(Some(job_url)) = input.job_url.as_ref() {
        validate_http_url(job_url, "JD 链接")?;
    }
    if let Some(Some(status_url)) = input.status_url.as_ref() {
        validate_http_url(status_url, "状态页 URL")?;
    }

    Ok(())
}

#[command]
pub async fn create_application(
    state: State<'_, AppState>,
    input: CreateApplicationInput,
) -> Result<Application, String> {
    validate_create_application_input(&input)?;

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
    validate_update_application_input(&input)?;

    let pool = &state.db;
    let now = chrono::Utc::now().to_rfc3339();
    let requested_status = input.status.clone();
    let previous_status = if requested_status.is_some() {
        Some(get_application_inner(pool, &id).await?.status)
    } else {
        None
    };

    let mut sets = vec!["updated_at = ?".to_string()];
    let mut values: Vec<Option<String>> = vec![Some(now)];

    macro_rules! add_field {
        ($field:ident, $col:expr) => {
            if let Some(v) = input.$field {
                sets.push(format!("{} = ?", $col));
                values.push(Some(v));
            }
        };
    }

    macro_rules! add_nullable_field {
        ($field:ident, $col:expr) => {
            if let Some(v) = input.$field {
                sets.push(format!("{} = ?", $col));
                values.push(v);
            }
        };
    }

    add_field!(company_name, "company_name");
    add_field!(job_title, "job_title");
    add_nullable_field!(location, "location");
    add_nullable_field!(salary_range, "salary_range");
    add_nullable_field!(job_url, "job_url");
    add_nullable_field!(status_url, "status_url");
    add_nullable_field!(source, "source");
    add_field!(status, "status");
    add_field!(priority, "priority");
    add_nullable_field!(applied_at, "applied_at");
    add_nullable_field!(deadline_at, "deadline_at");
    add_nullable_field!(notes, "notes");

    let sql = format!("UPDATE applications SET {} WHERE id = ?", sets.join(", "));
    let mut query = sqlx::query(&sql);
    for v in &values {
        query = query.bind(v);
    }
    query = query.bind(&id);

    query.execute(pool).await.map_err(|e| e.to_string())?;
    let app = get_application_inner(pool, &id).await?;

    if let Some(new_status) = requested_status {
        sync_tracking_targets_status(pool, &id, previous_status.as_deref(), &new_status).await?;
    }

    Ok(app)
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

async fn sync_tracking_targets_status(
    pool: &SqlitePool,
    application_id: &str,
    previous_status: Option<&str>,
    new_status: &str,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(old_status) = previous_status.filter(|status| *status != "unknown" && *status != new_status) {
        sqlx::query(
            "UPDATE tracking_targets SET current_status = ?, last_status = ?, updated_at = ? WHERE application_id = ?"
        )
        .bind(new_status)
        .bind(old_status)
        .bind(&now)
        .bind(application_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "UPDATE tracking_targets SET current_status = ?, updated_at = ? WHERE application_id = ?"
        )
        .bind(new_status)
        .bind(&now)
        .bind(application_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
