mod db;
mod commands;

use commands::{application, tracker, event, reminder, ai, sidecar, settings};
use sqlx::SqlitePool;
use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;

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
                db::init_database(&handle).await.expect("Failed to initialize database")
            });
            app.manage(AppState { db: pool.clone() });

            // Build tray menu
            let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&quit_item)
                .build()?;

            // Create tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
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

                    // Mark as running
                    let _ = settings::save_setting_raw(&db, "auto_check_is_running", "true").await;

                    // Run auto check using inner function
                    let result = tracker::run_auto_check_inner(&app_handle, &db, false).await;

                    // Update status
                    let now = chrono::Utc::now().to_rfc3339();
                    let _ = settings::save_setting_raw(&db, "auto_check_last_run_at", &now).await;
                    let _ = settings::save_setting_raw(&db, "auto_check_is_running", "false").await;

                    match result {
                        Ok(result) => {
                            let result_str = if result.total == 0 {
                                "无待检查目标".to_string()
                            } else {
                                format!("检查{}个，{}成功，{}失败，{}状态变更",
                                    result.total, result.success, result.failed, result.status_changes)
                            };
                            let _ = settings::save_setting_raw(&db, "auto_check_last_result", &result_str).await;
                            if result.total > 0 {
                                let _ = app_handle.emit("auto-check:notify", serde_json::json!({
                                    "type": "summary",
                                    "title": "检查完成",
                                    "body": result_str,
                                    "targetId": null,
                                    "applicationId": null
                                }));
                            }
                            println!("[auto_check] {}", result_str);
                        }
                        Err(e) => {
                            let result_str = format!("错误: {}", e);
                            let _ = settings::save_setting_raw(&db, "auto_check_last_result", &result_str).await;
                            let _ = app_handle.emit("auto-check:notify", serde_json::json!({
                                "type": "check_failed",
                                "title": "自动检查失败",
                                "body": result_str,
                                "targetId": null,
                                "applicationId": null
                            }));
                            println!("[auto_check] Error: {}", e);
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
            reminder::create_reminder,
            reminder::list_reminders,
            reminder::mark_reminder_done,
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
            tracker::run_auto_check,
            tracker::get_auto_check_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
