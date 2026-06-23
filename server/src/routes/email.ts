import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import db from '../db.js';
import { generateId } from '../auth.js';
import { escapeHtml } from '../validate.js';
import { decryptSecret } from '../crypto.js';

const app = new Hono<AppEnv>();

// Test email configuration
app.post('/test', async (c) => {
  const userId = c.get('userId');

  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;

  if (!settings || !settings.smtp_host || !settings.smtp_username || !settings.smtp_recipient) {
    return c.json({ code: 400, msg: '请先配置邮件设置' }, 400);
  }

  try {
    // 动态导入 nodemailer
    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: parseInt(settings.smtp_port || '465'),
      secure: parseInt(settings.smtp_port || '465') === 465,
      auth: {
        user: settings.smtp_username,
        pass: decryptSecret(settings.smtp_password),
      },
    });

    await transporter.sendMail({
      from: settings.smtp_username,
      to: settings.smtp_recipient,
      subject: 'ApplyRadar 邮件测试',
      text: '这是一封测试邮件，如果你收到这封邮件，说明邮件配置正确。',
      html: '<h2>ApplyRadar 邮件测试</h2><p>这是一封测试邮件，如果你收到这封邮件，说明邮件配置正确。</p>',
    });

    return c.json({ code: 0, msg: '测试邮件已发送，请检查收件箱' });
  } catch (e: any) {
    return c.json({ code: 400, msg: `发送失败: ${e.message}` }, 400);
  }
});

// Send daily report
app.post('/daily-report', async (c) => {
  const userId = c.get('userId');

  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;

  if (!settings || !settings.email_report_enabled || !settings.smtp_host) {
    return c.json({ code: 400, msg: '邮件日报未启用或未配置' }, 400);
  }

  try {
    // 获取统计数据
    const apps = db.prepare(
      'SELECT status, created_at FROM applications WHERE user_id = ?'
    ).all(userId) as any[];

    const reminders = db.prepare(
      'SELECT * FROM reminders WHERE user_id = ? AND is_done = 0 ORDER BY remind_at ASC LIMIT 10'
    ).all(userId) as any[];

    const recentEvents = db.prepare(
      'SELECT * FROM application_events WHERE user_id = ? ORDER BY event_time DESC LIMIT 10'
    ).all(userId) as any[];

    // 计算统计
    const total = apps.length;
    const activeStatuses = ['applied', 'received', 'under_review', 'assessment', 'interview', 'final_interview'];
    const active = apps.filter(a => activeStatuses.includes(a.status)).length;
    const offers = apps.filter(a => a.status === 'offer').length;

    // 生成 HTML
    const html = `
      <h2>ApplyRadar 求职状态日报</h2>
      <div style="margin: 20px 0;">
        <h3>📊 统计概览</h3>
        <ul>
          <li>总投递: ${total}</li>
          <li>进行中: ${active}</li>
          <li>已获 Offer: ${offers}</li>
          <li>待处理提醒: ${reminders.length}</li>
        </ul>
      </div>

      ${reminders.length > 0 ? `
      <div style="margin: 20px 0;">
        <h3>⏰ 待处理提醒</h3>
        <ul>
          ${reminders.map(r => `<li><strong>${escapeHtml(r.title)}</strong> - ${new Date(r.remind_at).toLocaleString('zh-CN')}</li>`).join('')}
        </ul>
      </div>
      ` : ''}

      ${recentEvents.length > 0 ? `
      <div style="margin: 20px 0;">
        <h3>📝 最近动态</h3>
        <ul>
          ${recentEvents.map(e => `<li>${escapeHtml(e.title)} - ${new Date(e.event_time).toLocaleString('zh-CN')}</li>`).join('')}
        </ul>
      </div>
      ` : ''}

      <p style="color: #666; margin-top: 30px; font-size: 12px;">
        此邮件由 ApplyRadar 自动发送
      </p>
    `;

    // 发送邮件
    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: parseInt(settings.smtp_port || '465'),
      secure: parseInt(settings.smtp_port || '465') === 465,
      auth: {
        user: settings.smtp_username,
        pass: decryptSecret(settings.smtp_password),
      },
    });

    await transporter.sendMail({
      from: settings.smtp_username,
      to: settings.smtp_recipient,
      subject: `ApplyRadar 求职状态日报 - ${new Date().toLocaleDateString('zh-CN')}`,
      html,
    });

    // 记录推送日志
    const logId = generateId();
    db.prepare(
      `INSERT INTO push_logs (id, user_id, push_type, title, body, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(logId, userId, 'email', '日报已发送', `发送至 ${settings.smtp_recipient}`, 'sent');

    return c.json({ code: 0, msg: '日报已发送' });
  } catch (e: any) {
    return c.json({ code: 400, msg: `发送失败: ${e.message}` }, 400);
  }
});

export default app;
