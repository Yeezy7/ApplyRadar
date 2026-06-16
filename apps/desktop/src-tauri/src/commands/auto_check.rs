use serde::Serialize;
use sqlx::SqlitePool;
use tauri::command;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use crate::AppState;
use super::ai;
use super::settings;
use super::sidecar;
use super::push_log;
use super::tracker::{TrackingTarget, CreateTrackingRunInput, UpdateTrackingTargetInput, create_tracking_run_inner, update_tracking_target_inner, get_targets_needing_check_inner};

static AUTO_CHECK_MUTEX: Mutex<()> = Mutex::const_new(());
const AUTO_CHECK_STALE_AFTER_MINUTES: i64 = 10;

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
pub struct ManualCheckItem {
    pub target_id: String,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ManualCheckResult {
    pub total: usize,
    pub success: usize,
    pub failed: usize,
    pub status_changes: usize,
    pub login_issues: usize,
    pub items: Vec<ManualCheckItem>,
}

impl ManualCheckResult {
    fn empty() -> Self {
        Self {
            total: 0,
            success: 0,
            failed: 0,
            status_changes: 0,
            login_issues: 0,
            items: Vec::new(),
        }
    }

    fn to_auto_check_result(&self) -> AutoCheckResult {
        AutoCheckResult {
            total: self.total,
            success: self.success,
            failed: self.failed,
            status_changes: self.status_changes,
            login_issues: self.login_issues,
        }
    }
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

fn emit_auto_check_notify(app_handle: &AppHandle, pool: &SqlitePool, notify: AutoCheckNotify) {
    let _ = app_handle.emit("auto-check:notify", &notify);
    let push_type = match notify.kind.as_str() {
        "status_change" => "status_change",
        "login_expired" => "login_issue",
        "check_failed" => "check_failed",
        _ => "notification",
    };
    let pool = pool.clone();
    let title = notify.title.clone();
    let body = notify.body.clone();
    let kind = push_type.to_string();
    tokio::spawn(async move {
        let _ = push_log::insert_push_log(&pool, &kind, &title, Some(&body), "desktop", "success", None).await;
    });
}

fn is_invalid_login_state(state: Option<&str>) -> bool {
    matches!(state, Some("expired") | Some("blocked") | Some("captcha_required") | Some("mfa_required"))
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
    sqlx::query_as::<_, super::application::Application>("SELECT * FROM applications WHERE id = ?")
        .bind(application_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

async fn create_pending_status_event_if_missing(
    pool: &SqlitePool,
    application_id: &str,
    title: &str,
    content: String,
    new_status: &str,
) -> Result<bool, String> {
    let existing = sqlx::query_scalar::<_, String>(
        "SELECT id FROM application_events WHERE application_id = ? AND event_type = 'note_added' AND new_status = ? AND handled_at IS NULL LIMIT 1"
    )
    .bind(application_id)
    .bind(new_status)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if existing.is_some() {
        return Ok(false);
    }

    super::event::create_event_inner(pool, &super::event::CreateEventInput {
        application_id: application_id.to_string(),
        event_type: "note_added".to_string(),
        title: title.to_string(),
        content: Some(content),
        old_status: None,
        new_status: Some(new_status.to_string()),
        handled_at: None,
        handled_action: None,
    }).await?;

    Ok(true)
}

async fn calculate_check_interval_from_db(pool: &SqlitePool) -> u64 {
    let targets = sqlx::query_scalar::<_, String>(
        "SELECT check_frequency FROM tracking_targets WHERE enabled = 1 AND check_frequency != 'manual'"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    if targets.is_empty() { return 3600; }
    if targets.iter().any(|f| f == "every_6h") { 1800 }
    else if targets.iter().any(|f| f == "every_12h") { 3600 }
    else { 7200 }
}

pub fn format_auto_check_result(result: &AutoCheckResult) -> String {
    if result.total == 0 { return "无待检查目标".to_string(); }
    let mut parts = vec![
        format!("检查{}个", result.total),
        format!("{}成功", result.success),
        format!("{}失败", result.failed),
        format!("{}状态变更", result.status_changes),
    ];
    if result.login_issues > 0 {
        parts.push(format!("{}登录问题", result.login_issues));
    }
    parts.join("，")
}

async fn normalize_auto_check_running_state(pool: &SqlitePool) -> bool {
    let is_running = settings::get_setting_raw(pool, "auto_check_is_running").await
        .map(|v| v == "true").unwrap_or(false);
    if !is_running { return false; }

    let Some(started_at) = settings::get_setting_raw(pool, "auto_check_started_at").await else {
        let _ = settings::save_setting_raw(pool, "auto_check_is_running", "false").await;
        return false;
    };

    let Ok(started_at) = chrono::DateTime::parse_from_rfc3339(&started_at)
        .map(|dt| dt.with_timezone(&chrono::Utc))
    else {
        let _ = settings::save_setting_raw(pool, "auto_check_is_running", "false").await;
        return false;
    };

    let age = chrono::Utc::now().signed_duration_since(started_at);
    if age > chrono::Duration::minutes(AUTO_CHECK_STALE_AFTER_MINUTES) {
        let _ = settings::save_setting_raw(pool, "auto_check_is_running", "false").await;
        let _ = settings::save_setting_raw(pool, "auto_check_last_result", "上次检查异常中断，运行锁已自动恢复").await;
        return false;
    }

    true
}

#[command]
pub async fn run_auto_check(app_handle: AppHandle, state: State<'_, AppState>, force: Option<bool>) -> Result<AutoCheckResult, String> {
    run_auto_check_with_status(&app_handle, &state.db, force.unwrap_or(false)).await
}

#[command]
pub async fn get_auto_check_status(state: State<'_, AppState>) -> Result<AutoCheckStatus, String> {
    let pool = &state.db;
    let enabled = settings::is_auto_check_enabled(pool).await;
    let last_run_at = settings::get_setting_raw(pool, "auto_check_last_run_at").await;
    let last_result = settings::get_setting_raw(pool, "auto_check_last_result").await;
    let is_running = normalize_auto_check_running_state(pool).await;
    let interval_secs = calculate_check_interval_from_db(pool).await;
    let next_run_at = last_run_at.as_ref().and_then(|last| {
        chrono::DateTime::parse_from_rfc3339(last).ok()
            .map(|dt| (dt + chrono::Duration::seconds(interval_secs as i64)).to_rfc3339())
    });
    Ok(AutoCheckStatus { enabled, last_run_at, next_run_at, last_result, is_running })
}

#[command]
pub async fn reset_auto_check(state: State<'_, AppState>) -> Result<(), String> {
    let pool = &state.db;
    settings::save_setting_raw(pool, "auto_check_is_running", "false").await?;
    settings::save_setting_raw(pool, "auto_check_last_result", "已手动重置").await?;
    Ok(())
}

#[command]
pub async fn run_tracking_target_check(app_handle: AppHandle, state: State<'_, AppState>, target_id: String) -> Result<ManualCheckResult, String> {
    run_manual_check_with_guard(&app_handle, &state.db, Some(vec![target_id])).await
}

#[command]
pub async fn run_tracking_targets_check(app_handle: AppHandle, state: State<'_, AppState>, target_ids: Option<Vec<String>>) -> Result<ManualCheckResult, String> {
    run_manual_check_with_guard(&app_handle, &state.db, target_ids).await
}

pub async fn run_auto_check_with_status(app_handle: &AppHandle, pool: &SqlitePool, force: bool) -> Result<AutoCheckResult, String> {
    let _guard = AUTO_CHECK_MUTEX.try_lock().map_err(|_| "自动检查正在进行中".to_string())?;
    if normalize_auto_check_running_state(pool).await {
        return Err("自动检查正在进行中".to_string());
    }

    let started_at = chrono::Utc::now().to_rfc3339();
    settings::save_setting_raw(pool, "auto_check_started_at", &started_at).await?;
    settings::save_setting_raw(pool, "auto_check_is_running", "true").await?;

    let result = run_auto_check_inner(app_handle, pool, force).await;
    let now = chrono::Utc::now().to_rfc3339();
    let _ = settings::save_setting_raw(pool, "auto_check_last_run_at", &now).await;
    let _ = settings::save_setting_raw(pool, "auto_check_is_running", "false").await;

    match result {
        Ok(result) => {
            let result_str = format_auto_check_result(&result);
            let _ = settings::save_setting_raw(pool, "auto_check_last_result", &result_str).await;
            if result.total > 0 {
                let _ = app_handle.emit("auto-check:notify", serde_json::json!({
                    "type": "summary", "title": "检查完成", "body": result_str, "targetId": null, "applicationId": null
                }));
                let _ = push_log::insert_push_log(pool, "notification", "自动检查完成", Some(&result_str), "desktop", "success", None).await;
            }
            Ok(result)
        }
        Err(e) => {
            let result_str = format!("错误: {}", e);
            let _ = settings::save_setting_raw(pool, "auto_check_last_result", &result_str).await;
            let _ = app_handle.emit("auto-check:notify", serde_json::json!({
                "type": "check_failed", "title": "自动检查失败", "body": result_str, "targetId": null, "applicationId": null
            }));
            let _ = push_log::insert_push_log(pool, "check_failed", "自动检查失败", Some(&result_str), "desktop", "failed", Some(&e)).await;
            Err(e)
        }
    }
}

async fn run_manual_check_with_guard(app_handle: &AppHandle, pool: &SqlitePool, target_ids: Option<Vec<String>>) -> Result<ManualCheckResult, String> {
    let _guard = AUTO_CHECK_MUTEX.try_lock().map_err(|_| "自动检查正在进行中".to_string())?;
    if normalize_auto_check_running_state(pool).await {
        return Err("自动检查正在进行中".to_string());
    }

    let targets = if let Some(ids) = target_ids {
        let mut targets = Vec::new();
        for id in ids {
            if let Some(target) = sqlx::query_as::<_, TrackingTarget>(
                "SELECT * FROM tracking_targets WHERE id = ? AND enabled = 1"
            ).bind(&id).fetch_optional(pool).await.map_err(|e| e.to_string())? {
                targets.push(target);
            }
        }
        targets
    } else {
        sqlx::query_as::<_, TrackingTarget>("SELECT * FROM tracking_targets WHERE enabled = 1 ORDER BY created_at DESC")
            .fetch_all(pool).await.map_err(|e| e.to_string())?
    };

    run_checks_for_targets(app_handle, pool, targets, false, false, "manual_check").await
}

pub async fn run_auto_check_inner(app_handle: &AppHandle, pool: &SqlitePool, force: bool) -> Result<AutoCheckResult, String> {
    let targets = if force {
        sqlx::query_as::<_, TrackingTarget>("SELECT * FROM tracking_targets WHERE enabled = 1")
            .fetch_all(pool).await.map_err(|e| e.to_string())?
    } else {
        get_targets_needing_check_inner(pool).await?
    };

    let result = run_checks_for_targets(app_handle, pool, targets, true, true, "auto_check").await?;
    println!("[auto_check] Complete: {} total, {} success, {} failed, {} status changes, {} login issues",
        result.total, result.success, result.failed, result.status_changes, result.login_issues);

    Ok(result.to_auto_check_result())
}

async fn run_checks_for_targets(
    app_handle: &AppHandle,
    pool: &SqlitePool,
    targets: Vec<TrackingTarget>,
    skip_domain_on_login_issue: bool,
    delay_between_targets: bool,
    log_prefix: &str,
) -> Result<ManualCheckResult, String> {
    if targets.is_empty() { return Ok(ManualCheckResult::empty()); }

    let mut result = ManualCheckResult { total: targets.len(), ..ManualCheckResult::empty() };
    let mut domains_with_login_issues: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut by_domain: std::collections::HashMap<String, Vec<&TrackingTarget>> = std::collections::HashMap::new();
    for target in &targets {
        by_domain.entry(target.domain.clone()).or_default().push(target);
    }

    for (domain, domain_targets) in &by_domain {
        if skip_domain_on_login_issue && domains_with_login_issues.contains(domain) {
            println!("[{}] Skipping domain {} due to login issue", log_prefix, domain);
            for target in domain_targets {
                result.failed += 1;
                result.items.push(ManualCheckItem { target_id: target.id.clone(), success: false, message: format!("{} 登录状态异常，已跳过同域后续检查", domain) });
            }
            continue;
        }

        println!("[{}] Checking domain: {} ({} targets)", log_prefix, domain, domain_targets.len());

        let profile_dir = domain_targets[0].profile_dir.clone().unwrap_or_else(|| format!("profiles/{}", domain));
        let batch_targets: Vec<sidecar::BatchTarget> = domain_targets.iter().map(|t| {
            sidecar::BatchTarget { target_id: t.id.clone(), status_url: t.status_url.clone() }
        }).collect();

        let batch_results = match sidecar::run_sidecar_batch_check(app_handle.clone(), domain.clone(), profile_dir, batch_targets).await {
            Ok(resp) => resp.results,
            Err(e) => {
                println!("[{}] Batch check error for domain {}: {}", log_prefix, domain, e);
                for target in domain_targets {
                    result.failed += 1;
                    result.items.push(ManualCheckItem { target_id: target.id.clone(), success: false, message: format!("批量检查失败: {}", e) });
                }
                continue;
            }
        };

        let mut res_map: std::collections::HashMap<String, sidecar::SidecarCheckResponse> = std::collections::HashMap::new();
        for r in batch_results {
            if let Some(ref tid) = r.target_id { res_map.insert(tid.clone(), r); }
        }

        for target in domain_targets {
            let res = match res_map.remove(&target.id) {
                Some(r) => r,
                None => {
                    result.failed += 1;
                    result.items.push(ManualCheckItem { target_id: target.id.clone(), success: false, message: "批量检查未返回该目标结果".to_string() });
                    continue;
                }
            };

            if !res.success {
                result.failed += 1;
                let now = chrono::Utc::now().to_rfc3339();
                let error_message = res.error.clone().unwrap_or_else(|| "检查失败".to_string());
                let _ = create_tracking_run_inner(pool, &CreateTrackingRunInput {
                    target_id: target.id.clone(), status: "failed".to_string(), raw_status: None, normalized_status: None,
                    confidence: None, login_state: res.login_state.clone(), error_message: Some(error_message.clone()),
                    page_hash: res.text_hash.clone(), ai_used: None,
                }).await;
                let _ = update_tracking_target_inner(pool, &target.id, &UpdateTrackingTargetInput {
                    status_url: None, ats_type: None, enabled: None, check_frequency: None, current_status: None,
                    last_status: None, login_state: res.login_state.clone(), last_checked_at: Some(now),
                    last_success_at: None, last_error: Some(error_message.clone()), last_text_hash: res.text_hash.clone(), profile_dir: None,
                }).await;
                let _ = super::event::create_event_inner(pool, &super::event::CreateEventInput {
                    application_id: target.application_id.clone(), event_type: "check_failed".to_string(),
                    title: "状态检查失败".to_string(), content: Some(error_message.clone()),
                    old_status: None, new_status: None, handled_at: None, handled_action: None,
                }).await;
                let body = if let Some(app) = get_application_summary(pool, &target.application_id).await {
                    format!("{} - {}: {}", app.company_name, app.job_title, error_message)
                } else { format!("{}: {}", target.domain, error_message) };
                emit_auto_check_notify(app_handle, pool, AutoCheckNotify {
                    kind: "check_failed".to_string(), title: "检查失败".to_string(), body,
                    target_id: Some(target.id.clone()), application_id: Some(target.application_id.clone()),
                });
                result.items.push(ManualCheckItem { target_id: target.id.clone(), success: false, message: error_message });
                continue;
            }

            let mut target_failed = false;
            let mut item_message = "检查完成".to_string();
            let now = chrono::Utc::now().to_rfc3339();
            let mut update = UpdateTrackingTargetInput {
                status_url: None, ats_type: None, enabled: None, check_frequency: None, current_status: None,
                last_status: None, login_state: res.login_state.clone(), last_checked_at: Some(now.clone()),
                last_success_at: Some(now.clone()), last_error: None, last_text_hash: res.text_hash.clone(), profile_dir: None,
            };

            let is_login_valid = res.login_state.as_deref().map_or(true, |s| s == "valid");
            if !is_login_valid {
                result.login_issues += 1;
                domains_with_login_issues.insert(target.domain.clone());
                if let Some(ref login_state) = res.login_state {
                    item_message = format!("登录状态: {}", login_state_label(login_state));
                    update.last_error = Some(item_message.clone());
                    let was_invalid = is_invalid_login_state(Some(target.login_state.as_str()));
                    let changed = target.login_state != *login_state;
                    if !was_invalid || changed {
                        let title = if was_invalid { format!("{} 登录状态变化", target.domain) } else { format!("{} 登录需要处理", target.domain) };
                        let content = if was_invalid { format!("{} -> {}", login_state_label(&target.login_state), login_state_label(login_state)) } else { format!("登录状态: {}", login_state_label(login_state)) };
                        let _ = super::event::create_event_inner(pool, &super::event::CreateEventInput {
                            application_id: target.application_id.clone(), event_type: "login_expired".to_string(),
                            title: title.clone(), content: Some(content.clone()),
                            old_status: None, new_status: None, handled_at: None, handled_action: None,
                        }).await;
                        emit_auto_check_notify(app_handle, pool, AutoCheckNotify {
                            kind: "login_expired".to_string(), title, body: content,
                            target_id: Some(target.id.clone()), application_id: Some(target.application_id.clone()),
                        });
                    }
                }
            }

            let _ = create_tracking_run_inner(pool, &CreateTrackingRunInput {
                target_id: target.id.clone(),
                status: if is_login_valid { "success" } else { "login_expired" }.to_string(),
                raw_status: res.raw_status.clone(), normalized_status: res.normalized_status.clone(),
                confidence: res.confidence, login_state: res.login_state.clone(),
                error_message: None, page_hash: res.text_hash.clone(), ai_used: Some(0),
            }).await;

            let has_ai_config = { let (api_key, _, _) = settings::get_ai_settings(pool).await; !api_key.is_empty() };

            if is_login_valid && !has_ai_config {
                item_message = "未配置 AI API Key，跳过识别".to_string();
                update.last_error = Some(item_message.clone());
                let _ = update_tracking_target_inner(pool, &target.id, &update).await;
                result.items.push(ManualCheckItem { target_id: target.id.clone(), success: false, message: item_message });
                continue;
            }

            if is_login_valid && res.page_text.is_some() && has_ai_config {
                let page_text = res.page_text.clone().unwrap_or_default();
                if !page_text.is_empty() {
                    let app_info = sqlx::query_as::<_, super::application::Application>("SELECT * FROM applications WHERE id = ?")
                        .bind(&target.application_id).fetch_optional(pool).await.ok().flatten();
                    let ai_input = ai::AIParseInput {
                        url: target.status_url.clone(), page_title: res.page_title.clone().unwrap_or_default(),
                        visible_text: page_text,
                        previous_status: if target.current_status != "unknown" { Some(target.current_status.clone()) } else { None },
                        known_company: app_info.as_ref().map(|a| a.company_name.clone()),
                        known_job_title: app_info.as_ref().map(|a| a.job_title.clone()),
                    };
                    match ai::parse_status_inner(pool, ai_input).await {
                        Ok(ai_result) => {
                            let confidence = ai_result.confidence.clamp(0.0, 1.0);
                            let _ = create_tracking_run_inner(pool, &CreateTrackingRunInput {
                                target_id: target.id.clone(), status: "success".to_string(),
                                raw_status: ai_result.raw_status.clone(), normalized_status: ai_result.normalized_status.clone(),
                                confidence: Some(confidence), login_state: res.login_state.clone(),
                                error_message: None, page_hash: res.text_hash.clone(), ai_used: Some(1),
                            }).await;
                            if let Some(ref new_status) = ai_result.normalized_status {
                                if confidence >= 0.85 {
                                    let old_status = &target.current_status;
                                    update.current_status = Some(new_status.clone());
                                    if old_status != "unknown" { update.last_status = Some(old_status.clone()); }
                                    let _ = sqlx::query("UPDATE applications SET status = ?, updated_at = ? WHERE id = ?")
                                        .bind(new_status).bind(&now).bind(&target.application_id).execute(pool).await;
                                    if old_status != "unknown" && old_status != new_status {
                                        result.status_changes += 1;
                                        item_message = format!("状态变更: {} -> {}", old_status, new_status);
                                        let _ = super::event::create_event_inner(pool, &super::event::CreateEventInput {
                                            application_id: target.application_id.clone(), event_type: "status_change".to_string(),
                                            title: "自动检测状态变更".to_string(), content: ai_result.reason.clone(),
                                            old_status: Some(old_status.clone()), new_status: Some(new_status.clone()),
                                            handled_at: None, handled_action: None,
                                        }).await;
                                        let body = if let Some(ref app) = app_info {
                                            format!("{} - {}: {} -> {}", app.company_name, app.job_title, old_status, new_status)
                                        } else { format!("{}: {} -> {}", target.domain, old_status, new_status) };
                                        emit_auto_check_notify(app_handle, pool, AutoCheckNotify {
                                            kind: "status_change".to_string(), title: "状态变化".to_string(), body,
                                            target_id: Some(target.id.clone()), application_id: Some(target.application_id.clone()),
                                        });
                                    } else if old_status == "unknown" {
                                        item_message = format!("AI 识别状态: {}", new_status);
                                        let _ = super::event::create_event_inner(pool, &super::event::CreateEventInput {
                                            application_id: target.application_id.clone(), event_type: "status_change".to_string(),
                                            title: "AI 识别状态".to_string(), content: Some(format!("识别为 \"{}\"，置信度 {}%", new_status, (confidence * 100.0) as i32)),
                                            old_status: None, new_status: Some(new_status.clone()), handled_at: None, handled_action: None,
                                        }).await;
                                    }
                                } else if confidence >= 0.60 {
                                    let created = create_pending_status_event_if_missing(pool, &target.application_id, "AI 识别待确认",
                                        format!("识别为 \"{}\"，置信度 {}%", new_status, (confidence * 100.0) as i32), new_status,
                                    ).await.unwrap_or(false);
                                    item_message = if created { format!("AI 识别待确认: {}，置信度 {}%", new_status, (confidence * 100.0) as i32) } else { format!("AI 识别待确认已存在: {}", new_status) };
                                }
                            }
                        }
                        Err(e) => {
                            target_failed = true;
                            result.failed += 1;
                            let error_message = e.to_string();
                            item_message = format!("AI 识别失败: {}", error_message);
                            update.last_error = Some(format!("AI 识别失败: {}", error_message));
                            let _ = create_tracking_run_inner(pool, &CreateTrackingRunInput {
                                target_id: target.id.clone(), status: "failed".to_string(), raw_status: None, normalized_status: None,
                                confidence: None, login_state: res.login_state.clone(), error_message: Some(error_message.clone()),
                                page_hash: res.text_hash.clone(), ai_used: Some(1),
                            }).await;
                            let _ = super::event::create_event_inner(pool, &super::event::CreateEventInput {
                                application_id: target.application_id.clone(), event_type: "check_failed".to_string(),
                                title: "AI 识别失败".to_string(), content: Some(error_message.clone()),
                                old_status: None, new_status: None, handled_at: None, handled_action: None,
                            }).await;
                        }
                    }
                }
            }

            let _ = update_tracking_target_inner(pool, &target.id, &update).await;
            if !target_failed { result.success += 1; }
            result.items.push(ManualCheckItem { target_id: target.id.clone(), success: !target_failed, message: item_message });
            if !is_login_valid { break; }
        }

        if delay_between_targets {
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    }

    Ok(result)
}
