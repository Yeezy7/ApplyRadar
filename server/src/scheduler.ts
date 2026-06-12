import cron from 'node-cron';
import db from './db.js';
import { generateId } from './auth.js';

// 定时任务状态
const taskStatus = {
  autoCheck: {
    isRunning: false,
    lastRunAt: null as string | null,
    lastResult: null as string | null,
  },
  emailReport: {
    isRunning: false,
    lastRunAt: null as string | null,
    lastResult: null as string | null,
  },
  reminderCheck: {
    isRunning: false,
    lastRunAt: null as string | null,
    lastResult: null as string | null,
  },
};

// 获取所有需要自动检查的用户
function getUsersForAutoCheck() {
  return db.prepare(
    'SELECT DISTINCT u.id, u.email, s.check_frequency FROM users u JOIN user_settings s ON u.id = s.user_id WHERE s.auto_check_enabled = 1'
  ).all() as any[];
}

// 执行单个用户的自动检查
async function runAutoCheckForUser(userId: string) {
  const targets = db.prepare(
    'SELECT * FROM tracking_targets WHERE user_id = ? AND enabled = 1'
  ).all(userId) as any[];

  if (targets.length === 0) return { total: 0, success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

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

  return { total: targets.length, success, failed };
}

// 发送邮件日报
async function sendEmailReport(userId: string) {
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;

  if (!settings || !settings.email_report_enabled || !settings.smtp_host) {
    return { success: false, message: '邮件日报未启用或未配置' };
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
          ${reminders.map(r => `<li><strong>${r.title}</strong> - ${new Date(r.remind_at).toLocaleString('zh-CN')}</li>`).join('')}
        </ul>
      </div>
      ` : ''}

      ${recentEvents.length > 0 ? `
      <div style="margin: 20px 0;">
        <h3>📝 最近动态</h3>
        <ul>
          ${recentEvents.map(e => `<li>${e.title} - ${new Date(e.event_time).toLocaleString('zh-CN')}</li>`).join('')}
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
        pass: settings.smtp_password,
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

    return { success: true, message: '日报已发送' };
  } catch (e: any) {
    return { success: false, message: `发送失败: ${e.message}` };
  }
}

// 发送提醒邮件
async function sendReminderEmail(reminder: any, userEmail: string) {
  try {
    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(reminder.user_id) as any;

    if (!settings || !settings.smtp_host || !settings.smtp_username || !settings.smtp_recipient) {
      return false;
    }

    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: parseInt(settings.smtp_port || '465'),
      secure: parseInt(settings.smtp_port || '465') === 465,
      auth: {
        user: settings.smtp_username,
        pass: settings.smtp_password,
      },
    });

    const html = `
      <h2>ApplyRadar 提醒</h2>
      <div style="margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 8px;">
        <h3 style="margin: 0 0 10px 0;">${reminder.title}</h3>
        ${reminder.content ? `<p style="margin: 0; color: #666;">${reminder.content}</p>` : ''}
        <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">
          提醒时间: ${new Date(reminder.remind_at).toLocaleString('zh-CN')}
        </p>
      </div>
      <p style="color: #666; font-size: 12px;">
        此邮件由 ApplyRadar 自动发送
      </p>
    `;

    await transporter.sendMail({
      from: settings.smtp_username,
      to: settings.smtp_recipient,
      subject: `ApplyRadar 提醒: ${reminder.title}`,
      html,
    });

    return true;
  } catch (e) {
    console.error('Failed to send reminder email:', e);
    return false;
  }
}

// 检查提醒并发送通知
async function checkReminders() {
  const now = new Date().toISOString();

  // 查找到期的提醒
  const dueReminders = db.prepare(
    'SELECT r.*, u.email FROM reminders r JOIN users u ON r.user_id = u.id WHERE r.is_done = 0 AND r.remind_at <= ? AND (r.notified_at IS NULL OR r.notified_at < r.remind_at)'
  ).all(now) as any[];

  for (const reminder of dueReminders) {
    // 发送邮件通知
    const emailSent = await sendReminderEmail(reminder, reminder.email);

    // 记录推送日志
    const logId = generateId();
    db.prepare(
      `INSERT INTO push_logs (id, user_id, push_type, title, body, status, application_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      logId,
      reminder.user_id,
      'reminder',
      reminder.title,
      emailSent ? '已发送邮件通知' : '提醒时间到了',
      emailSent ? 'sent' : 'failed',
      reminder.application_id
    );

    // 更新提醒的 notified_at
    db.prepare(
      "UPDATE reminders SET notified_at = datetime('now') WHERE id = ?"
    ).run(reminder.id);
  }

  return dueReminders.length;
}

// 初始化定时任务
export function initScheduler() {
  console.log('Initializing scheduler...');

  // 每分钟检查提醒
  cron.schedule('* * * * *', async () => {
    if (taskStatus.reminderCheck.isRunning) return;

    taskStatus.reminderCheck.isRunning = true;
    taskStatus.reminderCheck.lastRunAt = new Date().toISOString();

    try {
      const count = await checkReminders();
      taskStatus.reminderCheck.lastResult = `检查完成，处理 ${count} 条提醒`;
      if (count > 0) {
        console.log(`[Scheduler] Processed ${count} reminders`);
      }
    } catch (e: any) {
      taskStatus.reminderCheck.lastResult = `检查失败: ${e.message}`;
      console.error('[Scheduler] Reminder check failed:', e);
    } finally {
      taskStatus.reminderCheck.isRunning = false;
    }
  });

  // 每小时检查是否有用户需要自动检查
  cron.schedule('0 * * * *', async () => {
    if (taskStatus.autoCheck.isRunning) return;

    taskStatus.autoCheck.isRunning = true;
    taskStatus.autoCheck.lastRunAt = new Date().toISOString();

    try {
      const users = getUsersForAutoCheck();
      let totalSuccess = 0;
      let totalFailed = 0;

      for (const user of users) {
        const result = await runAutoCheckForUser(user.id);
        totalSuccess += result.success;
        totalFailed += result.failed;

        // 记录推送日志
        if (result.total > 0) {
          const logId = generateId();
          db.prepare(
            `INSERT INTO push_logs (id, user_id, push_type, title, body, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
          ).run(logId, user.id, 'auto_check', '自动检查完成', `${result.success} 成功，${result.failed} 失败`, 'sent');
        }
      }

      taskStatus.autoCheck.lastResult = `检查完成: ${users.length} 用户，${totalSuccess} 成功，${totalFailed} 失败`;
      console.log(`[Scheduler] Auto check completed: ${users.length} users, ${totalSuccess} success, ${totalFailed} failed`);
    } catch (e: any) {
      taskStatus.autoCheck.lastResult = `检查失败: ${e.message}`;
      console.error('[Scheduler] Auto check failed:', e);
    } finally {
      taskStatus.autoCheck.isRunning = false;
    }
  });

  // 每天早上 9 点检查是否需要发送日报
  cron.schedule('0 9 * * *', async () => {
    if (taskStatus.emailReport.isRunning) return;

    taskStatus.emailReport.isRunning = true;
    taskStatus.emailReport.lastRunAt = new Date().toISOString();

    try {
      const users = db.prepare(
        'SELECT DISTINCT u.id, u.email, s.email_report_time FROM users u JOIN user_settings s ON u.id = s.user_id WHERE s.email_report_enabled = 1'
      ).all() as any[];

      let successCount = 0;
      let failCount = 0;

      for (const user of users) {
        const result = await sendEmailReport(user.id);
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      }

      taskStatus.emailReport.lastResult = `日报发送完成: ${successCount} 成功，${failCount} 失败`;
      console.log(`[Scheduler] Email report completed: ${successCount} success, ${failCount} failed`);
    } catch (e: any) {
      taskStatus.emailReport.lastResult = `日报发送失败: ${e.message}`;
      console.error('[Scheduler] Email report failed:', e);
    } finally {
      taskStatus.emailReport.isRunning = false;
    }
  });

  console.log('Scheduler initialized');
}

// 获取定时任务状态
export function getSchedulerStatus() {
  return taskStatus;
}

// 手动触发自动检查
export async function triggerAutoCheck(userId?: string) {
  if (userId) {
    const result = await runAutoCheckForUser(userId);

    // 记录推送日志
    const logId = generateId();
    db.prepare(
      `INSERT INTO push_logs (id, user_id, push_type, title, body, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(logId, userId, 'manual_check', '手动检查完成', `${result.success} 成功，${result.failed} 失败`, 'sent');

    return result;
  }

  // 检查所有用户
  const users = getUsersForAutoCheck();
  let totalSuccess = 0;
  let totalFailed = 0;

  for (const user of users) {
    const result = await runAutoCheckForUser(user.id);
    totalSuccess += result.success;
    totalFailed += result.failed;
  }

  return { total: users.length, success: totalSuccess, failed: totalFailed };
}

// 手动发送日报
export async function triggerEmailReport(userId: string) {
  return await sendEmailReport(userId);
}
