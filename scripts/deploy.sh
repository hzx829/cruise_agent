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
SERVER_HOST="211.149.161.68"          # 服务器 IP
SERVER_PORT="22000"                    # 非标准 SSH 端口
REMOTE_APP_DIR="/srv/cruise_agent"
REMOTE_DATA_DIR="/data"
DOMAIN="www.cruiseswift.com"
APP_PORT=3000
PM2_APP_NAME="cruise_agent"

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
    return 0
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
    info "开始快速部署 cruise_agent..."

    # 检查 .env.local 是否存在
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
    ENV_FILE="${PROJECT_DIR}/.env.local"

    if [[ ! -f "$ENV_FILE" ]]; then
        error ".env.local 不存在，请先创建"
    fi

    if ! git -C "$PROJECT_DIR" diff --quiet || ! git -C "$PROJECT_DIR" diff --cached --quiet; then
        error "存在未提交的 tracked 改动。快速部署只发布当前 Git HEAD，请先提交或还原。"
    fi

    UNTRACKED="$(git -C "$PROJECT_DIR" ls-files --others --exclude-standard)"
    if [[ -n "$UNTRACKED" ]]; then
        warn "存在未跟踪文件，将不会部署："
        echo "$UNTRACKED" | sed 's/^/  - /'
    fi

    COMMIT="$(git -C "$PROJECT_DIR" rev-parse --short HEAD)"
    ARCHIVE="${TMPDIR:-/tmp}/cruise_agent_${COMMIT}_$$.tar"
    REMOTE_ARCHIVE="/tmp/cruise_agent_${COMMIT}.tar"
    REMOTE_ENV="/tmp/cruise_agent_${COMMIT}.env"

    cleanup_local_archive() {
        rm -f "$ARCHIVE"
    }
    trap cleanup_local_archive EXIT

    # 1. 只打包当前提交，避免同步未跟踪文件和本地构建产物
    info "打包当前提交 ${COMMIT}..."
    git -C "$PROJECT_DIR" archive --format=tar --output="$ARCHIVE" HEAD

    info "上传代码包和环境配置..."
    $SCP "$ARCHIVE" "${SERVER_USER}@${SERVER_HOST}:${REMOTE_ARCHIVE}"
    $SCP "$ENV_FILE" "${SERVER_USER}@${SERVER_HOST}:${REMOTE_ENV}"

    info "远端构建并切换发布..."
    $SSH bash << REMOTE
set -euo pipefail

REMOTE_APP_DIR="${REMOTE_APP_DIR}"
REMOTE_DATA_DIR="${REMOTE_DATA_DIR}"
PM2_APP_NAME="${PM2_APP_NAME}"
APP_PORT="${APP_PORT}"
COMMIT="${COMMIT}"
REMOTE_ARCHIVE="${REMOTE_ARCHIVE}"
REMOTE_ENV="${REMOTE_ENV}"
BUILD_DIR="/tmp/cruise_agent_build_\${COMMIT}_\$\$"

rm -rf "\${BUILD_DIR}"
mkdir -p "\${BUILD_DIR}" "\${REMOTE_APP_DIR}"

tar -xf "\${REMOTE_ARCHIVE}" -C "\${BUILD_DIR}"
mv "\${REMOTE_ENV}" "\${BUILD_DIR}/.env.local"
grep -q '^DB_PATH=' "\${BUILD_DIR}/.env.local" || \
    echo "DB_PATH=\${REMOTE_DATA_DIR}/cruise_deals.db" >> "\${BUILD_DIR}/.env.local"
echo "\${COMMIT}" > "\${BUILD_DIR}/.deploy-revision"

cd "\${BUILD_DIR}"
pnpm install --frozen-lockfile
pnpm build

# Preserve runtime data such as data/agent.db; replace everything else from the built commit.
find "\${REMOTE_APP_DIR}" -mindepth 1 -maxdepth 1 ! -name 'data' -exec rm -rf {} +
tar -C "\${BUILD_DIR}" -cf - . | tar -C "\${REMOTE_APP_DIR}" -xf -

cd /
rm -rf "\${BUILD_DIR}" "\${REMOTE_ARCHIVE}"

APP_IDS=\$(pm2 jlist | node -e "let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => { const name = process.argv[1]; const ids = JSON.parse(s).filter(p => p.name === name).map(p => p.pm_id); console.log(ids.join(' ')); });" "\${PM2_APP_NAME}")
read -r PRIMARY_ID EXTRA_IDS <<< "\${APP_IDS}"

if [[ -n "\${PRIMARY_ID:-}" ]]; then
    for extra_id in \${EXTRA_IDS:-}; do
        pm2 delete "\${extra_id}" || true
    done
    pm2 reload "\${PRIMARY_ID}" --update-env
else
    cd "\${REMOTE_APP_DIR}"
    pm2 start "pnpm start" --name "\${PM2_APP_NAME}" --cwd "\${REMOTE_APP_DIR}"
    pm2 startup systemd -u ${SERVER_USER} --hp /root || true
fi
pm2 save

for path in /chat /admin/agent-traces /api/admin/agent-traces?limit=1; do
    ok=0
    for i in {1..20}; do
        code=\$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:\${APP_PORT}\${path}" || true)
        if [[ "\${code}" == "200" ]]; then
            ok=1
            break
        fi
        sleep 1
    done
    if [[ "\${ok}" != "1" ]]; then
        echo "Health check failed: \${path} returned \${code}" >&2
        exit 1
    fi
done
REMOTE

    success "部署完成：${COMMIT} -> https://${DOMAIN}"
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
    $SSH "pm2 logs ${PM2_APP_NAME} --lines 30 --nostream"
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
