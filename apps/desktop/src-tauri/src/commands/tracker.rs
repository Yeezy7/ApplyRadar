use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::command;
use tauri::{AppHandle, Emitter, State};

use crate::AppState;
use super::ai;
use super::settings;
use super::sidecar;

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

#[command]
pub async fn create_tracking_target(
    state: State<'_, AppState>,
    input: CreateTrackingTargetInput,
) -> Result<TrackingTarget, String> {
    let pool = &state.db;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let domain = extract_domain(&input.status_url);
    let ats_type = input.ats_type.unwrap_or_else(|| "generic".to_string());
    let check_frequency = input.check_frequency.unwrap_or_else(|| "daily".to_string());

    sqlx::query(
        "INSERT INTO tracking_targets (id, application_id, domain, status_url, ats_type, check_frequency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&input.application_id)
    .bind(&domain)
    .bind(&input.status_url)
    .bind(&ats_type)
    .bind(&check_frequency)
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
    let pool = &state.db;
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
    let pool = &state.db;

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

// Inner helper: same logic as get_targets_needing_check but takes pool directly
async fn get_targets_needing_check_inner(pool: &SqlitePool) -> Result<Vec<TrackingTarget>, String> {
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
async fn create_tracking_run_inner(pool: &SqlitePool, input: &CreateTrackingRunInput) -> Result<TrackingRun, String> {
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
async fn update_tracking_target_inner(pool: &SqlitePool, id: &str, input: &UpdateTrackingTargetInput) -> Result<(), String> {
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
async fn create_event_inner(pool: &SqlitePool, input: &super::event::CreateEventInput) -> Result<(), String> {
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

    Ok(())
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AutoCheckNotify {
    #[serde(rename = "type")]
    kind: String,
    title: String,
    body: String,
    target_id: Option<String>,
    application_id: Option<String>,
}

fn emit_auto_check_notify(app_handle: &AppHandle, notify: AutoCheckNotify) {
    let _ = app_handle.emit("auto-check:notify", notify);
}

fn is_invalid_login_state(state: Option<&str>) -> bool {
    matches!(
        state,
        Some("expired") | Some("blocked") | Some("captcha_required") | Some("mfa_required")
    )
}

fn login_state_label(state: &str) -> &'static str {
    match state {
        "expired" => "已过期",
        "blocked" => "已封禁",
        "captcha_required" => "需要验证码",
        "mfa_required" => "需要二次验证",
        "valid" => "正常",
        _ => "未知",
    }
}

async fn get_application_summary(pool: &SqlitePool, application_id: &str) -> Option<super::application::Application> {
    sqlx::query_as::<_, super::application::Application>(
        "SELECT * FROM applications WHERE id = ?"
    )
    .bind(application_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoCheckResult {
    pub total: usize,
    pub success: usize,
    pub failed: usize,
    pub status_changes: usize,
    pub login_issues: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AutoCheckStatus {
    pub enabled: bool,
    pub last_run_at: Option<String>,
    pub next_run_at: Option<String>,
    pub last_result: Option<String>,
    pub is_running: bool,
}

#[command]
pub async fn run_auto_check(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    force: Option<bool>,
) -> Result<AutoCheckResult, String> {
    run_auto_check_inner(&app_handle, &state.db, force.unwrap_or(false)).await
}

#[command]
pub async fn get_auto_check_status(state: State<'_, AppState>) -> Result<AutoCheckStatus, String> {
    let pool = &state.db;
    let enabled = settings::is_auto_check_enabled(pool).await;
    let last_run_at = settings::get_setting_raw(pool, "auto_check_last_run_at").await;
    let last_result = settings::get_setting_raw(pool, "auto_check_last_result").await;
    let is_running = settings::get_setting_raw(pool, "auto_check_is_running").await
        .map(|v| v == "true")
        .unwrap_or(false);

    // Calculate next run time based on shortest target frequency
    let interval_secs = calculate_check_interval_from_db(pool).await;
    let next_run_at = last_run_at.as_ref().and_then(|last| {
        chrono::DateTime::parse_from_rfc3339(last)
            .ok()
            .map(|dt| (dt + chrono::Duration::seconds(interval_secs as i64)).to_rfc3339())
    });

    Ok(AutoCheckStatus {
        enabled,
        last_run_at,
        next_run_at,
        last_result,
        is_running,
    })
}

async fn calculate_check_interval_from_db(pool: &SqlitePool) -> u64 {
    let targets = sqlx::query_scalar::<_, String>(
        "SELECT check_frequency FROM tracking_targets WHERE enabled = 1 AND check_frequency != 'manual'"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    if targets.is_empty() {
        return 3600;
    }

    let has_6h = targets.iter().any(|f| f == "every_6h");
    let has_12h = targets.iter().any(|f| f == "every_12h");

    if has_6h {
        1800
    } else if has_12h {
        3600
    } else {
        7200
    }
}

// Inner helper: same logic as run_auto_check but takes pool directly
pub async fn run_auto_check_inner(app_handle: &AppHandle, pool: &SqlitePool, force: bool) -> Result<AutoCheckResult, String> {
    // Get targets that need checking
    let targets = if force {
        // Force mode: get all enabled targets
        sqlx::query_as::<_, TrackingTarget>(
            "SELECT * FROM tracking_targets WHERE enabled = 1"
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
    } else {
        get_targets_needing_check_inner(pool).await?
    };

    if targets.is_empty() {
        return Ok(AutoCheckResult {
            total: 0,
            success: 0,
            failed: 0,
            status_changes: 0,
            login_issues: 0,
        });
    }

    let mut success_count = 0;
    let mut failed_count = 0;
    let mut status_changes = 0;
    let mut login_issues = 0;

    // Track domains with login issues to skip remaining targets
    let mut domains_with_login_issues: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Group by domain for shared browser profiles
    let mut by_domain: std::collections::HashMap<String, Vec<&TrackingTarget>> = std::collections::HashMap::new();
    for target in &targets {
        by_domain.entry(target.domain.clone()).or_default().push(target);
    }

    for (domain, domain_targets) in &by_domain {
        // Skip domain if login issue was detected
        if domains_with_login_issues.contains(domain) {
            println!("[auto_check] Skipping domain {} due to login issue", domain);
            continue;
        }

        println!("[auto_check] Checking domain: {} ({} targets)", domain, domain_targets.len());

        // Check each target sequentially with delay between domains
        for target in domain_targets {
            let profile_dir = target.profile_dir.clone().unwrap_or_else(|| format!("profiles/{}", target.domain));

            // Call sidecar with retry
            let mut last_error = String::new();
            let mut res = None;
            for attempt in 1..=2 {
                match sidecar::run_sidecar_check(app_handle.clone(), target.id.clone(), target.status_url.clone(), profile_dir.clone()).await {
                    Ok(r) => {
                        res = Some(r);
                        break;
                    }
                    Err(e) => {
                        last_error = e;
                        if attempt < 2 {
                            println!("[auto_check] Retry {} for {}: {}", attempt, target.id, last_error);
                            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
                        }
                    }
                }
            }

            let res = match res {
                Some(r) => r,
                None => {
                    println!("[auto_check] Sidecar error for {}: {}", target.id, last_error);
                    failed_count += 1;
                    let now = chrono::Utc::now().to_rfc3339();

                    // Record failed run
                    let _ = create_tracking_run_inner(pool, &CreateTrackingRunInput {
                        target_id: target.id.clone(),
                        status: "failed".to_string(),
                        raw_status: None,
                        normalized_status: None,
                        confidence: None,
                        login_state: None,
                        error_message: Some(last_error.clone()),
                        page_hash: None,
                        ai_used: None,
                    }).await;

                    let _ = update_tracking_target_inner(pool, &target.id, &UpdateTrackingTargetInput {
                        status_url: None,
                        ats_type: None,
                        enabled: None,
                        check_frequency: None,
                        current_status: None,
                        last_status: None,
                        login_state: None,
                        last_checked_at: Some(now),
                        last_success_at: None,
                        last_error: Some(last_error.clone()),
                        last_text_hash: None,
                        profile_dir: None,
                    }).await;

                    let _ = create_event_inner(pool, &super::event::CreateEventInput {
                        application_id: target.application_id.clone(),
                        event_type: "check_failed".to_string(),
                        title: "状态检查失败".to_string(),
                        content: Some(last_error.clone()),
                        old_status: None,
                        new_status: None,
                    }).await;

                    let body = if let Some(app) = get_application_summary(pool, &target.application_id).await {
                        format!("{} - {}: {}", app.company_name, app.job_title, last_error)
                    } else {
                        format!("{}: {}", target.domain, last_error)
                    };
                    emit_auto_check_notify(app_handle, AutoCheckNotify {
                        kind: "check_failed".to_string(),
                        title: "检查失败".to_string(),
                        body,
                        target_id: Some(target.id.clone()),
                        application_id: Some(target.application_id.clone()),
                    });

                    continue;
                }
            };

            if !res.success {
                failed_count += 1;
                let now = chrono::Utc::now().to_rfc3339();
                let error_message = res.error.clone().unwrap_or_else(|| "检查失败".to_string());
                let _ = create_tracking_run_inner(pool, &CreateTrackingRunInput {
                    target_id: target.id.clone(),
                    status: "failed".to_string(),
                    raw_status: None,
                    normalized_status: None,
                    confidence: None,
                    login_state: res.login_state.clone(),
                    error_message: Some(error_message.clone()),
                    page_hash: res.text_hash.clone(),
                    ai_used: None,
                }).await;

                let _ = update_tracking_target_inner(pool, &target.id, &UpdateTrackingTargetInput {
                    status_url: None,
                    ats_type: None,
                    enabled: None,
                    check_frequency: None,
                    current_status: None,
                    last_status: None,
                    login_state: res.login_state.clone(),
                    last_checked_at: Some(now),
                    last_success_at: None,
                    last_error: Some(error_message.clone()),
                    last_text_hash: res.text_hash.clone(),
                    profile_dir: None,
                }).await;

                let _ = create_event_inner(pool, &super::event::CreateEventInput {
                    application_id: target.application_id.clone(),
                    event_type: "check_failed".to_string(),
                    title: "状态检查失败".to_string(),
                    content: Some(error_message.clone()),
                    old_status: None,
                    new_status: None,
                }).await;

                let body = if let Some(app) = get_application_summary(pool, &target.application_id).await {
                    format!("{} - {}: {}", app.company_name, app.job_title, error_message)
                } else {
                    format!("{}: {}", target.domain, error_message)
                };
                emit_auto_check_notify(app_handle, AutoCheckNotify {
                    kind: "check_failed".to_string(),
                    title: "检查失败".to_string(),
                    body,
                    target_id: Some(target.id.clone()),
                    application_id: Some(target.application_id.clone()),
                });

                continue;
            }

            let mut target_failed = false;

            // Update target basic info
            let now = chrono::Utc::now().to_rfc3339();
            let mut update = UpdateTrackingTargetInput {
                status_url: None,
                ats_type: None,
                enabled: None,
                check_frequency: None,
                current_status: None,
                last_status: None,
                login_state: res.login_state.clone(),
                last_checked_at: Some(now.clone()),
                last_success_at: Some(now.clone()),
                last_error: Some("".to_string()),
                last_text_hash: res.text_hash.clone(),
                profile_dir: None,
            };

            // Handle login state
            let is_login_valid = res.login_state.as_deref().map_or(true, |s| s == "valid");
            if !is_login_valid {
                login_issues += 1;
                domains_with_login_issues.insert(target.domain.clone());
                println!("[auto_check] Login issue detected for domain: {}", target.domain);
                if let Some(ref login_state) = res.login_state {
                    update.last_error = Some(format!("登录状态: {}", login_state_label(login_state)));

                    let was_invalid = is_invalid_login_state(Some(target.login_state.as_str()));
                    let changed = target.login_state != *login_state;
                    if !was_invalid || changed {
                        let title = if was_invalid {
                            format!("{} 登录状态变化", target.domain)
                        } else {
                            format!("{} 登录需要处理", target.domain)
                        };
                        let content = if was_invalid {
                            format!(
                                "{} -> {}",
                                login_state_label(&target.login_state),
                                login_state_label(login_state)
                            )
                        } else {
                            format!("登录状态: {}", login_state_label(login_state))
                        };

                        let _ = create_event_inner(pool, &super::event::CreateEventInput {
                            application_id: target.application_id.clone(),
                            event_type: "login_expired".to_string(),
                            title: title.clone(),
                            content: Some(content.clone()),
                            old_status: None,
                            new_status: None,
                        }).await;

                        emit_auto_check_notify(app_handle, AutoCheckNotify {
                            kind: "login_expired".to_string(),
                            title,
                            body: content,
                            target_id: Some(target.id.clone()),
                            application_id: Some(target.application_id.clone()),
                        });
                    }
                }
            }

            // Create tracking run
            let _ = create_tracking_run_inner(pool, &CreateTrackingRunInput {
                target_id: target.id.clone(),
                status: if is_login_valid { "success" } else { "login_expired" }.to_string(),
                raw_status: None,
                normalized_status: None,
                confidence: None,
                login_state: res.login_state.clone(),
                error_message: None,
                page_hash: res.text_hash.clone(),
                ai_used: Some(0),
            }).await;

            // Try AI parsing if login is valid and page text exists
            if is_login_valid && res.page_text.is_some() && {
                let (api_key, _, _) = settings::get_ai_settings(pool).await;
                !api_key.is_empty()
            } {
                let page_text = res.page_text.clone().unwrap_or_default();
                if !page_text.is_empty() {
                    // Get application info for context
                    let app_info = sqlx::query_as::<_, super::application::Application>(
                        "SELECT * FROM applications WHERE id = ?"
                    )
                    .bind(&target.application_id)
                    .fetch_optional(pool)
                    .await
                    .ok()
                    .flatten();

                    let ai_input = ai::AIParseInput {
                        url: target.status_url.clone(),
                        page_title: res.page_title.clone().unwrap_or_default(),
                        visible_text: page_text,
                        previous_status: if target.current_status != "unknown" {
                            Some(target.current_status.clone())
                        } else {
                            None
                        },
                        known_company: app_info.as_ref().map(|a| a.company_name.clone()),
                        known_job_title: app_info.as_ref().map(|a| a.job_title.clone()),
                    };

                    match ai::parse_status_inner(pool, ai_input).await {
                    Ok(ai_result) => {
                        let confidence = ai_result.confidence.clamp(0.0, 1.0);

                        // Record AI tracking run
                        let _ = create_tracking_run_inner(pool, &CreateTrackingRunInput {
                            target_id: target.id.clone(),
                            status: "success".to_string(),
                            raw_status: ai_result.raw_status.clone(),
                            normalized_status: ai_result.normalized_status.clone(),
                            confidence: Some(confidence),
                            login_state: res.login_state.clone(),
                            error_message: None,
                            page_hash: res.text_hash.clone(),
                            ai_used: Some(1),
                        }).await;

                        if let Some(ref new_status) = ai_result.normalized_status {
                            if confidence >= 0.85 {
                                let old_status = &target.current_status;

                                // Update target status
                                update.current_status = Some(new_status.clone());
                                if old_status != "unknown" {
                                    update.last_status = Some(old_status.clone());
                                }

                                // Update application status
                                let _ = sqlx::query(
                                    "UPDATE applications SET status = ?, updated_at = ? WHERE id = ?"
                                )
                                .bind(new_status)
                                .bind(&now)
                                .bind(&target.application_id)
                                .execute(pool)
                                .await;

                                if old_status != "unknown" && old_status != new_status {
                                    status_changes += 1;

                                    // Create status change event
                                    let _ = create_event_inner(pool, &super::event::CreateEventInput {
                                        application_id: target.application_id.clone(),
                                        event_type: "status_change".to_string(),
                                        title: "自动检测状态变更".to_string(),
                                        content: ai_result.reason.clone(),
                                        old_status: Some(old_status.clone()),
                                        new_status: Some(new_status.clone()),
                                    }).await;

                                    let body = if let Some(ref app) = app_info {
                                        format!("{} - {}: {} -> {}", app.company_name, app.job_title, old_status, new_status)
                                    } else {
                                        format!("{}: {} -> {}", target.domain, old_status, new_status)
                                    };
                                    emit_auto_check_notify(app_handle, AutoCheckNotify {
                                        kind: "status_change".to_string(),
                                        title: "状态变化".to_string(),
                                        body,
                                        target_id: Some(target.id.clone()),
                                        application_id: Some(target.application_id.clone()),
                                    });
                                } else if old_status == "unknown" {
                                    // First time detecting status
                                    let _ = create_event_inner(pool, &super::event::CreateEventInput {
                                        application_id: target.application_id.clone(),
                                        event_type: "status_change".to_string(),
                                        title: "AI 识别状态".to_string(),
                                        content: Some(format!("识别为 \"{}\"，置信度 {}%", new_status, (confidence * 100.0) as i32)),
                                        old_status: None,
                                        new_status: Some(new_status.clone()),
                                    }).await;
                                }
                            } else if confidence >= 0.60 {
                                // Low confidence - create pending event
                                let _ = create_event_inner(pool, &super::event::CreateEventInput {
                                    application_id: target.application_id.clone(),
                                    event_type: "note_added".to_string(),
                                    title: "AI 识别待确认".to_string(),
                                    content: Some(format!("识别为 \"{}\"，置信度 {}%", new_status, (confidence * 100.0) as i32)),
                                    old_status: None,
                                    new_status: Some(new_status.clone()),
                                }).await;
                            }
                        }
                    }
                    Err(e) => {
                        target_failed = true;
                        failed_count += 1;
                        let error_message = e.to_string();
                        update.last_error = Some(format!("AI 识别失败: {}", error_message));

                        let _ = create_tracking_run_inner(pool, &CreateTrackingRunInput {
                            target_id: target.id.clone(),
                            status: "failed".to_string(),
                            raw_status: None,
                            normalized_status: None,
                            confidence: None,
                            login_state: res.login_state.clone(),
                            error_message: Some(error_message.clone()),
                            page_hash: res.text_hash.clone(),
                            ai_used: Some(1),
                        }).await;

                        let _ = create_event_inner(pool, &super::event::CreateEventInput {
                            application_id: target.application_id.clone(),
                            event_type: "check_failed".to_string(),
                            title: "AI 识别失败".to_string(),
                            content: Some(error_message.clone()),
                            old_status: None,
                            new_status: None,
                        }).await;
                    }
                    }
                }
            }

            // Update the target
            let _ = update_tracking_target_inner(pool, &target.id, &update).await;

            if !target_failed {
                success_count += 1;
            }

            if !is_login_valid {
                break;
            }

            // Delay between checks on the same domain
            tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
        }

        // Delay between domains
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
    }

    println!("[auto_check] Complete: {} total, {} success, {} failed, {} status changes, {} login issues",
        targets.len(), success_count, failed_count, status_changes, login_issues);

    Ok(AutoCheckResult {
        total: targets.len(),
        success: success_count,
        failed: failed_count,
        status_changes,
        login_issues,
    })
}
