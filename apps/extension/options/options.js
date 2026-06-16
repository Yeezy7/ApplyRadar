import {
  getServerUrl, setServerUrl,
  getToken, setToken,
  getSyncedDomains, addSyncedDomain, removeSyncedDomain,
  getSyncInterval, setSyncInterval,
} from '../lib/storage.js';

const $ = (sel) => document.querySelector(sel);

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      resolve(response || { success: false });
    });
  });
}

// ========== 初始化 ==========

async function init() {
  const serverUrl = await getServerUrl();
  const token = await getToken();
  const syncInterval = await getSyncInterval();

  $('#server-url').value = serverUrl;
  $('#auth-token').value = token;
  $('#sync-interval').value = syncInterval / 60000;

  await loadDomains();
  bindEvents();
}

// ========== 域名列表 ==========

async function loadDomains() {
  const domains = await getSyncedDomains();
  const list = $('#domains-list');

  if (domains.length === 0) {
    list.innerHTML = '<div style="color:#a8a29e;font-size:12px;text-align:center;padding:12px">暂无监控域名</div>';
    return;
  }

  list.innerHTML = domains.map(d => `
    <div class="domain-item">
      <span class="domain-item-name">${d}</span>
      <button class="domain-item-remove" data-domain="${d}">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.domain-item-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      await removeSyncedDomain(btn.dataset.domain);
      await loadDomains();
    });
  });
}

// ========== 事件 ==========

function bindEvents() {
  // 保存设置
  $('#save-btn').addEventListener('click', async () => {
    const url = $('#server-url').value.trim();
    const token = $('#auth-token').value.trim();
    const interval = parseInt($('#sync-interval').value) || 5;

    try {
      if (url) await setServerUrl(url);
      await setToken(token);
      await setSyncInterval(interval * 60000);
      showStatus('save-status', '✓ 已保存', 'success');
    } catch (e) {
      showStatus('save-status', e.message, 'error');
    }
  });

  // 测试连接
  $('#test-btn').addEventListener('click', async () => {
    const btn = $('#test-btn');
    btn.disabled = true;
    btn.textContent = '测试中...';

    try {
      const url = $('#server-url').value.trim() || await getServerUrl();
      const token = $('#auth-token').value.trim() || await getToken();

      const res = await fetch(`${url}/`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      const data = await res.json();

      if (data.status === 'ok') {
        showStatus('save-status', `✓ 连接成功 (${data.version})`, 'success');
      } else {
        showStatus('save-status', '连接失败: 响应异常', 'error');
      }
    } catch (e) {
      showStatus('save-status', `连接失败: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '测试连接';
    }
  });

  // 添加域名
  $('#add-btn').addEventListener('click', async () => {
    const domain = $('#new-domain').value.trim();
    if (!domain) return;
    await addSyncedDomain(domain);
    $('#new-domain').value = '';
    await loadDomains();
  });

  $('#new-domain').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#add-btn').click();
  });

  // 同步全部
  $('#sync-all-btn').addEventListener('click', async () => {
    const btn = $('#sync-all-btn');
    btn.disabled = true;
    btn.textContent = '同步中...';
    await sendMessage({ type: 'SYNC_ALL' });
    btn.disabled = false;
    btn.textContent = '立即同步全部';
    showStatus('save-status', '✓ 同步完成', 'success');
  });

  // 检查登录状态
  $('#check-sessions-btn').addEventListener('click', async () => {
    const btn = $('#check-sessions-btn');
    btn.disabled = true;
    btn.textContent = '检查中...';
    await sendMessage({ type: 'CHECK_SESSIONS' });
    btn.disabled = false;
    btn.textContent = '检查登录状态';
    showStatus('save-status', '✓ 检查完成', 'success');
  });

  // 退出登录
  $('#logout-btn').addEventListener('click', async () => {
    if (confirm('确定退出登录？')) {
      await setToken('');
      showStatus('save-status', '✓ 已退出登录', 'success');
    }
  });
}

function showStatus(id, message, type) {
  const el = $(`#${id}`);
  el.textContent = message;
  el.className = `status ${type}`;
  setTimeout(() => {
    el.textContent = '';
    el.className = 'status';
  }, 4000);
}

// ========== 启动 ==========

init();
