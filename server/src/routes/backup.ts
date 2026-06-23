import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';
import { generateId } from '../auth.js';
import { backupImportSchema } from '../validate.js';

const app = new Hono<AppEnv>();

// Export all user data
app.get('/export', (c) => {
  const userId = c.get('userId');

  const applications = db.prepare('SELECT * FROM applications WHERE user_id = ?').all(userId);
  const events = db.prepare('SELECT * FROM application_events WHERE user_id = ?').all(userId);
  const reminders = db.prepare('SELECT * FROM reminders WHERE user_id = ?').all(userId);
  const trackingTargets = db.prepare('SELECT * FROM tracking_targets WHERE user_id = ?').all(userId);
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);

  const exportData = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    applications,
    events,
    reminders,
    tracking_targets: trackingTargets,
    settings,
  };

  return c.json({ code: 0, data: exportData });
});

// Import data
// 安全：使用 zod 校验所有导入字段，防止恶意/损坏的备份注入非法数据
app.post('/import', async (c) => {
  const userId = c.get('userId');
  const rawBody = await c.req.json();

  const parsed = backupImportSchema.safeParse(rawBody);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return c.json({ code: 400, msg: `备份数据校验失败: ${errors}` }, 400);
  }

  const body = parsed.data;

  const transaction = db.transaction(() => {
    let imported = {
      applications: 0,
      events: 0,
      reminders: 0,
      tracking_targets: 0,
    };

    // Import applications
    const existingApps = new Set(
      (db.prepare('SELECT id FROM applications WHERE user_id = ?').all(userId) as any[]).map(a => a.id)
    );

    for (const app of body.applications) {
      if (!existingApps.has(app.id)) {
        db.prepare(
          `INSERT INTO applications (id, user_id, company_name, job_title, location, salary_range, job_url, status_url, source, status, priority, applied_at, deadline_at, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          app.id, userId, app.company_name, app.job_title, app.location, app.salary_range,
          app.job_url, app.status_url, app.source, app.status, app.priority,
          app.applied_at, app.deadline_at, app.notes, app.created_at, app.updated_at
        );
        imported.applications++;
      }
    }

    // Import events
    if (body.events && Array.isArray(body.events)) {
      const existingEvents = new Set(
        (db.prepare('SELECT id FROM application_events WHERE user_id = ?').all(userId) as any[]).map(e => e.id)
      );

      for (const event of body.events) {
        if (!existingEvents.has(event.id) && existingApps.has(event.application_id)) {
          db.prepare(
            `INSERT INTO application_events (id, user_id, application_id, event_type, title, content, old_status, new_status, handled_at, handled_action, event_time, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            event.id, userId, event.application_id, event.event_type, event.title,
            event.content, event.old_status, event.new_status, event.handled_at,
            event.handled_action, event.event_time, event.created_at
          );
          imported.events++;
        }
      }
    }

    // Import reminders
    if (body.reminders && Array.isArray(body.reminders)) {
      const existingReminders = new Set(
        (db.prepare('SELECT id FROM reminders WHERE user_id = ?').all(userId) as any[]).map(r => r.id)
      );

      for (const reminder of body.reminders) {
        if (!existingReminders.has(reminder.id)) {
          db.prepare(
            `INSERT INTO reminders (id, user_id, application_id, title, content, reminder_type, remind_at, is_done, notified_at, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            reminder.id, userId, reminder.application_id, reminder.title, reminder.content,
            reminder.reminder_type, reminder.remind_at, reminder.is_done, reminder.notified_at,
            reminder.created_by, reminder.created_at, reminder.updated_at
          );
          imported.reminders++;
        }
      }
    }

    // Import tracking targets
    if (body.tracking_targets && Array.isArray(body.tracking_targets)) {
      const existingTargets = new Set(
        (db.prepare('SELECT id FROM tracking_targets WHERE user_id = ?').all(userId) as any[]).map(t => t.id)
      );

      for (const target of body.tracking_targets) {
        if (!existingTargets.has(target.id) && existingApps.has(target.application_id)) {
          db.prepare(
            `INSERT INTO tracking_targets (id, user_id, application_id, domain, status_url, ats_type, enabled, check_frequency, current_status, last_status, login_state, last_checked_at, last_success_at, last_error, last_text_hash, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            target.id, userId, target.application_id, target.domain, target.status_url,
            target.ats_type, target.enabled, target.check_frequency, target.current_status,
            target.last_status, target.login_state, target.last_checked_at, target.last_success_at,
            target.last_error, target.last_text_hash, target.created_at, target.updated_at
          );
          imported.tracking_targets++;
        }
      }
    }

    return imported;
  });

  try {
    const result = transaction();
    return c.json({
      code: 0,
      data: result,
      msg: `导入完成: ${result.applications} 条求职记录, ${result.events} 条事件, ${result.reminders} 条提醒, ${result.tracking_targets} 个追踪目标`,
    });
  } catch (e: any) {
    return c.json({ code: 500, msg: `导入失败: ${e.message}` }, 500);
  }
});

export default app;
