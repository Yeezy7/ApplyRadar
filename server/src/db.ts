import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DB_PATH = process.env.DB_PATH || './data/applyradar.db';

// Ensure directory exists
const dir = dirname(DB_PATH);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      password_hash TEXT,
      openid TEXT UNIQUE,
      nickname TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      job_title TEXT NOT NULL,
      location TEXT,
      salary_range TEXT,
      job_url TEXT,
      status_url TEXT,
      source TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'to_apply',
      priority TEXT DEFAULT 'medium',
      applied_at TEXT,
      deadline_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS application_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      old_status TEXT,
      new_status TEXT,
      handled_at TEXT,
      handled_action TEXT,
      event_time TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      application_id TEXT,
      title TEXT NOT NULL,
      content TEXT,
      reminder_type TEXT DEFAULT 'custom',
      remind_at TEXT NOT NULL,
      is_done INTEGER DEFAULT 0,
      notified_at TEXT,
      created_by TEXT DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      api_key TEXT,
      api_base_url TEXT DEFAULT 'https://api.openai.com/v1',
      model TEXT DEFAULT 'gpt-4o-mini',
      check_frequency TEXT DEFAULT 'daily',
      notifications_enabled INTEGER DEFAULT 1,
      auto_check_enabled INTEGER DEFAULT 0,
      email_report_enabled INTEGER DEFAULT 0,
      smtp_host TEXT,
      smtp_port TEXT DEFAULT '465',
      smtp_username TEXT,
      smtp_password TEXT,
      smtp_recipient TEXT,
      email_report_time TEXT DEFAULT '09:00',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tracking_targets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      status_url TEXT NOT NULL,
      ats_type TEXT DEFAULT 'generic',
      enabled INTEGER DEFAULT 1,
      check_frequency TEXT DEFAULT 'daily',
      current_status TEXT,
      last_status TEXT,
      login_state TEXT DEFAULT 'unknown',
      last_checked_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      last_text_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tracking_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT DEFAULT 'success',
      raw_status TEXT,
      normalized_status TEXT,
      confidence REAL,
      login_state TEXT,
      error_message TEXT,
      page_hash TEXT,
      ai_used INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES tracking_targets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS push_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      push_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      status TEXT DEFAULT 'sent',
      application_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
    CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
    CREATE INDEX IF NOT EXISTS idx_events_application ON application_events(application_id);
    CREATE INDEX IF NOT EXISTS idx_events_user ON application_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_application ON reminders(application_id);
    CREATE INDEX IF NOT EXISTS idx_tracking_targets_user ON tracking_targets(user_id);
    CREATE INDEX IF NOT EXISTS idx_tracking_targets_application ON tracking_targets(application_id);
    CREATE INDEX IF NOT EXISTS idx_tracking_runs_target ON tracking_runs(target_id);
    CREATE INDEX IF NOT EXISTS idx_push_logs_user ON push_logs(user_id);
  `);

  console.log('Database initialized');
}

export default db;
