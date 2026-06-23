import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';
import { generateId } from '../auth.js';
import { validateBody } from '../validate.js';
import { z } from 'zod';

const formTemplateSchema = z.object({
  domain: z.string().min(1).max(200),
  site_name: z.string().max(200).optional(),
  field_mappings: z.record(z.string(), z.string()),
  is_ai_generated: z.number().optional(),
  confidence: z.number().optional(),
});

function parseJson(v: any): any {
  if (!v) return {};
  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
}

const app = new Hono<AppEnv>();

// List form templates
app.get('/', (c) => {
  const userId = c.get('userId');
  const domain = c.req.query('domain');

  let sql = 'SELECT * FROM form_templates WHERE user_id = ?';
  const params: any[] = [userId];

  if (domain) {
    sql += ' AND domain = ?';
    params.push(domain);
  }

  sql += ' ORDER BY updated_at DESC';

  const rows = db.prepare(sql).all(...params) as any[];
  return c.json({
    code: 0,
    data: rows.map((r) => ({
      ...r,
      field_mappings: parseJson(r.field_mappings),
    })),
  });
});

// Get form template by domain
app.get('/by-domain/:domain', (c) => {
  const userId = c.get('userId');
  const domain = c.req.param('domain');

  const row = db.prepare(
    'SELECT * FROM form_templates WHERE user_id = ? AND domain = ? ORDER BY updated_at DESC LIMIT 1'
  ).get(userId, domain) as any | undefined;

  if (!row) {
    return c.json({ code: 404, msg: '未找到模板' }, 404);
  }

  return c.json({
    code: 0,
    data: { ...row, field_mappings: parseJson(row.field_mappings) },
  });
});

// Create or update form template
app.post('/', validateBody(formTemplateSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.get('validatedBody') as any;

  // Check if template already exists for this domain
  const existing = db.prepare(
    'SELECT id FROM form_templates WHERE user_id = ? AND domain = ?'
  ).get(userId, body.domain) as any | undefined;

  if (existing) {
    // Update
    db.prepare(
      `UPDATE form_templates SET
        site_name = COALESCE(?, site_name),
        field_mappings = ?,
        is_ai_generated = COALESCE(?, is_ai_generated),
        confidence = COALESCE(?, confidence),
        updated_at = datetime('now')
      WHERE id = ?`
    ).run(
      body.site_name || null,
      JSON.stringify(body.field_mappings),
      body.is_ai_generated ?? null,
      body.confidence ?? null,
      existing.id,
    );

    const updated = db.prepare('SELECT * FROM form_templates WHERE id = ?').get(existing.id) as any;
    return c.json({
      code: 0,
      data: { ...updated, field_mappings: parseJson(updated?.field_mappings) },
    });
  }

  // Create
  const id = generateId();
  db.prepare(
    `INSERT INTO form_templates (id, user_id, domain, site_name, field_mappings, is_ai_generated, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(id, userId, body.domain, body.site_name || null, JSON.stringify(body.field_mappings), body.is_ai_generated || 0, body.confidence || null);

  const created = db.prepare('SELECT * FROM form_templates WHERE id = ?').get(id) as any;
  return c.json({
    code: 0,
    data: { ...created, field_mappings: parseJson(created?.field_mappings) },
  }, 201);
});

// Delete form template
app.delete('/:id', (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const result = db.prepare('DELETE FROM form_templates WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) {
    return c.json({ code: 404, msg: '模板不存在' }, 404);
  }

  return c.json({ code: 0, msg: '已删除' });
});

export default app;
