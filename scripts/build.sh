#!/bin/bash
set -e
cd "$(dirname "$0")/.."

export GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
export GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "0000000")
export GIT_COMMIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo "0")

echo "Building: V$(cat VERSION | tr -d '[:space:]').${GIT_COMMIT_COUNT}-[${GIT_BRANCH}]-(${GIT_COMMIT})"

docker compose build app
docker compose up -d
echo "=== Done ==="
