import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';
import { generateId } from '../auth.js';

const app = new Hono<AppEnv>();

// 上传本地数据到云端
app.post('/push', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const { applications, events, reminders } = body;

  const results = {
    applications: { created: 0, updated: 0 },
    events: { created: 0, skipped: 0 },
    reminders: { created: 0, updated: 0 },
  };

  // 同步求职记录
  if (applications && Array.isArray(applications)) {
    for (const app of applications) {
      const existing = db.prepare('SELECT id, updated_at FROM applications WHERE id = ? AND user_id = ?').get(app.id, userId) as any;

      if (!existing) {
        // 新记录，插入
        db.prepare(
          `INSERT INTO applications (id, user_id, company_name, job_title, location, salary_range, job_url, status_url, source, status, priority, applied_at, deadline_at, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          app.id, userId, app.company_name, app.job_title, app.location || '',
          app.salary_range || '', app.job_url || '', app.status_url || '',
          app.source || 'manual', app.status || 'to_apply', app.priority || 'medium',
          app.applied_at || null, app.deadline_at || null, app.notes || '',
          app.created_at, app.updated_at
        );
        results.applications.created++;
      } else {
        // 已存在，检查是否需要更新
        if (new Date(app.updated_at) > new Date(existing.updated_at)) {
          db.prepare(
            `UPDATE applications SET
              company_name = ?, job_title = ?, location = ?, salary_range = ?,
              job_url = ?, status_url = ?, source = ?, status = ?, priority = ?,
              applied_at = ?, deadline_at = ?, notes = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`
          ).run(
            app.company_name, app.job_title, app.location || '',
            app.salary_range || '', app.job_url || '', app.status_url || '',
            app.source || 'manual', app.status || 'to_apply', app.priority || 'medium',
            app.applied_at || null, app.deadline_at || null, app.notes || '',
            app.updated_at, app.id, userId
          );
          results.applications.updated++;
        }
      }
    }
  }

  // 同步事件
  if (events && Array.isArray(events)) {
    for (const event of events) {
      const existing = db.prepare('SELECT id FROM application_events WHERE id = ?').get(event.id);
      if (!existing) {
        db.prepare(
          `INSERT INTO application_events (id, user_id, application_id, event_type, title, content, old_status, new_status, handled_at, handled_action, event_time, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          event.id, userId, event.application_id, event.event_type,
          event.title, event.content || null, event.old_status || null,
          event.new_status || null, event.handled_at || null,
          event.handled_action || null, event.event_time, event.created_at
        );
        results.events.created++;
      } else {
        results.events.skipped++;
      }
    }
  }

  // 同步提醒
  if (reminders && Array.isArray(reminders)) {
    for (const reminder of reminders) {
      const existing = db.prepare('SELECT id, updated_at FROM reminders WHERE id = ? AND user_id = ?').get(reminder.id, userId) as any;

      if (!existing) {
        db.prepare(
          `INSERT INTO reminders (id, user_id, application_id, title, content, reminder_type, remind_at, is_done, notified_at, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          reminder.id, userId, reminder.application_id || null,
          reminder.title, reminder.content || '', reminder.reminder_type || 'custom',
          reminder.remind_at, reminder.is_done || 0, reminder.notified_at || null,
          reminder.created_by || 'user', reminder.created_at, reminder.updated_at
        );
        results.reminders.created++;
      } else {
        if (new Date(reminder.updated_at) > new Date(existing.updated_at)) {
          db.prepare(
            `UPDATE reminders SET
              title = ?, content = ?, reminder_type = ?, remind_at = ?,
              is_done = ?, notified_at = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`
          ).run(
            reminder.title, reminder.content || '', reminder.reminder_type || 'custom',
            reminder.remind_at, reminder.is_done || 0, reminder.notified_at || null,
            reminder.updated_at, reminder.id, userId
          );
          results.reminders.updated++;
        }
      }
    }
  }

  return c.json({ code: 0, data: results });
});

// 从云端下载数据
app.post('/pull', async (c) => {
  const userId = c.get('userId');

  const applications = db.prepare('SELECT * FROM applications WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  const events = db.prepare('SELECT * FROM application_events WHERE user_id = ? ORDER BY event_time DESC').all(userId);
  const reminders = db.prepare('SELECT * FROM reminders WHERE user_id = ? ORDER BY remind_at ASC').all(userId);
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);

  return c.json({
    code: 0,
    data: {
      applications,
      events,
      reminders,
      settings,
      exported_at: new Date().toISOString(),
    },
  });
});

// 智能合并
app.post('/merge', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const { applications, events, reminders } = body;

  const results = {
    applications: { created: 0, updated: 0, skipped: 0 },
    events: { created: 0, skipped: 0 },
    reminders: { created: 0, updated: 0, skipped: 0 },
  };

  // 获取云端数据
  const remoteApps = db.prepare('SELECT * FROM applications WHERE user_id = ?').all(userId) as any[];
  const remoteEvents = db.prepare('SELECT * FROM application_events WHERE user_id = ?').all(userId) as any[];
  const remoteReminders = db.prepare('SELECT * FROM reminders WHERE user_id = ?').all(userId) as any[];

  // 创建云端数据的 Map
  const remoteAppMap = new Map(remoteApps.map(a => [a.id, a]));
  const remoteEventMap = new Map(remoteEvents.map(e => [e.id, e]));
  const remoteReminderMap = new Map(remoteReminders.map(r => [r.id, r]));

  // 合并求职记录
  if (applications && Array.isArray(applications)) {
    for (const localApp of applications) {
      const remoteApp = remoteAppMap.get(localApp.id);

      if (!remoteApp) {
        // 本地有，云端没有 → 上传
        db.prepare(
          `INSERT INTO applications (id, user_id, company_name, job_title, location, salary_range, job_url, status_url, source, status, priority, applied_at, deadline_at, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          localApp.id, userId, localApp.company_name, localApp.job_title,
          localApp.location || '', localApp.salary_range || '',
          localApp.job_url || '', localApp.status_url || '',
          localApp.source || 'manual', localApp.status || 'to_apply',
          localApp.priority || 'medium', localApp.applied_at || null,
          localApp.deadline_at || null, localApp.notes || '',
          localApp.created_at, localApp.updated_at
        );
        results.applications.created++;
      } else {
        // 两边都有，取 updated_at 更新的
        if (new Date(localApp.updated_at) > new Date(remoteApp.updated_at)) {
          db.prepare(
            `UPDATE applications SET
              company_name = ?, job_title = ?, location = ?, salary_range = ?,
              job_url = ?, status_url = ?, source = ?, status = ?, priority = ?,
              applied_at = ?, deadline_at = ?, notes = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`
          ).run(
            localApp.company_name, localApp.job_title, localApp.location || '',
            localApp.salary_range || '', localApp.job_url || '',
            localApp.status_url || '', localApp.source || 'manual',
            localApp.status || 'to_apply', localApp.priority || 'medium',
            localApp.applied_at || null, localApp.deadline_at || null,
            localApp.notes || '', localApp.updated_at, localApp.id, userId
          );
          results.applications.updated++;
        } else {
          results.applications.skipped++;
        }
        remoteAppMap.delete(localApp.id);
      }
    }

    // 云端有，本地没有 → 下载（已在 pull 中处理）
  }

  // 合并事件
  if (events && Array.isArray(events)) {
    for (const localEvent of events) {
      if (!remoteEventMap.has(localEvent.id)) {
        db.prepare(
          `INSERT INTO application_events (id, user_id, application_id, event_type, title, content, old_status, new_status, handled_at, handled_action, event_time, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          localEvent.id, userId, localEvent.application_id,
          localEvent.event_type, localEvent.title,
          localEvent.content || null, localEvent.old_status || null,
          localEvent.new_status || null, localEvent.handled_at || null,
          localEvent.handled_action || null, localEvent.event_time,
          localEvent.created_at
        );
        results.events.created++;
      } else {
        results.events.skipped++;
      }
    }
  }

  // 合并提醒
  if (reminders && Array.isArray(reminders)) {
    for (const localReminder of reminders) {
      const remoteReminder = remoteReminderMap.get(localReminder.id);

      if (!remoteReminder) {
        db.prepare(
          `INSERT INTO reminders (id, user_id, application_id, title, content, reminder_type, remind_at, is_done, notified_at, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          localReminder.id, userId, localReminder.application_id || null,
          localReminder.title, localReminder.content || '',
          localReminder.reminder_type || 'custom', localReminder.remind_at,
          localReminder.is_done || 0, localReminder.notified_at || null,
          localReminder.created_by || 'user', localReminder.created_at,
          localReminder.updated_at
        );
        results.reminders.created++;
      } else {
        if (new Date(localReminder.updated_at) > new Date(remoteReminder.updated_at)) {
          db.prepare(
            `UPDATE reminders SET
              title = ?, content = ?, reminder_type = ?, remind_at = ?,
              is_done = ?, notified_at = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`
          ).run(
            localReminder.title, localReminder.content || '',
            localReminder.reminder_type || 'custom', localReminder.remind_at,
            localReminder.is_done || 0, localReminder.notified_at || null,
            localReminder.updated_at, localReminder.id, userId
          );
          results.reminders.updated++;
        } else {
          results.reminders.skipped++;
        }
        remoteReminderMap.delete(localReminder.id);
      }
    }
  }

  return c.json({ code: 0, data: results });
});

export default app;
