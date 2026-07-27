#!/bin/bash
set -e
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$PROJECT_ROOT"

# 1. Generate version
bash scripts/gen-version.sh

# 2. Build Docker image
docker compose build app

# 3. Start services
docker compose up -d

echo ""
echo "=== Build complete ==="
cat static/version.json
