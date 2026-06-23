import { z } from 'zod';
import type { Context, Next } from 'hono';

// 通用验证 schema
export const emailSchema = z.string().email('邮箱格式不正确').max(255);
export const passwordSchema = z.string().min(6, '密码至少6位').max(128, '密码最多128位');
export const nicknameSchema = z.string().max(50).optional();

// 认证相关 schema
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '密码不能为空'),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  nickname: nicknameSchema,
});

// 应用记录 schema
export const applicationSchema = z.object({
  company_name: z.string().min(1).max(200),
  job_title: z.string().min(1).max(200),
  location: z.string().max(200).optional(),
  salary_range: z.string().max(100).optional(),
  job_url: z.string().url().max(500).optional().or(z.literal('')),
  status_url: z.string().url().max(500).optional().or(z.literal('')),
  source: z.enum(['official', 'email', 'referral', 'linkedin', 'boss', 'manual']).optional(),
  status: z.enum(['to_apply', 'applied', 'received', 'under_review', 'assessment', 'interview', 'final_interview', 'offer', 'rejected', 'withdrawn', 'unknown']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  applied_at: z.string().optional(),
  deadline_at: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

// 提醒 schema
export const reminderSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(2000).optional(),
  reminder_type: z.enum(['interview', 'assessment_deadline', 'offer_deadline', 'follow_up', 'document_required', 'custom']).optional(),
  remind_at: z.string().min(1),
  application_id: z.string().uuid().optional(),
});

// 设置 schema
export const settingsSchema = z.object({
  api_key: z.string().max(200).nullish(),
  api_base_url: z.string().url().max(500).nullish(),
  model: z.string().max(100).nullish(),
  check_frequency: z.enum(['manual', 'daily', 'every_12h', 'every_6h']).nullish(),
  notifications_enabled: z.union([z.boolean(), z.number()]).nullish(),
  auto_check_enabled: z.union([z.boolean(), z.number()]).nullish(),
  email_report_enabled: z.union([z.boolean(), z.number()]).nullish(),
  smtp_host: z.string().max(200).nullish(),
  smtp_port: z.string().max(10).nullish(),
  smtp_username: z.string().max(200).nullish(),
  smtp_password: z.string().max(200).nullish(),
  smtp_recipient: z.string().max(255).nullish(),
  email_report_time: z.string().max(10).nullish(),
});

// 验证中间件
export function validateBody(schema: z.ZodSchema) {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json();
      const result = schema.safeParse(body);

      if (!result.success) {
        const errors = result.error.issues.map((e: any) => e.message).join(', ');
        return c.json({ code: 400, msg: errors }, 400);
      }

      // 将验证后的数据存储到 context 中
      c.set('validatedBody', result.data);
      await next();
    } catch {
      return c.json({ code: 400, msg: '请求格式错误' }, 400);
    }
  };
}

// HTML 转义函数
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 备份导入 schema（包含 id 和时间戳，用于校验客户端传入的备份数据）
const VALID_STATUSES = ['to_apply', 'applied', 'received', 'under_review', 'assessment', 'interview', 'final_interview', 'offer', 'accepted', 'rejected', 'withdrawn', 'unknown'];
const VALID_SOURCES = ['official', 'email', 'referral', 'linkedin', 'boss', 'manual'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];
const VALID_EVENT_TYPES = ['status_change', 'note', 'interview', 'offer', 'rejected', 'other'];
const VALID_REMINDER_TYPES = ['interview', 'assessment_deadline', 'offer_deadline', 'follow_up', 'document_required', 'custom'];
const VALID_LOGIN_STATES = ['unknown', 'valid', 'expired', 'captcha_required', 'mfa_required', 'blocked'];

const backupAppSchema = z.object({
  id: z.string().min(1),
  company_name: z.string().min(1).max(200),
  job_title: z.string().min(1).max(200),
  location: z.string().max(200).nullish(),
  salary_range: z.string().max(100).nullish(),
  job_url: z.string().max(500).nullish(),
  status_url: z.string().max(500).nullish(),
  source: z.enum(VALID_SOURCES as [string, ...string[]]).nullish(),
  status: z.enum(VALID_STATUSES as [string, ...string[]]).nullish(),
  priority: z.enum(VALID_PRIORITIES as [string, ...string[]]).nullish(),
  applied_at: z.string().nullish(),
  deadline_at: z.string().nullish(),
  notes: z.string().max(5000).nullish(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

const backupEventSchema = z.object({
  id: z.string().min(1),
  application_id: z.string().min(1),
  event_type: z.enum(VALID_EVENT_TYPES as [string, ...string[]]),
  title: z.string().min(1).max(200),
  content: z.string().max(2000).nullish(),
  old_status: z.enum(VALID_STATUSES as [string, ...string[]]).nullish(),
  new_status: z.enum(VALID_STATUSES as [string, ...string[]]).nullish(),
  handled_at: z.string().nullish(),
  handled_action: z.string().max(200).nullish(),
  event_time: z.string().min(1),
  created_at: z.string().min(1),
});

const backupReminderSchema = z.object({
  id: z.string().min(1),
  application_id: z.string().nullish(),
  title: z.string().min(1).max(200),
  content: z.string().max(2000).nullish(),
  reminder_type: z.enum(VALID_REMINDER_TYPES as [string, ...string[]]).nullish(),
  remind_at: z.string().min(1),
  is_done: z.union([z.boolean(), z.number()]).nullish(),
  notified_at: z.string().nullish(),
  created_by: z.string().max(50).nullish(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

const backupTargetSchema = z.object({
  id: z.string().min(1),
  application_id: z.string().min(1),
  domain: z.string().min(1).max(200),
  status_url: z.string().min(1).max(500),
  ats_type: z.string().max(50).nullish(),
  enabled: z.union([z.boolean(), z.number()]).nullish(),
  check_frequency: z.enum(['manual', 'daily', 'every_12h', 'every_6h']).nullish(),
  current_status: z.string().max(500).nullish(),
  last_status: z.string().max(500).nullish(),
  login_state: z.enum(VALID_LOGIN_STATES as [string, ...string[]]).nullish(),
  last_checked_at: z.string().nullish(),
  last_success_at: z.string().nullish(),
  last_error: z.string().max(1000).nullish(),
  last_text_hash: z.string().max(200).nullish(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const backupImportSchema = z.object({
  applications: z.array(backupAppSchema).min(1, '至少需要一条求职记录'),
  events: z.array(backupEventSchema).optional(),
  reminders: z.array(backupReminderSchema).optional(),
  tracking_targets: z.array(backupTargetSchema).optional(),
});

// SSRF 防护：检查 URL 是否是内网地址
export function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // 检查内网地址
    if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) {
      return true;
    }

    // 检查 IPv6 映射的 IPv4 地址
    if (hostname.startsWith('::ffff:')) {
      const ip = hostname.slice(7);
      if (ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('172.') || ip.startsWith('192.168.')) {
        return true;
      }
    }

    // 检查私有 IP 段
    const parts = hostname.split('.');
    if (parts.length === 4) {
      const first = parseInt(parts[0]);
      const second = parseInt(parts[1]);

      // 10.0.0.0/8
      if (first === 10) return true;
      // 172.16.0.0/12
      if (first === 172 && second >= 16 && second <= 31) return true;
      // 192.168.0.0/16
      if (first === 192 && second === 168) return true;
    }

    // 检查链路本地地址
    if (hostname.startsWith('169.254.') || hostname.startsWith('fe80:')) {
      return true;
    }

    // 检查元数据地址
    if (hostname === 'metadata.google.internal' || hostname === '169.254.169.254') {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
