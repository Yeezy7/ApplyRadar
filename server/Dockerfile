FROM node:20-slim AS builder

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./
COPY server/package.json ./server/
COPY packages/shared/package.json ./packages/shared/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源码
COPY server/ ./server/
COPY packages/shared/ ./packages/shared/

# 构建
RUN cd server && pnpm build

# 生产镜像
FROM node:20-slim

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/server/package.json ./server/

# 只安装生产依赖
RUN pnpm install --frozen-lockfile --prod

# 复制构建产物
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/packages/shared ./packages/shared

# 创建数据目录
RUN mkdir -p /app/server/data

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# 启动
CMD ["node", "server/dist/index.js"]
