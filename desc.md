下面按 **混合架构** 写开发规划：本地客户端负责官网自动化，云端负责同步、推送、邮件解析和可选远程检查。

建议产品暂定名：**ApplyRadar**。

定位：

> 一个轻量化求职状态自动跟踪客户端：本地自动检查招聘官网状态，云端同步提醒，只在状态变化、登录失效或需要处理时通知用户。

---

# 一、总体架构

## 1. 架构原则

核心原则是：

```text
官网登录态尽量留在本地
自动化任务按需启动
云端只做同步、提醒和可选高级自动检查
AI 只负责理解页面内容，不负责绕过登录/验证码
```

推荐架构：

```text
ApplyRadar Client
├── 本地客户端 Tauri
│   ├── 求职看板
│   ├── 岗位管理
│   ├── 状态监控中心
│   ├── 提醒中心
│   ├── 本地数据库 SQLite
│   └── 系统托盘/通知
│
├── Automation Sidecar
│   ├── Playwright
│   ├── Chromium/Chrome for Testing
│   ├── 持久化浏览器 Profile
│   ├── 状态页批量检查
│   └── 官网适配器
│
├── AI Parser
│   ├── 页面状态识别
│   ├── 邮件内容识别
│   ├── 状态标准化
│   ├── 提醒事项提取
│   └── 求职进展摘要
│
└── Cloud Backend
    ├── 用户账号
    ├── 数据同步
    ├── 云端推送
    ├── 邮件解析
    ├── 可选远程 Worker
    └── 可选云端自动检查
```

## 2. 推荐技术栈

### 客户端

| 模块          | 技术                        |
| ----------- | ------------------------- |
| 桌面客户端       | Tauri                     |
| 前端          | React + TypeScript        |
| UI          | Tailwind CSS + shadcn/ui  |
| 本地数据库       | SQLite                    |
| 本地后端        | Rust + Tauri Commands     |
| 自动化 Sidecar | Node.js + Playwright      |
| 系统通知        | Tauri Notification Plugin |
| 托盘常驻        | Tauri System Tray         |
| 本地配置        | JSON / SQLite             |

Tauri 适合这个项目，因为它支持用现有 Web 前端技术构建跨平台应用，并通过 Rust 处理本地能力；官方也明确支持 Windows、macOS、Linux，并支持任意可编译为 HTML/CSS/JS 的前端框架。([Tauri][1])

Tauri 的 SQL 插件支持 SQLite、MySQL、PostgreSQL，因此第一版用 SQLite 做本地数据库比较合适。([Tauri][2])

Tauri 也支持系统托盘和通知插件，适合做“轻量常驻 + 状态变化提醒”。([Tauri][3])

### 自动化层

| 模块          | 技术                      |
| ----------- | ----------------------- |
| 浏览器自动化      | Playwright              |
| 登录态保存       | launchPersistentContext |
| 浏览器 Profile | 每个 domain 独立目录          |
| 页面解析        | DOM + innerText + 可选截图  |
| 任务队列        | 本地队列，后期可接 Redis/BullMQ  |

Playwright 的 `launchPersistentContext(userDataDir)` 可以使用指定的用户数据目录保存 cookies、local storage 等浏览器会话数据，适合“用户登录一次，后续自动访问状态页”的需求。([Playwright][4])

### 云端

| 模块        | 技术                               |
| --------- | -------------------------------- |
| 后端 API    | NestJS / Fastify                 |
| 数据库       | PostgreSQL                       |
| 队列        | Redis + BullMQ                   |
| 文件存储      | S3 / R2 / Supabase Storage       |
| 邮件解析      | Gmail API / Outlook API / 邮件转发入口 |
| 远程 Worker | Docker + Playwright              |
| AI 服务     | OpenAI API / 兼容模型 API            |

BullMQ 是基于 Redis 的 Node.js 队列系统，适合后期云端 Worker、邮件解析、远程检查任务调度。([BullMQ][5])

---

# 二、产品模式设计

建议内置三种自动化模式。

## 模式 A：本地自动检查，默认模式

```text
用户电脑开机
↓
客户端托盘常驻
↓
到检查时间
↓
启动 Playwright Sidecar
↓
使用本地浏览器 Profile 访问状态页
↓
AI/规则识别状态
↓
检查完成后关闭浏览器
↓
本地通知用户
```

优点：

```text
隐私好
不需要保存官网账号密码
资源占用可控
最适合 MVP
```

## 模式 B：云端同步 + 推送

```text
本地客户端检查状态
↓
同步到云端
↓
手机/网页/邮件推送提醒
```

云端不登录官网，只负责：

```text
数据同步
提醒推送
求职进展摘要
邮件解析
多设备查看
```

## 模式 C：云端自动检查，高级模式

```text
用户明确授权
↓
远程浏览器登录招聘官网
↓
服务器保存加密 session
↓
云端 Worker 定时检查状态
↓
推送结果
```

这个功能放后期，不放第一版。

原因是：服务器保存第三方官网登录态，隐私和合规风险更高，且验证码、二次验证、风控问题更复杂。

---

# 三、核心功能模块

## 1. 求职记录管理

基础字段：

```ts
type Application = {
  id: string;
  companyName: string;
  jobTitle: string;
  location?: string;
  salaryRange?: string;
  jobUrl?: string;
  statusUrl?: string;
  source: "official" | "email" | "referral" | "linkedin" | "boss" | "manual";
  status: ApplicationStatus;
  priority: "low" | "medium" | "high";
  appliedAt?: string;
  deadlineAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};
```

状态枚举：

```ts
type ApplicationStatus =
  | "to_apply"
  | "applied"
  | "received"
  | "under_review"
  | "assessment"
  | "interview"
  | "final_interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "unknown";
```

## 2. 状态监控中心

这是产品的核心页面。

字段：

| 字段      | 说明               |
| ------- | ---------------- |
| 公司      | 公司名称             |
| 岗位      | 岗位名称             |
| 状态页 URL | 自动检查入口           |
| 当前状态    | 标准化状态            |
| 上次检查    | 最近一次检查时间         |
| 登录状态    | 正常 / 失效 / 需要验证码  |
| 检查频率    | 手动 / 每日 / 每 6 小时 |
| 自动检查    | 开启 / 关闭          |
| 最近变化    | 状态变更记录           |

登录状态枚举：

```ts
type LoginState =
  | "valid"
  | "expired"
  | "captcha_required"
  | "mfa_required"
  | "blocked"
  | "unknown";
```

## 3. 自动化检查

核心流程：

```text
读取 tracking_targets
↓
按 domain 分组
↓
启动对应 browser profile
↓
访问 status_url
↓
判断登录状态
↓
提取页面文本
↓
计算页面 hash
↓
如果 hash 没变，跳过 AI
↓
如果 hash 变化，规则解析
↓
规则失败，调用 AI
↓
写入状态历史
↓
生成提醒
↓
关闭浏览器
```

关键策略：

```text
不要并发太高
不要频繁访问同一网站
不要默认截图
不要一直开着浏览器
不要绕过验证码
不要保存用户密码
```

推荐默认设置：

```text
检查频率：每天 1 次
并发数：1
同一 domain 间隔：30–120 秒
失败重试：1 小时后
登录失效：暂停该 domain，提示用户重新登录
```

## 4. AI 状态识别

AI 输入：

```json
{
  "url": "https://example.com/application/status",
  "pageTitle": "Application Status",
  "visibleText": "...",
  "previousStatus": "under_review",
  "knownCompany": "Example",
  "knownJobTitle": "Frontend Engineer"
}
```

AI 输出：

```json
{
  "companyName": "Example",
  "jobTitle": "Frontend Engineer",
  "rawStatus": "No longer under consideration",
  "normalizedStatus": "rejected",
  "confidence": 0.96,
  "loginState": "valid",
  "statusChanged": true,
  "nextAction": null,
  "deadline": null,
  "shouldNotify": true,
  "reason": "页面明确显示申请不再被考虑"
}
```

AI 不应直接决定最终状态。建议规则是：

```text
confidence >= 0.85：自动更新
0.60 <= confidence < 0.85：标记为“待确认”
confidence < 0.60：不更新，只提示识别失败
```

## 5. 官网适配器

第一版先做通用适配器。

后续再做常见 ATS 适配器：

```text
GenericAdapter
WorkdayAdapter
GreenhouseAdapter
LeverAdapter
AshbyAdapter
SmartRecruitersAdapter
TaleoAdapter
SuccessFactorsAdapter
```

接口设计：

```ts
interface SiteAdapter {
  name: string;
  match(url: string): boolean;
  detectLoginState(page: Page): Promise<LoginState>;
  extractPagePayload(page: Page): Promise<PagePayload>;
  extractRawStatus?(page: Page): Promise<RawStatusResult | null>;
}
```

流程：

```text
URL 匹配适配器
↓
适配器判断登录态
↓
适配器提取原始状态
↓
规则能识别则直接返回
↓
规则失败交给 AI
```

## 6. 提醒系统

提醒来源：

```text
用户手动创建
AI 从页面提取
AI 从邮件提取
状态变化自动生成
超过 N 天无反馈自动生成
Offer 截止自动生成
测评截止自动生成
面试时间自动生成
```

提醒类型：

```ts
type ReminderType =
  | "interview"
  | "assessment_deadline"
  | "offer_deadline"
  | "follow_up"
  | "document_required"
  | "custom";
```

通知方式：

```text
本地系统通知
应用内通知
邮件通知
移动端推送，后期
微信/Telegram/飞书，后期
```

---

# 四、数据库设计

## 1. applications

```sql
CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  location TEXT,
  salary_range TEXT,
  job_url TEXT,
  status_url TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  priority TEXT DEFAULT 'medium',
  applied_at TEXT,
  deadline_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## 2. tracking_targets

```sql
CREATE TABLE tracking_targets (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  status_url TEXT NOT NULL,
  ats_type TEXT DEFAULT 'generic',
  enabled INTEGER DEFAULT 1,
  check_frequency TEXT DEFAULT 'daily',
  current_status TEXT DEFAULT 'unknown',
  last_status TEXT,
  login_state TEXT DEFAULT 'unknown',
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  last_text_hash TEXT,
  profile_dir TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (application_id) REFERENCES applications(id)
);
```

## 3. application_events

```sql
CREATE TABLE application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  old_status TEXT,
  new_status TEXT,
  event_time TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (application_id) REFERENCES applications(id)
);
```

## 4. reminders

```sql
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  application_id TEXT,
  title TEXT NOT NULL,
  content TEXT,
  reminder_type TEXT,
  remind_at TEXT NOT NULL,
  is_done INTEGER DEFAULT 0,
  created_by TEXT DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (application_id) REFERENCES applications(id)
);
```

## 5. tracking_runs

```sql
CREATE TABLE tracking_runs (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  raw_status TEXT,
  normalized_status TEXT,
  confidence REAL,
  login_state TEXT,
  error_message TEXT,
  page_hash TEXT,
  ai_used INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (target_id) REFERENCES tracking_targets(id)
);
```

## 6. site_sessions

```sql
CREATE TABLE site_sessions (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  profile_dir TEXT NOT NULL,
  login_state TEXT DEFAULT 'unknown',
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

# 五、页面规划

## 1. Dashboard

展示：

```text
总投递数
进行中岗位
本周新增投递
今日待办
状态变化数量
登录失效网站
超过 14 天无反馈岗位
最近面试/测评/Offer 截止
```

## 2. Applications

表格视图：

```text
公司 | 岗位 | 状态 | 投递时间 | 等待天数 | 渠道 | 优先级 | 下一提醒
```

支持：

```text
搜索
状态筛选
渠道筛选
优先级筛选
导入/导出
批量编辑
```

## 3. Kanban

状态列：

```text
待投递
已投递
筛选中
测评/笔试
面试中
Offer
已拒绝
已放弃
```

支持拖拽修改状态。

## 4. Tracker

核心自动化页面：

```text
状态页 URL 管理
一键检查全部
单个岗位检查
登录状态展示
检查日志
失败原因
重新登录入口
自动检查开关
```

## 5. Application Detail

包括：

```text
岗位基本信息
JD 链接
状态页链接
状态历史
时间线
提醒事项
联系人
简历版本
备注
检查记录
```

## 6. Reminders

包括：

```text
今日提醒
本周提醒
逾期提醒
面试提醒
测评截止
Offer 截止
自定义提醒
```

## 7. Settings

包括：

```text
自动化模式
检查频率
AI 配置
数据存储位置
云端同步
隐私设置
通知设置
登录态管理
备份与导出
```

---

# 六、开发阶段规划

## 阶段 0：产品边界与技术验证

目标：确认自动化闭环能跑通。

任务：

```text
1. 确定产品名称、状态枚举、核心页面
2. 搭建 Tauri + React + TypeScript 项目
3. 验证 SQLite 读写
4. 验证 Tauri 系统通知
5. 验证 Node Sidecar 调用 Playwright
6. 验证 Playwright 持久化 profile
7. 用 2–3 个招聘状态页做页面文本提取测试
8. 设计 AI JSON 输出 schema
```

验收标准：

```text
客户端可以启动
可以保存一条岗位记录
可以打开状态页
可以提取页面文本
可以调用 AI 返回标准状态
```

## 阶段 1：本地求职管理 MVP

目标：先把求职 CRM 做出来。

功能：

```text
1. 新建岗位
2. 编辑岗位
3. 删除岗位
4. 岗位列表
5. 状态筛选
6. 搜索
7. Kanban 看板
8. 岗位详情页
9. 时间线事件
10. 本地 SQLite 持久化
```

验收标准：

```text
用户可以完整管理自己的投递记录
状态变更会写入时间线
关闭应用后数据仍保留
```

## 阶段 2：本地自动化检查 MVP

目标：跑通核心差异化功能。

功能：

```text
1. 添加状态页 URL
2. 创建 tracking target
3. 一键打开状态页
4. 用户在客户端内完成登录
5. 保存 browser profile
6. 单个岗位状态检查
7. 批量检查全部岗位
8. 检查完成后关闭浏览器
9. 记录检查日志
10. 识别登录失效
```

验收标准：

```text
用户登录一次后，客户端可以再次使用同一 profile 访问状态页
可以批量检查多个状态页
可以识别登录失效并提示用户
```

## 阶段 3：AI 状态识别

目标：把页面内容转成结构化状态。

功能：

```text
1. 页面文本清洗
2. 页面 hash 计算
3. AI 状态识别
4. 状态标准化
5. 置信度判断
6. 状态变化对比
7. 自动写入事件
8. 低置信度人工确认
9. 状态变化通知
```

验收标准：

```text
页面状态从 under_review 变为 rejected 时，系统可以识别并通知用户
页面没有变化时，不重复调用 AI
低置信度结果不会直接覆盖原状态
```

## 阶段 4：提醒与摘要

目标：让工具从“记录工具”变成“求职助手”。

功能：

```text
1. 手动创建提醒
2. 面试提醒
3. 测评截止提醒
4. Offer 截止提醒
5. 超过 N 天无反馈提醒
6. 登录失效提醒
7. 每日检查摘要
8. 每周求职进展摘要
```

验收标准：

```text
用户每天可以收到一条摘要
用户能看到哪些岗位状态变化、哪些岗位需要处理、哪些网站需要重新登录
```

## 阶段 5：官网适配器

目标：提高稳定性，减少 AI 成本。

优先级：

```text
1. GenericAdapter
2. WorkdayAdapter
3. GreenhouseAdapter
4. LeverAdapter
5. AshbyAdapter
6. SmartRecruitersAdapter
```

每个适配器实现：

```text
URL 匹配
登录态判断
状态文本提取
错误识别
页面变化检测
```

验收标准：

```text
常见 ATS 页面可以优先通过规则提取
规则失败时再调用 AI
AI 调用次数明显下降
```

## 阶段 6：云端同步

目标：多设备查看和云端提醒。

功能：

```text
1. 用户注册登录
2. 本地数据加密同步
3. 云端 PostgreSQL
4. Web 端只读看板
5. 云端提醒推送
6. 数据备份与恢复
7. 多设备冲突处理
```

验收标准：

```text
桌面端数据可以同步到云端
用户可以在 Web 端查看求职状态
提醒可以通过云端发送
```

## 阶段 7：邮件解析

目标：补齐官网状态跟踪之外的自动化来源。

功能：

```text
1. 邮件授权或邮件转发入口
2. 自动识别求职相关邮件
3. 识别投递成功
4. 识别面试邀请
5. 识别测评链接
6. 识别拒信
7. 识别 Offer
8. 提取时间和截止日期
9. 自动生成提醒
10. 自动关联已有岗位
```

验收标准：

```text
收到面试邮件后，系统可以自动创建面试事件和提醒
收到拒信后，系统可以自动更新岗位状态
```

## 阶段 8：云端自动检查，高级版

目标：用户电脑关机时也能检查。

功能：

```text
1. 远程浏览器 Worker
2. 用户授权远程登录
3. 加密保存 session
4. Docker 隔离执行
5. Redis/BullMQ 队列调度
6. 低频远程检查
7. 登录失效通知
8. 用户随时撤销远程 session
```

验收标准：

```text
用户开启云端检查后，即使本地客户端未运行，系统也能低频检查状态并推送变化
```

这个阶段要作为高级功能，默认关闭。

---

# 七、MVP 范围建议

第一版不要做太大。建议 MVP 只包含：

```text
1. Tauri 桌面客户端
2. 本地 SQLite
3. 求职记录管理
4. Kanban 看板
5. 状态页 URL 管理
6. 客户端内置登录窗口
7. Playwright 持久化 profile
8. 单个状态页检查
9. 一键批量检查
10. AI 状态识别
11. 状态变化通知
12. 登录失效提醒
13. 检查日志
```

第一版不做：

```text
1. 云端自动检查
2. 移动端
3. 团队协作
4. 自动投递
5. 绕过验证码
6. 保存第三方网站密码
7. 大规模 ATS 深度适配
```

---

# 八、推荐目录结构

```text
applyradar/
├── apps/
│   ├── desktop/
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   ├── stores/
│   │   │   ├── services/
│   │   │   └── types/
│   │   ├── src-tauri/
│   │   │   ├── src/
│   │   │   ├── tauri.conf.json
│   │   │   └── Cargo.toml
│   │   └── package.json
│   │
│   ├── web/
│   │   └── 后期云端 Web 控制台
│   │
│   └── mobile/
│       └── 后期移动端提醒
│
├── packages/
│   ├── shared/
│   │   ├── types/
│   │   ├── constants/
│   │   └── schemas/
│   │
│   ├── automation/
│   │   ├── playwright/
│   │   ├── adapters/
│   │   ├── parser/
│   │   └── sidecar/
│   │
│   └── ai/
│       ├── prompts/
│       ├── schemas/
│       └── status-parser/
│
├── services/
│   ├── api/
│   ├── worker/
│   └── sync/
│
└── docs/
    ├── architecture.md
    ├── database.md
    ├── ai-parser.md
    └── privacy.md
```

---

# 九、关键开发难点

## 1. 登录态失效

问题：

```text
招聘网站登录态经常过期
部分网站需要短信/邮箱/验证码
```

解决：

```text
不要绕过验证
提示用户重新登录
按 domain 管理登录态
登录失效后暂停该 domain 自动检查
```

## 2. 页面结构不稳定

问题：

```text
不同招聘官网页面结构完全不同
同一官网也可能改版
```

解决：

```text
规则适配器 + AI 兜底
保存 raw_text_hash
保存 raw_status
保存截图作为可选 debug
低置信度结果让用户确认
```

## 3. 资源占用

问题：

```text
浏览器自动化占用内存和 CPU
```

解决：

```text
Playwright 按需启动
检查完成立即关闭
默认并发数为 1
不默认截图
不常驻 Chromium
```

## 4. 隐私与信任

问题：

```text
用户不希望求职官网账号、简历、状态被滥用
```

解决：

```text
不保存官网密码
默认本地存储
云端同步可选
云端自动检查默认关闭
本地数据库可加密
提供一键导出和删除
```

## 5. 合规边界

明确不做：

```text
绕过验证码
破解二次验证
批量自动投递
高频爬取
隐藏自动化行为规避平台风控
```

明确做：

```text
用户授权后的低频状态检查
本地登录态复用
状态识别
提醒和归档
```

---

# 十、版本路线图

## v0.1：技术验证版

目标：证明核心自动化可行。

功能：

```text
添加岗位
添加状态页
打开登录窗口
保存 profile
检查单个状态页
AI 返回状态
```

## v0.2：本地 MVP

目标：能作为个人工具使用。

功能：

```text
岗位列表
Kanban
详情页
状态历史
批量检查
本地通知
检查日志
```

## v0.3：可用 Beta

目标：开始给真实用户测试。

功能：

```text
提醒系统
每日摘要
登录失效管理
低置信度人工确认
数据导出
错误反馈
```

## v0.4：稳定增强版

目标：提高识别准确率和稳定性。

功能：

```text
官网适配器
规则优先识别
AI 成本优化
更完整的异常处理
本地数据库加密
```

## v1.0：正式版

目标：完整个人求职状态跟踪客户端。

功能：

```text
本地自动检查
求职 CRM
状态监控中心
提醒中心
AI 摘要
邮件解析
云端同步
Web 端查看
```

## v1.5：高级自动化版

目标：支持用户电脑关机后的自动检查。

功能：

```text
远程 Worker
云端自动检查
远程登录态管理
手机推送
多设备同步
```

---

# 十一、优先级排序

最高优先级：

```text
1. 本地岗位管理
2. 状态页 URL 保存
3. 持久化浏览器 profile
4. 单个状态页检查
5. 批量检查
6. AI 状态识别
7. 状态变化通知
```

中等优先级：

```text
1. Kanban
2. 提醒中心
3. 每日摘要
4. 邮件解析
5. 官网适配器
6. 数据导出
```

后期优先级：

```text
1. 云端同步
2. Web 端查看
3. 移动端提醒
4. 云端自动检查
5. 付费高级功能
```

---

# 十二、最小开发闭环

最小闭环应该是：

```text
用户添加一个岗位
↓
填写状态页 URL
↓
点击“打开并登录”
↓
客户端保存该网站 profile
↓
点击“检查状态”
↓
Playwright 打开页面
↓
提取页面文本
↓
AI 识别状态
↓
写入状态历史
↓
如果变化，发送通知
```

只要这个闭环跑通，项目就成立。

后续所有功能都是增强：

```text
批量检查
定时检查
邮件解析
云端同步
远程 Worker
移动端提醒
```

---

# 十三、我建议的最终开发顺序

按实际落地顺序：

```text
1. Tauri 客户端壳子
2. SQLite 数据库
3. 求职记录 CRUD
4. Applications 表格页
5. Application Detail 详情页
6. Tracker 状态监控页
7. Node + Playwright Sidecar
8. 浏览器 profile 持久化
9. 单个状态页检查
10. AI 状态识别
11. 状态历史与通知
12. 批量检查
13. Kanban 看板
14. 提醒系统
15. 登录态管理
16. 每日摘要
17. 官网适配器
18. 邮件解析
19. 云端同步
20. 云端自动检查
```

一句话总结：

> 第一阶段不要急着做云端自动化。先把“本地登录一次 → 批量检查官网状态 → AI 识别变化 → 自动通知”这个闭环做扎实。这个闭环才是产品的核心竞争力。

[1]: https://v2.tauri.app/?utm_source=chatgpt.com "Tauri 2.0 | Tauri"
[2]: https://v2.tauri.app/plugin/sql/?utm_source=chatgpt.com "SQL"
[3]: https://v2.tauri.app/learn/system-tray/?utm_source=chatgpt.com "System Tray"
[4]: https://playwright.dev/docs/api/class-browsertype?utm_source=chatgpt.com "BrowserType"
[5]: https://docs.bullmq.io/?utm_source=chatgpt.com "What is BullMQ | BullMQ"
