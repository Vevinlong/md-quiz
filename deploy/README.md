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

## 打包说明（重要）

打包命令统一用仓库根目录的 `../package-deploy.sh`：

```bash
# 阿里云公网部署（必须传正式域名，否则候选人收到 localhost/内网链接）
cd /home/dkw/projects/md-quiz/md-quiz-ssh
./package-deploy.sh onlinetest.dakewe.cn

# 内网 / 本地部署（不需要域名，保持注释，自动推断）
./package-deploy.sh
```

> **SITE_BASE_URL 关键点**：阿里云正式环境必须在 `.env` 中配置正式域名
> （`SITE_BASE_URL=https://onlinetest.dakewe.cn`），否则生成的邀约链接 / 二维码
> 会用 localhost 或内网 IP，候选人打不开。本地 / 内网保持注释即可。
> `package-deploy.sh` 会自动处理，**不要手动直接 cp 本地 `.env`**。
