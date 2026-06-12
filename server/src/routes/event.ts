import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';
import { generateId } from '../auth.js';
import { z } from 'zod';
import { validateBody } from '../validate.js';

const eventSchema = z.object({
  application_id: z.string().uuid(),
  event_type: z.enum(['status_change', 'login_expired', 'check_success', 'check_failed', 'note_added', 'manual']),
  title: z.string().min(1).max(200),
  content: z.string().max(2000).optional(),
  old_status: z.string().max(50).optional(),
  new_status: z.string().max(50).optional(),
  event_time: z.string().optional(),
});

const app = new Hono<AppEnv>();

// List events by application
app.get('/', (c) => {
  const userId = c.get('userId');
  const applicationId = c.req.query('application_id');
  const limit = parseInt(c.req.query('limit') || '50');

  if (applicationId) {
    const rows = db.prepare(
      'SELECT * FROM application_events WHERE user_id = ? AND application_id = ? ORDER BY event_time DESC LIMIT ?'
    ).all(userId, applicationId, limit);
    return c.json({ code: 0, data: rows });
  }

  const rows = db.prepare(
    'SELECT * FROM application_events WHERE user_id = ? ORDER BY event_time DESC LIMIT ?'
  ).all(userId, limit);
  return c.json({ code: 0, data: rows });
});

// Create event
app.post('/', validateBody(eventSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.get('validatedBody');

  const id = generateId();
  const now = new Date().toISOString();

  const event = {
    id,
    user_id: userId,
    application_id: body.application_id,
    event_type: body.event_type,
    title: body.title,
    content: body.content || '',
    old_status: body.old_status || null,
    new_status: body.new_status || null,
    handled_at: null,
    handled_action: null,
    event_time: body.event_time || now,
    created_at: now,
  };

  db.prepare(
    `INSERT INTO application_events (id, user_id, application_id, event_type, title, content, old_status, new_status, handled_at, handled_action, event_time, created_at)
     VALUES (@id, @user_id, @application_id, @event_type, @title, @content, @old_status, @new_status, @handled_at, @handled_action, @event_time, @created_at)`
  ).run(event);

  return c.json({ code: 0, data: event }, 201);
});

export default app;
