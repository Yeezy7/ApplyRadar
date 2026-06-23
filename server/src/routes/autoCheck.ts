import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';
import { generateId } from '../auth.js';
import { addCheckJob, addBatchCheckJobs } from '../queue.js';

// Worker service token
const WORKER_SERVICE_TOKEN = process.env.WORKER_SERVICE_TOKEN || '';

const app = new Hono<AppEnv>();

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
      isRunning: false,
      lastRunAt: lastRun?.created_at || null,
      nextRunAt,
      lastResult: lastRun?.body || null,
    },
  });
});

// 手动触发自动检查（通过队列）
app.post('/run', async (c) => {
  const userId = c.get('userId');
  // Worker 回调使用 service token，不再传递用户 JWT
  const token = WORKER_SERVICE_TOKEN;

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
        queued: 0,
      },
    });
  }

  // 添加到队列
  const queued = await addBatchCheckJobs(targets, token);

  // 记录推送日志
  const logId = generateId();
  const resultMsg = `已将 ${queued} 个检查任务加入队列`;
  db.prepare(
    `INSERT INTO push_logs (id, user_id, push_type, title, body, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(logId, userId, 'auto_check', '检查任务已入队', resultMsg, 'sent');

  return c.json({
    code: 0,
    data: {
      total: targets.length,
      success: 0,
      failed: 0,
      statusChanges: 0,
      loginIssues: 0,
      queued,
    },
  });
});

// 检查单个目标（通过队列）
app.post('/check/:targetId', async (c) => {
  const userId = c.get('userId');
  const targetId = c.req.param('targetId');
  const token = WORKER_SERVICE_TOKEN;

  const target = db.prepare(
    'SELECT * FROM tracking_targets WHERE id = ? AND user_id = ?'
  ).get(targetId, userId) as any;

  if (!target) {
    return c.json({ code: 404, msg: '追踪目标不存在' }, 404);
  }

  const added = await addCheckJob(target, token);

  if (!added) {
    return c.json({ code: 500, msg: '无法添加检查任务，队列可能不可用' }, 500);
  }

  return c.json({
    code: 0,
    msg: '检查任务已加入队列',
    data: { targetId, queued: true },
  });
});

export default app;
