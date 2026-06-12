import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';
import { generateId } from '../auth.js';

const app = new Hono<AppEnv>();

// 上传本地数据到云端
app.post('/push', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const { applications, events, reminders, tracking_targets, settings } = body;

  const results = {
    applications: { created: 0, updated: 0 },
    events: { created: 0, skipped: 0 },
    reminders: { created: 0, updated: 0 },
    tracking_targets: { created: 0, updated: 0 },
    settings: { updated: false },
  };

  // 同步求职记录
  if (applications && Array.isArray(applications)) {
    for (const app of applications) {
      const existing = db.prepare('SELECT id, updated_at FROM applications WHERE id = ? AND user_id = ?').get(app.id, userId) as any;

      if (!existing) {
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

  // 同步监控目标
  if (tracking_targets && Array.isArray(tracking_targets)) {
    for (const target of tracking_targets) {
      const existing = db.prepare('SELECT id, updated_at FROM tracking_targets WHERE id = ? AND user_id = ?').get(target.id, userId) as any;

      if (!existing) {
        db.prepare(
          `INSERT INTO tracking_targets (id, user_id, application_id, domain, status_url, ats_type, enabled, check_frequency, current_status, last_status, login_state, last_checked_at, last_success_at, last_error, last_text_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          target.id, userId, target.application_id, target.domain,
          target.status_url, target.ats_type || 'generic', target.enabled ?? 1,
          target.check_frequency || 'daily', target.current_status || null,
          target.last_status || null, target.login_state || 'unknown',
          target.last_checked_at || null, target.last_success_at || null,
          target.last_error || null, target.last_text_hash || null,
          target.created_at, target.updated_at
        );
        results.tracking_targets.created++;
      } else {
        if (new Date(target.updated_at) > new Date(existing.updated_at)) {
          db.prepare(
            `UPDATE tracking_targets SET
              domain = ?, status_url = ?, ats_type = ?, enabled = ?,
              check_frequency = ?, current_status = ?, last_status = ?,
              login_state = ?, last_checked_at = ?, last_success_at = ?,
              last_error = ?, last_text_hash = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`
          ).run(
            target.domain, target.status_url, target.ats_type || 'generic',
            target.enabled ?? 1, target.check_frequency || 'daily',
            target.current_status || null, target.last_status || null,
            target.login_state || 'unknown', target.last_checked_at || null,
            target.last_success_at || null, target.last_error || null,
            target.last_text_hash || null, target.updated_at, target.id, userId
          );
          results.tracking_targets.updated++;
        }
      }
    }
  }

  // 同步设置
  if (settings) {
    const existing = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);

    if (!existing) {
      const id = generateId();
      db.prepare(
        `INSERT INTO user_settings (id, user_id, api_key, api_base_url, model, check_frequency, notifications_enabled, auto_check_enabled, email_report_enabled, smtp_host, smtp_port, smtp_username, smtp_password, smtp_recipient, email_report_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, userId,
        settings.api_key || '', settings.api_base_url || 'https://api.openai.com/v1',
        settings.model || 'gpt-4o-mini', settings.check_frequency || 'daily',
        settings.notifications_enabled ?? 1, settings.auto_check_enabled ?? 0,
        settings.email_report_enabled ?? 0, settings.smtp_host || '',
        settings.smtp_port || '465', settings.smtp_username || '',
        settings.smtp_password || '', settings.smtp_recipient || '',
        settings.email_report_time || '09:00'
      );
      results.settings.updated = true;
    } else {
      db.prepare(
        `UPDATE user_settings SET
          api_key = ?, api_base_url = ?, model = ?, check_frequency = ?,
          notifications_enabled = ?, auto_check_enabled = ?, email_report_enabled = ?,
          smtp_host = ?, smtp_port = ?, smtp_username = ?, smtp_password = ?,
          smtp_recipient = ?, email_report_time = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      ).run(
        settings.api_key || existing.api_key,
        settings.api_base_url || existing.api_base_url,
        settings.model || existing.model,
        settings.check_frequency || existing.check_frequency,
        settings.notifications_enabled ?? existing.notifications_enabled,
        settings.auto_check_enabled ?? existing.auto_check_enabled,
        settings.email_report_enabled ?? existing.email_report_enabled,
        settings.smtp_host || existing.smtp_host,
        settings.smtp_port || existing.smtp_port,
        settings.smtp_username || existing.smtp_username,
        settings.smtp_password || existing.smtp_password,
        settings.smtp_recipient || existing.smtp_recipient,
        settings.email_report_time || existing.email_report_time,
        userId
      );
      results.settings.updated = true;
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
  const tracking_targets = db.prepare('SELECT * FROM tracking_targets WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);

  return c.json({
    code: 0,
    data: {
      applications,
      events,
      reminders,
      tracking_targets,
      settings,
      exported_at: new Date().toISOString(),
    },
  });
});

// 智能合并
app.post('/merge', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const { applications, events, reminders, tracking_targets, settings } = body;

  const results = {
    applications: { created: 0, updated: 0, skipped: 0 },
    events: { created: 0, skipped: 0 },
    reminders: { created: 0, updated: 0, skipped: 0 },
    tracking_targets: { created: 0, updated: 0, skipped: 0 },
    settings: { updated: false },
  };

  // 获取云端数据
  const remoteApps = db.prepare('SELECT * FROM applications WHERE user_id = ?').all(userId) as any[];
  const remoteEvents = db.prepare('SELECT * FROM application_events WHERE user_id = ?').all(userId) as any[];
  const remoteReminders = db.prepare('SELECT * FROM reminders WHERE user_id = ?').all(userId) as any[];
  const remoteTargets = db.prepare('SELECT * FROM tracking_targets WHERE user_id = ?').all(userId) as any[];

  // 创建云端数据的 Map
  const remoteAppMap = new Map(remoteApps.map(a => [a.id, a]));
  const remoteEventMap = new Map(remoteEvents.map(e => [e.id, e]));
  const remoteReminderMap = new Map(remoteReminders.map(r => [r.id, r]));
  const remoteTargetMap = new Map(remoteTargets.map(t => [t.id, t]));

  // 合并求职记录
  if (applications && Array.isArray(applications)) {
    for (const localApp of applications) {
      const remoteApp = remoteAppMap.get(localApp.id);

      if (!remoteApp) {
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

  // 合并监控目标
  if (tracking_targets && Array.isArray(tracking_targets)) {
    for (const localTarget of tracking_targets) {
      const remoteTarget = remoteTargetMap.get(localTarget.id);

      if (!remoteTarget) {
        db.prepare(
          `INSERT INTO tracking_targets (id, user_id, application_id, domain, status_url, ats_type, enabled, check_frequency, current_status, last_status, login_state, last_checked_at, last_success_at, last_error, last_text_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          localTarget.id, userId, localTarget.application_id,
          localTarget.domain, localTarget.status_url,
          localTarget.ats_type || 'generic', localTarget.enabled ?? 1,
          localTarget.check_frequency || 'daily',
          localTarget.current_status || null, localTarget.last_status || null,
          localTarget.login_state || 'unknown', localTarget.last_checked_at || null,
          localTarget.last_success_at || null, localTarget.last_error || null,
          localTarget.last_text_hash || null, localTarget.created_at, localTarget.updated_at
        );
        results.tracking_targets.created++;
      } else {
        if (new Date(localTarget.updated_at) > new Date(remoteTarget.updated_at)) {
          db.prepare(
            `UPDATE tracking_targets SET
              domain = ?, status_url = ?, ats_type = ?, enabled = ?,
              check_frequency = ?, current_status = ?, last_status = ?,
              login_state = ?, last_checked_at = ?, last_success_at = ?,
              last_error = ?, last_text_hash = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`
          ).run(
            localTarget.domain, localTarget.status_url,
            localTarget.ats_type || 'generic', localTarget.enabled ?? 1,
            localTarget.check_frequency || 'daily',
            localTarget.current_status || null, localTarget.last_status || null,
            localTarget.login_state || 'unknown', localTarget.last_checked_at || null,
            localTarget.last_success_at || null, localTarget.last_error || null,
            localTarget.last_text_hash || null, localTarget.updated_at,
            localTarget.id, userId
          );
          results.tracking_targets.updated++;
        } else {
          results.tracking_targets.skipped++;
        }
        remoteTargetMap.delete(localTarget.id);
      }
    }
  }

  // 合并设置
  if (settings) {
    const remoteSettings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);

    if (!remoteSettings) {
      const id = generateId();
      db.prepare(
        `INSERT INTO user_settings (id, user_id, api_key, api_base_url, model, check_frequency, notifications_enabled, auto_check_enabled, email_report_enabled, smtp_host, smtp_port, smtp_username, smtp_password, smtp_recipient, email_report_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, userId,
        settings.api_key || '', settings.api_base_url || 'https://api.openai.com/v1',
        settings.model || 'gpt-4o-mini', settings.check_frequency || 'daily',
        settings.notifications_enabled ?? 1, settings.auto_check_enabled ?? 0,
        settings.email_report_enabled ?? 0, settings.smtp_host || '',
        settings.smtp_port || '465', settings.smtp_username || '',
        settings.smtp_password || '', settings.smtp_recipient || '',
        settings.email_report_time || '09:00'
      );
      results.settings.updated = true;
    } else {
      // 取更新时间更近的设置
      const localUpdated = settings.updated_at ? new Date(settings.updated_at) : new Date(0);
      const remoteUpdated = (remoteSettings as any).updated_at ? new Date((remoteSettings as any).updated_at) : new Date(0);

      if (localUpdated > remoteUpdated) {
        db.prepare(
          `UPDATE user_settings SET
            api_key = ?, api_base_url = ?, model = ?, check_frequency = ?,
            notifications_enabled = ?, auto_check_enabled = ?, email_report_enabled = ?,
            smtp_host = ?, smtp_port = ?, smtp_username = ?, smtp_password = ?,
            smtp_recipient = ?, email_report_time = ?, updated_at = datetime('now')
           WHERE user_id = ?`
        ).run(
          settings.api_key || (remoteSettings as any).api_key,
          settings.api_base_url || (remoteSettings as any).api_base_url,
          settings.model || (remoteSettings as any).model,
          settings.check_frequency || (remoteSettings as any).check_frequency,
          settings.notifications_enabled ?? (remoteSettings as any).notifications_enabled,
          settings.auto_check_enabled ?? (remoteSettings as any).auto_check_enabled,
          settings.email_report_enabled ?? (remoteSettings as any).email_report_enabled,
          settings.smtp_host || (remoteSettings as any).smtp_host,
          settings.smtp_port || (remoteSettings as any).smtp_port,
          settings.smtp_username || (remoteSettings as any).smtp_username,
          settings.smtp_password || (remoteSettings as any).smtp_password,
          settings.smtp_recipient || (remoteSettings as any).smtp_recipient,
          settings.email_report_time || (remoteSettings as any).email_report_time,
          userId
        );
        results.settings.updated = true;
      }
    }
  }

  return c.json({ code: 0, data: results });
});

export default app;
