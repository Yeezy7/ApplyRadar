import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';
import { generateId } from '../auth.js';

const app = new Hono<AppEnv>();

// Get settings
app.get('/', (c) => {
  const userId = c.get('userId');

  let settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;

  if (!settings) {
    const id = generateId();
    db.prepare('INSERT INTO user_settings (id, user_id) VALUES (?, ?)').run(id, userId);
    settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  }

  return c.json({ code: 0, data: settings });
});

// Save settings
app.put('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const existing = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);

  if (!existing) {
    const id = generateId();
    db.prepare(
      `INSERT INTO user_settings (id, user_id, api_key, api_base_url, model, check_frequency, notifications_enabled, auto_check_enabled, email_report_enabled, smtp_host, smtp_port, smtp_username, smtp_password, smtp_recipient, email_report_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      userId,
      body.api_key || '',
      body.api_base_url || 'https://api.openai.com/v1',
      body.model || 'gpt-4o-mini',
      body.check_frequency || 'daily',
      body.notifications_enabled !== false ? 1 : 0,
      body.auto_check_enabled ? 1 : 0,
      body.email_report_enabled ? 1 : 0,
      body.smtp_host || '',
      body.smtp_port || '465',
      body.smtp_username || '',
      body.smtp_password || '',
      body.smtp_recipient || '',
      body.email_report_time || '09:00'
    );
  } else {
    const fields: string[] = [];
    const params: any[] = [];

    const allowedFields = [
      'api_key', 'api_base_url', 'model', 'check_frequency', 'notifications_enabled',
      'auto_check_enabled', 'email_report_enabled', 'smtp_host', 'smtp_port',
      'smtp_username', 'smtp_password', 'smtp_recipient', 'email_report_time'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'notifications_enabled' || field === 'auto_check_enabled' || field === 'email_report_enabled') {
          fields.push(`${field} = ?`);
          params.push(body[field] ? 1 : 0);
        } else {
          fields.push(`${field} = ?`);
          params.push(body[field]);
        }
      }
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      params.push(userId);

      db.prepare(
        `UPDATE user_settings SET ${fields.join(', ')} WHERE user_id = ?`
      ).run(...params);
    }
  }

  const updated = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  return c.json({ code: 0, data: updated });
});

export default app;
