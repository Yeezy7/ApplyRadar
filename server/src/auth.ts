import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'applyradar-dev-secret-change-in-production';

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
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

// Auth middleware - extracts userId from token
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
export function registerUser(email: string, password: string, nickname?: string) {
  const id = generateId();
  const passwordHash = bcrypt.hashSync(password, 10);

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    throw new Error('邮箱已注册');
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
export function loginUser(email: string, password: string) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!user) {
    throw new Error('用户不存在');
  }

  if (!user.password_hash) {
    throw new Error('该账号未设置密码，请使用微信登录');
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    throw new Error('密码错误');
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
