use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::command;
use tauri::State;

use crate::AppState;
use super::validation::is_valid_application_status;


#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct TrackingTarget {
    pub id: String,
    pub application_id: String,
    pub domain: String,
    pub status_url: String,
    pub ats_type: String,
    pub enabled: i64,
    pub check_frequency: String,
    pub current_status: String,
    pub last_status: Option<String>,
    pub login_state: String,
    pub last_checked_at: Option<String>,
    pub last_success_at: Option<String>,
    pub last_error: Option<String>,
    pub last_text_hash: Option<String>,
    pub profile_dir: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTrackingTargetInput {
    pub application_id: String,
    pub status_url: String,
    pub ats_type: Option<String>,
    pub check_frequency: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTrackingTargetInput {
    pub status_url: Option<String>,
    pub ats_type: Option<String>,
    pub enabled: Option<i64>,
    pub check_frequency: Option<String>,
    pub current_status: Option<String>,
    pub last_status: Option<String>,
    pub login_state: Option<String>,
    pub last_checked_at: Option<String>,
    pub last_success_at: Option<String>,
    pub last_error: Option<String>,
    pub last_text_hash: Option<String>,
    pub profile_dir: Option<String>,
}

fn extract_domain(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .unwrap_or_else(|| "unknown".to_string())
}

fn validate_status_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|_| "状态页 URL 格式无效".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("状态页 URL 必须是有效的 http/https 地址".to_string());
    }
    Ok(())
}

fn is_valid_check_frequency(frequency: &str) -> bool {
    matches!(frequency, "manual" | "daily" | "every_6h" | "every_12h")
}

fn is_valid_login_state(state: &str) -> bool {
    matches!(
        state,
        "valid" | "expired" | "captcha_required" | "mfa_required" | "blocked" | "unknown"
    )
}

fn validate_tracking_target_create_input(input: &CreateTrackingTargetInput) -> Result<(), String> {
    validate_status_url(&input.status_url)?;
    if let Some(frequency) = input.check_frequency.as_deref() {
        if !is_valid_check_frequency(frequency) {
            return Err(format!("Unsupported check frequency: {}", frequency));
        }
    }
    if let Some(ats_type) = input.ats_type.as_deref() {
        if ats_type.trim().is_empty() {
            return Err("ATS 类型不能为空".to_string());
        }
    }
    Ok(())
}

fn validate_tracking_target_update_input(input: &UpdateTrackingTargetInput) -> Result<(), String> {
    if let Some(url) = input.status_url.as_deref() {
        validate_status_url(url)?;
    }
    if let Some(frequency) = input.check_frequency.as_deref() {
        if !is_valid_check_frequency(frequency) {
            return Err(format!("Unsupported check frequency: {}", frequency));
        }
    }
    if let Some(status) = input.current_status.as_deref() {
        if !is_valid_application_status(status) {
            return Err(format!("Unsupported application status: {}", status));
        }
    }
    if let Some(status) = input.last_status.as_deref() {
        if !is_valid_application_status(status) {
            return Err(format!("Unsupported application status: {}", status));
        }
    }
    if let Some(state) = input.login_state.as_deref() {
        if !is_valid_login_state(state) {
            return Err(format!("Unsupported login state: {}", state));
        }
    }
    if let Some(ats_type) = input.ats_type.as_deref() {
        if ats_type.trim().is_empty() {
            return Err("ATS 类型不能为空".to_string());
        }
    }
    if let Some(enabled) = input.enabled {
        if !matches!(enabled, 0 | 1) {
            return Err("enabled 只能是 0 或 1".to_string());
        }
    }
    Ok(())
}

#[command]
pub async fn create_tracking_target(
    state: State<'_, AppState>,
    input: CreateTrackingTargetInput,
) -> Result<TrackingTarget, String> {
    validate_tracking_target_create_input(&input)?;

    let pool = &state.db;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let domain = extract_domain(&input.status_url);
    let profile_dir = format!("profiles/{}", domain);
    let ats_type = input.ats_type.unwrap_or_else(|| "generic".to_string());
    let check_frequency = input.check_frequency.unwrap_or_else(|| "daily".to_string());
    let current_status = sqlx::query_scalar::<_, String>("SELECT status FROM applications WHERE id = ?")
        .bind(&input.application_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Application not found".to_string())?;

    sqlx::query(
        "INSERT INTO tracking_targets (id, application_id, domain, status_url, ats_type, check_frequency, current_status, profile_dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&input.application_id)
    .bind(&domain)
    .bind(&input.status_url)
    .bind(&ats_type)
    .bind(&check_frequency)
    .bind(&current_status)
    .bind(&profile_dir)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    get_target_inner(pool, &id).await
}

#[command]
pub async fn list_tracking_targets(
    state: State<'_, AppState>,
    application_id: Option<String>,
) -> Result<Vec<TrackingTarget>, String> {
    let pool = &state.db;

    let rows = if let Some(ref aid) = application_id {
        sqlx::query_as::<_, TrackingTarget>(
            "SELECT * FROM tracking_targets WHERE application_id = ?1 ORDER BY created_at DESC"
        )
        .bind(aid)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query_as::<_, TrackingTarget>(
            "SELECT * FROM tracking_targets ORDER BY created_at DESC"
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
    };

    Ok(rows)
}

#[command]
pub async fn update_tracking_target(
    state: State<'_, AppState>,
    id: String,
    input: UpdateTrackingTargetInput,
) -> Result<TrackingTarget, String> {
    validate_tracking_target_update_input(&input)?;

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

    // When status_url changes, also update domain
    if let Some(ref url) = input.status_url {
        let domain = extract_domain(url);
        sets.push("domain = ?".to_string());
        values.push(domain);
        sets.push("status_url = ?".to_string());
        values.push(url.clone());
    }

    add_field!(ats_type, "ats_type");
    add_field!(check_frequency, "check_frequency");
    add_field!(current_status, "current_status");
    add_field!(last_status, "last_status");
    add_field!(login_state, "login_state");
    add_field!(last_checked_at, "last_checked_at");
    add_field!(last_success_at, "last_success_at");
    add_field!(last_error, "last_error");
    add_field!(last_text_hash, "last_text_hash");
    add_field!(profile_dir, "profile_dir");

    if let Some(v) = input.enabled {
        sets.push("enabled = ?".to_string());
        values.push(v.to_string());
    }

    let sql = format!("UPDATE tracking_targets SET {} WHERE id = ?", sets.join(", "));
    let mut query = sqlx::query(&sql);
    for v in &values {
        query = query.bind(v);
    }
    query = query.bind(&id);

    query.execute(pool).await.map_err(|e| e.to_string())?;
    get_target_inner(pool, &id).await
}

async fn get_target_inner(pool: &SqlitePool, id: &str) -> Result<TrackingTarget, String> {
    let row = sqlx::query_as::<_, TrackingTarget>("SELECT * FROM tracking_targets WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;

    row.ok_or_else(|| "Tracking target not found".to_string())
}

#[command]
pub async fn delete_tracking_target(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    sqlx::query("DELETE FROM tracking_runs WHERE target_id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM tracking_targets WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// === Tracking Runs ===

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct TrackingRun {
    pub id: String,
    pub target_id: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub status: String,
    pub raw_status: Option<String>,
    pub normalized_status: Option<String>,
    pub confidence: Option<f64>,
    pub login_state: Option<String>,
    pub error_message: Option<String>,
    pub page_hash: Option<String>,
    pub ai_used: i64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTrackingRunInput {
    pub target_id: String,
    pub status: String,
    pub raw_status: Option<String>,
    pub normalized_status: Option<String>,
    pub confidence: Option<f64>,
    pub login_state: Option<String>,
    pub error_message: Option<String>,
    pub page_hash: Option<String>,
    pub ai_used: Option<i64>,
}

#[command]
pub async fn create_tracking_run(
    state: State<'_, AppState>,
    input: CreateTrackingRunInput,
) -> Result<TrackingRun, String> {
    create_tracking_run_inner(&state.db, &input).await
}

#[command]
pub async fn list_tracking_runs(
    state: State<'_, AppState>,
    target_id: String,
) -> Result<Vec<TrackingRun>, String> {
    let pool = &state.db;
    let rows = sqlx::query_as::<_, TrackingRun>(
        "SELECT * FROM tracking_runs WHERE target_id = ? ORDER BY created_at DESC"
    )
    .bind(&target_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[command]
pub async fn get_targets_needing_check(
    state: State<'_, AppState>,
) -> Result<Vec<TrackingTarget>, String> {
    get_targets_needing_check_inner(&state.db).await
}

// Inner helper: same logic as get_targets_needing_check but takes pool directly
pub async fn get_targets_needing_check_inner(pool: &SqlitePool) -> Result<Vec<TrackingTarget>, String> {
    let targets = sqlx::query_as::<_, TrackingTarget>(
        "SELECT * FROM tracking_targets WHERE enabled = 1"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now();
    let mut needs_check = Vec::new();

    for target in targets {
        let should_check = match target.last_checked_at {
            None => true,
            Some(ref last_checked) => {
                let last = chrono::DateTime::parse_from_rfc3339(last_checked)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or(now);

                let duration = now.signed_duration_since(last);

                match target.check_frequency.as_str() {
                    "manual" => false,
                    "daily" => duration.num_hours() >= 24,
                    "every_12h" => duration.num_hours() >= 12,
                    "every_6h" => duration.num_hours() >= 6,
                    _ => duration.num_hours() >= 24,
                }
            }
        };

        if should_check {
            needs_check.push(target);
        }
    }

    Ok(needs_check)
}

// Inner helper: create tracking run with pool directly
pub async fn create_tracking_run_inner(pool: &SqlitePool, input: &CreateTrackingRunInput) -> Result<TrackingRun, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO tracking_runs (id, target_id, started_at, finished_at, status, raw_status, normalized_status, confidence, login_state, error_message, page_hash, ai_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&input.target_id)
    .bind(&now)
    .bind(&now)
    .bind(&input.status)
    .bind(&input.raw_status)
    .bind(&input.normalized_status)
    .bind(&input.confidence)
    .bind(&input.login_state)
    .bind(&input.error_message)
    .bind(&input.page_hash)
    .bind(input.ai_used.unwrap_or(0))
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let row = sqlx::query_as::<_, TrackingRun>("SELECT * FROM tracking_runs WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(row)
}

// Inner helper: update tracking target with pool directly
pub async fn update_tracking_target_inner(pool: &SqlitePool, id: &str, input: &UpdateTrackingTargetInput) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();

    let mut sets = vec!["updated_at = ?".to_string()];
    let mut values: Vec<String> = vec![now];

    if let Some(ref v) = input.login_state {
        sets.push("login_state = ?".to_string());
        values.push(v.clone());
    }
    if let Some(ref v) = input.last_checked_at {
        sets.push("last_checked_at = ?".to_string());
        values.push(v.clone());
    }
    if let Some(ref v) = input.last_success_at {
        sets.push("last_success_at = ?".to_string());
        values.push(v.clone());
    }
    if let Some(ref v) = input.last_error {
        sets.push("last_error = ?".to_string());
        values.push(v.clone());
    } else {
        sets.push("last_error = NULL".to_string());
    }
    if let Some(ref v) = input.last_text_hash {
        sets.push("last_text_hash = ?".to_string());
        values.push(v.clone());
    }
    if let Some(ref v) = input.current_status {
        sets.push("current_status = ?".to_string());
        values.push(v.clone());
    }
    if let Some(ref v) = input.last_status {
        sets.push("last_status = ?".to_string());
        values.push(v.clone());
    }

    if sets.len() <= 1 {
        return Ok(());
    }

    let sql = format!("UPDATE tracking_targets SET {} WHERE id = ?", sets.join(", "));
    let mut query = sqlx::query(&sql);
    for v in &values {
        query = query.bind(v);
    }
    query = query.bind(id);

    query.execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

// Inner helper: create event with pool directly


