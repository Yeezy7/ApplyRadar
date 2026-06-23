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
  const domain = c.req.query('domain');

  let sql = 'SELECT * FROM tracking_targets WHERE user_id = ?';
  const params: any[] = [userId];

  if (applicationId) {
    sql += ' AND application_id = ?';
    params.push(applicationId);
  }

  if (domain) {
    sql += ' AND domain = ?';
    params.push(domain);
  }

  sql += ' ORDER BY created_at DESC';

  const rows = db.prepare(sql).all(...params);
  return c.json({ code: 0, data: rows });
});

// Get all unique domains with tracking targets
app.get('/domains', (c) => {
  const userId = c.get('userId');
  const rows = db.prepare(
    'SELECT DISTINCT domain FROM tracking_targets WHERE user_id = ?'
  ).all(userId) as any[];
  return c.json({ code: 0, data: rows.map(r => r.domain) });
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

// Update session cookies for a target
app.put('/:id/cookies', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = db.prepare('SELECT * FROM tracking_targets WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) {
    return c.json({ code: 404, msg: '追踪目标不存在' }, 404);
  }

  // cookies 可以是 JSON 字符串或对象
  const cookies = typeof body.cookies === 'string' ? body.cookies : JSON.stringify(body.cookies || []);

  db.prepare(
    "UPDATE tracking_targets SET session_cookies = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(cookies, id, userId);

  return c.json({ code: 0, msg: 'Cookie 已更新' });
});

// Update login state only
app.put('/:id/login-state', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = db.prepare('SELECT * FROM tracking_targets WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) {
    return c.json({ code: 404, msg: '追踪目标不存在' }, 404);
  }

  const { login_state } = body;
  if (!login_state) {
    return c.json({ code: 400, msg: 'login_state 不能为空' }, 400);
  }

  db.prepare(
    "UPDATE tracking_targets SET login_state = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(login_state, id, userId);

  return c.json({ code: 0, msg: '登录状态已更新' });
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

// Create tracking run (for manual check or worker callback)
app.post('/:id/runs', async (c) => {
  return handleCreateRun(c.get('userId'), c.req.param('id'), await parseBody(c));
});

export default app;

// ---------- Worker 回调专用路由 ----------
// 允许 worker service token 鉴权，不强制 userId 匹配
function parseBody(c: any) {
  try {
    const text = c.req.text ? '' : '';
    // Hono c.req.json() can only be called once, use raw text
    return c.req.json?.() || {};
  } catch {
    return {};
  }
}

async function handleCreateRun(userId: string, targetId: string, body: any) {
  const isWorker = userId === '__worker__';

  // Verify target exists and belongs to user (skip for worker)
  const target = db.prepare(
    isWorker
      ? 'SELECT * FROM tracking_targets WHERE id = ?'
      : 'SELECT * FROM tracking_targets WHERE id = ? AND user_id = ?'
  ).get(targetId, ...(!isWorker ? [userId] : [])) as any;
  if (!target) {
    return new Response(JSON.stringify({ code: 404, msg: '追踪目标不存在' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // For worker calls, use the target's actual user_id
  const effectiveUserId = isWorker ? target.user_id : userId;

  const id = generateId();
  const now = new Date().toISOString();

  const run = {
    id,
    user_id: effectiveUserId,
    target_id: targetId,
    started_at: now,
    finished_at: now,
    status: body.status || 'success',
    raw_status: body.raw_status || null,
    normalized_status: body.normalized_status || null,
    confidence: body.confidence ?? 0,
    login_state: body.login_state || 'unknown',
    error_message: body.error_message || null,
    page_hash: body.page_hash || null,
    ai_used: body.ai_used ?? 0,
    created_at: now,
  };

  db.prepare(
    `INSERT INTO tracking_runs (id, user_id, target_id, started_at, finished_at, status, raw_status, normalized_status, confidence, login_state, error_message, page_hash, ai_used, created_at)
     VALUES (@id, @user_id, @target_id, @started_at, @finished_at, @status, @raw_status, @normalized_status, @confidence, @login_state, @error_message, @page_hash, @ai_used, @created_at)`
  ).run(run);

  // Update target with check results
  const updates = ["last_checked_at = ?", "updated_at = datetime('now')"];
  const params: any[] = [now];

  if (body.login_state) {
    updates.push("login_state = ?");
    params.push(body.login_state);
  }
  if (body.page_hash) {
    updates.push("last_text_hash = ?");
    params.push(body.page_hash);
  }
  if (body.status === 'success' && !body.error_message) {
    updates.push("last_success_at = ?");
    params.push(now);
  }
  if (body.error_message) {
    updates.push("last_error = ?");
    params.push(body.error_message);
  } else {
    // 成功时清除之前的错误
    updates.push("last_error = ?");
    params.push(null);
  }

  params.push(targetId);
  db.prepare(
    `UPDATE tracking_targets SET ${updates.join(', ')} WHERE id = ?`
  ).run(...params);

  return new Response(JSON.stringify({ code: 0, data: run }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Factory: standalone handler for worker callback (bypasses Hono app context)
export function createWorkerCallbackRoute() {
  return async (c: any) => {
    const targetId = c.req.param('id');
    let body: any = {};
    try {
      const raw = await c.req.text();
      if (raw) body = JSON.parse(raw);
    } catch {
      body = {};
    }
    return handleCreateRun(c.get('userId'), targetId, body);
  };
}
