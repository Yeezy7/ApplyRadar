# ApplyRadar 后端部署指南

## 架构说明

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Web 端     │     │  Desktop 端  │     │  Miniapp    │
│  (React)    │     │  (Tauri)    │     │  (小程序)   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │   统一后端   │
                    │   (Hono)    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   SQLite    │
                    │   数据库    │
                    └─────────────┘
```

## 部署方式

### 方式一：Docker 部署（推荐）

1. 创建 Dockerfile：

```dockerfile
FROM node:20-slim

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./
COPY server/package.json ./server/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源码
COPY server/ ./server/
COPY packages/shared/ ./packages/shared/

# 构建
RUN cd server && pnpm build

# 创建数据目录
RUN mkdir -p /app/server/data

# 暴露端口
EXPOSE 3000

# 启动
CMD ["node", "server/dist/index.js"]
```

2. 创建 docker-compose.yml：

```yaml
version: '3.8'

services:
  applyradar-server:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/server/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOST=0.0.0.0
      - DB_PATH=/app/server/data/applyradar.db
      - JWT_SECRET=your-secret-key-here
    restart: unless-stopped
```

3. 启动服务：

```bash
docker-compose up -d
```

### 方式二：直接部署

1. 安装依赖：

```bash
pnpm install
```

2. 构建：

```bash
cd server && pnpm build
```

3. 配置环境变量：

```bash
export NODE_ENV=production
export PORT=3000
export HOST=0.0.0.0
export DB_PATH=./data/applyradar.db
export JWT_SECRET=your-secret-key-here
```

4. 启动：

```bash
node server/dist/index.js
```

### 方式三：使用 PM2（进程管理）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start server/dist/index.js --name applyradar-server

# 设置开机自启
pm2 startup
pm2 save
```

## Nginx 反向代理配置

```nginx
server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## SSL 证书（HTTPS）

使用 Let's Encrypt：

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d api.your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

## 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| NODE_ENV | 运行环境 | development |
| PORT | 服务端口 | 3000 |
| HOST | 监听地址 | 0.0.0.0 |
| DB_PATH | 数据库路径 | ./data/applyradar.db |
| JWT_SECRET | JWT 密钥 | 需要设置 |
| WECHAT_APPID | 微信 AppID | 可选 |
| WECHAT_APPSECRET | 微信 AppSecret | 可选 |

## 数据备份

SQLite 数据库文件位于 `data/applyradar.db`，定期备份此文件即可。

```bash
# 备份
cp data/applyradar.db data/backup/applyradar_$(date +%Y%m%d).db

# 恢复
cp data/backup/applyradar_20260611.db data/applyradar.db
```

## 健康检查

```bash
curl http://localhost:3000/
```

返回：
```json
{
  "name": "ApplyRadar API",
  "version": "1.0.0",
  "status": "ok"
}
```

## API 文档

所有 API 都需要 Bearer Token 认证（除了登录和注册）：

```bash
# 登录获取 Token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# 使用 Token 访问 API
curl http://localhost:3000/api/applications \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 监控

```bash
# 查看日志
pm2 logs applyradar-server

# 查看状态
pm2 status

# 监控
pm2 monit
```
