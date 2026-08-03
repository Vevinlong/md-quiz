# md-quiz 全新 Ubuntu 24.04.4 部署指南

## 前置条件

- Ubuntu 24.04.4 x86_64
- 可访问 Docker Hub 镜像（已配置国内 mirror）
- （可选）测验题库 shire 仓库的 Git 访问权限

## 1. 安装 Docker

```bash
# 卸载旧版本
sudo apt-get remove docker docker-engine docker.io containerd runc

# 安装依赖
sudo apt-get update
sudo apt-get install -y ca-certificates curl

# 添加 Docker 官方 GPG 密钥
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# 添加阿里云 Docker 镜像源
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装 Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 将当前用户加入 docker 组（免 sudo）
sudo usermod -aG docker $USER
# 重新登录生效

# 配置 Docker 镜像加速
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me"
  ]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker

# 验证
docker --version
docker compose version
```

## 2. 部署 md-quiz

### 方式 A：预构建镜像（推荐，无需拉依赖）

从开发机导出镜像，上传到服务器：

```bash
# 在开发机上导出
docker save md-quiz:local -o /tmp/md-quiz.tar

# 上传到服务器
scp /tmp/md-quiz.tar docker-compose.yml .env dkw@新服务器IP:~/md-quiz/
```

在服务器上：

```bash
mkdir -p ~/md-quiz ~/md-quiz-reset
cd ~/md-quiz

# 加载镜像
sudo docker load < md-quiz.tar

# 修改 .env（必须！）
vim .env
# 至少改 ADMIN_PASSWORD 和 APP_SECRET_KEY

# 启动
sudo docker compose -p md-quiz up -d

# 验证
curl http://localhost:8000/healthz
curl http://localhost:8000/api/admin/version
```

### 方式 B：源码构建

```bash
# 克隆仓库
git clone <md-quiz-repo-url> md-quiz
cd md-quiz

# 配置 .env（从模板修改）
cp .env.example .env   # 或手动创建
vim .env

# 生成版本号
bash scripts/gen-version.sh

# 构建并启动
sudo docker compose build --no-cache
sudo docker compose up -d
```

## 3. .env 配置说明

```bash
# ========== 必改 ==========
APP_SECRET_KEY=<生成一个随机 UUID>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<你的密码>

# ========== 数据库（不改） ==========
POSTGRES_USER=mdquiz
POSTGRES_PASSWORD=mdquiz_password
POSTGRES_DB=mdquiz

# ========== LLM 评卷（可选） ==========
OPENAI_API_KEY=<火山方舟 API Key>
OPENAI_MODEL=deepseek-v4-flash-260425
# OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# ========== 短信验证（可选） ==========
SMS_ENABLED=false

# ========== MCP（可选） ==========
# MCP_ENABLED=true
# MCP_AUTH_TOKEN=<生成 token>
```

## 4. 测验题库同步（可选）

后台管理 → 题库管理 → 绑定 Git 仓库：

- 仓库地址：`git@...` 或 `https://...`（含 token）
- 如果使用 SSH，容器内已有 `git`，需挂载 SSH key 或使用 HTTP + token

## 5. 目录结构

```
~/md-quiz/
  docker-compose.yml    # Compose 编排
  .env                  # 环境变量
  md-quiz.tar           # 预构建镜像（方式 A）
  scripts/
    deploy-server.sh    # 服务器端部署脚本

~/md-quiz-reset/        # admin 密码重置目录
  # 在此目录创建文件 "admin-reset.flag" 可触发密码重置为 .env 中配置的值
```

## 6. 常用运维命令

```bash
# 查看日志
sudo docker compose -p md-quiz logs -f app

# 重启
sudo docker compose -p md-quiz up -d --force-recreate

# 更新镜像（预构建方式）
sudo docker load < md-quiz-new.tar
sudo docker compose -p md-quiz up -d --force-recreate

# 数据库备份
sudo docker compose -p md-quiz exec db pg_dump -U mdquiz mdquiz > backup.sql

# 重置 admin 密码
touch ~/md-quiz-reset/admin-reset.flag
sudo docker compose -p md-quiz restart app
# 密码会重置为 .env 中的 ADMIN_PASSWORD
```

## 7. 端口

| 端口 | 服务 | 说明 |
|------|------|------|
| 8000 | md-quiz app | HTTP API + 前端页面 |
| 5433 | PostgreSQL | 数据库（映射到宿主机，方便调试） |

## 8. 验证部署

```bash
# 健康检查
curl http://localhost:8000/healthz

# 版本信息
curl http://localhost:8000/api/admin/version

# 后台页面
curl -I http://localhost:8000/admin/login
```
