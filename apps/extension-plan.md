# ApplyRadar 浏览器扩展开发计划

## 一、定位

浏览器扩展是 ApplyRadar 的**登录态桥梁**——解决云端 worker 无法保持目标网站登录态的核心痛点。同时扩展为用户提供轻量级的求职辅助入口，无需打开完整客户端即可完成常用操作。

---

## 二、核心功能

### 2.1 Cookie 自动同步（核心）

**解决的问题：** 云端 worker 检查目标网站时登录态过期。

**流程：**
1. 用户在扩展中添加目标网站域名（或扩展自动识别）
2. 用户正常在浏览器中登录目标网站
3. 扩展通过 `chrome.cookies` API 静默抓取该域名的所有 Cookie
4. 自动发送到 ApplyRadar 服务器，保存到对应 tracking_target 的 `session_cookies` 字段
5. Worker 下次检查时自动注入这些 Cookie

**触发时机：**
- 用户访问已配置的域名时 → 自动同步
- Cookie 发生变化时（`chrome.cookies.onChanged` 监听）→ 增量同步
- 用户手动点击「立即同步」→ 全量同步

**安全设计：**
- Cookie 传输使用 HTTPS
- 服务端存储时加密（AES-256）
- 扩展本地不持久化 Cookie 明文
- Token 存储在 `chrome.storage.local`，不暴露给 content script

### 2.2 Session 健康监测

**解决的问题：** 用户不知道登录态什么时候过期。

**功能：**
- 扩展定时（每小时）检查已配置域名的 Cookie 是否仍然有效
- 通过访问目标网站的关键页面（如账户页）验证 session 是否有效
- Session 即将过期时（如 Cookie 的 `expires` 字段临近），提前通知用户
- Session 已过期时，弹出通知提醒用户重新登录

**通知策略：**
- 即将过期（< 24h）：扩展图标显示黄色标记
- 已过期：弹出系统通知 + 扩展图标显示红色标记
- 用户点击通知 → 打开目标网站登录页

### 2.3 快速状态查看

**解决的问题：** 用户想快速查看求职状态，不想打开完整客户端。

**功能：**
- 扩展 popup 中展示所有追踪目标的最新状态
- 显示每个目标的：公司名、职位、当前状态、登录状态、上次检查时间
- 状态变化的条目高亮显示
- 点击条目跳转到目标网站的状态页

**数据来源：**
- 从服务器 API 拉取（`GET /api/tracking`）
- 本地缓存（`chrome.storage.local`），离线时显示缓存数据
- 每次打开 popup 时自动刷新

### 2.4 一键添加追踪目标

**解决的问题：** 用户在浏览招聘网站时想快速添加追踪。

**功能：**
- 在招聘网站页面上，扩展检测到可能是求职相关页面时，显示「添加追踪」按钮
- 点击后自动提取：
  - 页面标题（作为公司名/职位名）
  - 当前 URL（作为 status_url）
  - 域名（作为 domain）
- 用户确认后调用 `POST /api/tracking` 创建追踪目标
- 自动同步当前域名的 Cookie

**智能检测规则：**
- URL 包含 `/deliver`、`/application`、`/status`、`/myDeliver` 等关键词
- 页面标题包含公司名或职位名
- 页面包含求职状态相关的 DOM 元素

### 2.5 页面状态快照

**解决的问题：** 用户想快速了解当前页面的求职状态，无需等待 worker 检查。

**功能：**
- 用户在目标网站的状态页上，点击扩展图标
- 扩展提取当前页面的可见文本
- 发送到服务器进行 AI 解析（`POST /api/ai/parse-jd` 或专用端点）
- 在 popup 中显示解析结果：当前状态、置信度、建议操作

---

## 三、技术架构

### 3.1 扩展结构

```
extensions/applyradar/
├── manifest.json              # MV3 配置
├── background/
│   └── service-worker.js      # 后台服务：Cookie 同步、定时检查、通知
├── popup/
│   ├── popup.html             # Popup 页面
│   ├── popup.js               # Popup 逻辑
│   └── popup.css              # Popup 样式
├── content/
│   ├── content.js             # Content script：页面检测、添加追踪按钮
│   └── content.css            # Content script 样式
├── options/
│   ├── options.html           # 设置页面
│   ├── options.js             # 设置逻辑
│   └── options.css            # 设置样式
├── lib/
│   ├── api.js                 # API 封装（fetch + auth）
│   ├── crypto.js              # Cookie 加密
│   └── storage.js             # 本地存储封装
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 3.2 权限设计

```json
{
  "manifest_version": 3,
  "permissions": [
    "cookies",
    "storage",
    "notifications",
    "alarms",
    "activeTab",
    "tabs"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

| 权限 | 用途 |
|------|------|
| `cookies` | 读取/同步 Cookie |
| `storage` | 本地存储 Token、配置、缓存 |
| `notifications` | Session 过期通知 |
| `alarms` | 定时检查 Session 状态 |
| `activeTab` | 获取当前标签页信息 |
| `tabs` | 监听标签页导航事件 |

### 3.3 数据流

```
用户浏览器                  扩展                     服务器                  Worker
   │                         │                        │                      │
   │  登录目标网站            │                        │                      │
   │────────────────────>│                        │                      │
   │                         │  Cookie 变化           │                      │
   │                         │  (onChanged)           │                      │
   │                         │───────────────────>│                      │
   │                         │  POST /api/tracking    │                      │
   │                         │  /:id/cookies          │                      │
   │                         │                        │  保存 Cookie          │
   │                         │                        │─────────────────>│
   │                         │                        │                      │
   │                         │                        │     Worker 检查时      │
   │                         │                        │     注入 Cookie        │
   │                         │                        │<─────────────────│
```

### 3.4 API 接口

扩展需要调用的服务器接口：

| 接口 | 方法 | 用途 |
|------|------|------|
| `/api/auth/login` | POST | 扩展登录获取 Token |
| `/api/tracking` | GET | 获取追踪目标列表 |
| `/api/tracking/:id/cookies` | PUT | 同步 Cookie |
| `/api/tracking/:id` | GET | 获取单个目标详情 |
| `/api/tracking` | POST | 添加追踪目标 |
| `/api/stats` | GET | 获取统计数据（popup 展示） |

---

## 四、用户交互流程

### 4.1 首次使用

```
1. 安装扩展
2. 点击扩展图标 → 显示登录界面
3. 输入 ApplyRadar 账号密码 → 登录
4. 扩展提示「配置完成」
5. 用户正常浏览招聘网站，扩展会自动检测和同步
```

### 4.2 日常使用

```
1. 用户正常在浏览器中使用
2. 扩展在后台静默工作：
   - 检测到已配置域名 → 自动同步 Cookie
   - Cookie 变化 → 增量同步
   - 定时检查 Session 状态
3. 用户想查看状态 → 点击扩展图标 → 看到所有目标状态
4. Session 过期 → 收到通知 → 去登录 → Cookie 自动同步
```

### 4.3 添加新追踪

```
1. 用户在招聘网站看到一个职位
2. 扩展检测到页面特征 → 在页面右下角显示「添加追踪」浮窗
3. 用户点击 → 确认信息（公司名、职位名、URL）
4. 调用 API 创建追踪目标
5. 自动同步当前域名的 Cookie
6. 提示「已添加，将自动监控状态变化」
```

---

## 五、开发阶段

### Phase 1：基础框架（2-3 天）

- [ ] 创建扩展项目结构
- [ ] 配置 manifest.json
- [ ] 实现 API 封装层（lib/api.js）
- [ ] 实现本地存储封装（lib/storage.js）
- [ ] 实现登录界面（popup 中）
- [ ] 实现基本 Cookie 同步（background service worker）

### Phase 2：核心功能（3-4 天）

- [ ] Cookie 自动同步（监听 onChanged + 定时全量同步）
- [ ] Session 健康检查（定时验证 + 过期通知）
- [ ] Popup 状态展示（追踪目标列表 + 状态）
- [ ] Cookie 加密存储

### Phase 3：增强功能（3-4 天）

- [ ] Content script：页面检测 + 添加追踪按钮
- [ ] 快速状态查看（页面快照 + AI 解析）
- [ ] 设置页面（管理域名、Token、通知偏好）
- [ ] 离线缓存 + 数据刷新

### Phase 4：打磨（2-3 天）

- [ ] 错误处理 + 重试机制
- [ ] UI/UX 打磨
- [ ] 多语言支持（中/英）
- [ ] 扩展图标动画（同步中、正常、异常状态）

---

## 六、安全性考量

| 风险 | 措施 |
|------|------|
| Cookie 泄露 | HTTPS 传输 + 服务端 AES-256 加密存储 |
| Token 泄露 | 存储在 chrome.storage.local，不暴露给 content script |
| 中间人攻击 | 所有 API 调用使用 HTTPS |
| 扩展被恶意利用 | 只在用户主动操作时同步，不自动上传到第三方 |
| Cookie 被滥用 | 服务端按用户隔离，只能访问自己的数据 |

---

## 七、与现有系统的集成

### 7.1 服务器端改动

- `PUT /api/tracking/:id/cookies` — 已实现，接收 Cookie 并保存
- `GET /api/tracking` — 已实现，返回追踪目标列表
- `POST /api/tracking` — 已实现，创建追踪目标
- 新增：Cookie 加密存储（中间件层）
- 新增：扩展专用的轻量 API（减少数据传输）

### 7.2 Worker 端改动

- `worker/src/browser.ts` — `injectCookies` 已实现
- `worker/src/checker.ts` — 已支持 `session_cookies` 字段
- 无需额外改动

### 7.3 前端改动

- Web 端无需改动
- 扩展的 popup/options 页面是独立的

---

## 八、后续扩展方向

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 求职页面智能识别 | 自动识别 BOSS 直聘、拉勾、牛客等平台的投递状态页 | P1 |
| 状态变化即时提醒 | 在状态页上直接显示状态变化标记 | P2 |
| 表单自动填充 | 自动填充求职申请表（姓名、邮箱、简历等） | P2 |
| 投递记录自动记录 | 检测到投递操作后自动创建 Application 记录 | P2 |
| 简历匹配度分析 | 对比职位要求和用户简历，给出匹配度评分 | P3 |
| 多浏览器支持 | 扩展到 Firefox、Edge | P3 |
