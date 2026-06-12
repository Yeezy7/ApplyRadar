import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';
import { generateId } from '../auth.js';
import { z } from 'zod';
import { validateBody } from '../validate.js';

const trackingTargetSchema = z.object({
  application_id: z.string().uuid(),
  domain: z.string().min(1).max(200),
  status_url: z.string().url().max(500),
  ats_type: z.string().max(50).optional(),
  enabled: z.number().int().min(0).max(1).optional(),
  check_frequency: z.enum(['manual', 'daily', 'every_12h', 'every_6h']).optional(),
});

const app = new Hono<AppEnv>();

// List tracking targets
app.get('/', (c) => {
  const userId = c.get('userId');
  const applicationId = c.req.query('application_id');

  let sql = 'SELECT * FROM tracking_targets WHERE user_id = ?';
  const params: any[] = [userId];

  if (applicationId) {
    sql += ' AND application_id = ?';
    params.push(applicationId);
  }

  sql += ' ORDER BY created_at DESC';

  const rows = db.prepare(sql).all(...params);
  return c.json({ code: 0, data: rows });
});

// Get single tracking target
app.get('/:id', (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const row = db.prepare('SELECT * FROM tracking_targets WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) {
    return c.json({ code: 404, msg: '追踪目标不存在' }, 404);
  }

  return c.json({ code: 0, data: row });
});

// Create tracking target
app.post('/', validateBody(trackingTargetSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.get('validatedBody');

  const id = generateId();
  const now = new Date().toISOString();

  const target = {
    id,
    user_id: userId,
    application_id: body.application_id,
    domain: body.domain,
    status_url: body.status_url,
    ats_type: body.ats_type || 'generic',
    enabled: body.enabled !== undefined ? body.enabled : 1,
    check_frequency: body.check_frequency || 'daily',
    current_status: null,
    last_status: null,
    login_state: 'unknown',
    last_checked_at: null,
    last_success_at: null,
    last_error: null,
    last_text_hash: null,
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `INSERT INTO tracking_targets (id, user_id, application_id, domain, status_url, ats_type, enabled, check_frequency, current_status, last_status, login_state, last_checked_at, last_success_at, last_error, last_text_hash, created_at, updated_at)
     VALUES (@id, @user_id, @application_id, @domain, @status_url, @ats_type, @enabled, @check_frequency, @current_status, @last_status, @login_state, @last_checked_at, @last_success_at, @last_error, @last_text_hash, @created_at, @updated_at)`
  ).run(target);

  return c.json({ code: 0, data: target }, 201);
});

// Update tracking target
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = db.prepare('SELECT * FROM tracking_targets WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) {
    return c.json({ code: 404, msg: '追踪目标不存在' }, 404);
  }

  const fields: string[] = [];
  const params: any[] = [];

  const allowedFields = ['domain', 'status_url', 'ats_type', 'enabled', 'check_frequency', 'current_status', 'last_status', 'login_state', 'last_checked_at', 'last_success_at', 'last_error', 'last_text_hash'];

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
    `UPDATE tracking_targets SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
  ).run(...params);

  const updated = db.prepare('SELECT * FROM tracking_targets WHERE id = ?').get(id);
  return c.json({ code: 0, data: updated });
});

// Delete tracking target
app.delete('/:id', (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const result = db.prepare('DELETE FROM tracking_targets WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) {
    return c.json({ code: 404, msg: '追踪目标不存在' }, 404);
  }

  return c.json({ code: 0, msg: '已删除' });
});

// List tracking runs for a target
app.get('/:id/runs', (c) => {
  const userId = c.get('userId');
  const targetId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '50');

  // Verify target belongs to user
  const target = db.prepare('SELECT id FROM tracking_targets WHERE id = ? AND user_id = ?').get(targetId, userId);
  if (!target) {
    return c.json({ code: 404, msg: '追踪目标不存在' }, 404);
  }

  const rows = db.prepare(
    'SELECT * FROM tracking_runs WHERE target_id = ? ORDER BY started_at DESC LIMIT ?'
  ).all(targetId, limit);

  return c.json({ code: 0, data: rows });
});

// Create tracking run (for manual check)
app.post('/:id/runs', async (c) => {
  const userId = c.get('userId');
  const targetId = c.req.param('id');

  // Verify target belongs to user
  const target = db.prepare('SELECT * FROM tracking_targets WHERE id = ? AND user_id = ?').get(targetId, userId) as any;
  if (!target) {
    return c.json({ code: 404, msg: '追踪目标不存在' }, 404);
  }

  const id = generateId();
  const now = new Date().toISOString();

  const run = {
    id,
    user_id: userId,
    target_id: targetId,
    started_at: now,
    finished_at: now,
    status: 'success',
    raw_status: target.current_status,
    normalized_status: target.current_status,
    confidence: 1.0,
    login_state: target.login_state,
    error_message: null,
    page_hash: null,
    ai_used: 0,
    created_at: now,
  };

  db.prepare(
    `INSERT INTO tracking_runs (id, user_id, target_id, started_at, finished_at, status, raw_status, normalized_status, confidence, login_state, error_message, page_hash, ai_used, created_at)
     VALUES (@id, @user_id, @target_id, @started_at, @finished_at, @status, @raw_status, @normalized_status, @confidence, @login_state, @error_message, @page_hash, @ai_used, @created_at)`
  ).run(run);

  // Update target last_checked_at
  db.prepare(
    "UPDATE tracking_targets SET last_checked_at = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(now, targetId);

  return c.json({ code: 0, data: run }, 201);
});

export default app;
