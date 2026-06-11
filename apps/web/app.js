const API_BASE_KEY = "applyradar.web.apiBase";
const TOKEN_KEY = "applyradar.web.token";
const USER_KEY = "applyradar.web.user";
const THEME_KEY = "applyradar.web.theme";
const DEMO_KEY = "applyradar.web.demo";

const statusOptions = [
  ["to_apply", "待投递"],
  ["applied", "已投递"],
  ["received", "已收到"],
  ["under_review", "审核中"],
  ["assessment", "测评"],
  ["interview", "面试"],
  ["final_interview", "终面"],
  ["offer", "Offer"],
  ["rejected", "已拒绝"],
  ["withdrawn", "已撤回"],
  ["unknown", "未知"],
];

const priorityOptions = [
  ["low", "低"],
  ["medium", "中"],
  ["high", "高"],
];

const navItems = [
  { key: "dashboard", label: "总览", hint: "状态与近期动作" },
  { key: "applications", label: "求职记录", hint: "管理岗位与流转" },
  { key: "kanban", label: "看板", hint: "按阶段查看机会" },
  { key: "reminders", label: "提醒", hint: "面试与跟进安排" },
  { key: "settings", label: "连接设置", hint: "服务地址与账号状态" },
];

const demoApplications = [
  {
    id: "demo-1",
    company_name: "字节跳动",
    job_title: "后端工程师",
    location: "上海",
    source: "official",
    status: "interview",
    priority: "high",
    applied_at: "2026-06-03",
    updated_at: "2026-06-10T11:20:00.000Z",
    notes: "二面在周四晚上，准备系统设计。",
  },
  {
    id: "demo-2",
    company_name: "腾讯",
    job_title: "前端开发",
    location: "深圳",
    source: "referral",
    status: "under_review",
    priority: "medium",
    applied_at: "2026-06-01",
    updated_at: "2026-06-09T16:40:00.000Z",
    notes: "内推渠道，等待 HR 筛选。",
  },
  {
    id: "demo-3",
    company_name: "美团",
    job_title: "数据分析师",
    location: "北京",
    source: "official",
    status: "assessment",
    priority: "high",
    applied_at: "2026-06-07",
    updated_at: "2026-06-10T09:00:00.000Z",
    notes: "在线测评本周截止。",
  },
  {
    id: "demo-4",
    company_name: "阿里云",
    job_title: "AI 平台实习生",
    location: "杭州",
    source: "linkedin",
    status: "applied",
    priority: "medium",
    applied_at: "2026-06-08",
    updated_at: "2026-06-08T15:10:00.000Z",
    notes: "需要补一版更偏基础设施的简历。",
  },
];

const demoReminders = [
  { id: "rem-1", title: "美团测评截止", content: "明晚 23:00 前完成。", remind_at: "2026-06-12T15:00:00.000Z" },
  { id: "rem-2", title: "字节二面准备", content: "把系统设计题过一遍。", remind_at: "2026-06-12T10:30:00.000Z" },
];

const state = {
  apiBase: localStorage.getItem(API_BASE_KEY) || "http://127.0.0.1:3000",
  token: localStorage.getItem(TOKEN_KEY) || "",
  user: readJson(USER_KEY),
  theme: localStorage.getItem(THEME_KEY) || "light",
  demoMode: localStorage.getItem(DEMO_KEY) === "true",
  authMode: "login",
  currentView: "dashboard",
  dashboard: null,
  applications: [],
  reminders: [],
  loading: false,
  error: "",
  notice: "",
  authError: "",
  search: "",
  statusFilter: "",
  formOpen: false,
  editingId: null,
  authForm: { email: "", password: "", nickname: "" },
  appForm: emptyApplicationForm(),
};

const root = document.querySelector("#app");

function readJson(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function emptyApplicationForm() {
  return {
    company_name: "",
    job_title: "",
    location: "",
    source: "manual",
    status: "to_apply",
    priority: "medium",
    applied_at: "",
    notes: "",
  };
}

function statusLabel(value) {
  return statusOptions.find(([key]) => key === value)?.[1] || value;
}

function priorityLabel(value) {
  return priorityOptions.find(([key]) => key === value)?.[1] || value;
}

function sourceLabel(value) {
  const map = {
    official: "官网",
    email: "邮件",
    referral: "内推",
    linkedin: "LinkedIn",
    boss: "BOSS",
    manual: "手动",
  };
  return map[value] || value || "-";
}

function icon(name) {
  const icons = {
    dashboard: "◎",
    applications: "▦",
    kanban: "▤",
    reminders: "◌",
    settings: "◍",
    radar: "◔",
    sun: "☼",
    moon: "☾",
    spark: "✦",
    warning: "!",
    success: "✓",
    arrow: "↗",
  };
  return icons[name] || "•";
}

function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
}

function toggleTheme() {
  setTheme(state.theme === "light" ? "dark" : "light");
  render();
}

function setNotice(message) {
  state.notice = message;
  state.error = "";
  render();
}

function setError(message) {
  state.error = message;
  state.notice = "";
  render();
}

async function apiRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${state.apiBase}${path}`, {
    ...options,
    headers,
  });

  const result = await response.json();
  if (!response.ok || result.code !== 0) {
    throw new Error(result.msg || "请求失败");
  }
  return result.data;
}

async function login() {
  state.loading = true;
  state.authError = "";
  render();

  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: state.authForm.email,
        password: state.authForm.password,
      }),
    });
    state.token = data.token;
    state.user = data.user;
    state.demoMode = false;
    localStorage.setItem(TOKEN_KEY, data.token);
    writeJson(USER_KEY, data.user);
    localStorage.removeItem(DEMO_KEY);
    await bootstrapApp();
  } catch (error) {
    state.authError = error instanceof Error ? error.message : String(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function register() {
  state.loading = true;
  state.authError = "";
  render();

  try {
    const data = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: state.authForm.email,
        password: state.authForm.password,
        nickname: state.authForm.nickname,
      }),
    });
    state.token = data.token;
    state.user = data.user;
    state.demoMode = false;
    localStorage.setItem(TOKEN_KEY, data.token);
    writeJson(USER_KEY, data.user);
    localStorage.removeItem(DEMO_KEY);
    await bootstrapApp();
  } catch (error) {
    state.authError = error instanceof Error ? error.message : String(error);
  } finally {
    state.loading = false;
    render();
  }
}

function enterDemoMode() {
  state.demoMode = true;
  state.token = "";
  state.user = { nickname: "演示账户" };
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.setItem(DEMO_KEY, "true");
  hydrateDemoData();
  render();
}

function logout() {
  state.token = "";
  state.user = null;
  state.demoMode = false;
  state.dashboard = null;
  state.applications = [];
  state.reminders = [];
  state.currentView = "dashboard";
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(DEMO_KEY);
  render();
}

function hydrateDemoData() {
  state.applications = [...demoApplications];
  state.reminders = [...demoReminders];
  state.dashboard = buildDashboardFromApplications(state.applications, state.reminders);
}

function buildDashboardFromApplications(applications, reminders) {
  const activeStatuses = ["applied", "received", "under_review", "assessment", "interview", "final_interview"];
  const total = applications.length;
  const active = applications.filter((item) => activeStatuses.includes(item.status)).length;
  const thisWeek = applications.filter((item) => daysBetween(item.created_at || item.updated_at) <= 7).length;
  const offers = applications.filter((item) => item.status === "offer").length;
  const statusCounts = {};

  applications.forEach((item) => {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  });

  return {
    total,
    active,
    thisWeek,
    offers,
    pendingReminders: reminders.length,
    statusCounts,
    recentApps: [...applications].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 5),
  };
}

async function bootstrapApp() {
  state.loading = true;
  state.error = "";
  render();

  if (state.demoMode) {
    hydrateDemoData();
    state.loading = false;
    render();
    return;
  }

  try {
    const [dashboard, applications, reminders] = await Promise.all([
      apiRequest("/api/stats"),
      apiRequest("/api/applications"),
      apiRequest("/api/reminders"),
    ]);

    state.dashboard = dashboard;
    state.applications = applications;
    state.reminders = reminders;
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function refreshApplications() {
  if (state.demoMode) {
    state.dashboard = buildDashboardFromApplications(state.applications, state.reminders);
    render();
    return;
  }

  state.loading = true;
  render();

  try {
    const params = new URLSearchParams();
    if (state.search.trim()) params.set("search", state.search.trim());
    if (state.statusFilter) params.set("status", state.statusFilter);
    state.applications = await apiRequest(`/api/applications${params.toString() ? `?${params}` : ""}`);
    state.dashboard = await apiRequest("/api/stats");
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function saveApplication() {
  const payload = {
    ...state.appForm,
    applied_at: state.appForm.applied_at || null,
  };

  state.loading = true;
  render();

  try {
    if (state.demoMode) {
      if (state.editingId) {
        state.applications = state.applications.map((item) =>
          item.id === state.editingId
            ? { ...item, ...payload, updated_at: new Date().toISOString() }
            : item
        );
      } else {
        state.applications.unshift({
          id: crypto.randomUUID(),
          ...payload,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } else if (state.editingId) {
      await apiRequest(`/api/applications/${state.editingId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      state.applications = await apiRequest("/api/applications");
      state.dashboard = await apiRequest("/api/stats");
    } else {
      await apiRequest("/api/applications", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.applications = await apiRequest("/api/applications");
      state.dashboard = await apiRequest("/api/stats");
    }

    state.formOpen = false;
    state.editingId = null;
    state.appForm = emptyApplicationForm();
    state.dashboard = buildDashboardFromApplications(state.applications, state.reminders);
    setNotice("求职记录已保存");
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function deleteApplication(id) {
  if (!confirm("确定删除这条求职记录吗？")) return;

  state.loading = true;
  render();

  try {
    if (state.demoMode) {
      state.applications = state.applications.filter((item) => item.id !== id);
      state.dashboard = buildDashboardFromApplications(state.applications, state.reminders);
    } else {
      await apiRequest(`/api/applications/${id}`, { method: "DELETE" });
      state.applications = await apiRequest("/api/applications");
      state.dashboard = await apiRequest("/api/stats");
    }
    setNotice("记录已删除");
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    state.loading = false;
    render();
  }
}

function openCreateModal() {
  state.editingId = null;
  state.appForm = emptyApplicationForm();
  state.formOpen = true;
  render();
}

function openEditModal(id) {
  const item = state.applications.find((entry) => entry.id === id);
  if (!item) return;
  state.editingId = id;
  state.appForm = {
    company_name: item.company_name || "",
    job_title: item.job_title || "",
    location: item.location || "",
    source: item.source || "manual",
    status: item.status || "to_apply",
    priority: item.priority || "medium",
    applied_at: item.applied_at ? item.applied_at.slice(0, 10) : "",
    notes: item.notes || "",
  };
  state.formOpen = true;
  render();
}

function closeModal() {
  state.formOpen = false;
  state.editingId = null;
  state.appForm = emptyApplicationForm();
  render();
}

function daysBetween(value) {
  if (!value) return 0;
  const diff = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function pipelineData() {
  const groups = [
    { key: "to_apply", label: "准备", color: "#6b7280" },
    { key: "applied", label: "已投递", color: "#2563eb", aliases: ["received"] },
    { key: "under_review", label: "评估", color: "#f59e0b", aliases: ["assessment"] },
    { key: "interview", label: "面试", color: "#7c3aed", aliases: ["final_interview"] },
    { key: "offer", label: "结果", color: "#10b981", aliases: ["rejected", "withdrawn"] },
  ];

  return groups.map((group) => {
    const count = state.applications.filter((item) => [group.key, ...(group.aliases || [])].includes(item.status)).length;
    return { ...group, count };
  });
}

function buildAuthView() {
  const isRegister = state.authMode === "register";
  return `
    <div class="auth-shell">
      <div class="auth-card">
        <section class="auth-hero">
          <span class="brand-chip">${icon("radar")} ApplyRadar</span>
          <div>
            <p class="mode-chip">求职追踪</p>
            <h1 class="hero-title">把每一次投递都跟进到底。</h1>
            <p class="hero-copy">集中查看岗位进度、待处理提醒和最近变化，让投递节奏更清楚。</p>
          </div>
          <div class="hero-grid">
            <article class="hero-stat">
              <span class="muted">投递进度</span>
              <strong>总览 + 记录</strong>
              <span class="tiny muted">随时回看每个岗位当前走到哪一步。</span>
            </article>
            <article class="hero-stat">
              <span class="muted">待办提醒</span>
              <strong>跟进更及时</strong>
              <span class="tiny muted">把面试、测评和回访安排放到同一个列表里。</span>
            </article>
          </div>
          <article class="auth-pane-card">
            <h3>当前可用</h3>
            <p class="auth-copy">账号登录、仪表盘、求职记录管理、提醒查看，以及右上角浅色 / 深色切换。</p>
          </article>
        </section>
        <section class="auth-form">
          <div class="auth-inline">
            <div>
              <h2>${isRegister ? "创建账号" : "登录 ApplyRadar"}</h2>
              <p class="auth-copy">登录后继续管理你的投递记录和提醒。</p>
            </div>
            <button class="theme-button" data-action="toggle-theme">${state.theme === "light" ? icon("moon") : icon("sun")} ${state.theme === "light" ? "深色" : "浅色"}</button>
          </div>
          <div class="field">
            <label>API Base URL</label>
            <input name="apiBase" value="${escapeHtml(state.apiBase)}" placeholder="http://127.0.0.1:3000" />
            <span class="field-help">填写服务地址，例如 <code>http://127.0.0.1:3000</code>。</span>
          </div>
          ${isRegister ? `
            <div class="field">
              <label>昵称</label>
              <input name="nickname" value="${escapeHtml(state.authForm.nickname)}" placeholder="比如：Yeezy" />
            </div>
          ` : ""}
          <div class="field">
            <label>邮箱</label>
            <input name="email" value="${escapeHtml(state.authForm.email)}" placeholder="you@example.com" />
          </div>
          <div class="field">
            <label>密码</label>
            <input name="password" type="password" value="${escapeHtml(state.authForm.password)}" placeholder="至少 6 位" />
          </div>
          ${state.authError ? `<div class="notice error">${escapeHtml(state.authError)}</div>` : ""}
          <div class="auth-actions">
            <button class="button-primary" data-action="${isRegister ? "register" : "login"}">${state.loading ? "处理中..." : isRegister ? "创建并进入" : "登录"}</button>
            <button class="button-secondary" data-action="enter-demo">查看示例数据</button>
            <button class="button-ghost" data-action="toggle-auth-mode">${isRegister ? "已有账号，去登录" : "没有账号，去注册"}</button>
          </div>
        </section>
      </div>
    </div>
  `;
}

function buildMetricCards() {
  const dashboard = state.dashboard || buildDashboardFromApplications(state.applications, state.reminders);
  const cards = [
    ["总投递", dashboard.total, `${dashboard.thisWeek} 个本周新增`, icon("spark")],
    ["进行中", dashboard.active, "仍在推进中的机会", icon("arrow")],
    ["提醒", dashboard.pendingReminders, "需要手动处理", icon("warning")],
    ["Offer", dashboard.offers, "当前拿到的结果", icon("success")],
  ];

  return `
    <div class="metrics-grid">
      ${cards.map(([label, value, copy, glyph]) => `
        <article class="metric-card">
          <div class="metric-row">
            <div>
              <h3>${label}</h3>
              <div class="metric-value">${value}</div>
              <p class="muted">${copy}</p>
            </div>
            <span class="mini-chip">${glyph}</span>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function buildDashboardView() {
  const dashboard = state.dashboard || buildDashboardFromApplications(state.applications, state.reminders);
  const stages = pipelineData();
  const actionItems = [];

  if (dashboard.pendingReminders) {
    actionItems.push(["待办提醒", `${dashboard.pendingReminders} 个待处理提醒`, "warning"]);
  }
  if (dashboard.offers) {
    actionItems.push(["Offer 跟进", `${dashboard.offers} 个结果等待处理`, "success"]);
  }
  if (!actionItems.length) {
    actionItems.push(["当前状态平稳", "暂时没有高优先级动作", "success"]);
  }

  return `
    ${buildMetricCards()}
    <div class="page-grid">
      <section class="panel">
        <header class="panel-header">
          <div>
            <h3>投递管线</h3>
            <p class="muted">先判断机会集中卡在哪个阶段</p>
          </div>
          <span class="mini-chip">${icon("radar")} 当前总览</span>
        </header>
        <div class="panel-body">
          <div class="pipeline-grid">
            ${stages.map((stage) => `
              <div class="stage">
                <strong>${stage.label}</strong>
                <span class="muted">${stage.count} 条</span>
                <div class="stage-bar"><span style="width:${Math.max(12, stage.count * 18)}%; background:${stage.color}"></span></div>
              </div>
            `).join("")}
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>公司</th><th>岗位</th><th>状态</th><th>更新</th></tr>
              </thead>
              <tbody>
                ${(dashboard.recentApps || []).map((item) => `
                  <tr class="table-row">
                    <td>${escapeHtml(item.company_name)}</td>
                    <td>${escapeHtml(item.job_title)}</td>
                    <td><span class="status-pill ${item.status}">${statusLabel(item.status)}</span></td>
                    <td>${formatDate(item.updated_at)}</td>
                  </tr>
                `).join("") || `<tr><td colspan="4" class="empty-state"><div class="empty-copy">还没有求职记录，先去“求职记录”里加一条。</div></td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <div class="stack">
        <section class="panel">
          <header class="panel-header">
            <div>
              <h3>行动队列</h3>
              <p class="muted">把今天该动手的事情放前面</p>
            </div>
          </header>
          <div class="panel-body action-list">
            ${actionItems.map(([title, copy, tone]) => `
              <article class="list-item">
                <div>
                  <strong>${title}</strong>
                  <p class="muted">${copy}</p>
                </div>
                <span class="tag ${tone}">${tone === "success" ? "稳定" : "待处理"}</span>
              </article>
            `).join("")}
          </div>
        </section>
        <section class="panel">
          <header class="panel-header">
            <div>
              <h3>近期提醒</h3>
              <p class="muted">面试、测评和跟进动作</p>
            </div>
          </header>
          <div class="panel-body activity-list">
            ${state.reminders.slice(0, 4).map((item) => `
              <article class="list-item">
                <div>
                  <strong>${escapeHtml(item.title)}</strong>
                  <p class="muted">${escapeHtml(item.content || "暂无补充说明")}</p>
                </div>
                <span class="mini-chip">${formatDate(item.remind_at)}</span>
              </article>
            `).join("") || `<div class="empty-state"><div class="empty-copy">目前没有待提醒事项。</div></div>`}
          </div>
        </section>
      </div>
    </div>
  `;
}

function buildApplicationsView() {
  return `
    <div class="split">
      <section class="panel">
        <header class="panel-header">
          <div>
            <h3>求职记录</h3>
            <p class="muted">搜索、筛选、维护每条岗位状态</p>
          </div>
          <div class="table-actions">
            <button class="button-secondary" data-action="refresh-applications">刷新</button>
            <button class="button-primary" data-action="open-create">新建记录</button>
          </div>
        </header>
        <div class="panel-body">
          <div class="toolbar">
            <div class="toolbar-left">
              <label class="toolbar-search">
                <input name="search" value="${escapeHtml(state.search)}" placeholder="搜索公司、岗位、地点" />
              </label>
              <select name="statusFilter">
                <option value="">全部状态</option>
                ${statusOptions.map(([value, label]) => `<option value="${value}" ${state.statusFilter === value ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>公司</th>
                  <th>岗位</th>
                  <th>状态</th>
                  <th>优先级</th>
                  <th>来源</th>
                  <th>等待</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                ${state.applications.map((item) => `
                  <tr class="table-row">
                    <td class="company-cell">
                      <strong>${escapeHtml(item.company_name)}</strong>
                      <span class="muted tiny">${escapeHtml(item.location || "未填写地点")}</span>
                    </td>
                    <td>${escapeHtml(item.job_title)}</td>
                    <td><span class="status-pill ${item.status}">${statusLabel(item.status)}</span></td>
                    <td><span class="priority-pill ${item.priority}">${priorityLabel(item.priority)}</span></td>
                    <td>${sourceLabel(item.source)}</td>
                    <td>${daysBetween(item.applied_at || item.updated_at)} 天</td>
                    <td>
                      <div class="table-actions">
                        <button class="button-ghost" data-action="edit-application" data-id="${item.id}">编辑</button>
                        <button class="button-danger" data-action="delete-application" data-id="${item.id}">删除</button>
                      </div>
                    </td>
                  </tr>
                `).join("") || `<tr><td colspan="7" class="empty-state"><div class="empty-copy">还没有记录，先新建一条试试。</div></td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <aside class="stack">
        <section class="placeholder-card">
          <h3>本周重点</h3>
          <p class="muted">优先补齐状态变更、等待时间较长和高优先级岗位，列表会更有参考价值。</p>
        </section>
        <section class="placeholder-card">
          <h3>筛选建议</h3>
          <p class="muted">先按状态缩小范围，再搜索公司或岗位名称，会比直接翻表更快。</p>
        </section>
      </aside>
    </div>
  `;
}

function buildKanbanView() {
  const columns = [
    ["待投递", ["to_apply"]],
    ["已投递", ["applied", "received"]],
    ["评估中", ["under_review", "assessment"]],
    ["面试中", ["interview", "final_interview"]],
    ["结果", ["offer", "rejected", "withdrawn"]],
  ];

  return `
    <section class="panel">
      <header class="panel-header">
        <div>
          <h3>状态看板</h3>
          <p class="muted">按阶段快速查看机会分布和当前推进位置。</p>
        </div>
      </header>
      <div class="panel-body">
        <div class="kanban-grid">
          ${columns.map(([label, statuses]) => `
            <div class="kanban-column">
              <strong>${label}</strong>
              <p class="muted tiny">${state.applications.filter((item) => statuses.includes(item.status)).length} 条</p>
              ${state.applications.filter((item) => statuses.includes(item.status)).map((item) => `
                <article class="column-card">
                  <strong>${escapeHtml(item.company_name)}</strong>
                  <p class="muted">${escapeHtml(item.job_title)}</p>
                </article>
              `).join("") || `<div class="empty-state"><div class="empty-copy">暂无记录</div></div>`}
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function buildRemindersView() {
  return `
    <section class="panel">
      <header class="panel-header">
        <div>
          <h3>提醒</h3>
          <p class="muted">把面试、测评和回访安排集中收在这里。</p>
        </div>
      </header>
      <div class="panel-body activity-list">
        ${state.reminders.map((item) => `
          <article class="list-item">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <p class="muted">${escapeHtml(item.content || "暂无补充说明")}</p>
            </div>
            <span class="mini-chip">${formatDate(item.remind_at)}</span>
          </article>
        `).join("") || `<div class="empty-state"><div class="empty-copy">暂无提醒。</div></div>`}
      </div>
    </section>
  `;
}

function buildSettingsView() {
  return `
    <section class="panel">
      <header class="panel-header">
        <div>
          <h3>偏好设置</h3>
          <p class="muted">管理连接地址、主题和当前账号</p>
        </div>
      </header>
      <div class="panel-body settings-list">
        <div class="field">
          <label>API Base URL</label>
          <input name="apiBase" value="${escapeHtml(state.apiBase)}" placeholder="http://127.0.0.1:3000" />
        </div>
        <article class="list-item">
          <div>
            <strong>主题模式</strong>
            <p class="muted">右上角可随时切换浅色和深色</p>
          </div>
          <button class="theme-button" data-action="toggle-theme">${state.theme === "light" ? icon("moon") : icon("sun")} ${state.theme === "light" ? "深色" : "浅色"}</button>
        </article>
        <article class="list-item">
          <div>
            <strong>当前账号</strong>
            <p class="muted">${state.demoMode ? "示例数据" : escapeHtml(state.user?.nickname || state.user?.email || "未登录")}</p>
          </div>
          <button class="button-ghost" data-action="logout">退出</button>
        </article>
      </div>
    </section>
  `;
}

function buildAppShell() {
  const current = navItems.find((item) => item.key === state.currentView) || navItems[0];
  return `
    <div class="shell">
      <aside class="app-sidebar">
        <div class="sidebar-brand">
          <div class="brand-mark">AR</div>
          <div>
            <h1>ApplyRadar</h1>
            <p class="muted">求职追踪</p>
          </div>
        </div>
        <nav class="nav-group">
          ${navItems.map((item) => `
            <button class="nav-button ${item.key === state.currentView ? "active" : ""}" data-action="switch-view" data-view="${item.key}">
              <span>${icon(item.key)}</span>
              <span class="nav-meta">
                <strong>${item.label}</strong>
                <small>${item.hint}</small>
              </span>
              ${item.key === "applications" ? `<span class="nav-count">${state.applications.length}</span>` : ""}
            </button>
          `).join("")}
        </nav>
        <div class="sidebar-footer">
          <span class="brand-chip">${state.demoMode ? "示例" : "连接中"}</span>
          <h3 style="margin: 12px 0 0;">${state.demoMode ? "当前为示例数据" : "当前连接地址"}</h3>
          <p class="muted">${state.demoMode ? "可先浏览界面与流程。" : escapeHtml(state.apiBase)}</p>
        </div>
      </aside>
      <main class="app-main">
        <div class="toolbar">
          <div class="toolbar-left app-head">
            <div>
              <h2>${current.label}</h2>
              <p class="muted">${current.hint}</p>
            </div>
          </div>
          <div class="toolbar-right">
            <span class="toolbar-chip">${state.demoMode ? "示例数据" : `你好，${escapeHtml(state.user?.nickname || state.user?.email || "用户")}`}</span>
            <button class="theme-button" data-action="toggle-theme">${state.theme === "light" ? icon("moon") : icon("sun")} ${state.theme === "light" ? "深色" : "浅色"}</button>
          </div>
        </div>
        ${state.notice ? `<div class="notice success">${escapeHtml(state.notice)}</div>` : ""}
        ${state.error ? `<div class="notice error">${escapeHtml(state.error)}</div>` : ""}
        ${state.loading ? `<div class="notice">正在同步数据，请稍候…</div>` : ""}
        ${renderCurrentView()}
        ${state.formOpen ? buildApplicationModal() : ""}
      </main>
    </div>
  `;
}

function buildApplicationModal() {
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <div class="modal-card" data-stop-close="true">
        <header class="panel-header">
          <div>
            <h3>${state.editingId ? "编辑求职记录" : "新建求职记录"}</h3>
            <p class="muted">先把浏览器端最核心的录入流转通。</p>
          </div>
        </header>
        <div class="modal-body">
          <div class="field">
            <label>公司</label>
            <input name="company_name" value="${escapeHtml(state.appForm.company_name)}" />
          </div>
          <div class="field">
            <label>岗位</label>
            <input name="job_title" value="${escapeHtml(state.appForm.job_title)}" />
          </div>
          <div class="field">
            <label>地点</label>
            <input name="location" value="${escapeHtml(state.appForm.location)}" />
          </div>
          <div class="field">
            <label>来源</label>
            <select name="source">
              ${["manual", "official", "referral", "email", "linkedin", "boss"].map((value) => `<option value="${value}" ${state.appForm.source === value ? "selected" : ""}>${sourceLabel(value)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>状态</label>
            <select name="status">
              ${statusOptions.map(([value, label]) => `<option value="${value}" ${state.appForm.status === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>优先级</label>
            <select name="priority">
              ${priorityOptions.map(([value, label]) => `<option value="${value}" ${state.appForm.priority === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </div>
          <div class="field span-2">
            <label>投递日期</label>
            <input type="date" name="applied_at" value="${escapeHtml(state.appForm.applied_at)}" />
          </div>
          <div class="field span-2">
            <label>备注</label>
            <textarea name="notes">${escapeHtml(state.appForm.notes)}</textarea>
          </div>
        </div>
        <div class="modal-actions">
          <button class="button-ghost" data-action="close-modal">取消</button>
          <button class="button-primary" data-action="save-application">${state.loading ? "保存中..." : "保存记录"}</button>
        </div>
      </div>
    </div>
  `;
}

function renderCurrentView() {
  if (state.currentView === "dashboard") return buildDashboardView();
  if (state.currentView === "applications") return buildApplicationsView();
  if (state.currentView === "kanban") return buildKanbanView();
  if (state.currentView === "reminders") return buildRemindersView();
  return buildSettingsView();
}

function render() {
  root.innerHTML = state.token || state.demoMode ? buildAppShell() : buildAuthView();
  document.documentElement.dataset.theme = state.theme;
  bindEvents();
}

function bindEvents() {
  root.querySelectorAll("[data-action]").forEach((node) => {
    node.addEventListener("click", async (event) => {
      const action = event.currentTarget.dataset.action;
      if (action === "toggle-theme") return toggleTheme();
      if (action === "toggle-auth-mode") {
        state.authMode = state.authMode === "login" ? "register" : "login";
        state.authError = "";
        return render();
      }
      if (action === "enter-demo") return enterDemoMode();
      if (action === "login") return login();
      if (action === "register") return register();
      if (action === "logout") return logout();
      if (action === "switch-view") {
        state.currentView = event.currentTarget.dataset.view;
        state.notice = "";
        state.error = "";
        return render();
      }
      if (action === "refresh-applications") return refreshApplications();
      if (action === "open-create") return openCreateModal();
      if (action === "edit-application") return openEditModal(event.currentTarget.dataset.id);
      if (action === "delete-application") return deleteApplication(event.currentTarget.dataset.id);
      if (action === "save-application") return saveApplication();
      if (action === "close-modal") {
        if (event.target.closest('[data-stop-close="true"]')) return;
        return closeModal();
      }
    });
  });

  root.querySelectorAll('input[name="apiBase"]').forEach((input) => {
    input.addEventListener("change", (event) => {
      state.apiBase = event.currentTarget.value.trim() || "http://127.0.0.1:3000";
      localStorage.setItem(API_BASE_KEY, state.apiBase);
    });
  });

  const authFields = ["email", "password", "nickname"];
  authFields.forEach((field) => {
    const input = root.querySelector(`input[name="${field}"]`);
    if (!input) return;
    input.addEventListener("input", (event) => {
      state.authForm[field] = event.currentTarget.value;
    });
  });

  const appFields = ["company_name", "job_title", "location", "source", "status", "priority", "applied_at", "notes"];
  appFields.forEach((field) => {
    const element = root.querySelector(`[name="${field}"]`);
    if (!element) return;
    element.addEventListener("input", (event) => {
      state.appForm[field] = event.currentTarget.value;
    });
    element.addEventListener("change", (event) => {
      state.appForm[field] = event.currentTarget.value;
    });
  });

  const searchInput = root.querySelector('input[name="search"]');
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      state.search = event.currentTarget.value;
    });
    searchInput.addEventListener("change", refreshApplications);
  }

  const statusFilter = root.querySelector('select[name="statusFilter"]');
  if (statusFilter) {
    statusFilter.addEventListener("change", (event) => {
      state.statusFilter = event.currentTarget.value;
      refreshApplications();
    });
  }
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

setTheme(state.theme);
if (state.token || state.demoMode) {
  bootstrapApp();
}
render();
