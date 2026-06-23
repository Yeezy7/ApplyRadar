mod db;
mod commands;

use chrono::Timelike;
use commands::{application, tracker, auto_check, event, reminder, ai, sidecar, settings, email, push_log, backup, resume};
use sqlx::SqlitePool;
use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;

fn parse_hhmm(s: &str) -> Option<u32> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 { return None; }
    let h: u32 = parts[0].parse().ok()?;
    let m: u32 = parts[1].parse().ok()?;
    if h > 23 || m > 59 { return None; }
    Some(h * 60 + m)
}

// Calculate check interval based on target frequencies
async fn calculate_check_interval(db: &SqlitePool) -> u64 {
    let targets = sqlx::query_scalar::<_, String>(
        "SELECT check_frequency FROM tracking_targets WHERE enabled = 1 AND check_frequency != 'manual'"
    )
    .fetch_all(db)
    .await
    .unwrap_or_default();

    if targets.is_empty() {
        // No targets or all manual: check every hour for new targets
        return 3600;
    }

    // Find shortest frequency
    let has_6h = targets.iter().any(|f| f == "every_6h");
    let has_12h = targets.iter().any(|f| f == "every_12h");

    if has_6h {
        // Check every 30 minutes for 6h targets
        1800
    } else if has_12h {
        // Check every hour for 12h targets
        3600
    } else {
        // Daily targets: check every 2 hours
        7200
    }
}

pub struct AppState {
    pub db: SqlitePool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Initialize database
            let pool = tauri::async_runtime::block_on(async {
                db::init_database(&handle).await
            }).map_err(|e| {
                eprintln!("Failed to initialize database: {}", e);
                Box::<dyn std::error::Error>::from(e)
            })?;
            app.manage(AppState { db: pool.clone() });

            // Build tray menu
            let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&quit_item)
                .build()?;

            // Create tray icon
            let icon = app.default_window_icon()
                .ok_or("Window icon not found")?
                .clone();
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("ApplyRadar · 投递雷达")
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    let id = event.id().as_ref();
                    if id == "show" {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    } else if id == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Handle window close - hide instead of quit
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }

            // Start background auto-check timer
            let db = pool.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    // Calculate next check interval based on target frequencies
                    let interval_secs = calculate_check_interval(&db).await;

                    println!("[auto_check] Next check in {} seconds", interval_secs);
                    tokio::time::sleep(tokio::time::Duration::from_secs(interval_secs)).await;

                    // Check if auto check is enabled
                    if !settings::is_auto_check_enabled(&db).await {
                        continue;
                    }

                    println!("[auto_check] Running auto check");

                    match auto_check::run_auto_check_with_status(&app_handle, &db, false).await {
                        Ok(result) => println!("[auto_check] {}", auto_check::format_auto_check_result(&result)),
                        Err(e) => println!("[auto_check] Error: {}", e),
                    }
                }
            });

            // Start reminder notification timer
            let db = pool.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let notifications_enabled = settings::get_setting_raw(&db, "notifications_enabled")
                        .await
                        .map(|value| value == "true")
                        .unwrap_or(true);

                    if notifications_enabled {
                        match reminder::emit_due_reminder_notifications(&app_handle, &db).await {
                            Ok(count) if count > 0 => {
                                println!("[reminders] Emitted {} due reminder notifications", count);
                            }
                            Ok(_) => {}
                            Err(e) => {
                                println!("[reminders] Failed to emit due reminders: {}", e);
                            }
                        }
                    }

                    tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                }
            });

            // Start daily email report timer
            let db = pool.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut last_sent_date: String = String::new();

                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;

                    let enabled = settings::get_setting_raw(&db, "email_report_enabled")
                        .await
                        .map(|v| v == "true")
                        .unwrap_or(false);
                    if !enabled {
                        continue;
                    }

                    let report_time = settings::get_setting_raw(&db, "email_report_time")
                        .await
                        .unwrap_or_else(|| "09:00".to_string());

                    let local_now = chrono::Local::now();
                    let today = local_now.format("%Y-%m-%d").to_string();

                    // Check if already sent today (in-memory + DB)
                    if last_sent_date == today {
                        continue;
                    }
                    let db_last_sent = settings::get_setting_raw(&db, "email_report_last_sent")
                        .await
                        .unwrap_or_default();
                    if db_last_sent.starts_with(&today) {
                        last_sent_date = today;
                        continue;
                    }

                    // Parse time and compare with a 2-minute window
                    let local_time = local_now.time();
                    let current_minutes = local_time.hour() * 60 + local_time.minute();
                    let report_minutes = parse_hhmm(&report_time).unwrap_or(9 * 60);
                    if current_minutes.abs_diff(report_minutes) > 1 {
                        continue;
                    }

                    let config = email::read_smtp_config(&db).await;
                    if !email::is_smtp_configured(&config) {
                        continue;
                    }

                    println!("[email_report] Sending daily report...");
                    match email::send_daily_report_with_config(&db, &config).await {
                        Ok(()) => {
                            println!("[email_report] Daily report sent");
                            last_sent_date = today;
                        }
                        Err(e) => {
                            println!("[email_report] Failed to send: {}", e);
                            let _ = app_handle.emit("auto-check:notify", serde_json::json!({
                                "type": "check_failed",
                                "title": "邮件报告发送失败",
                                "body": e,
                                "targetId": null,
                                "applicationId": null
                            }));
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            application::create_application,
            application::list_applications,
            application::get_application,
            application::update_application,
            application::delete_application,
            tracker::create_tracking_target,
            tracker::list_tracking_targets,
            tracker::update_tracking_target,
            tracker::delete_tracking_target,
            tracker::create_tracking_run,
            tracker::list_tracking_runs,
            tracker::get_targets_needing_check,
            event::create_event,
            event::list_events_by_application,
            event::resolve_application_event,
            reminder::create_reminder,
            reminder::list_reminders,
            reminder::mark_reminder_done,
            reminder::update_reminder,
            reminder::delete_reminder,
            ai::parse_status,
            ai::test_ai_connection,
            ai::extract_job_info,
            sidecar::run_sidecar_check,
            sidecar::run_sidecar_batch_check,
            sidecar::run_sidecar_open_login,
            sidecar::run_sidecar_fetch_page,
            sidecar::get_app_data_dir,
            settings::get_settings,
            settings::save_settings,
            settings::is_ai_configured,
            auto_check::run_auto_check,
            auto_check::get_auto_check_status,
            auto_check::reset_auto_check,
            auto_check::run_tracking_target_check,
            auto_check::run_tracking_targets_check,
            email::test_email_config,
            email::send_daily_report,
            email::send_daily_report_with_check,
            push_log::list_push_logs,
            push_log::clear_push_logs,
            backup::export_data,
            backup::export_data_to_file,
            resume::create_resume,
            resume::list_resumes,
            resume::get_resume,
            resume::update_resume,
            resume::delete_resume,
            resume::set_default_resume,
            resume::upload_resume_pdf,
            resume::parse_resume_pdf,
            resume::get_default_resume,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
