<div align="center">

# ApplyRadar

**投递雷达 — 本地求职状态自动跟踪桌面客户端**

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-stable-orange)](https://www.rust-lang.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

本地自动检查招聘官网状态，AI 解析页面内容为结构化状态更新，只在状态变化、登录失效或需要处理时通知你。

[功能特性](#功能特性) · [快速开始](#快速开始) · [技术栈](#技术栈) · [开发指南](#开发指南) · [FAQ](#常见问题)

</div>

---

## 功能特性

### 求职管理
- 求职记录 CRUD — 公司、岗位、地点、薪资、来源、优先级、投递日期、截止日期、备注
- 状态看板 — 按投递阶段分组（待投递 → 已投递 → 审核中 → 面试 → 结果），支持拖拽修改
- 等待天数 — 自动计算投递后等待天数，超时高亮提醒

### 自动监控
- 状态页检查 — Playwright 持久化浏览器 Profile，复用登录态，无需保存账号密码
- 批量检查 — 同域目标合并为一次浏览器会话，大幅提速
- 规则 + AI 双引擎 — 无 AI 时使用保守规则识别；配置 OpenAI 兼容接口后 AI 解析更精准
- 待确认闭环 — 低置信度识别结果可确认采用或忽略

### 通知与推送
- 系统通知 — 状态变化、登录异常、检查完成/失败时推送桌面通知
- 邮件日报 — SMTP 配置后每日定时发送 HTML 报告，支持 QQ 邮箱/163 邮箱等
- 推送记录 — 所有推送历史（邮件、通知、状态变更、提醒）集中记录和查看
- 提醒管理 — 创建提醒、到期通知、关联求职记录

### 数据安全
- 本地优先 — SQLite 数据库、浏览器 Profile、配置文件全部存储在本机
- 备份恢复 — JSON 导入/导出，导入时自动清洗脏数据、去重
- 登录保护 — 验证码、二次验证、账号异常自动检测，不会绕过安全机制

---

## 快速开始

### 环境要求

| 依赖 | 版本 |
|------|------|
| Node.js | 20+ |
| pnpm | 9+ |
| Rust | stable |
| Playwright Chromium | 自动安装 |

### 安装

```bash
# 克隆仓库
git clone https://github.com/Yeezy7/ApplyRadar.git
cd ApplyRadar

# 安装依赖
pnpm install

# 安装 Playwright 浏览器
pnpm exec playwright install chromium
```

### 开发

```bash
# 构建 sidecar（首次必须）
pnpm build:sidecar

# 启动开发模式
pnpm tauri dev
```

### 构建

```bash
# 构建 sidecar
pnpm build:sidecar

# Tauri 打包
pnpm tauri build
```

---

## 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 桌面客户端 | Tauri v2 | Rust 后端 + Web 前端 |
| 前端 | React 19 + TypeScript + Vite | SPA，无路由库 |
| UI | Tailwind CSS v4 + lucide-react | 原子化 CSS + 图标库 |
| 本地后端 | Rust + Tauri Commands | 异步命令，SQLite 直连 |
| 数据库 | SQLite + sqlx | 编译时校验 SQL |
| 浏览器自动化 | Node.js + Playwright | sidecar 进程，stdin/stdout JSON 协议 |
| AI | OpenAI 兼容 API | Rust reqwest 调用，支持任意兼容接口 |
| 邮件 | lettre (SMTP) | 支持 SSL(465) / STARTTLS(587) |
| 包管理 | pnpm workspace | monorepo 结构 |

---

## 项目结构

```text
ApplyRadar/
├── apps/desktop/                  # Tauri + React 主应用
│   ├── src/                       # 前端
│   │   ├── pages/                 # 页面组件（7 个）
│   │   ├── components/            # 共享组件
│   │   ├── services/              # Tauri invoke 封装
│   │   ├── stores/                # 设置缓存
│   │   └── utils/                 # 工具函数
│   └── src-tauri/                 # Rust 后端
│       ├── src/commands/          # Tauri commands（9 个模块）
│       ├── src/db.rs              # SQLite 连接 + 迁移
│       └── src/lib.rs             # 插件注册 + 后台调度
├── packages/automation/           # Playwright Sidecar
│   └── src/sidecar.ts             # stdin/stdout JSON 行协议
├── packages/shared/               # 共享 TypeScript 类型
├── desc.md                        # 产品与技术规划
└── ui.md                          # UI 原型参考
```

---

## 开发指南

### 常用命令

```bash
# 开发
pnpm tauri dev              # 启动完整应用
pnpm dev                    # 仅前端 Vite
pnpm build:sidecar          # 构建 sidecar

# 校验
cd apps/desktop/src-tauri && cargo check   # Rust 编译检查
cd apps/desktop && npx tsc --noEmit        # TypeScript 类型检查
pnpm build                                   # 前端构建
```

### 架构概览

```
┌─────────────┐     Tauri invoke      ┌──────────────┐
│   React UI  │ ───────────────────→ │ Rust Commands │
│  (Frontend) │ ←─────────────────── │  (Backend)    │
└─────────────┘     JSON response     └──────┬───────┘
                                             │
                                    ┌────────┴────────┐
                                    │                  │
                              ┌─────▼─────┐    ┌──────▼──────┐
                              │  SQLite   │    │  Sidecar    │
                              │ Database  │    │ (Playwright)│
                              └───────────┘    └─────────────┘
```

### 数据与配置

应用数据存放在 Tauri app data 目录（`设置 → 数据存储` 可查看路径）：

- `applyradar.db` — SQLite 数据库
- `profiles/` — 浏览器持久化 Profile
- `settings` 表 — 应用配置

---

## 常见问题

### sidecar 找不到

```bash
pnpm build:sidecar
```

### Playwright 浏览器缺失

```bash
pnpm exec playwright install chromium
```

### AI 测试失败

检查：API Key 是否有效、Base URL 是否正确、模型名是否可用、网络是否可达。

### 自动检查卡在"执行中"

后端有 10 分钟超时自动恢复。也可以在监控页点击「重置状态」手动恢复。

### 邮件发送失败

确认 SMTP 配置正确（QQ 邮箱需要授权码而非密码）。端口 465 用 SSL，587 用 STARTTLS。

---

## 许可证

[MIT](./LICENSE)
