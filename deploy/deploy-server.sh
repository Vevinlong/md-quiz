#!/bin/bash
set -e
# md-quiz 部署/升级脚本 — 在服务器上执行
# 前置条件: md-quiz.tar、docker-compose.yml、.env、deploy-server.sh 已放到当前目录

cd "$(dirname "$0")"

echo "=== 1. 加载镜像 ==="
sudo docker load < md-quiz.tar

echo "=== 2. 重新创建容器 ==="
sudo docker compose -p md-quiz up -d --force-recreate

echo "=== 3. 等待健康检查 ==="
sleep 10

echo "=== 4. 状态 ==="
sudo docker compose -p md-quiz ps

echo "=== 5. 版本 ==="
curl -s http://localhost:8000/api/admin/version
echo ""
echo "=== 部署完成 ==="
