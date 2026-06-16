import { isLoggedIn, getToken, setToken, getSyncedDomains, setSyncedDomains, addSyncedDomain, removeSyncedDomain } from '../lib/storage.js';
import { login, getTrackingTargets, getTrackingDomains } from '../lib/api.js';

// ========== DOM ==========

const $ = (sel) => document.querySelector(sel);

// ========== 工具 ==========

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      resolve(response || { success: false, error: 'No response' });
    });
  });
}

function formatTime(ts) {
  if (!ts) return '-';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  return `${Math.floor(hr / 24)}天前`;
}

function getCookieHealth(cookies) {
  if (!cookies || cookies.length === 0) return 'none';
  const now = Date.now();
  const hasExpired = cookies.some(c => c.expirationDate && c.expirationDate * 1000 < now);
  if (hasExpired) return 'expired';
  const hasExpiringSoon = cookies.some(c => {
    if (!c.expirationDate) return false;
    return (c.expirationDate * 1000 - now) < 24 * 60 * 60 * 1000;
  });
  if (hasExpiringSoon) return 'expiring';
  return 'healthy';
}

// ========== 状态 ==========

let currentTab = null;

// ========== 初始化 ==========

async function init() {
  const loggedIn = await isLoggedIn();
  if (loggedIn) {
    await showMainView();
  } else {
    showLoginView();
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  await loadCurrentDomain();
}

function showLoginView() {
  $('#login-view').style.display = 'block';
  $('#main-view').style.display = 'none';
}

async function showMainView() {
  $('#login-view').style.display = 'none';
  $('#main-view').style.display = 'block';

  // 自动从服务器同步域名列表
  await syncDomainsFromServer();

  await loadDomains();
  await loadTargets();
  await loadLastSyncTime();
}

// ========== 自动同步服务器域名 ==========

async function syncDomainsFromServer() {
  try {
    const serverDomains = await getTrackingDomains();
    const localDomains = await getSyncedDomains();
    const merged = [...new Set([...localDomains, ...serverDomains])];
    await setSyncedDomains(merged);
  } catch {
    // 静默失败
  }
}

// ========== 登录 ==========

$('#login-btn').addEventListener('click', async () => {
  const email = $('#email').value.trim();
  const password = $('#password').value.trim();

  if (!email || !password) {
    $('#login-error').textContent = '请输入邮箱和密码';
    return;
  }

  const btn = $('#login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 登录中...';
  $('#login-error').textContent = '';

  try {
    const data = await login(email, password);
    await setToken(data.token);
    await showMainView();
  } catch (e) {
    $('#login-error').textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '登录';
  }
});

// Enter 键登录
$('#password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#login-btn').click();
});

// ========== 当前域名 ==========

async function loadCurrentDomain() {
  const el = $('#current-domain');
  if (!currentTab?.url) {
    el.style.display = 'none';
    return;
  }

  try {
    const url = new URL(currentTab.url);
    const domain = url.hostname;

    // 跳过 chrome:// 和扩展页面
    if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:') {
      el.style.display = 'none';
      return;
    }

    $('#domain-name').textContent = domain;

    const domains = await getSyncedDomains();
    const isSynced = domains.includes(domain);

    if (isSynced) {
      $('#domain-status').textContent = '已监控';
      $('#domain-status').className = 'domain-status status-ok';
      $('#sync-current-btn').textContent = '同步 Cookie';
      $('#sync-current-btn').onclick = () => syncCurrent(domain);
    } else {
      $('#domain-status').textContent = '未监控';
      $('#domain-status').className = 'domain-status';
      $('#sync-current-btn').textContent = '+ 添加监控';
      $('#sync-current-btn').onclick = () => addDomain(domain);
    }

    el.style.display = 'flex';
  } catch {
    el.style.display = 'none';
  }
}

async function syncCurrent(domain) {
  const btn = $('#sync-current-btn');
  btn.disabled = true;
  btn.textContent = '同步中...';

  const result = await sendMessage({ type: 'SYNC_COOKIES', domain });
  btn.disabled = false;

  if (result?.success) {
    btn.textContent = '✓ 已同步';
    btn.classList.add('synced');
  } else {
    btn.textContent = '✗ 失败';
    btn.classList.add('sync-error');
  }

  setTimeout(() => {
    btn.textContent = '同步 Cookie';
    btn.classList.remove('synced', 'sync-error');
  }, 2500);
}

async function addDomain(domain) {
  const btn = $('#sync-current-btn');
  btn.disabled = true;
  btn.textContent = '添加中...';

  await addSyncedDomain(domain);
  await sendMessage({ type: 'ADD_DOMAIN', domain });
  await loadCurrentDomain();
  await loadDomains();
}

// ========== 域名列表 ==========

async function loadDomains() {
  const domains = await getSyncedDomains();
  const times = (await chrome.storage.local.get('last_sync_times')).last_sync_times || {};

  if (domains.length === 0) {
    $('#domain-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📡</div>
        <div>暂无监控域名</div>
        <div class="empty-hint">访问招聘网站后点击「添加监控」</div>
      </div>`;
    return;
  }

  $('#domain-list').innerHTML = domains.map(d => {
    const lastSync = times[d];
    const syncLabel = lastSync ? formatTime(lastSync) : '未同步';

    return `
      <div class="domain-item" data-domain="${d}">
        <div class="domain-item-info">
          <span class="domain-item-name">${d}</span>
          <span class="domain-item-sync">上次同步: ${syncLabel}</span>
        </div>
        <div class="domain-item-actions">
          <button class="domain-item-btn sync-btn" title="同步">↻</button>
          <button class="domain-item-btn remove-btn" title="移除">✕</button>
        </div>
      </div>`;
  }).join('');

  // 绑定事件
  $('#domain-list').querySelectorAll('.sync-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const domain = btn.closest('.domain-item').dataset.domain;
      btn.classList.add('spinning');
      await sendMessage({ type: 'SYNC_COOKIES', domain });
      btn.classList.remove('spinning');
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = '↻'; }, 1500);
      await loadDomains();
    });
  });

  $('#domain-list').querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const domain = btn.closest('.domain-item').dataset.domain;
      if (confirm(`确定移除 ${domain}？`)) {
        await removeSyncedDomain(domain);
        await loadDomains();
      }
    });
  });
}

// ========== 追踪目标 ==========

async function loadTargets() {
  const el = $('#target-list');
  el.innerHTML = '<div class="loading"><span class="spinner"></span> 加载中...</div>';

  try {
    const targets = await getTrackingTargets();
    $('#target-count').textContent = targets.length;

    if (targets.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎯</div>
          <div>暂无追踪目标</div>
          <div class="empty-hint">在 Web 端添加求职记录后自动同步</div>
        </div>`;
      return;
    }

    const statusLabels = {
      to_apply: '待投递', applied: '已投递', received: '已收到',
      under_review: '审核中', assessment: '测评中', interview: '面试中',
      final_interview: '终面中', offer: '已 Offer', rejected: '已拒绝',
      withdrawn: '已撤回', unknown: '未知',
    };

    const statusColors = {
      to_apply: '#78716c', applied: '#2563eb', received: '#7c3aed',
      under_review: '#d97706', assessment: '#d97706', interview: '#ea580c',
      final_interview: '#ea580c', offer: '#16a34a', rejected: '#dc2626',
      withdrawn: '#9ca3af', unknown: '#9ca3af',
    };

    const loginLabels = {
      valid: '正常', expired: '已过期', captcha_required: '需验证',
      mfa_required: '需验证', blocked: '被阻止', unknown: '未知',
    };

    const loginDot = {
      valid: '#16a34a', expired: '#dc2626', captcha_required: '#f59e0b',
      mfa_required: '#f59e0b', blocked: '#dc2626', unknown: '#9ca3af',
    };

    el.innerHTML = targets.map(t => {
      const status = t.current_status || 'unknown';
      const login = t.login_state || 'unknown';
      const color = statusColors[status] || '#9ca3af';

      return `
        <div class="target-item" data-url="${t.status_url}">
          <div class="target-info">
            <div class="target-company">${t.domain}</div>
            <div class="target-meta">
              <span class="target-status" style="color:${color}">${statusLabels[status] || status}</span>
              ${t.last_checked_at ? `<span class="target-time">${formatTime(Date.parse(t.last_checked_at))}</span>` : ''}
            </div>
          </div>
          <div class="target-login-badge">
            <span class="login-dot" style="background:${loginDot[login] || '#9ca3af'}"></span>
            ${loginLabels[login] || login}
          </div>
        </div>`;
    }).join('');

    el.querySelectorAll('.target-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        if (url) chrome.tabs.create({ url });
      });
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div>加载失败: ${e.message}</div></div>`;
  }
}

// ========== 同步全部 ==========

$('#sync-all-btn').addEventListener('click', async () => {
  const btn = $('#sync-all-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  await sendMessage({ type: 'SYNC_ALL' });
  btn.disabled = false;
  btn.textContent = '↻';
  await loadDomains();
  await loadLastSyncTime();
});

// ========== 最后同步时间 ==========

async function loadLastSyncTime() {
  const result = await chrome.storage.local.get('last_sync_times');
  const times = result.last_sync_times || {};
  const values = Object.values(times);

  if (values.length === 0) {
    $('#last-sync-time').textContent = '尚未同步';
    return;
  }

  const latest = Math.max(...values);
  $('#last-sync-time').textContent = `最后同步: ${formatTime(latest)}`;
}

// ========== 添加域名弹窗 ==========

$('#add-domain-btn').addEventListener('click', () => {
  $('#add-domain-modal').style.display = 'flex';
  $('#new-domain-input').value = '';
  $('#new-domain-input').focus();
});

$('#close-modal-btn').addEventListener('click', () => {
  $('#add-domain-modal').style.display = 'none';
});

$('#add-domain-modal').addEventListener('click', (e) => {
  if (e.target.id === 'add-domain-modal') {
    $('#add-domain-modal').style.display = 'none';
  }
});

$('#confirm-add-btn').addEventListener('click', async () => {
  const domain = $('#new-domain-input').value.trim();
  if (!domain) return;

  const btn = $('#confirm-add-btn');
  btn.disabled = true;
  btn.textContent = '添加中...';

  await addSyncedDomain(domain);
  await sendMessage({ type: 'ADD_DOMAIN', domain });
  $('#add-domain-modal').style.display = 'none';
  btn.disabled = false;
  btn.textContent = '添加';
  await loadDomains();
});

$('#new-domain-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#confirm-add-btn').click();
  if (e.key === 'Escape') $('#add-domain-modal').style.display = 'none';
});

// ========== 设置 ==========

$('#settings-btn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ========== 启动 ==========

init();
