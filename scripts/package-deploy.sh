#!/bin/bash
set -euo pipefail
# md-quiz 内网自包含部署包打包脚本
#
# 用法:
#   bash scripts/package-deploy.sh          # 打自包含内网包（SITE_BASE_URL 保持注释）
#
# 依赖: /tmp/md-quiz.tar 已由 deploy.sh 构建导出（或手动 docker save md-quiz:local -o /tmp/md-quiz.tar）
#
# 产出: <工作区>/md-quiz-dkw-release-<ver>-<commit>.tar（自包含，含镜像+compose+.env+文档+部署脚本）
# 组装来源: md-quiz/deploy/（git 静态源）+ md-quiz/.env + md-quiz/docker-compose.yml + /tmp/md-quiz.tar
# 注意: deploy-package/ 每次由脚本全量重建，不要手工改它，改了也会被覆盖
# 本地 md-quiz/.env 永远不会被修改（只读取复制）。

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"        # md-quiz/（git 仓库）
WORKSPACE_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"    # md-quiz-ssh/（工作区，非 git）
DEPLOY_SRC="$PROJECT_ROOT/deploy"                    # git 静态源
DEPLOY_DIR="$WORKSPACE_ROOT/deploy-package"          # 组装目录（脚本重建，产物）
RELEASE_DIR="$WORKSPACE_ROOT"                        # 输出 tar 位置

echo "=== 1. 检查镜像 ==="
if [ ! -f /tmp/md-quiz.tar ]; then
  echo "错误: /tmp/md-quiz.tar 不存在，请先执行 deploy.sh local/server/cloud 构建导出" >&2
  exit 1
fi

# 从镜像 tar 层读版本信息（display 如 V01.01.01.227 → 三段版本 1.1.1 去前导零 + build 227）
read_image_version() {
  local tmp
  tmp=$(mktemp -d)
  tar -xf /tmp/md-quiz.tar -C "$tmp" 2>/dev/null
  local display="" build="" commit=""
  for f in "$tmp"/blobs/sha256/*; do
    local res
    res=$(tar -xOf "$f" --wildcards '*/version.json' 2>/dev/null | head -14)
    display=$(echo "$res" | sed -n 's/.*"display"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
    build=$(echo "$res" | sed -n 's/.*"build"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | head -1)
    commit=$(echo "$res" | sed -n 's/.*"commit"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
    if [ -n "$display" ] && [ -n "$build" ] && [ -n "$commit" ]; then break; fi
  done
  rm -rf "$tmp"
  # display 形如 V1.2.1.229：去前导 V 拆段，取前三段去前导零 → 1.2.1
  local segments ver3=""
  display="${display#V}"
  IFS='.' read -r -a segments <<< "$display"
  local i
  for ((i = 0; i < 3 && i < ${#segments[@]}; i++)); do
    local clean="${segments[$i]#0}"
    clean="${clean:-0}"
    ver3="${ver3}${ver3:+.}${clean}"
  done
  echo "${ver3}-${build}|${commit}"
}

IMAGE_META=$(read_image_version)
IMAGE_VERSION="${IMAGE_META%%|*}"
IMAGE_COMMIT="${IMAGE_META##*|}"
if [ -z "$IMAGE_VERSION" ] || [ -z "$IMAGE_COMMIT" ]; then
  echo "错误: 无法从镜像读取版本信息" >&2
  exit 1
fi
echo "镜像版本: $IMAGE_VERSION, commit: $IMAGE_COMMIT"

echo "=== 2. 全量重建 deploy-package/（从 git 源组装，清残留） ==="
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
cp "$DEPLOY_SRC"/deploy-server.sh "$DEPLOY_SRC"/deploy-ubuntu24.md "$DEPLOY_SRC"/README.md "$DEPLOY_SRC"/.env.template "$DEPLOY_DIR"/
cp "$PROJECT_ROOT/docker-compose.yml" "$DEPLOY_DIR/"
cp "$PROJECT_ROOT/.env" "$DEPLOY_DIR/.env"
cp /tmp/md-quiz.tar "$DEPLOY_DIR/md-quiz.tar"

echo "=== 3. SITE_BASE_URL 内网语义（保持注释） ==="
# md-quiz/.env 里可能是注释状态，这里强制保证打包的 .env 是内网语义（不补域名）
if grep -q "^SITE_BASE_URL=" "$DEPLOY_DIR/.env"; then
  sed -i "s|^SITE_BASE_URL=.*|# SITE_BASE_URL=onlinetest.dakewe.cn|" "$DEPLOY_DIR/.env"
  echo "  → 已置为注释（内网/本地，自动推断域名）"
else
  echo "  → 保持现状（内网语义）"
fi

echo "=== 4. 确认打包内容 ==="
ls -lh "$DEPLOY_DIR"
echo "SITE_BASE_URL: $(grep -c '^SITE_BASE_URL=' "$DEPLOY_DIR/.env" || true) 行生效（应为 0）"

echo "=== 5. 重新打包（不压缩） ==="
RELEASE_NAME="md-quiz-dkw-release-${IMAGE_VERSION}-${IMAGE_COMMIT}.tar"
rm -f "$RELEASE_DIR"/md-quiz-dkw-release-*.tar
rm -f "$RELEASE_DIR/deploy-package.tar"   # 兼容旧名（如被引用）
tar -cf "$RELEASE_DIR/$RELEASE_NAME" -C "$WORKSPACE_ROOT" deploy-package/

echo "=== 完成 ==="
ls -lh --time-style=full-iso "$RELEASE_DIR/$RELEASE_NAME"
echo "内网包: $RELEASE_DIR/$RELEASE_NAME"
