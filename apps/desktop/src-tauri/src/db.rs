use sqlx::sqlite::SqlitePoolOptions;
use sqlx::Row;
use sqlx::SqlitePool;
use tauri::Manager;

pub async fn init_database(app_handle: &tauri::AppHandle) -> Result<SqlitePool, String> {
    // Use app data directory
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .or_else(|_| app_handle.path().app_config_dir())
        .map_err(|e| format!("Failed to get app directory: {}", e))?;

    // Create directory if it doesn't exist
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create directory {:?}: {}", app_dir, e))?;

    let db_path = app_dir.join("applyradar.db");
    let db_path_str = db_path.to_string_lossy().to_string();

    // Use mode=rwc to create the database file if it doesn't exist
    let db_url = format!("sqlite:{}?mode=rwc", db_path_str);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database at {:?}: {}", db_path, e))?;

    // Enable foreign key constraints
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

    run_migrations(&pool).await?;

    Ok(pool)
}

async fn run_migrations(pool: &SqlitePool) -> Result<(), String> {
    let migrations = vec![
        r#"
        CREATE TABLE IF NOT EXISTS applications (
            id TEXT PRIMARY KEY,
            company_name TEXT NOT NULL,
            job_title TEXT NOT NULL,
            location TEXT,
            salary_range TEXT,
            job_url TEXT,
            status_url TEXT,
            source TEXT,
            status TEXT NOT NULL DEFAULT 'unknown',
            priority TEXT DEFAULT 'medium',
            applied_at TEXT,
            deadline_at TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS tracking_targets (
            id TEXT PRIMARY KEY,
            application_id TEXT NOT NULL,
            domain TEXT NOT NULL,
            status_url TEXT NOT NULL,
            ats_type TEXT DEFAULT 'generic',
            enabled INTEGER DEFAULT 1,
            check_frequency TEXT DEFAULT 'daily',
            current_status TEXT DEFAULT 'unknown',
            last_status TEXT,
            login_state TEXT DEFAULT 'unknown',
            last_checked_at TEXT,
            last_success_at TEXT,
            last_error TEXT,
            last_text_hash TEXT,
            profile_dir TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(application_id, status_url),
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
        );
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS application_events (
            id TEXT PRIMARY KEY,
            application_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT,
            old_status TEXT,
            new_status TEXT,
            handled_at TEXT,
            handled_action TEXT,
            event_time TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
        );
        "#,
        r#"
        CREATE INDEX IF NOT EXISTS idx_events_app_time ON application_events(application_id, event_time DESC);
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY,
            application_id TEXT,
            title TEXT NOT NULL,
            content TEXT,
            reminder_type TEXT,
            remind_at TEXT NOT NULL,
            is_done INTEGER DEFAULT 0,
            notified_at TEXT,
            created_by TEXT DEFAULT 'user',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
        );
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS tracking_runs (
            id TEXT PRIMARY KEY,
            target_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            status TEXT NOT NULL,
            raw_status TEXT,
            normalized_status TEXT,
            confidence REAL,
            login_state TEXT,
            error_message TEXT,
            page_hash TEXT,
            ai_used INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (target_id) REFERENCES tracking_targets(id) ON DELETE CASCADE
        );
        "#,
        r#"
        CREATE INDEX IF NOT EXISTS idx_tracking_runs_target_created ON tracking_runs(target_id, created_at DESC);
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS site_sessions (
            id TEXT PRIMARY KEY,
            domain TEXT NOT NULL,
            profile_dir TEXT NOT NULL,
            login_state TEXT DEFAULT 'unknown',
            last_verified_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS push_logs (
            id TEXT PRIMARY KEY,
            push_type TEXT NOT NULL,
            title TEXT NOT NULL,
            detail TEXT,
            channel TEXT NOT NULL DEFAULT 'desktop',
            status TEXT NOT NULL DEFAULT 'success',
            error_message TEXT,
            created_at TEXT NOT NULL
        );
        "#,
        r#"
        CREATE INDEX IF NOT EXISTS idx_push_logs_created ON push_logs(created_at DESC);
        "#,
    ];

    for sql in migrations {
        sqlx::query(sql)
            .execute(pool)
            .await
            .map_err(|e| format!("Migration failed: {}", e))?;
    }

    ensure_column(pool, "application_events", "handled_at", "TEXT").await?;
    ensure_column(pool, "application_events", "handled_action", "TEXT").await?;
    ensure_column(pool, "reminders", "notified_at", "TEXT").await?;

    // 简历表迁移
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS resumes (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            full_name TEXT,
            phone TEXT,
            email TEXT,
            gender TEXT,
            birth_date TEXT,
            hometown TEXT,
            political_status TEXT,
            target_position TEXT,
            target_city TEXT,
            expected_salary TEXT,
            job_type TEXT,
            education TEXT,
            work_experience TEXT,
            projects TEXT,
            skills TEXT,
            certifications TEXT,
            summary TEXT,
            pdf_file_path TEXT,
            raw_text TEXT,
            parsed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    "#)
    .execute(pool)
    .await
    .map_err(|e| format!("Migration failed (resumes): {}", e))?;

    // 简历附件表
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS resume_attachments (
            id TEXT PRIMARY KEY,
            resume_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER,
            mime_type TEXT DEFAULT 'application/pdf',
            uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
        )
    "#)
    .execute(pool)
    .await
    .map_err(|e| format!("Migration failed (resume_attachments): {}", e))?;

    // 表单模板表
    sqlx::query(r#"
        CREATE TABLE IF NOT EXISTS form_templates (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT '',
            domain TEXT NOT NULL,
            site_name TEXT,
            field_mappings TEXT NOT NULL DEFAULT '{}',
            is_ai_generated INTEGER DEFAULT 0,
            confidence REAL,
            last_used_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    "#)
    .execute(pool)
    .await
    .map_err(|e| format!("Migration failed (form_templates): {}", e))?;

    Ok(())
}

/// SAFETY: `table`, `column`, and `column_type` MUST be compile-time string literals.
/// Never pass user-supplied values to this function — it uses raw SQL interpolation.
async fn ensure_column(
    pool: &SqlitePool,
    table: &str,
    column: &str,
    column_type: &str,
) -> Result<(), String> {
    let pragma = format!("PRAGMA table_info({})", table);
    let rows = sqlx::query(&pragma)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to inspect table '{}': {}", table, e))?;

    if rows.iter().any(|row| row.get::<String, _>("name") == column) {
        return Ok(());
    }

    let alter = format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, column_type);
    sqlx::query(&alter)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to add column '{}.{}': {}", table, column, e))?;

    Ok(())
}
