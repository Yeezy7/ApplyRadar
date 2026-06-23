// Content script: 右侧抽屉面板 — 添加追踪 + 填写简历

(function() {
  'use strict';

  const JOB_KEYWORDS = [
    '/deliver', '/application', '/status', '/myDeliver',
    '/myApplication', '/track', '/progress', '/interview',
    '/offer', '/result', '/feedback', '/login', '/apply',
    '/resume', '/profile', '/personal', '/info',
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
    { domain: 'bytedance.com', name: '字节跳动' },
    { domain: 'xiaomi.com', name: '小米' },
    { domain: 'huawei.com', name: '华为' },
    { domain: 'alibaba.com', name: '阿里巴巴' },
    { domain: 'tencent.com', name: '腾讯' },
    { domain: '104.com.tw', name: '104人力银行' },
    { domain: 'cakeresume.com', name: 'CakeResume' },
    { domain: 'yourator.co', name: 'Yourator' },
  ];

  let drawer = null;
  let isDrawerOpen = false;
  let activeTab = 'track';

  // ========== 工具函数 ==========

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

    for (const sel of ['.company-name', '.company', '[class*="company"]', '.employer']) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) { companyName = el.textContent.trim(); break; }
    }
    for (const sel of ['.job-name', '.job-title', '[class*="job-title"]', '.position-name']) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) { jobTitle = el.textContent.trim(); break; }
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

  // ========== 表单识别（委托给 form-detector.js / form-filler.js）==========
  // 实际实现见独立模块，通过 window.ApplyRadarForms 暴露：
  //   - detectFormFields()     扫描页面，返回识别到的字段列表
  //   - fillDetectedFields()   用简历数据填充识别到的字段
  //   - identifyField(element) 识别单个元素
  // content.js 此处仅保留薄封装，便于在模块未加载时优雅降级。

  const Forms = window.ApplyRadarForms;

  function detectFormFieldsSafe() {
    if (Forms && typeof Forms.detectFormFields === 'function') {
      return Forms.detectFormFields();
    }
    console.warn('[ApplyRadar] form-detector.js 未加载，表单识别不可用');
    return [];
  }

  function identifyFieldSafe(element) {
    if (Forms && typeof Forms.identifyField === 'function') {
      return Forms.identifyField(element);
    }
    return null;
  }

  function getLabelFor(element) {
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label.textContent.trim();
    }
    const parentLabel = element.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();
    const prev = element.previousElementSibling;
    if (prev && ['LABEL', 'SPAN', 'DIV'].includes(prev.tagName)) {
      return prev.textContent.trim();
    }
    return '';
  }

  // ========== 抽屉 UI ==========

  function createDrawer() {
    if (drawer) return;

    drawer = document.createElement('div');
    drawer.id = 'applyradar-drawer';
    drawer.innerHTML = `
      <div class="ar-drawer-tab" id="ar-drawer-tab">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="6"/>
          <circle cx="12" cy="12" r="2"/>
        </svg>
      </div>
      <div class="ar-drawer-panel" id="ar-drawer-panel">
        <div class="ar-drawer-header">
          <div class="ar-drawer-tabs">
            <button class="ar-drawer-tab-btn active" data-tab="track">追踪</button>
            <button class="ar-drawer-tab-btn" data-tab="fill">填写</button>
          </div>
          <button class="ar-drawer-close" id="ar-drawer-close">✕</button>
        </div>
        <div class="ar-drawer-body" id="ar-drawer-body"></div>
      </div>
    `;

    document.body.appendChild(drawer);

    // 事件绑定
    setupDrag();
    document.getElementById('ar-drawer-close').addEventListener('click', closeDrawer);

    drawer.querySelectorAll('.ar-drawer-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        drawer.querySelectorAll('.ar-drawer-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTabContent();
      });
    });

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (isDrawerOpen && drawer && !drawer.contains(e.target)) {
        closeDrawer();
      }
    }, true);
  }

  function toggleDrawer() {
    if (isDrawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function openDrawer() {
    createDrawer();
    isDrawerOpen = true;
    drawer.querySelector('.ar-drawer-panel').classList.add('ar-drawer-panel-open');
    renderTabContent();
  }

  function closeDrawer() {
    isDrawerOpen = false;
    if (drawer) {
      drawer.querySelector('.ar-drawer-panel').classList.remove('ar-drawer-panel-open');
    }
  }

  function renderTabContent() {
    const body = document.getElementById('ar-drawer-body');
    if (!body) return;

    if (activeTab === 'track') {
      renderTrackTab(body);
    } else {
      renderFillTab(body);
    }
  }

  // ========== 追踪 Tab ==========

  function renderTrackTab(body) {
    const info = extractPageInfo();
    body.innerHTML = `
      <div class="ar-drawer-info">
        <div class="ar-drawer-info-row">
          <span class="ar-drawer-label">站点</span>
          <span class="ar-drawer-value">${info.siteName || info.domain}</span>
        </div>
        <div class="ar-drawer-info-row">
          <span class="ar-drawer-label">公司</span>
          <span class="ar-drawer-value">${info.companyName || '-'}</span>
        </div>
        <div class="ar-drawer-info-row">
          <span class="ar-drawer-label">职位</span>
          <span class="ar-drawer-value">${info.jobTitle || '-'}</span>
        </div>
        <div class="ar-drawer-info-row">
          <span class="ar-drawer-label">域名</span>
          <span class="ar-drawer-value ar-drawer-mono">${info.domain}</span>
        </div>
      </div>
      <button class="ar-drawer-btn ar-drawer-btn-primary" id="ar-track-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        添加追踪
      </button>
    `;

    document.getElementById('ar-track-btn')?.addEventListener('click', () => handleAddTracking(info, body));
  }

  function handleAddTracking(info, body) {
    const btn = document.getElementById('ar-track-btn');
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="ar-spinner"></span> 添加中...';

    chrome.runtime.sendMessage({
      type: 'ADD_TRACKING',
      data: { domain: info.domain, status_url: info.url, company_name: info.companyName, job_title: info.jobTitle },
    }, (response) => {
      if (response?.success) {
        btn.innerHTML = '✓ 已添加';
        btn.classList.add('ar-drawer-btn-success');
        setTimeout(closeDrawer, 1500);
      } else {
        btn.innerHTML = response?.error || '添加失败';
        btn.classList.add('ar-drawer-btn-error');
        setTimeout(() => {
          btn.innerHTML = '添加追踪';
          btn.disabled = false;
          btn.classList.remove('ar-drawer-btn-error');
        }, 2000);
      }
    });
  }

  // ========== 填写 Tab ==========

  function renderFillTab(body) {
    body.innerHTML = '<div class="ar-drawer-loading">获取简历数据...</div>';

    chrome.runtime.sendMessage({ type: 'GET_RESUME' }, (response) => {
      if (!response?.success || !response?.resume) {
        body.innerHTML = `
          <div class="ar-drawer-empty">
            <p>未找到简历数据</p>
            <p class="ar-drawer-hint">请先在 ApplyRadar 中创建简历</p>
          </div>
        `;
        return;
      }

      const resume = response.resume;

      // 直接列出所有简历字段，不扫描页面
      const fields = [
        { key: 'full_name', label: '姓名', value: resume.full_name },
        { key: 'phone', label: '手机', value: resume.phone },
        { key: 'email', label: '邮箱', value: resume.email },
        { key: 'gender', label: '性别', value: resume.gender },
        { key: 'birth_date', label: '出生日期', value: resume.birth_date },
        { key: 'hometown', label: '籍贯', value: resume.hometown },
        { key: 'target_position', label: '求职意向', value: resume.target_position },
        { key: 'target_city', label: '期望城市', value: resume.target_city },
        { key: 'expected_salary', label: '期望薪资', value: resume.expected_salary },
        { key: 'school', label: '学校', value: resume.education?.[0]?.school },
        { key: 'major', label: '专业', value: resume.education?.[0]?.major },
        { key: 'education', label: '学历', value: resume.education?.[0]?.degree },
        { key: 'work_company', label: '公司', value: resume.work_experience?.[0]?.company },
        { key: 'work_title', label: '职位', value: resume.work_experience?.[0]?.title },
      ].filter(f => f.value);

      if (fields.length === 0) {
        body.innerHTML = `
          <div class="ar-drawer-empty">
            <p>简历数据为空</p>
            <p class="ar-drawer-hint">请先在 ApplyRadar 中填写简历</p>
          </div>
        `;
        return;
      }

      let html = '<div class="ar-fill-fields">';
      for (const field of fields) {
        html += `
          <div class="ar-fill-field matched">
            <label class="ar-fill-label">
              <input type="checkbox" class="ar-fill-cb" data-field="${field.key}" data-value="${field.value}" checked>
              <span>${field.label}</span>
            </label>
            <span class="ar-fill-val">${field.value}</span>
          </div>
        `;
      }
      html += '</div>';
      html += `
        <div class="ar-fill-actions">
          <button class="ar-drawer-btn ar-drawer-btn-ghost" id="ar-fill-all">全不选</button>
          <button class="ar-drawer-btn ar-drawer-btn-primary" id="ar-fill-go">填写选中</button>
        </div>
      `;
      body.innerHTML = html;

      document.getElementById('ar-fill-all')?.addEventListener('click', () => {
        const cbs = body.querySelectorAll('.ar-fill-cb');
        const allOn = Array.from(cbs).every(c => c.checked);
        cbs.forEach(c => c.checked = !allOn);
      });

      document.getElementById('ar-fill-go')?.addEventListener('click', () => {
        const Forms = window.ApplyRadarForms;
        let count = 0;

        // 一次扫描页面，建立 fieldName → element 映射，避免重复遍历 DOM
        const fieldMap = new Map();
        if (Forms && typeof Forms.detectFormFields === 'function') {
          for (const f of Forms.detectFormFields()) {
            if (!fieldMap.has(f.fieldName)) fieldMap.set(f.fieldName, f.element);
          }
        }

        body.querySelectorAll('.ar-fill-cb:checked').forEach(cb => {
          const val = cb.dataset.value;
          const field = cb.dataset.field;
          if (!val) return;

          const el = fieldMap.get(field);
          if (el && Forms && typeof Forms.fillElement === 'function') {
            Forms.fillElement(el, val);
            count++;
          }
        });
        const goBtn = document.getElementById('ar-fill-go');
        if (goBtn) {
          goBtn.innerHTML = count > 0 ? `✓ 已填写 ${count} 个字段` : '未匹配到表单字段';
          goBtn.classList.add(count > 0 ? 'ar-drawer-btn-success' : 'ar-drawer-btn-error');
          setTimeout(closeDrawer, 1500);
        }
      });
    });
  }

  // ========== 拖动 ==========

  function setupDrag() {
    const tab = drawer.querySelector('.ar-drawer-tab');
    const panel = drawer.querySelector('.ar-drawer-panel');
    let dragging = false;
    let moved = false;
    let startY = 0;
    let startTop = 0;

    // 恢复上次位置
    chrome.storage.local.get('ar_tab_top', (result) => {
      if (result.ar_tab_top != null) {
        const top = result.ar_tab_top;
        tab.style.top = top + 'px';
        panel.style.top = top + 'px';
        panel.style.transform = 'none';
      }
    });

    tab.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      startY = e.clientY;
      startTop = tab.getBoundingClientRect().top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 3) moved = true;
      if (!moved) return;

      const tabH = tab.offsetHeight;
      const minY = 10;
      const maxY = window.innerHeight - tabH - 10;
      const newTop = Math.min(maxY, Math.max(minY, startTop + dy));
      tab.style.top = newTop + 'px';
      tab.style.right = '0';
      tab.style.transform = 'none';

      panel.style.top = newTop + 'px';
      panel.style.transform = 'none';
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      if (!moved) {
        toggleDrawer();
        return;
      }
      const rect = tab.getBoundingClientRect();
      const tabH = rect.height;
      const minY = 10;
      const maxY = window.innerHeight - tabH - 10;
      const clampedTop = Math.min(maxY, Math.max(minY, rect.top));

      tab.style.top = clampedTop + 'px';
      tab.style.bottom = 'auto';
      panel.style.top = clampedTop + 'px';
      panel.style.bottom = 'auto';
      panel.style.transform = 'none';

      // 保存位置
      chrome.storage.local.set({ ar_tab_top: clampedTop });
    });
  }

  // ========== 初始化 ==========

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createDrawer);
  } else {
    createDrawer();
  }
})();
