#!/bin/bash
set -euo pipefail
# md-quiz 统一部署入口
#
# 用法:
#   bash scripts/deploy.sh local      # 场景1: 构建 + 版本校验 + 本地跑起来
#   bash scripts/deploy.sh server     # 场景2: 构建 + 校验 + 打内网包 + 打印 scp 命令
#   bash scripts/deploy.sh cloud      # 场景3: 构建 + 校验 + 上传云端(env+镜像) + 重启 + 验证
#   bash scripts/deploy.sh all        # 场景4: 上面三者顺序走
#
# 说明:
#   - 构建产物 /tmp/md-quiz.tar；内网包输出到 <工作区>/md-quiz-dkw-release-*.tar
#   - 云端部署走 IT 提供的 HTTP 接口（独立于考试系统），凭证在 cloud-upload.env
#   - scp/ssh 命令只打印不执行（由你手动执行），API Key 不回显

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"        # md-quiz/（git 仓库）
WORKSPACE_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"    # md-quiz-ssh/（工作区，非 git）

# ===== 配置段（按需修改） =====
INTERNAL_USER=dkw
INTERNAL_HOST=192.168.181.33
INTERNAL_DIR=/home/dkw/Download/md-quiz-release
CLOUD_DOMAIN=onlinetest.dakewe.cn          # 考试系统正式域名（上传的 .env 用）
CLOUD_ENV_FILE="$WORKSPACE_ROOT/cloud-upload.env"   # 云端凭证（非 git）

usage() {
  sed -n '3,13p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

[ $# -ge 1 ] || usage
CMD="${1:-}"

# 从镜像 tar 读 build 号（与 package-deploy.sh 同源判据）
read_image_build() {
  local tmp
  tmp=$(mktemp -d)
  tar -xf /tmp/md-quiz.tar -C "$tmp" 2>/dev/null
  local build=""
  for f in "$tmp"/blobs/sha256/*; do
    build=$(tar -xOf "$f" --wildcards '*/version.json' 2>/dev/null \
      | sed -n 's/.*"build"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | head -1)
    [ -n "$build" ] && break
  done
  rm -rf "$tmp"
  echo "$build"
}

BUILD_DONE=0
do_build() {
  [ "$BUILD_DONE" = 1 ] && return
  cd "$PROJECT_ROOT"
  echo "=== 1. 生成版本号 ==="
  bash scripts/gen-version.sh
  echo "=== 2. 构建镜像 ==="
  bash scripts/build.sh --no-cache
  echo "=== 3. 导出镜像 ==="
  docker save md-quiz:local -o /tmp/md-quiz.tar
  echo "=== 4. 版本校验 ==="
  local git_count build
  git_count=$(git -C "$PROJECT_ROOT" rev-list --count HEAD)
  build=$(read_image_build)
  if [ -z "$build" ]; then
    echo "错误: 无法从镜像读到 build 号" >&2
    exit 1
  fi
  if [ "$git_count" != "$build" ]; then
    echo "错误: 镜像 build=$build != git commit count=$git_count，构建产物异常，中止" >&2
    exit 1
  fi
  echo "  ✓ build=$build 与 git commit count 一致"
  BUILD_DONE=1
}

# 生成云端 .env（临时文件）：md-quiz/.env + 反注释 SITE_BASE_URL
gen_cloud_env() {
  local out=/tmp/md-quiz-cloud.env
  cp "$PROJECT_ROOT/.env" "$out"
  if grep -q "^[# ]*SITE_BASE_URL=" "$out"; then
    sed -i "s|^[# ]*SITE_BASE_URL=.*|SITE_BASE_URL=https://${CLOUD_DOMAIN}|" "$out"
  else
    echo "SITE_BASE_URL=https://${CLOUD_DOMAIN}" >> "$out"
  fi
  echo "$out"
}

# 加载云端凭证（cloud-upload.env），不回显 Key
load_cloud_config() {
  if [ ! -f "$CLOUD_ENV_FILE" ]; then
    echo "错误: 找不到 $CLOUD_ENV_FILE（云端凭证），请按模板创建" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$CLOUD_ENV_FILE"
  set +a
  if [ -z "${CLOUD_API_KEY:-}" ]; then
    echo "错误: $CLOUD_ENV_FILE 缺 CLOUD_API_KEY" >&2
    exit 1
  fi
}

# 上传（IT 提供的接口：octet-stream 原始文件流，X-API-KEY 认证）
cloud_upload() {   # $1=接口路径  $2=文件
  curl --silent --show-error --fail \
    --request POST \
    --url "${CLOUD_BASE_URL}${1}" \
    --header 'Content-Type: application/octet-stream' \
    --header "X-API-KEY: ${CLOUD_API_KEY}" \
    --data-binary @"$2"
  echo ""
}

cmd_local() {
  do_build
  echo "=== 5. 本地启动 ==="
  cd "$PROJECT_ROOT"
  docker compose up -d --force-recreate app
  sleep 5
  echo "=== 6. 本地版本确认 ==="
  curl -s http://localhost:8000/api/admin/version | python3 -c "import sys,json;d=json.load(sys.stdin);print('API: V%s.%s build=%s commit=%s'%(d['base'],d['build'],d['build'],d['commit']))"
}

cmd_server() {
  do_build
  echo "=== 5. 打内网自包含包 ==="
  bash "$SCRIPT_DIR/package-deploy.sh"
  local release
  release=$(ls -1t "$WORKSPACE_ROOT"/md-quiz-dkw-release-*.tar | head -1)
  echo ""
  echo "=== 6. 内网部署命令（请手动执行） ==="
  echo "scp $release ${INTERNAL_USER}@${INTERNAL_HOST}:${INTERNAL_DIR}/"
  echo "ssh ${INTERNAL_USER}@${INTERNAL_HOST} \"cd ${INTERNAL_DIR} && tar -xf \$(basename $release) && cd deploy-package && ./deploy-server.sh\""
}

cmd_cloud() {
  do_build
  load_cloud_config
  local env_file
  env_file=$(gen_cloud_env)
  echo "=== 5. 上传 env（${CLOUD_BASE_URL}/env） ==="
  cloud_upload /env "$env_file"
  echo "=== 6. 上传镜像（${CLOUD_BASE_URL}/upload，$(du -h /tmp/md-quiz.tar | cut -f1)） ==="
  cloud_upload /upload /tmp/md-quiz.tar
  echo "=== 7. 重启（${CLOUD_BASE_URL}/restart） ==="
  cloud_upload /restart /tmp/md-quiz.tar
  echo "=== 8. 云端版本验证 ==="
  local i
  for i in $(seq 1 12); do
    sleep 10
    if curl -s "https://${CLOUD_DOMAIN}/api/admin/version" | python3 -c "import sys,json;d=json.load(sys.stdin);print('API: V%s.%s build=%s commit=%s'%(d['base'],d['build'],d['build'],d['commit']))" 2>/dev/null; then
      rm -f "$env_file"
      return 0
    fi
    echo "  (第 ${i} 次探测未就绪，10s 后重试)"
  done
  rm -f "$env_file"
  echo "警告: 云端长时间未就绪，请检查 https://${CLOUD_DOMAIN}" >&2
  return 1
}

case "$CMD" in
  local)  cmd_local ;;
  server) cmd_server ;;
  cloud)  cmd_cloud ;;
  all)    cmd_local; cmd_server; cmd_cloud ;;
  *)      usage ;;
esac
echo "=== deploy.sh $CMD 完成 ==="
