#!/usr/bin/env bash
# ============================================================
# 求一基 · 一键部署脚本
# 把项目同步到目标服务器并用 PM2 拉起/重启应用。
#
# 用法（在本地 Mac 执行）：
#   SERVER_HOST=your.server.ip \
#   SERVER_USER=root \
#   REMOTE_DIR=/var/www/fundRecommend \
#   ./deploy/deploy.sh
#
# 可选环境变量：
#   SSH_PORT    (默认 22)
#   PM2_NAME    (默认 fundrecommend，见 ecosystem.config.js)
# ============================================================
set -euo pipefail

SERVER_HOST="${SERVER_HOST:?请设置 SERVER_HOST（服务器 IP 或域名）}"
SERVER_USER="${SERVER_USER:?请设置 SERVER_USER（SSH 用户名）}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/fundRecommend}"
SSH_PORT="${SSH_PORT:-22}"
PM2_NAME="${PM2_NAME:-fundrecommend}"

LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> 同步代码到 ${SERVER_USER}@${SERVER_HOST}:${REMOTE_DIR}"
rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='data' \
  --exclude='.env' \
  -e "ssh -p ${SSH_PORT}" \
  "${LOCAL_DIR}/" "${SERVER_USER}@${SERVER_HOST}:${REMOTE_DIR}/"

echo "==> 远程安装依赖并重启 PM2"
ssh -p "${SSH_PORT}" "${SERVER_USER}@${SERVER_HOST}" bash -s <<EOF
set -e
cd "${REMOTE_DIR}"
# 生产依赖
npm install --omit=dev || npm install
# 用 PM2 拉起（已存在则重启）
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "${PM2_NAME}" || pm2 start ecosystem.config.js
  pm2 save
else
  echo "警告：未检测到 pm2，请用 npm install -g pm2 后手动启动：node server.js"
fi
echo "==> 部署完成，确认进程："
pm2 ls | grep "${PM2_NAME}" || true
EOF

echo "==> 完成。请确保 nginx 已 include deploy/nginx-fundRecommend.conf 并重载：nginx -s reload"
