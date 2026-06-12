#!/bin/bash

# ApplyRadar 部署脚本

set -e

echo "=== ApplyRadar 部署脚本 ==="

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "错误: Docker 未安装，请先安装 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "错误: Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

# 创建 .env 文件（如果不存在）
if [ ! -f .env ]; then
    echo "创建 .env 文件..."
    cp .env.example .env
    # 生成随机 JWT 密钥
    JWT_SECRET=$(openssl rand -hex 32)
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
    echo "已生成随机 JWT 密钥"
fi

# 创建数据目录
mkdir -p data

# 构建并启动
echo "构建 Docker 镜像..."
docker-compose build

echo "启动服务..."
docker-compose up -d

# 等待服务启动
echo "等待服务启动..."
sleep 5

# 检查服务状态
if curl -f http://localhost:3000/ > /dev/null 2>&1; then
    echo "=== 部署成功 ==="
    echo "服务地址: http://localhost:3000"
    echo "健康检查: http://localhost:3000/"
    echo ""
    echo "查看日志: docker-compose logs -f"
    echo "停止服务: docker-compose down"
else
    echo "错误: 服务启动失败"
    echo "查看日志: docker-compose logs"
    exit 1
fi
