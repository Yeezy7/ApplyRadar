import { Hono } from 'hono';
import db from '../db.js';

const app = new Hono();

const ACTIVE_STATUSES = ['applied', 'received', 'under_review', 'assessment', 'interview', 'final_interview'];

// Get dashboard stats
app.get('/', (c) => {
  const userId = c.get('userId');

  // Get all applications
  const apps = db.prepare(
    'SELECT status, created_at, updated_at FROM applications WHERE user_id = ?'
  ).all(userId) as any[];

  // Get pending reminders count
  const reminderCount = db.prepare(
    'SELECT COUNT(*) as count FROM reminders WHERE user_id = ? AND is_done = 0'
  ).get(userId) as any;

  // Calculate stats
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let active = 0;
  let thisWeek = 0;
  let offers = 0;
  const statusCounts: Record<string, number> = {};

  for (const app of apps) {
    statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
    if (ACTIVE_STATUSES.includes(app.status)) active++;
    if (app.created_at >= weekAgo) thisWeek++;
    if (app.status === 'offer') offers++;
  }

  // Get recent 5 applications
  const recentApps = db.prepare(
    'SELECT * FROM applications WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5'
  ).all(userId);

  return c.json({
    code: 0,
    data: {
      total: apps.length,
      active,
      thisWeek,
      offers,
      pendingReminders: reminderCount.count,
      statusCounts,
      recentApps,
    },
  });
});

export default app;
