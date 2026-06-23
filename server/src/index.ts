import 'dotenv/config';
import { Hono } from 'hono';
import type { AppEnv } from './types.js';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { serve } from '@hono/node-server';
import db, { initDatabase } from './db.js';
import { authMiddleware, authOrServiceMiddleware, registerUser, loginUser, wechatLogin, generateToken } from './auth.js';
import { initScheduler, getSchedulerStatus, triggerAutoCheck, triggerEmailReport } from './scheduler.js';
import { validateBody, loginSchema, registerSchema } from './validate.js';
import applicationRoutes from './routes/application.js';
import eventRoutes from './routes/event.js';
import reminderRoutes from './routes/reminder.js';
import settingsRoutes from './routes/settings.js';
import statsRoutes from './routes/stats.js';
import trackingRoutes, { createWorkerCallbackRoute } from './routes/tracking.js';
import pushLogRoutes from './routes/pushLog.js';
import aiRoutes from './routes/ai.js';
import backupRoutes from './routes/backup.js';
import emailRoutes from './routes/email.js';
import autoCheckRoutes from './routes/autoCheck.js';
import syncRoutes from './routes/sync.js';
import resumeRoutes from './routes/resume.js';
import formTemplateRoutes from './routes/formTemplate.js';

const app = new Hono<AppEnv>();

// CORS 白名单
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');

// Rate Limiting — 基于 SQLite，支持多实例和重启持久化
// 安全：用事务包裹读写，防止并发请求绕过限流
const rateLimitCheck = db.transaction((key: string, limit: number, windowMs: number): boolean => {
  const now = Date.now();
  const resetAt = now + windowMs;

  const entry = db.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').get(key) as any;

  if (!entry || now > entry.reset_at) {
    db.prepare('INSERT OR REPLACE INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)').run(key, resetAt);
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(key);
  return true;
});

function getRateLimit(key: string, limit: number, windowMs: number): boolean {
  return rateLimitCheck(key, limit, windowMs);
}

// 每分钟清理过期的 rate limit 记录
setInterval(() => {
  db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').run(Date.now());
}, 60000);

// 全局错误处理器 — 防止堆栈信息泄露
app.onError((err, c) => {
  console.error(`[Error] ${c.req.method} ${c.req.path}:`, err);
  return c.json({ code: 500, msg: '服务器内部错误' }, 500);
});

// 安全响应头（必须在最前面，确保所有响应都包含安全头）
app.use('*', secureHeaders());

// Middleware
app.use('*', cors({
  origin: (origin) => {
    // 允许无 origin（如 curl、扩展请求）
    if (!origin) return origin;
    // 允许 chrome-extension 和 moz-extension
    if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
      return origin;
    }
    // 检查白名单
    if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
      return origin;
    }
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use('*', logger());

// Rate limiting 中间件
// 安全：取 X-Forwarded-For 第一个 IP（由可信反向代理设置），
// 结合 User-Agent 增大伪造成本
app.use('*', async (c, next) => {
  const path = c.req.path;
  const xff = c.req.header('x-forwarded-for') || '';
  const ip = xff.split(',')[0].trim() || 'unknown';
  const ua = c.req.header('user-agent') || '';
  const key = `${ip}:${path}:${ua.substring(0, 50)}`;

  // 登录接口：5次/分钟
  if (path === '/api/auth/login') {
    if (!getRateLimit(key, 5, 60000)) {
      return c.json({ code: 429, msg: '请求过于频繁，请稍后再试' }, 429);
    }
  }
  // 注册接口：3次/分钟
  else if (path === '/api/auth/register') {
    if (!getRateLimit(key, 3, 60000)) {
      return c.json({ code: 429, msg: '请求过于频繁，请稍后再试' }, 429);
    }
  }
  // 其他接口：100次/分钟
  else if (path.startsWith('/api/')) {
    if (!getRateLimit(key, 100, 60000)) {
      return c.json({ code: 429, msg: '请求过于频繁，请稍后再试' }, 429);
    }
  }

  await next();
});

// Health check
app.get('/', (c) => {
  return c.json({ name: 'ApplyRadar API', version: '1.0.0', status: 'ok' });
});

// Public routes
app.post('/api/auth/register', validateBody(registerSchema), async (c) => {
  try {
    const body = c.get('validatedBody') as any;
    const { email, password, nickname } = body;
    const user = await registerUser(email, password, nickname);
    const token = generateToken(user.id);
    return c.json({ code: 0, data: { user, token } });
  } catch (e: any) {
    return c.json({ code: 400, msg: e.message }, 400);
  }
});

app.post('/api/auth/login', validateBody(loginSchema), async (c) => {
  try {
    const body = c.get('validatedBody') as any;
    const { email, password } = body;
    if (!email || !password) {
      return c.json({ code: 400, msg: '邮箱和密码不能为空' }, 400);
    }
    const user = await loginUser(email, password);
    const token = generateToken(user.id);
    return c.json({ code: 0, data: { user, token } });
  } catch (e: any) {
    return c.json({ code: 400, msg: e.message }, 400);
  }
});

// WeChat mini program login (by openid directly)
app.post('/api/auth/wechat', async (c) => {
  try {
    const { openid, nickname } = await c.req.json();
    if (!openid) {
      return c.json({ code: 400, msg: 'openid 不能为空' }, 400);
    }
    const user = wechatLogin(openid, nickname);
    const token = generateToken(user.id);
    return c.json({ code: 0, data: { user, token } });
  } catch (e: any) {
    return c.json({ code: 400, msg: e.message }, 400);
  }
});

// WeChat mini program login (by wx.login code)
app.post('/api/auth/wechat-code', async (c) => {
  try {
    const { code, nickname } = await c.req.json();
    if (!code) {
      return c.json({ code: 400, msg: 'code 不能为空' }, 400);
    }

    const appId = process.env.WECHAT_APPID;
    const appSecret = process.env.WECHAT_APPSECRET;
    if (!appId || !appSecret) {
      return c.json({ code: 500, msg: '微信登录未配置' }, 500);
    }

    // Exchange code for openid via WeChat API
    const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;
    const wxRes = await fetch(wxUrl);
    const wxData = await wxRes.json() as any;

    if (wxData.errcode) {
      return c.json({ code: 400, msg: `微信登录失败: ${wxData.errmsg}` }, 400);
    }

    const user = wechatLogin(wxData.openid, nickname);
    const token = generateToken(user.id);
    return c.json({ code: 0, data: { user, token, openid: wxData.openid } });
  } catch (e: any) {
    return c.json({ code: 400, msg: e.message }, 400);
  }
});

// Protected routes - require auth
app.use('/api/applications/*', authMiddleware);
app.use('/api/events/*', authMiddleware);
app.use('/api/reminders/*', authMiddleware);
app.use('/api/settings/*', authMiddleware);
app.use('/api/stats/*', authMiddleware);

// Worker 回调路由：必须在 tracking 通用 middleware 之前注册，
// 否则 authMiddleware 会先拦截（不支持 service token）
app.post('/api/tracking/:id/runs', authOrServiceMiddleware, createWorkerCallbackRoute());

app.use('/api/tracking/*', authMiddleware);
app.use('/api/push-logs/*', authMiddleware);
app.use('/api/ai/*', authMiddleware);
app.use('/api/backup/*', authMiddleware);
app.use('/api/email/*', authMiddleware);
app.use('/api/auto-check/*', authMiddleware);
app.use('/api/sync/*', authMiddleware);
app.use('/api/resumes/*', authMiddleware);
app.use('/api/form-templates/*', authMiddleware);

app.route('/api/applications', applicationRoutes);
app.route('/api/events', eventRoutes);
app.route('/api/reminders', reminderRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/stats', statsRoutes);
app.route('/api/tracking', trackingRoutes);
app.route('/api/push-logs', pushLogRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/backup', backupRoutes);
app.route('/api/email', emailRoutes);
app.route('/api/auto-check', autoCheckRoutes);
app.route('/api/sync', syncRoutes);
app.route('/api/resumes', resumeRoutes);
app.route('/api/form-templates', formTemplateRoutes);

// Scheduler status and manual triggers
app.get('/api/scheduler/status', authMiddleware, (c) => {
  const status = getSchedulerStatus();
  return c.json({ code: 0, data: status });
});

app.post('/api/scheduler/auto-check', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const result = await triggerAutoCheck(userId);
  return c.json({ code: 0, data: result });
});

app.post('/api/scheduler/email-report', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const result = await triggerEmailReport(userId);
  return c.json({ code: 0, data: result });
});

// Init database and start server
initDatabase();

// Initialize scheduler
initScheduler();

const port = parseInt(process.env.PORT || '3000');
const host = process.env.HOST || '0.0.0.0';

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`ApplyRadar server running at http://${host}:${port}`);
});
