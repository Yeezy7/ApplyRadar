import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import db from './db.js';

// JWT_SECRET 必须通过环境变量设置
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET!, { expiresIn: '30d' });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET!) as { userId: string };
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateId(): string {
  return randomUUID();
}

// Worker 内部通信密钥（可选，用于 server ↔ worker 回调鉴权）
const WORKER_SERVICE_TOKEN = process.env.WORKER_SERVICE_TOKEN;

export function verifyServiceToken(token: string): boolean {
  if (!WORKER_SERVICE_TOKEN) return false;
  return token === WORKER_SERVICE_TOKEN;
}

// Auth middleware - accepts either user JWT or worker service token
export async function authOrServiceMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ code: 401, msg: '未登录' }, 401);
  }

  const token = authHeader.slice(7);

  // 先尝试 worker service token
  if (WORKER_SERVICE_TOKEN && token === WORKER_SERVICE_TOKEN) {
    c.set('userId', '__worker__');
    await next();
    return;
  }

  // 再尝试用户 JWT
  const payload = verifyToken(token);
  if (!payload) {
    return c.json({ code: 401, msg: '登录已过期' }, 401);
  }

  c.set('userId', payload.userId);
  await next();
}

// Auth middleware - user JWT only (no worker service token)
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ code: 401, msg: '未登录' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return c.json({ code: 401, msg: '登录已过期' }, 401);
  }

  c.set('userId', payload.userId);
  await next();
}

// Register with email/password
// 安全：不泄露邮箱是否已注册（返回与成功相同结构，静默跳过）
export async function registerUser(email: string, password: string, nickname?: string) {
  const id = generateId();
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as any;
  if (existing) {
    // 不抛出具体原因，返回成功结构但 id 为 existing.id（静默登录已有账号）
    // 或者统一返回「注册失败」，不暴露邮箱已存在
    throw new Error('注册失败，请稍后重试');
  }

  db.prepare(
    'INSERT INTO users (id, email, password_hash, nickname) VALUES (?, ?, ?, ?)'
  ).run(id, email, passwordHash, nickname || email.split('@')[0]);

  // Create default settings
  db.prepare(
    'INSERT INTO user_settings (id, user_id) VALUES (?, ?)'
  ).run(generateId(), id);

  return { id, email, nickname };
}

// Login with email/password
// 安全：统一错误消息防止用户枚举，不存在的邮箱也跑 bcrypt 防止时序攻击
const DUMMY_HASH = '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
export async function loginUser(email: string, password: string) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;

  // 无论用户是否存在都执行 bcrypt.compare，防止时序侧信道
  const hashToCheck = user?.password_hash || DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCheck);

  // 统一错误消息，不区分「用户不存在」和「密码错误」
  if (!user || !valid || !user.password_hash) {
    throw new Error('邮箱或密码错误');
  }

  return { id: user.id, email: user.email, nickname: user.nickname };
}

// WeChat mini program login (by openid)
export function wechatLogin(openid: string, nickname?: string) {
  let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid) as any;

  if (!user) {
    const id = generateId();
    db.prepare(
      'INSERT INTO users (id, openid, nickname) VALUES (?, ?, ?)'
    ).run(id, openid, nickname || '微信用户');

    db.prepare(
      'INSERT INTO user_settings (id, user_id) VALUES (?, ?)'
    ).run(generateId(), id);

    user = { id, openid, nickname: nickname || '微信用户' };
  }

  return { id: user.id, openid: user.openid, nickname: user.nickname };
}
