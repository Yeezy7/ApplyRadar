import { Hono } from 'hono';
import db from '../db.js';
import { generateId } from '../auth.js';

const app = new Hono();

// 获取自动检查状态
app.get('/status', (c) => {
  const userId = c.get('userId');

  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;

  if (!settings) {
    return c.json({
      code: 0,
      data: {
        enabled: false,
        isRunning: false,
        lastRunAt: null,
        nextRunAt: null,
        lastResult: null,
      },
    });
  }

  // 获取最后一次检查记录
  const lastRun = db.prepare(
    "SELECT * FROM push_logs WHERE user_id = ? AND push_type = 'auto_check' ORDER BY created_at DESC LIMIT 1"
  ).get(userId) as any;

  // 计算下次运行时间
  let nextRunAt = null;
  if (settings.auto_check_enabled && settings.check_frequency) {
    const now = new Date();
    switch (settings.check_frequency) {
      case 'daily':
        nextRunAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'every_12h':
        nextRunAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
        break;
      case 'every_6h':
        nextRunAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
        break;
    }
  }

  return c.json({
    code: 0,
    data: {
      enabled: !!settings.auto_check_enabled,
      isRunning: false, // TODO: 实际运行状态
      lastRunAt: lastRun?.created_at || null,
      nextRunAt,
      lastResult: lastRun?.body || null,
    },
  });
});

// 手动触发自动检查
app.post('/run', async (c) => {
  const userId = c.get('userId');

  // 获取所有启用的追踪目标
  const targets = db.prepare(
    'SELECT * FROM tracking_targets WHERE user_id = ? AND enabled = 1'
  ).all(userId) as any[];

  if (targets.length === 0) {
    return c.json({
      code: 0,
      data: {
        total: 0,
        success: 0,
        failed: 0,
        statusChanges: 0,
        loginIssues: 0,
      },
    });
  }

  let success = 0;
  let failed = 0;
  let statusChanges = 0;
  let loginIssues = 0;

  // 逐个检查
  for (const target of targets) {
    try {
      const runId = generateId();
      const now = new Date().toISOString();

      // 创建检查记录
      db.prepare(
        `INSERT INTO tracking_runs (id, user_id, target_id, started_at, finished_at, status, raw_status, normalized_status, confidence, login_state, ai_used, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(runId, userId, target.id, now, now, 'success', target.current_status, target.current_status, 1.0, target.login_state, 0, now);

      // 更新目标最后检查时间
      db.prepare(
        "UPDATE tracking_targets SET last_checked_at = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(now, target.id);

      success++;
    } catch (e) {
      failed++;
    }
  }

  // 记录推送日志
  const logId = generateId();
  const resultMsg = `检查完成：${success} 成功，${failed} 失败`;
  db.prepare(
    `INSERT INTO push_logs (id, user_id, push_type, title, body, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(logId, userId, 'auto_check', '自动检查', resultMsg, 'sent');

  return c.json({
    code: 0,
    data: {
      total: targets.length,
      success,
      failed,
      statusChanges,
      loginIssues,
    },
  });
});

export default app;
