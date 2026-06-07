# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

ApplyRadar（投递雷达）是一个求职状态自动跟踪桌面客户端。本地自动检查招聘官网状态，AI 解析页面内容为结构化状态更新，只在状态变化、登录失效或需要处理时通知用户。

**当前状态：** Phase 0 技术验证已完成。项目有可运行的 Tauri + React + TypeScript 应用，包含 SQLite 数据库、基础 UI 和 Playwright Sidecar 骨架。

## 常用命令

```bash
# 开发模式启动应用
pnpm tauri dev

# 构建前端
pnpm build

# 构建 Sidecar
pnpm build:sidecar

# TypeScript 类型检查
cd apps/desktop && npx tsc --noEmit

# Rust 编译检查
cd apps/desktop/src-tauri && cargo check
```

## 技术栈

| 层 | 技术 |
|---|------|
| 桌面客户端 | Tauri v2 (Rust backend + web frontend) |
| 前端 | React + TypeScript + Vite |
| UI | Tailwind CSS v4 + lucide-react |
| 本地数据库 | SQLite (sqlx, 直接管理连接) |
| 浏览器自动化 | Node.js + Playwright (sidecar 进程) |
| AI | OpenAI API / 兼容 LLM API (Rust reqwest 调用) |

## 项目结构

```
ApplyRadar/
├── apps/desktop/                  # Tauri + React 主应用
│   ├── src/                       # React 前端
│   │   ├── pages/                 # ApplicationsPage, TrackerPage, SettingsPage
│   │   ├── components/            # ApplicationForm
│   │   ├── services/              # Tauri invoke 封装
│   │   └── styles.css             # Tailwind 入口
│   └── src-tauri/                 # Rust 后端
│       ├── src/lib.rs             # 插件注册 + 命令注册 + DB 初始化
│       ├── src/db.rs              # SQLite 连接 + migrations
│       └── src/commands/          # Tauri commands (application, tracker, event, reminder, ai)
├── packages/shared/               # 共享 TypeScript 类型 + 常量
│   └── src/types.ts               # Application, TrackingTarget, AIParseInput/Output 等
├── packages/automation/           # Playwright Sidecar
│   └── src/sidecar.ts             # stdin/stdout JSON 协议
├── desc.md                        # 完整开发规划文档
└── ui.md                          # React UI 原型参考
```

## 核心架构

**数据库：** 使用 sqlx 直接管理 SQLite 连接（不使用 Tauri SQL Plugin）。数据库文件存储在 Tauri app data 目录。所有 SQL 操作通过 Tauri Commands 暴露给前端。

**Sidecar 通信：** Playwright Sidecar 通过 stdin/stdout JSON 行协议与 Tauri 通信。前端通过 Tauri Shell Plugin 或直接调用 sidecar 二进制。

**AI 调用：** 在 Rust 端使用 reqwest 调用 OpenAI 兼容 API，API Key 存储在前端 localStorage。confidence >= 0.85 自动更新，0.60-0.85 待确认，< 0.60 不更新。

**前端状态管理：** 使用 React useState/useContext，无需外部状态管理库。

## 关键类型

定义在 `packages/shared/src/types.ts`：
- `ApplicationStatus` — 11 种状态（to_apply → rejected/withdrawn/unknown）
- `LoginState` — 6 种登录状态
- `TrackingTarget` — 监控目标
- `AIParseInput` / `AIParseOutput` — AI 输入输出 schema
- `SiteAdapter` — 适配器接口

## 设计文档

- `desc.md` — 完整开发规划，包含数据库 DDL、开发阶段、版本路线图
- `ui.md` — React UI 原型，可作为 UI 实现的参考（framer-motion + lucide-react + Tailwind）
