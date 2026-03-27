# Cruise Agent 🚢

邮轮特价智能助手 — 基于 AI 的邮轮航次搜索与比价工具。

数据来源：[cruise_crawler](../cruise_crawler)，通过直连本地 SQLite 读取爬虫抓取的邮轮数据，无需额外后端服务。

## 功能

- 🤖 **AI 对话**：用自然语言搜索邮轮特价，支持目的地、品牌、舱位、预算等多维度筛选
- 📊 **价格分析**：历史价格走势、降价幅度排行
- 🌍 **多区域价格**：对比 USD / EUR / GBP / AUD 等不同货币报价
- 🔔 **比价表格**：跨品牌、跨舱位横向对比
- ✍️ **营销文案**：一键生成邮轮特价推广文案

## 技术栈

- **框架**：Next.js 16 (App Router)
- **AI**：智谱 GLM / OpenAI，使用 [AI SDK](https://sdk.vercel.ai)
- **数据库**：SQLite（`better-sqlite3`，只读直连爬虫数据库）
- **UI**：Tailwind CSS v4 + Radix UI + Recharts

## 本地开发

### 前置条件

确保 [cruise_crawler](../cruise_crawler) 已运行过爬虫，本地存在数据库文件：

```text
../cruise_crawler/data/cruise_deals.db
```

### 启动

```bash
pnpm install
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 环境变量

创建 `.env.local`：

```env
# AI 提供商: zhipu | openai
AI_PROVIDER=zhipu
CHAT_MODEL=glm-5
ZHIPU_API_KEY=your_key_here

# OpenAI（AI_PROVIDER=openai 时使用）
# OPENAI_API_KEY=sk-xxx

# 数据库路径（默认自动推断，生产环境需显式指定）
# DB_PATH=/data/cruise_deals.db
```

## 生产部署

### 架构说明

```text
本地 Mac
├── cruise_crawler  →  爬取数据  →  cruise_deals.db
└── scripts/sync_db.sh  →  rsync  →  服务器 /data/cruise_deals.db
                                          ↓
                                    cruise_agent (PM2 + Next.js)
                                          ↓
                                    Nginx 反向代理 + SSL
```

cruise_crawler **不需要**部署到服务器，只需定期将本地数据库同步到服务器即可。

### 首次部署

**1. 填写服务器信息**（编辑 `scripts/deploy.sh` 顶部）：

```bash
SERVER_HOST="你的服务器IP"
DOMAIN="你的域名.com"
```

**2. 初始化服务器**（安装 Node.js / PM2 / Nginx / SSL 证书）：

```bash
./scripts/deploy.sh --setup
```

**3. 部署应用**：

```bash
./scripts/deploy.sh --update
```

### 数据库同步

在 `cruise_crawler` 目录下操作：

```bash
# 填写服务器信息（编辑 scripts/sync_db.sh 顶部的 SERVER_HOST）

# 直接同步当前数据库
./scripts/sync_db.sh

# 爬取后自动同步
./scripts/sync_db.sh --after-crawl

# 设置每天凌晨 3 点定时同步
./scripts/sync_db.sh --cron

# 对比本地与服务器数据差异
./scripts/sync_db.sh --diff
```

### 后续更新代码

```bash
./scripts/deploy.sh --update
```

### 查看运行状态

```bash
./scripts/deploy.sh --status
```
