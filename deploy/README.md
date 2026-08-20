# md-quiz 部署包

## 文件说明

| 文件 | 说明 |
|------|------|
| `md-quiz.tar` | Docker 镜像（`docker save` 导出） |
| `docker-compose.yml` | Docker Compose 编排文件 |
| `.env.template` | 环境变量模板，复制为 `.env` 后修改 |
| `deploy-ubuntu24.md` | 完整部署文档 |
| `deploy-server.sh` | 服务器端快速部署脚本 |

## 快速部署

```bash
# 1. 加载镜像
sudo docker load < md-quiz.tar

# 2. 配置环境变量
cp .env.template .env
vim .env    # 修改密码、API Key 等

# 3. 启动
sudo docker compose -p md-quiz up -d

# 4. 验证
curl http://localhost:8000/healthz
```

详细步骤参考 `deploy-ubuntu24.md`。

## 打包与发布（重要）

统一用 `scripts/deploy.sh`，不要再手动 cp 或单独跑 package-deploy.sh：

```bash
cd /home/dkw/projects/md-quiz/md-quiz-ssh/md-quiz

bash scripts/deploy.sh local      # 场景1: 构建 + 版本校验 + 本地跑起来
bash scripts/deploy.sh server     # 场景2: 构建 + 校验 + 打内网包 + 打印 scp 命令
bash scripts/deploy.sh cloud      # 场景3: 构建 + 校验 + 上传云端(env+镜像) + 重启 + 验证
bash scripts/deploy.sh all        # 场景4: 上面三者顺序走（只构建一次）
```

内网包固定名 `deploy-package.tar`（不带版本，版本号在包内 md-quiz.tar 的 version.json，deploy-server.sh 会打印），scp 命令永远不变：

```bash
scp /home/dkw/projects/md-quiz/md-quiz-ssh/md-quiz/deploy-package.tar dkw@192.168.181.33:/home/dkw/Download/md-quiz-release/
ssh dkw@192.168.181.33 "cd /home/dkw/Download/md-quiz-release && tar -xf deploy-package.tar && cd deploy-package && ./deploy-server.sh"
```

> **SITE_BASE_URL 关键点**：云端部署走 IT 提供的 HTTP 接口（上传 env + 镜像 + 重启），
> 上传的 `.env` 由 deploy.sh 自动配置 `SITE_BASE_URL=https://onlinetest.dakewe.cn`。
> 内网包保持注释（自动推断域名）。**本地 `md-quiz/.env` 永不被脚本修改**。
