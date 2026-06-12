import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';

const app = new Hono<AppEnv>();

const ACTIVE_STATUSES = ['applied', 'received', 'under_review', 'assessment', 'interview', 'final_interview'];

// Prepared statements for better performance
const stmtTotal = db.prepare('SELECT COUNT(*) as count FROM applications WHERE user_id = ?');
const stmtActive = db.prepare(`SELECT COUNT(*) as count FROM applications WHERE user_id = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`);
const stmtThisWeek = db.prepare("SELECT COUNT(*) as count FROM applications WHERE user_id = ? AND created_at >= datetime('now', '-7 days')");
const stmtOffers = db.prepare("SELECT COUNT(*) as count FROM applications WHERE user_id = ? AND status = 'offer'");
const stmtPendingReminders = db.prepare('SELECT COUNT(*) as count FROM reminders WHERE user_id = ? AND is_done = 0');
const stmtStatusCounts = db.prepare('SELECT status, COUNT(*) as count FROM applications WHERE user_id = ? GROUP BY status');
const stmtRecentApps = db.prepare('SELECT * FROM applications WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5');

// Get dashboard stats
app.get('/', (c) => {
  const userId = c.get('userId');

  // 使用 prepared statements 和 SQL 聚合
  const total = (stmtTotal.get(userId) as any).count;
  const active = (stmtActive.get(userId, ...ACTIVE_STATUSES) as any).count;
  const thisWeek = (stmtThisWeek.get(userId) as any).count;
  const offers = (stmtOffers.get(userId) as any).count;
  const pendingReminders = (stmtPendingReminders.get(userId) as any).count;

  // 使用 GROUP BY 获取状态分布
  const statusRows = stmtStatusCounts.all(userId) as any[];
  const statusCounts: Record<string, number> = {};
  for (const row of statusRows) {
    statusCounts[row.status] = row.count;
  }

  // 获取最近 5 条记录
  const recentApps = stmtRecentApps.all(userId);

  return c.json({
    code: 0,
    data: {
      total,
      active,
      thisWeek,
      offers,
      pendingReminders,
      statusCounts,
      recentApps,
    },
  });
});

export default app;
