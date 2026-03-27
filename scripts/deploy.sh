#!/bin/bash
# =============================================================================
# cruise_agent 部署脚本
# 用法:
#   首次部署: ./scripts/deploy.sh --setup
#   更新代码: ./scripts/deploy.sh --update
#   查看状态: ./scripts/deploy.sh --status
# =============================================================================

set -e

# ---- 配置（根据实际情况修改） ----
SERVER_USER="root"
SERVER_HOST=""                      # 填写服务器 IP，如 123.45.67.89
SERVER_PORT="22"
REMOTE_APP_DIR="/srv/cruise_agent"
REMOTE_DATA_DIR="/data"
DOMAIN=""                           # 填写域名，如 example.com
APP_PORT=3000

# ---- 颜色输出 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

SSH="ssh -p ${SERVER_PORT} ${SERVER_USER}@${SERVER_HOST}"
SCP="scp -P ${SERVER_PORT}"

# ---- 检查配置 ----
check_config() {
    [[ -z "$SERVER_HOST" ]] && error "请先在脚本顶部填写 SERVER_HOST（服务器 IP）"
    [[ -z "$DOMAIN" ]]      && error "请先在脚本顶部填写 DOMAIN（域名）"
}

# ============================================================
# --setup: 首次初始化服务器环境
# ============================================================
setup_server() {
    check_config
    info "开始初始化服务器环境..."

    $SSH bash << REMOTE_SCRIPT
set -e

echo ">>> 更新系统包..."
apt update -qq && apt upgrade -y -qq

echo ">>> 安装 Node.js 22..."
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - -qq
    apt install -y nodejs -qq
fi
node -v

echo ">>> 安装 pnpm..."
if ! command -v pnpm &>/dev/null; then
    npm install -g pnpm
fi
pnpm -v

echo ">>> 安装 PM2..."
if ! command -v pm2 &>/dev/null; then
    npm install -g pm2
fi

echo ">>> 安装 Nginx..."
if ! command -v nginx &>/dev/null; then
    apt install -y nginx -qq
fi

echo ">>> 安装 Certbot..."
apt install -y certbot python3-certbot-nginx -qq

echo ">>> 创建目录..."
mkdir -p ${REMOTE_APP_DIR}
mkdir -p ${REMOTE_DATA_DIR}

echo ">>> 服务器初始化完成"
REMOTE_SCRIPT

    # 配置 Nginx
    setup_nginx
    success "服务器初始化完成！"
    info "下一步：运行 ./scripts/deploy.sh --update 部署应用"
}

# ============================================================
# 配置 Nginx
# ============================================================
setup_nginx() {
    info "配置 Nginx..."

    NGINX_CONF="server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_cache_bypass \\\$http_upgrade;
        proxy_read_timeout 60s;
    }
}"

    echo "$NGINX_CONF" | $SSH "cat > /etc/nginx/sites-available/cruise-agent"
    $SSH "ln -sf /etc/nginx/sites-available/cruise-agent /etc/nginx/sites-enabled/cruise-agent \
        && nginx -t && systemctl reload nginx"

    success "Nginx 配置完成"
    info "SSL 证书申请中（需要域名已解析到服务器 IP）..."
    $SSH "certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos -m admin@${DOMAIN} || true"
}

# ============================================================
# --update: 部署/更新应用代码
# ============================================================
deploy_update() {
    check_config
    info "开始部署 cruise_agent..."

    # 检查 .env.local 是否存在
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
    ENV_FILE="${PROJECT_DIR}/.env.local"

    if [[ ! -f "$ENV_FILE" ]]; then
        error ".env.local 不存在，请先创建"
    fi

    # 1. 同步代码（排除不需要的目录）
    info "同步代码到服务器..."
    rsync -avz --progress \
        --exclude='.git' \
        --exclude='node_modules' \
        --exclude='.next' \
        --exclude='.env.local' \
        --exclude='data/' \
        "${PROJECT_DIR}/" \
        "${SERVER_USER}@${SERVER_HOST}:${REMOTE_APP_DIR}/"

    # 2. 同步 .env.local
    info "同步环境配置..."
    $SCP "$ENV_FILE" "${SERVER_USER}@${SERVER_HOST}:${REMOTE_APP_DIR}/.env.local"

    # 确保 DB_PATH 在 .env.local 中已配置
    $SSH "grep -q 'DB_PATH' ${REMOTE_APP_DIR}/.env.local || \
        echo 'DB_PATH=${REMOTE_DATA_DIR}/cruise_deals.db' >> ${REMOTE_APP_DIR}/.env.local"

    # 3. 安装依赖 & 构建
    info "安装依赖..."
    $SSH "cd ${REMOTE_APP_DIR} && pnpm install --frozen-lockfile"

    info "构建应用..."
    $SSH "cd ${REMOTE_APP_DIR} && pnpm build"

    # 4. 重启 PM2
    info "重启服务..."
    $SSH << 'REMOTE'
        if pm2 describe cruise-agent > /dev/null 2>&1; then
            pm2 reload cruise-agent
        else
            cd /srv/cruise_agent
            pm2 start "pnpm start" --name cruise-agent --cwd /srv/cruise_agent
            pm2 save
            pm2 startup | tail -1 | bash || true
        fi
REMOTE

    success "部署完成！访问 https://${DOMAIN}"
}

# ============================================================
# --status: 查看运行状态
# ============================================================
show_status() {
    check_config
    info "=== PM2 进程状态 ==="
    $SSH "pm2 list"
    echo ""
    info "=== 最近日志（最后 30 行）==="
    $SSH "pm2 logs cruise-agent --lines 30 --nostream"
    echo ""
    info "=== 数据库信息 ==="
    $SSH "ls -lh ${REMOTE_DATA_DIR}/cruise_deals.db 2>/dev/null || echo '数据库文件不存在'"
}

# ============================================================
# 入口
# ============================================================
case "${1:-}" in
    --setup)   setup_server  ;;
    --update)  deploy_update ;;
    --nginx)   check_config && setup_nginx ;;
    --status)  show_status   ;;
    *)
        echo "用法: $0 [选项]"
        echo ""
        echo "  --setup    首次部署：初始化服务器环境、Nginx、SSL"
        echo "  --update   更新代码：同步代码并重启服务"
        echo "  --nginx    重新配置 Nginx"
        echo "  --status   查看运行状态与日志"
        echo ""
        echo "首次使用请先编辑脚本顶部的 SERVER_HOST 和 DOMAIN"
        ;;
esac
