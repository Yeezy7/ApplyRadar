import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { initDatabase } from './db.js';
import { authMiddleware, registerUser, loginUser, wechatLogin, generateToken } from './auth.js';
import applicationRoutes from './routes/application.js';
import eventRoutes from './routes/event.js';
import reminderRoutes from './routes/reminder.js';
import settingsRoutes from './routes/settings.js';
import statsRoutes from './routes/stats.js';

const app = new Hono();

// Middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));
app.use('*', logger());

// Health check
app.get('/', (c) => {
  return c.json({ name: 'ApplyRadar API', version: '1.0.0', status: 'ok' });
});

// Public routes
app.post('/api/auth/register', async (c) => {
  try {
    const { email, password, nickname } = await c.req.json();
    if (!email || !password) {
      return c.json({ code: 400, msg: '邮箱和密码不能为空' }, 400);
    }
    const user = registerUser(email, password, nickname);
    const token = generateToken(user.id);
    return c.json({ code: 0, data: { user, token } });
  } catch (e: any) {
    return c.json({ code: 400, msg: e.message }, 400);
  }
});

app.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ code: 400, msg: '邮箱和密码不能为空' }, 400);
    }
    const user = loginUser(email, password);
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

app.route('/api/applications', applicationRoutes);
app.route('/api/events', eventRoutes);
app.route('/api/reminders', reminderRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/stats', statsRoutes);

// Init database and start server
initDatabase();

const port = parseInt(process.env.PORT || '3000');
const host = process.env.HOST || '0.0.0.0';

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`ApplyRadar server running at http://${host}:${port}`);
});
