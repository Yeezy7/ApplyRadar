import { isLoggedIn, setToken, getSyncedDomains, setSyncedDomains, addSyncedDomain, removeSyncedDomain } from '../lib/storage.js';
import { login, getTrackingTargets, getTrackingDomains, getApplications } from '../lib/api.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (r) => resolve(r || { success: false }));
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

function setStatus(text) {
  $('#footer-status').textContent = text;
}

// ===== Init =====

async function init() {
  if (await isLoggedIn()) {
    await showMain();
  } else {
    showLogin();
  }
  setupTabs();
  setupCurrentPage();
}

function showLogin() {
  $('#login-view').style.display = 'block';
  $('#main-view').style.display = 'none';
  setupLogin();
}

async function showMain() {
  $('#login-view').style.display = 'none';
  $('#main-view').style.display = 'block';
  await syncServerDomains();
  await Promise.all([loadTargets(), loadDomains(), loadCookies()]);
  setStatus('就绪');
}

// ===== Login =====

function setupLogin() {
  $('#login-btn').addEventListener('click', handleLogin);
  $('#password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
}

async function handleLogin() {
  const email = $('#email').value.trim();
  const password = $('#password').value.trim();
  if (!email || !password) {
    $('#login-error').textContent = '请输入邮箱和密码';
    return;
  }

  const btn = $('#login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  $('#login-error').textContent = '';

  try {
    const data = await login(email, password);
    await setToken(data.token);
    await showMain();
  } catch (e) {
    $('#login-error').textContent = e.message;
    btn.disabled = false;
    btn.textContent = '登录';
  }
}

// ===== Tabs =====

function setupTabs() {
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      $(`.tab-content[data-tab="${tab.dataset.tab}"]`).classList.add('active');
    });
  });
}

// ===== Current Page =====

function setupCurrentPage() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.url) return;
    try {
      const url = new URL(tab.url);
      if (url.protocol === 'chrome:' || url.protocol === 'chrome-extension:') return;

      const domain = url.hostname;
      const el = $('#current-page');
      el.style.display = 'block';
      $('#page-domain').textContent = domain;

      getSyncedDomains().then(domains => {
        if (domains.includes(domain)) {
          $('#page-status').textContent = '已监控';
          $('#page-status').className = 'page-card-status ok';
          const btn = $('#page-action-btn');
          btn.textContent = '同步 Cookie';
          btn.onclick = () => syncDomain(domain, btn);
        } else {
          $('#page-status').textContent = '未监控';
          $('#page-status').className = 'page-card-status';
          const btn = $('#page-action-btn');
          btn.textContent = '+ 添加';
          btn.onclick = () => addDomain(domain);
        }
      });
    } catch {}
  });
}

async function syncDomain(domain, btn) {
  btn.disabled = true;
  btn.textContent = '...';
  setStatus(`同步 ${domain}...`);
  const r = await sendMessage({ type: 'SYNC_COOKIES', domain });
  btn.disabled = false;
  if (r?.success) {
    btn.textContent = '✓ 已同步';
    setStatus(`${domain} 同步完成，检查中...`);
    pollStatusUpdates();
  } else {
    btn.textContent = '✗ 失败';
    setStatus('同步失败');
  }
  setTimeout(() => { btn.textContent = '同步 Cookie'; }, 2500);
  loadDomains();
  loadCookies();
}

let pollTimer = null;
let prevStatuses = {};

function captureStatuses() {
  const statuses = {};
  $('#target-list').querySelectorAll('.list-item').forEach(item => {
    const badges = item.querySelectorAll('.badge-sm');
    badges.forEach(b => {
      if (b.classList.contains('badge-danger') || b.classList.contains('badge-warning')) {
        statuses[item.dataset.url] = true;
      }
    });
  });
  return statuses;
}

async function pollStatusUpdates() {
  if (pollTimer) clearTimeout(pollTimer);
  prevStatuses = captureStatuses();

  let attempts = 0;
  const maxAttempts = 15;
  const interval = 2000;

  const poll = async () => {
    attempts++;

    // 只刷新数据，不重建整个 DOM
    try {
      const [targets, apps] = await Promise.all([getTrackingTargets(), getApplications()]);
      const appMap = new Map(apps.map(a => [a.id, a]));
      updateTargetBadges(targets, appMap);
    } catch {}

    // 检查是否还有需要关注的状态
    const currentStatuses = captureStatuses();
    const hasIssues = Object.keys(currentStatuses).length > 0;

    if (!hasIssues || attempts >= maxAttempts) {
      setStatus('就绪');
      return;
    }

    setStatus(`检查中... (${attempts})`);
    pollTimer = setTimeout(poll, interval);
  };

  pollTimer = setTimeout(poll, 2000);
}

function updateTargetBadges(targets, appMap) {
  const SL = { to_apply:'待投递', applied:'已投递', received:'已收到', under_review:'审核中', assessment:'测评中', interview:'面试中', final_interview:'终面', offer:'Offer', rejected:'已拒绝', withdrawn:'已撤回', unknown:'未知' };
  const SC = { to_apply:'neutral', applied:'neutral', received:'success', under_review:'warning', assessment:'warning', interview:'warning', final_interview:'warning', offer:'success', rejected:'danger', withdrawn:'neutral', unknown:'neutral' };
  const LL = { valid:'正常', expired:'已过期', captcha_required:'需验证', mfa_required:'需验证', blocked:'被阻止', unknown:'未知' };
  const LC = { valid:'success', expired:'danger', captcha_required:'warning', mfa_required:'warning', blocked:'danger', unknown:'neutral' };

  const el = $('#target-list');
  el.querySelectorAll('.list-item').forEach(item => {
    const url = item.dataset.url;
    const t = targets.find(t => t.status_url === url);
    if (!t) return;

    const s = t.current_status || 'unknown';
    const l = t.login_state || 'unknown';

    // 更新状态 badge
    const badges = item.querySelectorAll('.badge-sm');
    if (badges.length >= 2) {
      badges[0].className = `badge-sm badge-${SC[s]||'neutral'}`;
      badges[0].innerHTML = `<span class="badge-dot"></span>${SL[s]||s}`;
      badges[1].className = `badge-sm badge-${LC[l]||'neutral'}`;
      badges[1].innerHTML = `<span class="badge-dot"></span>${LL[l]||l}`;
    }

    // 更新时间
    const timeEl = item.querySelector('.list-item-sub:last-child span:last-child');
    if (timeEl && t.last_checked_at) {
      timeEl.textContent = `· ${formatTime(Date.parse(t.last_checked_at))}`;
    }
  });
}

async function addDomain(domain) {
  await addSyncedDomain(domain);
  await sendMessage({ type: 'ADD_DOMAIN', domain });
  setupCurrentPage();
  loadDomains();
  loadCookies();
}

// ===== Targets =====

async function loadTargets() {
  const el = $('#target-list');
  el.innerHTML = '<div class="loading"><span class="spinner"></span></div>';

  try {
    const [targets, apps] = await Promise.all([getTrackingTargets(), getApplications()]);
    const appMap = new Map(apps.map(a => [a.id, a]));

    if (targets.length === 0) {
      el.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🎯</div>
          <div class="empty-title">暂无追踪目标</div>
          <div class="empty-desc">在 Web 端添加求职记录后自动同步</div>
        </div>`;
      return;
    }

    const SL = { to_apply:'待投递', applied:'已投递', received:'已收到', under_review:'审核中', assessment:'测评中', interview:'面试中', final_interview:'终面', offer:'Offer', rejected:'已拒绝', withdrawn:'已撤回', unknown:'未知' };
    const SC = { to_apply:'neutral', applied:'neutral', received:'success', under_review:'warning', assessment:'warning', interview:'warning', final_interview:'warning', offer:'success', rejected:'danger', withdrawn:'neutral', unknown:'neutral' };
    const LL = { valid:'正常', expired:'已过期', captcha_required:'需验证', mfa_required:'需验证', blocked:'被阻止', unknown:'未知' };
    const LC = { valid:'success', expired:'danger', captcha_required:'warning', mfa_required:'warning', blocked:'danger', unknown:'neutral' };

    el.innerHTML = targets.map(t => {
      const app = appMap.get(t.application_id);
      const companyName = app?.company_name || t.domain;
      const jobTitle = app?.job_title || '';
      const s = t.current_status || 'unknown';
      const l = t.login_state || 'unknown';
      return `
        <div class="list-item" data-url="${t.status_url}">
          <div class="list-item-info">
            <div class="list-item-title">${companyName}</div>
            <div class="list-item-sub">
              ${jobTitle ? `<span>${jobTitle}</span><span>·</span>` : ''}
              <span class="badge-sm badge-${SC[s]||'neutral'}"><span class="badge-dot"></span>${SL[s]||s}</span>
              <span class="badge-sm badge-${LC[l]||'neutral'}"><span class="badge-dot"></span>${LL[l]||l}</span>
            </div>
            <div class="list-item-sub" style="margin-top:2px">
              <span style="color:var(--text-muted)">${t.domain}</span>
              ${t.last_checked_at ? `<span>· ${formatTime(Date.parse(t.last_checked_at))}</span>` : ''}
            </div>
          </div>
          <div class="list-item-actions">
            <button class="icon-btn check-btn" title="检查">▶</button>
          </div>
        </div>`;
    }).join('');

    el.querySelectorAll('.list-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.icon-btn')) return;
        const url = item.dataset.url;
        if (url) chrome.tabs.create({ url });
      });
    });

    el.querySelectorAll('.check-btn').forEach((btn, i) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        checkTarget(targets[i], btn);
      });
    });
  } catch (e) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-title">加载失败</div><div class="empty-desc">${e.message}</div></div>`;
  }
}

async function checkTarget(target, btn) {
  btn.textContent = '...';
  btn.disabled = true;
  setStatus(`检查 ${target.domain}...`);

  try {
    const r = await sendMessage({ type: 'CHECK_TARGET', targetId: target.id });
    if (r?.success) {
      setStatus(`${target.domain}: ${r.message || '完成'}`);
    } else {
      setStatus(`${target.domain}: ${r?.error || '失败'}`);
    }
  } catch (e) {
    setStatus(`检查失败: ${e.message}`);
  }

  btn.textContent = '▶';
  btn.disabled = false;
  setTimeout(() => setStatus('就绪'), 5000);
}

// ===== Domains =====

async function loadDomains() {
  const domains = await getSyncedDomains();
  const times = (await chrome.storage.local.get('last_sync_times')).last_sync_times || {};

  // 从服务器获取追踪目标和应用，关联域名
  let targets = [], apps = [];
  try {
    [targets, apps] = await Promise.all([getTrackingTargets(), getApplications()]);
  } catch {}
  const appMap = new Map(apps.map(a => [a.id, a]));

  $('#domain-count').textContent = `${domains.length} 个域名`;
  const el = $('#domain-list');

  if (domains.length === 0) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📡</div>
        <div class="empty-title">暂无监控域名</div>
        <div class="empty-desc">访问招聘网站后点击「添加」</div>
      </div>`;
    return;
  }

  el.innerHTML = domains.map(d => {
    const domainTargets = targets.filter(t => t.domain === d);
    const companies = [...new Set(domainTargets.map(t => {
      const app = appMap.get(t.application_id);
      return app?.company_name || null;
    }).filter(Boolean))];

    const loginStates = domainTargets.map(t => t.login_state || 'unknown');
    const hasExpired = loginStates.some(s => s === 'expired');
    const allValid = loginStates.every(s => s === 'valid');
    const badgeClass = hasExpired ? 'danger' : allValid ? 'success' : 'neutral';
    const badgeText = hasExpired ? '有已过期' : allValid ? '正常' : `${domainTargets.length} 个目标`;

    return `
    <div class="list-item" data-domain="${d}">
      <div class="list-item-info">
        <div class="list-item-title">${d}</div>
        <div class="list-item-sub">
          ${companies.length > 0
            ? `<span>${companies.slice(0, 2).join('、')}${companies.length > 2 ? ' 等' : ''}</span><span>·</span>`
            : ''}
          <span class="badge-sm badge-${badgeClass}"><span class="badge-dot"></span>${badgeText}</span>
          <span>·</span>
          <span>${times[d] ? formatTime(times[d]) : '未同步'}</span>
        </div>
      </div>
      <div class="list-item-actions">
        <button class="icon-btn sync-btn" title="同步">↻</button>
        <button class="icon-btn danger remove-btn" title="移除">×</button>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.sync-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const d = btn.closest('.list-item').dataset.domain;
      btn.classList.add('spinning');
      await sendMessage({ type: 'SYNC_COOKIES', domain: d });
      btn.classList.remove('spinning');
      loadDomains();
      loadCookies();
    });
  });

  el.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const d = btn.closest('.list-item').dataset.domain;
      await removeSyncedDomain(d);
      loadDomains();
      loadCookies();
    });
  });
}

// ===== Cookies =====

async function loadCookies() {
  const el = $('#cookie-info');
  const domains = await getSyncedDomains();

  if (domains.length === 0) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🍪</div>
        <div class="empty-title">暂无 Cookie</div>
        <div class="empty-desc">添加监控域名后自动同步 Cookie</div>
      </div>`;
    return;
  }

  const results = await Promise.all(domains.map(async d => {
    try {
      const cookies = await chrome.cookies.getAll({ domain: d });
      return { domain: d, count: cookies.length, cookies };
    } catch {
      return { domain: d, count: 0, cookies: [] };
    }
  }));

  el.innerHTML = results.map(r => {
    const now = Date.now();
    const healthy = r.cookies.filter(c => !c.expirationDate || c.expirationDate * 1000 > now).length;
    const total = r.count || 1;
    const pct = Math.round((healthy / total) * 100);
    const healthClass = pct > 80 ? 'filled' : pct > 40 ? 'warning' : 'danger';

    return `
      <div class="cookie-item">
        <div class="cookie-item-header">
          <span class="cookie-item-domain">${r.domain}</span>
          <span class="cookie-count">${r.count} 个 Cookie</span>
        </div>
        <div class="cookie-health">
          <div class="health-bar ${healthClass}" style="width:${pct}%"></div>
          <div class="health-bar" style="width:${100-pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

// ===== Sync Server Domains =====

async function syncServerDomains() {
  try {
    const serverDomains = await getTrackingDomains();
    const localDomains = await getSyncedDomains();
    const merged = [...new Set([...localDomains, ...serverDomains])];
    await setSyncedDomains(merged);
  } catch {}
}

// ===== Sync All =====

$('#sync-all-btn').addEventListener('click', async () => {
  const btn = $('#sync-all-btn');
  btn.classList.add('spinning');
  setStatus('同步中...');
  await sendMessage({ type: 'SYNC_ALL' });
  btn.classList.remove('spinning');
  setStatus('同步完成，检查中...');
  await Promise.all([loadDomains(), loadCookies()]);
  pollStatusUpdates();
});

// ===== Settings =====

$('#settings-btn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ===== Modal =====

$('#add-domain-btn').addEventListener('click', () => {
  $('#modal-overlay').style.display = 'flex';
  const input = $('#modal-domain-input');
  input.value = '';
  input.focus();
});

function closeModal() {
  $('#modal-overlay').style.display = 'none';
}

$('#modal-close').addEventListener('click', closeModal);
$('#modal-cancel').addEventListener('click', closeModal);
$('#modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

$('#modal-confirm').addEventListener('click', async () => {
  const domain = $('#modal-domain-input').value.trim();
  if (!domain) return;
  await addSyncedDomain(domain);
  await sendMessage({ type: 'ADD_DOMAIN', domain });
  closeModal();
  loadDomains();
  loadCookies();
});

$('#modal-domain-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#modal-confirm').click();
  if (e.key === 'Escape') closeModal();
});

// ===== Start =====

init();
