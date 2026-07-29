#!/bin/bash
set -e
# 部署 md-quiz 镜像到服务器 — 在服务器上执行
# 前置条件: md-quiz.tar 和 docker-compose.yml 已放到当前目录

cd "$(dirname "$0")"

echo "=== 加载镜像 ==="
sudo docker load < md-quiz.tar

echo "=== 重新创建容器 ==="
sudo docker compose -p md-quiz up -d --force-recreate

echo "=== 等待健康检查 ==="
sleep 10

echo "=== 状态 ==="
sudo docker compose -p md-quiz ps

echo "=== 版本 ==="
curl -s http://localhost:8000/api/admin/version
echo ""
echo "=== 部署完成 ==="
