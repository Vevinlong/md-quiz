#!/bin/bash
set -e
# md-quiz 统一构建入口 —— 始终先生成版本号，再构建镜像
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$PROJECT_ROOT"

echo "=== 生成版本号 ==="
bash scripts/gen-version.sh

echo "=== 构建镜像 ==="
docker compose build "$@"

echo "=== 构建完成 ==="
