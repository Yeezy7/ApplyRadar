# ApplyRadar Worker

状态检查 Worker 服务，使用 Playwright 自动化浏览器检查求职状态页。

## 前置条件

1. Redis 服务运行中
2. Server API 服务运行中

## 安装

```bash
# 安装 Playwright 浏览器
npx playwright install chromium
```

## 启动

```bash
# 开发模式
pnpm dev

# 生产模式
pnpm build
pnpm start
```

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
cp .env.example .env
```

- `REDIS_URL` - Redis 连接地址
- `SERVER_URL` - Server API 地址
- `WORKER_CONCURRENCY` - 并发检查数
- `PROFILES_DIR` - 浏览器 Profile 存储目录

## 架构

```
Worker 服务
├── src/
│   ├── index.ts      # 入口，BullMQ Worker
│   ├── checker.ts    # 检查逻辑
│   ├── browser.ts    # Playwright 浏览器管理
│   └── extractor.ts  # 页面文本提取
└── profiles/         # 浏览器 Profile 存储
```

## 工作流程

1. Server 将检查任务加入 BullMQ 队列
2. Worker 从队列获取任务
3. 使用 Playwright 打开目标页面
4. 提取页面文本、检测登录状态
5. 将检查结果回调给 Server
