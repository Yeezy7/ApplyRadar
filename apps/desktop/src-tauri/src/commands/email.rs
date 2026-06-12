use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use serde::Deserialize;
use sqlx::SqlitePool;
use std::time::Duration;
use tauri::command;
use tauri::State;

use crate::AppState;
use super::settings;
use super::push_log;
use super::auto_check;

#[derive(Debug, Deserialize)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub recipient: String,
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn build_transport(config: &SmtpConfig) -> Result<AsyncSmtpTransport<Tokio1Executor>, String> {
    let creds = Credentials::new(config.username.clone(), config.password.clone());

    // Port 587 uses STARTTLS, port 465 uses implicit TLS
    let transport = if config.port == 587 {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)
            .map_err(|e| format!("SMTP 服务器地址无效: {}", e))?
            .port(config.port)
            .credentials(creds)
            .timeout(Some(Duration::from_secs(30)))
            .build()
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&config.host)
            .map_err(|e| format!("SMTP 服务器地址无效: {}", e))?
            .port(config.port)
            .credentials(creds)
            .timeout(Some(Duration::from_secs(30)))
            .build()
    };

    Ok(transport)
}

async fn send_email(
    config: &SmtpConfig,
    subject: &str,
    body: String,
) -> Result<(), String> {
    if config.host.is_empty() || config.username.is_empty() || config.recipient.is_empty() {
        return Err("SMTP 配置不完整".to_string());
    }

    let email = Message::builder()
        .from(
            format!("投递雷达 <{}>", config.username)
                .parse()
                .map_err(|e| format!("发件人地址无效: {}", e))?,
        )
        .to(config
            .recipient
            .parse()
            .map_err(|e| format!("收件人地址无效: {}", e))?)
        .subject(subject)
        .header(ContentType::TEXT_HTML)
        .body(body)
        .map_err(|e| format!("邮件构建失败: {}", e))?;

    let transport = build_transport(config)?;

    transport
        .send(email)
        .await
        .map_err(|e| format!("邮件发送失败: {}", e))?;

    Ok(())
}

fn status_label(status: &str) -> &str {
    match status {
        "to_apply" => "待投递",
        "applied" => "已投递",
        "received" => "已收到",
        "under_review" => "审核中",
        "assessment" => "测评中",
        "interview" => "面试中",
        "final_interview" => "终面",
        "offer" => "已录用",
        "rejected" => "已拒绝",
        "withdrawn" => "已撤回",
        _ => "未知",
    }
}

async fn generate_daily_report(pool: &SqlitePool) -> Result<(String, String), String> {
    let now = chrono::Local::now();
    let utc_now = chrono::Utc::now();
    let yesterday = (utc_now - chrono::Duration::days(1)).to_rfc3339();
    let three_days_later = (utc_now + chrono::Duration::days(3)).to_rfc3339();

    // All applications grouped by status
    let apps = sqlx::query_as::<_, (String, String, String, Option<String>)>(
        "SELECT company_name, job_title, status, applied_at FROM applications ORDER BY status, updated_at DESC"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    // Status changes in last 24h
    let status_changes = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, String)>(
        "SELECT a.company_name, a.job_title, e.old_status, e.new_status, e.event_time \
         FROM application_events e JOIN applications a ON a.id = e.application_id \
         WHERE e.event_type = 'status_change' AND e.created_at >= ? ORDER BY e.created_at DESC"
    )
    .bind(&yesterday)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    // Upcoming reminders (next 3 days)
    let reminders = sqlx::query_as::<_, (String, String, Option<String>, String)>(
        "SELECT title, remind_at, content, reminder_type FROM reminders \
         WHERE is_done = 0 AND remind_at <= ? ORDER BY remind_at ASC LIMIT 10"
    )
    .bind(&three_days_later)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    // Login issues
    let login_issues = sqlx::query_as::<_, (String, String, String)>(
        "SELECT a.company_name, a.job_title, t.login_state \
         FROM tracking_targets t JOIN applications a ON a.id = t.application_id \
         WHERE t.login_state IN ('expired', 'blocked', 'captcha_required', 'mfa_required')"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    // Group apps by status
    let status_order = [
        "offer", "final_interview", "interview", "assessment",
        "under_review", "received", "applied", "to_apply",
        "rejected", "withdrawn", "unknown",
    ];
    let mut by_status: std::collections::HashMap<String, Vec<&(String, String, String, Option<String>)>> = std::collections::HashMap::new();
    for app in &apps {
        by_status.entry(app.2.clone()).or_default().push(app);
    }

    // Build HTML report
    let mut html = String::from(r#"<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>投递雷达日报</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px}
h1{font-size:20px;color:#1a1a1a;border-bottom:2px solid #e5e5e5;padding-bottom:8px}
h2{font-size:15px;color:#555;margin-top:20px}
h3{font-size:13px;color:#666;margin:12px 0 6px}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #eee}
th{background:#f8f8f8;font-weight:600;font-size:12px;text-transform:uppercase;color:#888}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500}
.warn{background:#fff3cd;color:#856404}
.ok{background:#d4edda;color:#155724}
.empty{color:#999;font-style:italic;font-size:13px}
.footer{margin-top:30px;padding-top:10px;border-top:1px solid #eee;font-size:11px;color:#999}
.status-header{display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600;margin-bottom:4px}
</style></head><body>"#);

    html.push_str(&format!(
        "<h1>📊 投递雷达日报 — {}</h1>",
        now.format("%m月%d日")
    ));

    // Positions by status
    html.push_str("<h2>📋 各状态职位</h2>");
    let mut has_any = false;
    for status in status_order {
        let Some(items) = by_status.get(status) else { continue };
        if items.is_empty() { continue; }
        has_any = true;
        let color = match status {
            "offer" => "background:#d4edda;color:#155724",
            "interview" | "final_interview" => "background:#e8e0f0;color:#5b21b6",
            "assessment" => "background:#dbeafe;color:#1e40af",
            "under_review" | "received" => "background:#fef3c7;color:#92400e",
            "applied" => "background:#e0f2fe;color:#0369a1",
            "to_apply" => "background:#f3f4f6;color:#374151",
            "rejected" => "background:#fee2e2;color:#991b1b",
            "withdrawn" => "background:#f3f4f6;color:#6b7280",
            _ => "background:#f3f4f6;color:#6b7280",
        };
        html.push_str(&format!(
            "<h3><span class='status-header' style='{}'>{} ({})</span></h3>",
            color, status_label(status), items.len()
        ));
        html.push_str("<table><tr><th>公司</th><th>岗位</th></tr>");
        for (company, job, _, _) in items {
            html.push_str(&format!(
                "<tr><td>{}</td><td>{}</td></tr>",
                escape_html(company), escape_html(job)
            ));
        }
        html.push_str("</table>");
    }
    if !has_any {
        html.push_str("<p class='empty'>暂无投递记录</p>");
    }

    // Status changes
    html.push_str("<h2>🔄 近24小时状态变更</h2>");
    if status_changes.is_empty() {
        html.push_str("<p class='empty'>无状态变更</p>");
    } else {
        html.push_str("<table><tr><th>公司</th><th>岗位</th><th>变更</th><th>时间</th></tr>");
        for (company, job, old, new, time) in &status_changes {
            let old_label = old.as_deref().map(status_label).unwrap_or("-");
            let new_label = new.as_deref().map(status_label).unwrap_or("-");
            let time_str = chrono::DateTime::parse_from_rfc3339(time)
                .map(|dt| dt.format("%m-%d %H:%M").to_string())
                .unwrap_or_else(|_| String::new());
            html.push_str(&format!(
                "<tr><td>{}</td><td>{}</td><td>{} → {}</td><td>{}</td></tr>",
                escape_html(company), escape_html(job), old_label, new_label, time_str
            ));
        }
        html.push_str("</table>");
    }

    // Upcoming reminders
    if !reminders.is_empty() {
        html.push_str("<h2>⏰ 即将到期提醒</h2>");
        html.push_str("<table><tr><th>提醒</th><th>时间</th><th>备注</th></tr>");
        for (title, remind_at, content, _rtype) in &reminders {
            let time_str = chrono::DateTime::parse_from_rfc3339(remind_at)
                .map(|dt| dt.format("%m-%d %H:%M").to_string())
                .unwrap_or_else(|_| remind_at.clone());
            html.push_str(&format!(
                "<tr><td>{}</td><td>{}</td><td>{}</td></tr>",
                escape_html(title), time_str, escape_html(content.as_deref().unwrap_or(""))
            ));
        }
        html.push_str("</table>");
    }

    // Login issues
    if !login_issues.is_empty() {
        html.push_str("<h2>🔐 登录异常</h2>");
        for (company, job, state) in &login_issues {
            let label = match state.as_str() {
                "expired" => "已过期",
                "blocked" => "已封禁",
                "captcha_required" => "需要验证码",
                "mfa_required" => "需要二次验证",
                _ => "异常",
            };
            html.push_str(&format!(
                "<p><span class='badge warn'>{}</span> {} - {}</p>",
                label, escape_html(company), escape_html(job)
            ));
        }
    }

    html.push_str(&format!(
        "<div class='footer'>由投递雷达自动生成 · {}</div></body></html>",
        now.format("%Y-%m-%d %H:%M")
    ));

    let subject = format!("投递雷达日报 — {}", now.format("%m月%d日"));
    Ok((subject, html))
}

pub fn read_smtp_config(pool: &SqlitePool) -> impl std::future::Future<Output = SmtpConfig> + '_ {
    async move {
        SmtpConfig {
            host: settings::get_setting_raw(pool, "smtp_host").await.unwrap_or_default(),
            port: settings::get_setting_raw(pool, "smtp_port").await
                .unwrap_or_else(|| "465".to_string())
                .parse()
                .unwrap_or(465),
            username: settings::get_setting_raw(pool, "smtp_username").await.unwrap_or_default(),
            password: settings::get_setting_raw(pool, "smtp_password").await.unwrap_or_default(),
            recipient: settings::get_setting_raw(pool, "smtp_recipient").await.unwrap_or_default(),
        }
    }
}

pub fn is_smtp_configured(config: &SmtpConfig) -> bool {
    !config.host.is_empty() && !config.username.is_empty() && !config.recipient.is_empty()
}

#[command]
pub async fn test_email_config(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let config = read_smtp_config(&state.db).await;

    match send_email(
        &config,
        "投递雷达 — 邮件测试",
        r#"<h2>✅ 邮件配置成功</h2><p>如果你收到了这封邮件，说明 SMTP 配置正确。</p>"#.to_string(),
    ).await {
        Ok(()) => {
            let _ = push_log::insert_push_log(&state.db, "email", "邮件测试", Some("测试邮件已发送"), "email", "success", None).await;
            Ok("测试邮件已发送，请检查收件箱".to_string())
        }
        Err(e) => {
            let _ = push_log::insert_push_log(&state.db, "email", "邮件测试失败", None, "email", "failed", Some(&e)).await;
            Err(e)
        }
    }
}

#[command]
pub async fn send_daily_report(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let config = read_smtp_config(&state.db).await;

    let (subject, body) = generate_daily_report(&state.db).await?;
    match send_email(&config, &subject, body).await {
        Ok(()) => {
            let now = chrono::Local::now().to_rfc3339();
            let _ = settings::save_setting_raw(&state.db, "email_report_last_sent", &now).await;
            let _ = push_log::insert_push_log(&state.db, "email", "日报已发送", Some(&subject), "email", "success", None).await;
            Ok("日报已发送".to_string())
        }
        Err(e) => {
            let _ = push_log::insert_push_log(&state.db, "email", "日报发送失败", None, "email", "failed", Some(&e)).await;
            Err(e)
        }
    }
}

pub async fn send_daily_report_with_config(
    pool: &SqlitePool,
    config: &SmtpConfig,
) -> Result<(), String> {
    // Pre-write sentinel to prevent duplicate sends
    let now = chrono::Local::now().to_rfc3339();
    let _ = settings::save_setting_raw(pool, "email_report_last_sent", &now).await;

    let (subject, body) = generate_daily_report(pool).await?;
    match send_email(config, &subject, body).await {
        Ok(()) => {
            let _ = push_log::insert_push_log(pool, "email", "定时日报", Some(&subject), "email", "success", None).await;
            Ok(())
        }
        Err(e) => {
            let _ = push_log::insert_push_log(pool, "email", "定时日报失败", None, "email", "failed", Some(&e)).await;
            Err(e)
        }
    }
}

#[command]
pub async fn send_daily_report_with_check(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let pool = &state.db;

    // First run auto-check on all enabled targets
    let _ = push_log::insert_push_log(pool, "notification", "推送前检查", Some("开始检查全部职位"), "desktop", "success", None).await;
    match auto_check::run_auto_check_with_status(&app_handle, pool, true).await {
        Ok(result) => {
            let msg = auto_check::format_auto_check_result(&result);
            let _ = push_log::insert_push_log(pool, "notification", "推送前检查完成", Some(&msg), "desktop", "success", None).await;
        }
        Err(e) => {
            let _ = push_log::insert_push_log(pool, "check_failed", "推送前检查失败", Some(&e), "desktop", "failed", Some(&e)).await;
            // Continue to send report even if check fails
        }
    }

    // Then send the report
    let config = read_smtp_config(pool).await;
    let (subject, body) = generate_daily_report(pool).await?;
    match send_email(&config, &subject, body).await {
        Ok(()) => {
            let now = chrono::Local::now().to_rfc3339();
            let _ = settings::save_setting_raw(pool, "email_report_last_sent", &now).await;
            let _ = push_log::insert_push_log(pool, "email", "日报已发送", Some(&subject), "email", "success", None).await;
            Ok("检查完成，日报已发送".to_string())
        }
        Err(e) => {
            let _ = push_log::insert_push_log(pool, "email", "日报发送失败", None, "email", "failed", Some(&e)).await;
            Err(e)
        }
    }
}
