import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';
import { generateId } from '../auth.js';

const app = new Hono<AppEnv>();

// List push logs
app.get('/', (c) => {
  const userId = c.get('userId');
  const pushType = c.req.query('type');
  const limit = parseInt(c.req.query('limit') || '100');

  let sql = 'SELECT * FROM push_logs WHERE user_id = ?';
  const params: any[] = [userId];

  if (pushType) {
    sql += ' AND push_type = ?';
    params.push(pushType);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  return c.json({ code: 0, data: rows });
});

// Create push log
app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const id = generateId();
  const now = new Date().toISOString();

  const log = {
    id,
    user_id: userId,
    push_type: body.push_type,
    title: body.title,
    body: body.body || '',
    status: body.status || 'sent',
    application_id: body.application_id || null,
    created_at: now,
  };

  db.prepare(
    `INSERT INTO push_logs (id, user_id, push_type, title, body, status, application_id, created_at)
     VALUES (@id, @user_id, @push_type, @title, @body, @status, @application_id, @created_at)`
  ).run(log);

  return c.json({ code: 0, data: log }, 201);
});

// Get push log stats
app.get('/stats', (c) => {
  const userId = c.get('userId');

  const stats = db.prepare(
    `SELECT push_type, COUNT(*) as count FROM push_logs WHERE user_id = ? GROUP BY push_type`
  ).all(userId);

  const total = db.prepare(
    'SELECT COUNT(*) as count FROM push_logs WHERE user_id = ?'
  ).get(userId) as any;

  return c.json({
    code: 0,
    data: {
      total: total.count,
      byType: stats,
    },
  });
});

export default app;
