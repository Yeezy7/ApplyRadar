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
  api_key: z.string().max(200).optional(),
  api_base_url: z.string().url().max(500).optional(),
  model: z.string().max(100).optional(),
  check_frequency: z.enum(['manual', 'daily', 'every_12h', 'every_6h']).optional(),
  notifications_enabled: z.boolean().optional(),
  auto_check_enabled: z.boolean().optional(),
  email_report_enabled: z.boolean().optional(),
  smtp_host: z.string().max(200).optional(),
  smtp_port: z.string().max(10).optional(),
  smtp_username: z.string().max(200).optional(),
  smtp_password: z.string().max(200).optional(),
  smtp_recipient: z.string().email().max(255).optional(),
  email_report_time: z.string().max(10).optional(),
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

// SSRF 防护：检查 URL 是否是内网地址
export function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // 检查内网地址
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return true;
    }

    // 检查私有 IP 段
    if (hostname.startsWith('10.') || hostname.startsWith('172.') || hostname.startsWith('192.168.')) {
      return true;
    }

    // 检查链路本地地址
    if (hostname.startsWith('169.254.') || hostname.startsWith('fe80:')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
