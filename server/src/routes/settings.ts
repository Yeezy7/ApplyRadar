import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';
import { generateId } from '../auth.js';
import { validateBody, settingsSchema } from '../validate.js';

const app = new Hono<AppEnv>();

// 脱敏处理
function maskSensitive(value: string): string {
  if (!value || value.length <= 4) return '****';
  return '****' + value.slice(-4);
}

// Get settings
app.get('/', (c) => {
  const userId = c.get('userId');

  let settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;

  if (!settings) {
    const id = generateId();
    db.prepare('INSERT INTO user_settings (id, user_id) VALUES (?, ?)').run(id, userId);
    settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  }

  // 敏感信息脱敏
  const maskedSettings = {
    ...settings,
    api_key: settings.api_key ? maskSensitive(settings.api_key) : '',
    smtp_password: settings.smtp_password ? maskSensitive(settings.smtp_password) : '',
  };

  return c.json({ code: 0, data: maskedSettings });
});

// Save settings
app.put('/', validateBody(settingsSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.get('validatedBody');

  const existing = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);

  // 如果前端传来的值是脱敏的（****），则保留原值
  const getOriginalValue = (field: string, newValue: string | undefined) => {
    if (!newValue || newValue.startsWith('****')) {
      return existing ? (existing as any)[field] : '';
    }
    return newValue;
  };

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
      if ((body as any)[field] !== undefined) {
        if (field === 'notifications_enabled' || field === 'auto_check_enabled' || field === 'email_report_enabled') {
          fields.push(`${field} = ?`);
          params.push((body as any)[field] ? 1 : 0);
        } else if (field === 'api_key' || field === 'smtp_password') {
          // 处理敏感字段：如果是脱敏值则保留原值
          const value = getOriginalValue(field, (body as any)[field]);
          fields.push(`${field} = ?`);
          params.push(value);
        } else {
          fields.push(`${field} = ?`);
          params.push((body as any)[field]);
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

  const updated = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;
  // 返回时脱敏
  const maskedUpdated = {
    ...updated,
    api_key: updated.api_key ? maskSensitive(updated.api_key) : '',
    smtp_password: updated.smtp_password ? maskSensitive(updated.smtp_password) : '',
  };
  return c.json({ code: 0, data: maskedUpdated });
});

export default app;
