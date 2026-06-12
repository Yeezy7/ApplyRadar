import { Hono } from 'hono';
import db from '../db.js';
import { generateId } from '../auth.js';

const app = new Hono();

// List reminders
app.get('/', (c) => {
  const userId = c.get('userId');
  const includeDone = c.req.query('include_done') === 'true';
  const applicationId = c.req.query('application_id');

  let sql = 'SELECT * FROM reminders WHERE user_id = ?';
  const params: any[] = [userId];

  if (!includeDone) {
    sql += ' AND is_done = 0';
  }

  if (applicationId) {
    sql += ' AND application_id = ?';
    params.push(applicationId);
  }

  sql += ' ORDER BY remind_at ASC LIMIT 200';

  const rows = db.prepare(sql).all(...params);
  return c.json({ code: 0, data: rows });
});

// Create reminder
app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const id = generateId();
  const now = new Date().toISOString();

  const reminder = {
    id,
    user_id: userId,
    application_id: body.application_id || null,
    title: body.title,
    content: body.content || '',
    reminder_type: body.reminder_type || 'custom',
    remind_at: body.remind_at,
    is_done: 0,
    notified_at: null,
    created_by: body.created_by || 'user',
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `INSERT INTO reminders (id, user_id, application_id, title, content, reminder_type, remind_at, is_done, notified_at, created_by, created_at, updated_at)
     VALUES (@id, @user_id, @application_id, @title, @content, @reminder_type, @remind_at, @is_done, @notified_at, @created_by, @created_at, @updated_at)`
  ).run(reminder);

  return c.json({ code: 0, data: reminder }, 201);
});

// Update reminder
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) {
    return c.json({ code: 404, msg: '提醒不存在' }, 404);
  }

  const fields: string[] = [];
  const params: any[] = [];

  const allowedFields = ['title', 'content', 'reminder_type', 'remind_at', 'application_id'];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      fields.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  if (fields.length === 0) {
    return c.json({ code: 400, msg: '没有要更新的字段' }, 400);
  }

  fields.push("updated_at = datetime('now')");
  params.push(id, userId);

  db.prepare(
    `UPDATE reminders SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
  ).run(...params);

  const updated = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
  return c.json({ code: 0, data: updated });
});

// Mark reminder done
app.patch('/:id/done', (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const result = db.prepare(
    "UPDATE reminders SET is_done = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(id, userId);

  if (result.changes === 0) {
    return c.json({ code: 404, msg: '提醒不存在' }, 404);
  }

  return c.json({ code: 0, msg: '已标记完成' });
});

// Delete reminder
app.delete('/:id', (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const result = db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) {
    return c.json({ code: 404, msg: '提醒不存在' }, 404);
  }

  return c.json({ code: 0, msg: '已删除' });
});

export default app;
