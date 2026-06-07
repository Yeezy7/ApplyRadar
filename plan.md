# ApplyRadar 开发计划

## 已完成

### 基础设施
- [x] Tauri + React + TS + Tailwind 脚手架 + pnpm workspace
- [x] SQLite 数据库 6 张表 + migrations + PRAGMA foreign_keys = ON
- [x] SQL 注入修复（参数化查询）
- [x] Profile 目录路径修复（绝对路径解析）
- [x] Settings 配置接入（stores/settings.ts）
- [x] 数据库索引（tracking_runs.target_id, application_events.application_id）

### 核心 CRUD
- [x] Application CRUD + 快速状态切换
- [x] Tracking Target CRUD + 创建入口（URL 验证、协议检查、重复检测、错误提示、Escape 关闭、防重复提交、删除按钮）
- [x] ApplicationForm 自动创建/更新 Tracking Target（URL 验证、domain 同步、check_frequency 使用设置值）
- [x] Event 创建（手动状态变更、AI 失败、登录状态变化、内容溢出截断）
- [x] Reminder CRUD + 创建表单 + 删除 + 类型筛选 + 搜索 + 关联应用显示
- [x] Tracking Run 创建和查询 + 检查历史展示（状态文字、AI 标记、目标标识）

### 检查流程（完整闭环）
- [x] Playwright Sidecar 构建 + Rust 命令调用
- [x] Sidecar 自动杀掉已有 Chrome 进程
- [x] TrackerPage 接入 Sidecar 检查
- [x] ApplicationDetailPage 接入完整检查流程（含 AI）
- [x] 写入 tracking_runs 记录
- [x] 接入 AI 状态识别（UTF-8 安全截断、HTTP 超时、snake_case 字段名）
- [x] AI 结果更新应用状态（confidence >= 0.85 自动更新，0.60-0.85 待确认事件）
- [x] 创建事件记录（status_change, login_expired, note_added）
- [x] 状态变化通知（遵循 notificationsEnabled 开关）

### UI 页面
- [x] Dashboard 仪表盘（渐变卡片、骨架屏、动态列表）
- [x] Applications 列表页（公司头像、等待天数、hover 操作）
- [x] Application Detail 详情页（快速状态切换、检查/登录按钮、提醒交互、错误重试、竞争防护、长列表滚动）
- [x] Kanban 看板（完整状态列、拖拽回滚、事件记录、搜索、点击详情）
- [x] Tracker 状态监控页（完整检查流程、简化结果消息）
- [x] Reminders 提醒页（创建/删除、类型筛选、搜索、关联应用、过期标记）
- [x] Settings 设置页（测试连接、Key 显示/隐藏、重置默认、数据目录、通知权限、脏状态）

### 关键修复
- [x] UTF-8 安全截断（防 CJK 文本 panic）
- [x] HTTP 超时（60s 请求 + 10s 连接）
- [x] URL 双斜杠 bug
- [x] checkFrequency 连接到实际创建逻辑
- [x] handleCheckAll 正确计数成功/失败
- [x] 手动状态变更创建事件
- [x] 登录状态变化全覆盖
- [x] AI 失败事件
- [x] sidecar login_state 权威优先
- [x] tracking_runs/application_events 索引
- [x] PRAGMA foreign_keys = ON
- [x] UNIQUE(application_id, status_url) 约束
- [x] Sidecar camelCase 字段名
- [x] AI prompt snake_case 字段名
- [x] AI 输出字段默认值

## 启动方式

```bash
cd /Users/ikun/Documents/code/Projects/APP/ApplyRadar
pnpm tauri dev
```
