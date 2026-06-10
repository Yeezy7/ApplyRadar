# ApplyRadar 微信小程序迁移计划

## 概述

将 ApplyRadar 桌面端应用的核心功能迁移到微信小程序，使用微信云开发（Serverless）作为后端，让用户可以在手机上随时查看和管理求职状态。

## 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 前端 | 微信小程序原生 | WXML + WXSS + TypeScript |
| 后端 | 微信云开发 | 云函数 + 云数据库 + 云存储 |
| 数据库 | 云开发数据库 | NoSQL 文档型，自动按用户隔离 |
| 登录 | 微信登录 | 云开发内置，无需额外实现 |
| 通知 | 微信订阅消息 | 状态变化时推送到用户微信 |

## 功能规划

### Phase 1：核心功能（MVP）✅ 已完成

- [x] 微信登录（云开发自动处理）
- [x] 投递记录 CRUD（创建、编辑、删除、列表、详情）
- [x] 状态看板（5列分组，长按切换状态）
- [x] 数据统计仪表盘（投递数量、状态分布、最近更新）
- [x] 提醒管理（创建、编辑、删除、标记完成）
- [x] 事件时间线（状态变更历史记录）
- [x] 搜索和筛选（按公司/岗位搜索，按状态筛选）

### Phase 2：自动化能力

- [ ] 云函数定时触发器（替代桌面端 Playwright Sidecar）
- [ ] 页面内容抓取（HTTP 请求 + HTML 解析）
- [ ] AI 状态解析（云函数调用 OpenAI 兼容 API）
- [ ] 登录状态检测（识别验证码、MFA、过期等情况）
- [ ] 微信订阅消息通知（状态变化、登录过期推送）
- [ ] 检查记录查看（TrackingRun 列表）

### Phase 3：增强功能

- [ ] 数据导入导出（与桌面端 JSON 备份互转）
- [ ] 邮件日报（云函数 SMTP 发送）
- [ ] 批量操作（批量删除、批量状态变更）
- [ ] 分享功能（分享求职进展到朋友圈/好友）
- [ ] 深色模式

## 项目结构

```
apps/miniapp/
├── project.config.json          # 小程序项目配置
├── app.json                     # 全局配置（页面路由、TabBar）
├── app.ts                       # 入口文件（云开发初始化）
├── app.wxss                     # 全局样式
├── sitemap.json                 # 站点地图
├── miniprogram/
│   ├── pages/
│   │   ├── dashboard/           # 仪表盘页面
│   │   │   ├── index.wxml
│   │   │   ├── index.wxss
│   │   │   ├── index.ts
│   │   │   └── index.json
│   │   ├── applications/        # 投递记录页面
│   │   │   ├── index.wxml       # 列表页
│   │   │   ├── index.wxss
│   │   │   ├── index.ts
│   │   │   ├── index.json
│   │   │   └── detail/          # 详情/编辑页
│   │   │       ├── index.wxml
│   │   │       ├── index.wxss
│   │   │       ├── index.ts
│   │   │       └── index.json
│   │   ├── kanban/              # 看板页面
│   │   │   ├── index.wxml
│   │   │   ├── index.wxss
│   │   │   ├── index.ts
│   │   │   └── index.json
│   │   ├── reminders/           # 提醒页面
│   │   │   ├── index.wxml
│   │   │   ├── index.wxss
│   │   │   ├── index.ts
│   │   │   └── index.json
│   │   └── settings/            # 设置页面
│   │       ├── index.wxml
│   │       ├── index.wxss
│   │       ├── index.ts
│   │       └── index.json
│   ├── components/              # 公共组件
│   │   ├── app-card/            # 投递卡片
│   │   ├── status-badge/        # 状态标签
│   │   ├── stat-card/           # 统计卡片
│   │   └── empty-state/         # 空状态
│   ├── services/                # 云函数调用封装
│   │   ├── common.ts            # 通用调用方法
│   │   ├── application.ts       # 投递记录 API
│   │   ├── event.ts             # 事件 API
│   │   ├── reminder.ts          # 提醒 API
│   │   └── user.ts              # 用户设置 API
│   ├── utils/                   # 工具函数
│   │   ├── types.ts             # 类型定义（复用桌面端共享类型）
│   │   ├── constants.ts         # 常量（状态枚举、标签、颜色）
│   │   └── format.ts            # 日期格式化、状态计算
│   └── styles/
│       ├── theme.wxss           # 主题变量和通用样式
│       └── icons/               # TabBar 图标（10个PNG）
└── cloudfunctions/              # 云函数
    ├── application/             # 投递记录 CRUD
    │   ├── index.js
    │   └── package.json
    ├── event/                   # 事件管理
    │   ├── index.js
    │   └── package.json
    ├── reminder/                # 提醒管理
    │   ├── index.js
    │   └── package.json
    └── user/                    # 用户设置 + 统计
        ├── index.js
        └── package.json
```

## 云数据库设计

### applications 集合

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 自动生成 |
| _openid | string | 用户标识（自动填充） |
| company_name | string | 公司名称 |
| job_title | string | 岗位名称 |
| location | string | 工作地点 |
| salary_range | string | 薪资范围 |
| job_url | string | 投递链接 |
| status_url | string | 状态页链接 |
| source | string | 来源（official/email/referral/linkedin/boss/manual） |
| status | string | 状态（11种：to_apply → rejected/withdrawn/unknown） |
| priority | string | 优先级（low/medium/high） |
| applied_at | string | 投递日期（ISO） |
| deadline_at | string | 截止日期（ISO） |
| notes | string | 备注 |
| created_at | string | 创建时间 |
| updated_at | string | 更新时间 |

### application_events 集合

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 自动生成 |
| _openid | string | 用户标识 |
| application_id | string | 关联投递 ID |
| event_type | string | 事件类型（status_change/check_failed/login_expired/note_added/manual） |
| title | string | 事件标题 |
| content | string | 事件内容 |
| old_status | string | 旧状态 |
| new_status | string | 新状态 |
| event_time | string | 事件时间 |
| created_at | string | 创建时间 |

### reminders 集合

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 自动生成 |
| _openid | string | 用户标识 |
| application_id | string | 关联投递 ID（可选） |
| title | string | 提醒标题 |
| content | string | 提醒内容 |
| reminder_type | string | 类型（interview/assessment_deadline/offer_deadline/follow_up/document_required/custom） |
| remind_at | string | 提醒时间 |
| is_done | boolean | 是否完成 |
| created_by | string | 创建者（user/ai/system） |
| created_at | string | 创建时间 |
| updated_at | string | 更新时间 |

### user_settings 集合

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 自动生成 |
| _openid | string | 用户标识 |
| apiKey | string | AI API Key |
| apiBaseUrl | string | AI API 地址 |
| model | string | AI 模型名称 |
| checkFrequency | string | 检查频率 |
| notificationsEnabled | boolean | 通知开关 |
| created_at | string | 创建时间 |
| updated_at | string | 更新时间 |

## 云函数 API

### application 云函数

| action | 参数 | 说明 |
|--------|------|------|
| create | company_name, job_title, ... | 创建投递记录 |
| list | search?, status? | 查询投递列表 |
| get | id | 获取单条记录 |
| update | id, ...fields | 更新投递记录 |
| delete | id | 删除投递记录 |

### event 云函数

| action | 参数 | 说明 |
|--------|------|------|
| create | application_id, event_type, title, ... | 创建事件 |
| listByApplication | application_id | 查询某投递的事件 |
| listAll | limit? | 查询所有事件 |

### reminder 云函数

| action | 参数 | 说明 |
|--------|------|------|
| create | title, remind_at, ... | 创建提醒 |
| list | includeDone?, applicationId? | 查询提醒列表 |
| update | id, ...fields | 更新提醒 |
| markDone | id | 标记完成 |
| delete | id | 删除提醒 |

### user 云函数

| action | 参数 | 说明 |
|--------|------|------|
| getSettings | - | 获取用户设置 |
| saveSettings | ...fields | 保存用户设置 |
| getStats | - | 获取仪表盘统计数据 |

## 页面功能说明

### 仪表盘（Dashboard）
- 4个统计卡片：总投递、进行中、本周新增、待处理
- 状态分布进度条
- 最近更新的5条投递记录
- 点击记录跳转详情

### 投递列表（Applications）
- 搜索框（公司/岗位名称）
- 状态筛选下拉框
- 卡片式列表展示
- 下拉刷新
- 点击卡片进入详情

### 投递详情（Detail）
- 查看模式：显示完整信息、事件时间线、相关提醒
- 编辑模式：表单编辑所有字段
- 快速状态切换（Picker）
- 事件时间线（状态变更、检查结果）
- 相关提醒列表 + 添加提醒
- 删除确认

### 看板（Kanban）
- 5列：待投递、已投递、审核中、面试、结果
- 横向滚动浏览
- 长按卡片弹出状态选择器
- 搜索过滤

### 提醒（Reminders）
- 提醒列表（支持显示/隐藏已完成）
- 类型筛选
- 搜索
- 标记完成
- 新建/编辑提醒（底部弹窗表单）
- 过期提醒高亮

### 设置（Settings）
- AI 配置（API Key、Base URL、模型）
- 自动化设置（检查频率、通知开关）
- 关于信息
- 保存设置

## 与桌面端的关系

| 维度 | 桌面端 | 小程序 |
|------|--------|--------|
| 数据存储 | 本地 SQLite | 云开发数据库 |
| 浏览器自动化 | Playwright Sidecar | Phase 2：云函数 HTTP 抓取 |
| AI 解析 | Rust reqwest 调用 | Phase 2：云函数调用 |
| 通知 | 系统通知 | 微信订阅消息 |
| 登录 | 无需登录 | 微信自动登录 |
| 类型定义 | packages/shared/src/types.ts | miniprogram/utils/types.ts（手动同步） |

## 部署步骤

### 1. 准备工作
1. 注册微信小程序账号（https://mp.weixin.qq.com/）
2. 获取 AppID
3. 下载微信开发者工具

### 2. 配置项目
1. 在微信开发者工具中打开 `apps/miniapp/` 目录
2. 修改 `project.config.json` 中的 `appid` 为你的 AppID
3. 替换 `styles/icons/` 下的 TabBar 图标（建议 81x81 像素 PNG）

### 3. 初始化云开发
1. 在开发者工具中点击「云开发」按钮
2. 创建云开发环境
3. 创建以下数据库集合：
   - `applications`
   - `application_events`
   - `reminders`
   - `user_settings`

### 4. 部署云函数
1. 右键点击 `cloudfunctions/` 下的每个云函数目录
2. 选择「上传并部署：云端安装依赖」
3. 依次部署：application、event、reminder、user

### 5. 测试
1. 在模拟器中测试所有页面
2. 真机扫码测试
3. 检查云数据库中的数据是否正确

### 6. 发布
1. 在开发者工具中点击「上传」
2. 在微信公众平台提交审核
3. 审核通过后发布

## 后续迭代

### Phase 2 优先级
1. **云函数定时检查** - 使用云函数定时触发器，每天自动检查状态页
2. **AI 状态解析** - 复用桌面端的 AI Prompt，通过云函数调用 LLM
3. **微信订阅消息** - 状态变化时推送通知

### Phase 3 优先级
1. **数据导入导出** - 支持桌面端 JSON 备份格式
2. **分享功能** - 分享求职进展到微信
3. **深色模式** - 适配系统深色模式
