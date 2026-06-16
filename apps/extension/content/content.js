// Content script: 检测求职相关页面，显示「添加追踪」按钮

(function() {
  'use strict';

  const JOB_KEYWORDS = [
    '/deliver', '/application', '/status', '/myDeliver',
    '/myApplication', '/track', '/progress', '/interview',
    '/offer', '/result', '/feedback', '/login',
  ];

  const SITE_PATTERNS = [
    { domain: 'hotjob.cn', name: '招聘平台' },
    { domain: 'zhipin.com', name: 'BOSS 直聘' },
    { domain: 'lagou.com', name: '拉勾' },
    { domain: 'liepin.com', name: '猎聘' },
    { domain: 'zhaopin.com', name: '智联招聘' },
    { domain: '51job.com', name: '前程无忧' },
    { domain: 'nowcoder.com', name: '牛客' },
    { domain: 'mokahr.com', name: '摩卡' },
    { domain: 'cemc.com.cn', name: '测评平台' },
    { domain: 'bytedance.com', name: '字节跳动' },
    { domain: 'xiaomi.com', name: '小米' },
    { domain: 'huawei.com', name: '华为' },
    { domain: 'alibaba.com', name: '阿里巴巴' },
    { domain: 'tencent.com', name: '腾讯' },
  ];

  let fabContainer = null;
  let isExpanded = false;

  function isJobPage() {
    const url = window.location.href.toLowerCase();
    const domain = window.location.hostname.toLowerCase();
    if (JOB_KEYWORDS.some(kw => url.includes(kw))) return true;
    if (SITE_PATTERNS.some(p => domain.includes(p.domain))) return true;
    return false;
  }

  function detectSiteName() {
    const domain = window.location.hostname.toLowerCase();
    for (const p of SITE_PATTERNS) {
      if (domain.includes(p.domain)) return p.name;
    }
    return null;
  }

  function extractPageInfo() {
    const title = document.title || '';
    const h1 = document.querySelector('h1')?.textContent?.trim() || '';

    let companyName = '';
    let jobTitle = '';

    const companySelectors = [
      '.company-name', '.company', '[class*="company"]',
      '.employer', '.org-name', '.comp-name',
    ];
    for (const sel of companySelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        companyName = el.textContent.trim();
        break;
      }
    }

    const jobSelectors = [
      '.job-name', '.job-title', '[class*="job-title"]',
      '.position-name', '.role-title', '.job-name-text',
    ];
    for (const sel of jobSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        jobTitle = el.textContent.trim();
        break;
      }
    }

    if (!companyName) companyName = title.split(/[-|–—]/)[0]?.trim() || title;
    if (!jobTitle) jobTitle = h1 || title;

    return {
      companyName: companyName.substring(0, 100),
      jobTitle: jobTitle.substring(0, 100),
      url: window.location.href,
      domain: window.location.hostname,
      siteName: detectSiteName(),
    };
  }

  function createFAB() {
    if (fabContainer) return;

    fabContainer = document.createElement('div');
    fabContainer.id = 'applyradar-fab';
    fabContainer.innerHTML = `
      <div class="ar-fab-btn" title="ApplyRadar">
        <svg class="ar-fab-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="6"/>
          <circle cx="12" cy="12" r="2"/>
          <line x1="12" y1="2" x2="12" y2="6"/>
        </svg>
      </div>
      <div class="ar-fab-panel">
        <div class="ar-fab-header">
          <span class="ar-fab-title">ApplyRadar</span>
          <button class="ar-fab-close">✕</button>
        </div>
        <div class="ar-fab-body" id="ar-fab-body">
          <div class="ar-fab-loading">检测页面中...</div>
        </div>
      </div>
    `;

    document.body.appendChild(fabContainer);

    const btn = fabContainer.querySelector('.ar-fab-btn');
    const panel = fabContainer.querySelector('.ar-fab-panel');
    const closeBtn = fabContainer.querySelector('.ar-fab-close');

    btn.addEventListener('click', () => {
      isExpanded = !isExpanded;
      panel.classList.toggle('ar-fab-panel-open', isExpanded);
      if (isExpanded) updatePanelContent();
    });

    closeBtn.addEventListener('click', () => {
      isExpanded = false;
      panel.classList.remove('ar-fab-panel-open');
    });

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!fabContainer.contains(e.target) && isExpanded) {
        isExpanded = false;
        panel.classList.remove('ar-fab-panel-open');
      }
    });
  }

  function updatePanelContent() {
    const body = document.getElementById('ar-fab-body');
    if (!body) return;

    const info = extractPageInfo();

    body.innerHTML = `
      <div class="ar-fab-info">
        <div class="ar-fab-info-row">
          <span class="ar-fab-label">站点</span>
          <span class="ar-fab-value">${info.siteName || info.domain}</span>
        </div>
        <div class="ar-fab-info-row">
          <span class="ar-fab-label">公司</span>
          <span class="ar-fab-value">${info.companyName || '-'}</span>
        </div>
        <div class="ar-fab-info-row">
          <span class="ar-fab-label">职位</span>
          <span class="ar-fab-value">${info.jobTitle || '-'}</span>
        </div>
        <div class="ar-fab-info-row">
          <span class="ar-fab-label">域名</span>
          <span class="ar-fab-value ar-fab-domain">${info.domain}</span>
        </div>
      </div>
      <button class="ar-fab-confirm" id="ar-fab-confirm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        添加追踪
      </button>
    `;

    document.getElementById('ar-fab-confirm')?.addEventListener('click', () => {
      handleAddTracking(info);
    });
  }

  function handleAddTracking(info) {
    const confirmBtn = document.getElementById('ar-fab-confirm');
    if (!confirmBtn) return;

    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="ar-spinner"></span> 添加中...';

    chrome.runtime.sendMessage({
      type: 'ADD_TRACKING',
      data: {
        domain: info.domain,
        status_url: info.url,
        company_name: info.companyName,
        job_title: info.jobTitle,
      },
    }, (response) => {
      if (response?.success) {
        confirmBtn.innerHTML = '✓ 已添加';
        confirmBtn.classList.add('ar-fab-success');
        setTimeout(() => {
          isExpanded = false;
          document.querySelector('.ar-fab-panel')?.classList.remove('ar-fab-panel-open');
          confirmBtn.disabled = false;
          confirmBtn.classList.remove('ar-fab-success');
        }, 2000);
      } else {
        confirmBtn.innerHTML = response?.error || '添加失败';
        confirmBtn.classList.add('ar-fab-error');
        setTimeout(() => {
          confirmBtn.innerHTML = '添加追踪';
          confirmBtn.disabled = false;
          confirmBtn.classList.remove('ar-fab-error');
        }, 2500);
      }
    });
  }

  // 初始化
  if (isJobPage()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createFAB);
    } else {
      createFAB();
    }
  }
})();
