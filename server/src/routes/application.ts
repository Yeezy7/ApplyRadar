import { Hono } from 'hono';
import db from '../db.js';
import { generateId } from '../auth.js';
import type { Application } from '../types.js';

const app = new Hono();

// List applications
app.get('/', (c) => {
  const userId = c.get('userId');
  const search = c.req.query('search');
  const status = c.req.query('status');

  let sql = 'SELECT * FROM applications WHERE user_id = ?';
  const params: any[] = [userId];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (search) {
    sql += ' AND (company_name LIKE ? OR job_title LIKE ? OR location LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  sql += ' ORDER BY updated_at DESC LIMIT 200';

  const rows = db.prepare(sql).all(...params);
  return c.json({ code: 0, data: rows });
});

// Get single application
app.get('/:id', (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const row = db.prepare('SELECT * FROM applications WHERE id = ? AND user_id = ?').get(id, userId) as Application | undefined;
  if (!row) {
    return c.json({ code: 404, msg: '记录不存在' }, 404);
  }

  return c.json({ code: 0, data: row });
});

// Create application
app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const id = generateId();
  const now = new Date().toISOString();

  const app_data = {
    id,
    user_id: userId,
    company_name: body.company_name,
    job_title: body.job_title,
    location: body.location || '',
    salary_range: body.salary_range || '',
    job_url: body.job_url || '',
    status_url: body.status_url || '',
    source: body.source || 'manual',
    status: body.status || 'to_apply',
    priority: body.priority || 'medium',
    applied_at: body.applied_at || null,
    deadline_at: body.deadline_at || null,
    notes: body.notes || '',
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `INSERT INTO applications (id, user_id, company_name, job_title, location, salary_range, job_url, status_url, source, status, priority, applied_at, deadline_at, notes, created_at, updated_at)
     VALUES (@id, @user_id, @company_name, @job_title, @location, @salary_range, @job_url, @status_url, @source, @status, @priority, @applied_at, @deadline_at, @notes, @created_at, @updated_at)`
  ).run(app_data);

  return c.json({ code: 0, data: app_data }, 201);
});

// Update application
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = db.prepare('SELECT * FROM applications WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) {
    return c.json({ code: 404, msg: '记录不存在' }, 404);
  }

  const fields: string[] = [];
  const params: any[] = [];

  const allowedFields = ['company_name', 'job_title', 'location', 'salary_range', 'job_url', 'status_url', 'source', 'status', 'priority', 'applied_at', 'deadline_at', 'notes'];

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
    `UPDATE applications SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
  ).run(...params);

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  return c.json({ code: 0, data: updated });
});

// Delete application
app.delete('/:id', (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const result = db.prepare('DELETE FROM applications WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) {
    return c.json({ code: 404, msg: '记录不存在' }, 404);
  }

  return c.json({ code: 0, msg: '已删除' });
});

export default app;
