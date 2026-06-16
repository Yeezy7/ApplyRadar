import {
  getSyncedDomains,
  addSyncedDomain,
  getLastSyncTimes,
  setLastSyncTime,
  isLoggedIn,
} from '../lib/storage.js';
import {
  getTrackingTargets,
  updateTrackingCookies,
  createTrackingTarget,
  api as serverApi,
} from '../lib/api.js';

// Cookie 同步间隔（5 分钟）
const SYNC_INTERVAL = 5 * 60 * 1000;

// Session 检查间隔（1 小时）
const SESSION_CHECK_INTERVAL = 60 * 60 * 1000;

// ========== Cookie 同步 ==========

async function syncCookiesForDomain(domain) {
  try {
    const cookies = await chrome.cookies.getAll({ domain });
    if (cookies.length === 0) return;

    const targets = await getTrackingTargets();
    const target = targets.find(t => t.domain === domain || domain.endsWith('.' + t.domain));
    if (!target) return;

    const cookieJson = JSON.stringify(cookies);
    await updateTrackingCookies(target.id, cookieJson);
    await setLastSyncTime(domain, Date.now());

    console.log(`[ApplyRadar] Synced ${cookies.length} cookies for ${domain}`);
  } catch (e) {
    console.error(`[ApplyRadar] Failed to sync cookies for ${domain}:`, e);
  }
}

async function syncAllCookies() {
  const domains = await getSyncedDomains();
  for (const domain of domains) {
    await syncCookiesForDomain(domain);
  }
}

// Cookie 变化监听
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  if (changeInfo.removed) return;

  const cookie = changeInfo.cookie;
  const domain = cookie.domain.replace(/^\./, '');

  const domains = await getSyncedDomains();
  if (domains.some(d => domain === d || domain.endsWith('.' + d))) {
    await syncCookiesForDomain(domain);
  }
});

// ========== Session 健康检查 ==========

async function checkSessionHealth() {
  const targets = await getTrackingTargets();
  const now = Date.now();

  for (const target of targets) {
    if (!target.session_cookies) continue;

    try {
      const cookies = JSON.parse(target.session_cookies);
      if (!Array.isArray(cookies)) continue;

      // 检查是否有即将过期的 Cookie
      const expiringSoon = cookies.some(c => {
        if (!c.expirationDate) return false;
        const expiresIn = c.expirationDate * 1000 - now;
        return expiresIn > 0 && expiresIn < 24 * 60 * 60 * 1000;
      });

      const expired = cookies.some(c => {
        if (!c.expirationDate) return false;
        return c.expirationDate * 1000 < now;
      });

      if (expired) {
        showNotification(
          '登录已过期',
          `${target.domain} 的登录态已过期，请重新登录`,
          target.id
        );
      } else if (expiringSoon) {
        showNotification(
          '登录即将过期',
          `${target.domain} 的登录态将在 24 小时内过期`,
          target.id
        );
      }
    } catch {
      // ignore parse errors
    }
  }
}

// ========== 通知 ==========

function showNotification(title, message, targetId) {
  chrome.notifications.create(`session-${targetId}-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 2,
  });
}

// ========== 初始化 ==========

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ApplyRadar] Extension installed');

  // 设置定时任务
  chrome.alarms.create('sync-cookies', { periodInMinutes: SYNC_INTERVAL / 60000 });
  chrome.alarms.create('check-sessions', { periodInMinutes: SESSION_CHECK_INTERVAL / 60000 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!(await isLoggedIn())) return;

  if (alarm.name === 'sync-cookies') {
    await syncAllCookies();
  } else if (alarm.name === 'check-sessions') {
    await checkSessionHealth();
  }
});

// 消息处理（来自 popup 或 content script）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_COOKIES') {
    syncCookiesForDomain(message.domain).then(() => {
      sendResponse({ success: true });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true; // 异步响应
  }

  if (message.type === 'SYNC_ALL') {
    syncAllCookies().then(() => {
      sendResponse({ success: true });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }

  if (message.type === 'ADD_DOMAIN') {
    addSyncedDomain(message.domain).then(() => {
      syncCookiesForDomain(message.domain);
      sendResponse({ success: true });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }

  if (message.type === 'CHECK_SESSIONS') {
    checkSessionHealth().then(() => {
      sendResponse({ success: true });
    }).catch(e => {
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }

  if (message.type === 'ADD_TRACKING') {
    (async () => {
      try {
        const { domain, status_url, company_name, job_title } = message.data;
        await addSyncedDomain(domain);

        // 检查是否已有该域名的追踪目标
        const existing = await getTrackingTargets(domain);
        if (existing.length > 0) {
          await syncCookiesForDomain(domain);
          sendResponse({ success: true, message: '已存在' });
          return;
        }

        // 先创建 Application 记录
        const appResult = await serverApi.post('/api/applications', {
          company_name: company_name || domain,
          job_title: job_title || '状态追踪',
          status_url,
          source: 'extension',
          status: 'unknown',
        });

        // 再创建 TrackingTarget
        await createTrackingTarget({
          application_id: appResult.id,
          domain,
          status_url,
        });

        // 同步 Cookie
        await syncCookiesForDomain(domain);

        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
});
