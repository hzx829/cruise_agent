# Cruise Agent — 实施进展

## Phase 1: MVP — 对话 + 查询 ✅

### 已完成

#### 数据层

- [lib/db/index.ts](lib/db/index.ts) — better-sqlite3 单例连接，readonly 模式
- [lib/db/types.ts](lib/db/types.ts) — TypeScript 接口定义 (DealRow, BrandRow, SearchFilters, TopDrop, TrackingStats 等)
- [lib/db/queries.ts](lib/db/queries.ts) — 完整查询层 (searchDeals, getBrandSummary, getPriceStats 等)

#### AI 工具 (7 个)

- [lib/ai/tools/search-deals.ts](lib/ai/tools/search-deals.ts) — 多维度航线搜索
- [lib/ai/tools/get-brand-overview.ts](lib/ai/tools/get-brand-overview.ts) — 品牌概览 + Top15 目的地
- [lib/ai/tools/analyze-prices.ts](lib/ai/tools/analyze-prices.ts) — 价格统计 + 分布
- [lib/ai/tools/get-price-history.ts](lib/ai/tools/get-price-history.ts) — 单条航线价格追踪
- [lib/ai/tools/generate-chart.ts](lib/ai/tools/generate-chart.ts) — 可视化图表数据 (bar/scatter)
- [lib/ai/tools/compare-cruises.ts](lib/ai/tools/compare-cruises.ts) — 多航线并排对比
- [lib/ai/tools/generate-copywriting.ts](lib/ai/tools/generate-copywriting.ts) — 小红书文案素材

#### Agent & API

- [lib/ai/prompts.ts](lib/ai/prompts.ts) — 系统提示词（中文、品牌映射、交互规则）
- [app/api/chat/route.ts](app/api/chat/route.ts) — streamText + 7 tools, stopWhen: stepCountIs(5)

#### 前端组件

- [components/chat.tsx](components/chat.tsx) — 主聊天组件 (useChat + DefaultChatTransport + 快捷操作)
- [components/message.tsx](components/message.tsx) — 消息渲染 (文本 + 7 种 tool part)
- [components/deal-card.tsx](components/deal-card.tsx) — 航线卡片 + 列表
- [components/price-chart.tsx](components/price-chart.tsx) — Recharts 柱状图/散点图
- [components/compare-table.tsx](components/compare-table.tsx) — 航线对比表格
- [components/copywriting-card.tsx](components/copywriting-card.tsx) — 文案卡片 + 一键复制

#### 配置

- [next.config.ts](next.config.ts) — serverExternalPackages: better-sqlite3
- [.env.local](.env.local) — OPENAI_API_KEY

### 技术栈

- Next.js 16.1.6 (App Router, Turbopack)
- AI SDK v6 (ai + @ai-sdk/react + @ai-sdk/openai)
- better-sqlite3 readonly → cruise_crawler 的 SQLite DB
- Recharts, lucide-react, react-markdown, Tailwind CSS v4

### 使用说明

```bash
cd cruise_agent
# 配置 .env.local 中的 OPENAI_API_KEY
npm run dev
# 访问 http://localhost:3000
```

---

## Phase 2: 价格追踪集成 + UI 升级 ✅

### 已完成

#### 数据层增强

- [lib/db/types.ts](lib/db/types.ts) — 新增 `TopDrop`、`TrackingStats` 接口；`DealRow` 新增 price_lowest/highest/trend 等字段
- [lib/db/queries.ts](lib/db/queries.ts) — 新增 5 个查询函数：
  - `getTopPriceDrops()` — 降价幅度最大的航线，支持按品牌层级筛选
  - `getTrendStats()` — 按 price_trend 分组统计
  - `getTrackingOverview()` — 追踪系统整体概览（含 top drops）
  - `getRecentPriceChanges()` — 最近的价格变动记录
- `searchDeals()` 增强：支持 `priceTrend`、`tier` 筛选

#### 新增 AI 工具

- [lib/ai/tools/get-top-drops.ts](lib/ai/tools/get-top-drops.ts) — 🔥 降价排行榜（核心工具，支持按品牌层级筛选）
- [lib/ai/tools/get-tracking-overview.ts](lib/ai/tools/get-tracking-overview.ts) — 📡 追踪系统概览

#### 工具增强

- `search-deals` — 新增 priceTrend/tier 参数，输出增加 brandTier/priceHighest/priceLowest/priceTrend 字段
- `get-price-history` — 输出增加 trackingStats 和 summary（含 min/max/avg/changePct）

#### 系统提示词重写

- [lib/ai/prompts.ts](lib/ai/prompts.ts) — 完全重写，聚焦「话题性 Deal」策略
  - 品牌层级体系（budget/standard/premium/luxury）
  - 小红书文案策略（数字反差 + emoji + 标签策略）
  - 价格追踪字段说明
  - 引导 AI 优先推荐高端品牌大幅降价

#### UI 全面升级

- [app/globals.css](app/globals.css) — 完整 CSS 变量系统（light/dark），对齐官方 chatbot 风格
- [app/layout.tsx](app/layout.tsx) — 新增 ThemeProvider，支持系统级深色模式
- [components/theme-provider.tsx](components/theme-provider.tsx) — next-themes 封装
- [components/chat.tsx](components/chat.tsx) — 重写：
  - textarea 替代 input，支持 Enter 发送 / Shift+Enter 换行
  - 滚动到底部按钮（智能显示/隐藏）
  - Stop 按钮（流式时可中断）
  - 深色模式切换按钮
  - Thinking 动画（bouncing dots）
  - 价格追踪导向的快捷操作
- [components/message.tsx](components/message.tsx) — 重写：
  - 新增 tool part 处理器（getTopPriceDrops/getTrackingOverview）
  - 降价排行专属 UI（红色 TrendingDown 标题）
  - 追踪概览卡片（4 宫格统计 + 趋势标签）
  - 全部使用语义化颜色（bg-card, text-muted-foreground 等）
  - @tailwindcss/typography 增强 markdown 渲染
- [components/deal-card.tsx](components/deal-card.tsx) — 增强：
  - 价格趋势徽章（📉降价/📈涨价/➡️稳定/🆕新上架）
  - 品牌层级徽章（奢华/高端/标准/大众）
  - 降价百分比高亮（dropPct）
  - 历史价格范围条
  - 全部语义化颜色 + 深色模式适配
- 所有组件（price-chart, compare-table, copywriting-card）— 统一使用语义化颜色

#### 新增依赖

- `next-themes` — 深色模式支持
- `tailwindcss-animate` — 动画
- `@tailwindcss/typography` — Markdown 排版

---

## Phase 3: 健壮性 + 动态化 ✅

### 已完成

#### Prompt 动态化（去硬编码）

- [lib/ai/prompts.ts](lib/ai/prompts.ts) — `SYSTEM_PROMPT` 常量 → `buildSystemPrompt()` 函数
  - `buildBrandSection()` — 从 DB 查询有实际数据的品牌，动态生成品牌映射表（含 deal 数量、舱位类型列）
  - `buildTierSection()` — 从 DB 动态生成层级体系表，有数据标 ✅ 无数据标 ❌
  - 缺失层级自动生成 ⚠️ 提示 + 回退建议（如推荐高端房型替代）
  - 新爬虫上线后 prompt **自动更新**，无需改代码
- [app/api/chat/route.ts](app/api/chat/route.ts) — `system: SYSTEM_PROMPT` → `system: buildSystemPrompt()`

#### 数据层增强

- [lib/db/types.ts](lib/db/types.ts) — 新增 `ActiveBrandInfo` 接口
- [lib/db/queries.ts](lib/db/queries.ts) — 新增 2 个查询函数：
  - `getActiveBrandsStats()` — 有实际 deal 的品牌统计（id/name/tier/currency/deal_count/scored_count/cabin_types）
  - `getCabinTypes()` — 所有舱位类型及航线数量

#### 新增 AI 工具（2 个，总计 12 个）

- [lib/ai/tools/list-destinations.ts](lib/ai/tools/list-destinations.ts) — 列出所有可用目的地及航线数量
- [lib/ai/tools/list-cabin-types.ts](lib/ai/tools/list-cabin-types.ts) — 列出所有可用舱位/房型及航线数量

> 解决核心问题：用户用中文查「夏威夷」→ LLM 不知道 DB 里叫 `Hawaii` → 返回 0 结果。
> 现在 LLM 会先调 `listDestinations` 获取可用值，再用正确参数搜索。

#### Bug 修复

- **Hydration mismatch** — 深色模式切换按钮 SSR/client 不一致，用 `useSyncExternalStore` + `useHasMounted()` 修复
- **Tier 数组验证** — LLM 传 `tier: ["luxury","premium"]` 但 schema 只接受单值，5 个文件改为 `z.union` + SQL `IN` 语法
- **better-sqlite3 原生模块** — `pnpm approve-builds` 允许编译
- **空结果引导** — 从「直接告知无数据」改为「仍调工具但不限制参数，用全量数据回答」

---

## Phase 6: 智能顾问升级 — 「查·比·学」三合一 ✅

> 设计文档：[agent-upgrade-design.md](agent-upgrade-design.md)

### 背景

从「纯价格搬运工」升级为「智能邮轮顾问」，新增 Web 搜索能力，实现价格/知识/创作三大能力分区。

### 已完成

#### 新增 AI 工具（2 个，总计 16 个）

- [lib/ai/tools/web-search.ts](lib/ai/tools/web-search.ts) — 🌐 Tavily 通用网络搜索（工具 description 中禁止用于查询价格）
- [lib/ai/tools/cruise-encyclopedia.ts](lib/ai/tools/cruise-encyclopedia.ts) — 📖 邮轮专业百科（限定 CruiseCritic / CruiseMapper / RoyalCaribbeanBlog 等权威站点）

#### Agent 架构升级

- [lib/ai/agent.ts](lib/ai/agent.ts) — 新增 `createCruiseAgent()` 工厂函数：
  - 使用 `ToolLoopAgent`（AI SDK v6 原生 Agent 架构）
  - `stopWhen: stepCountIs(8)` 支持更复杂的多步推理
  - 全部 16 个工具按分类注册
  - `onStepFinish` 开发日志（打印每步 tool 调用和 token 用量）

#### API Route 重构

- [app/api/chat/route.ts](app/api/chat/route.ts) — 替换 `streamText` 为 `createAgentUIStreamResponse`：
  - 移除 14 个独立 tool 导入，改为 `createCruiseAgent(model)` 一行
  - 完整保留消息持久化逻辑（loadChat / saveMessages / createChat / updateChatTitle）
  - `onFinish` 回调用于持久化 AI 回复 + 首条消息生成标题
  - 增加历史消息空 parts 过滤（防止旧数据触发 ZodError）

#### System Prompt 重构

- [lib/ai/prompts.ts](lib/ai/prompts.ts) — `buildSystemPrompt()` 全面重写：
  - **新身份**：「游速达智能邮轮顾问，能查价格、讲评测、写文案、解惑答疑」
  - **4 条路由规则**（核心变化）：
    - 规则 1：价格类 → DB 工具，严禁 webSearch 查价格
    - 规则 2：知识类 → webSearch / cruiseEncyclopedia
    - 规则 3：混合类 → 先 DB 后搜索，分别标注来源
    - 规则 4：文案类 → DB 数据 + 可选搜索 + generateCopywriting
  - **工具表格**拆分为三栏：🔒 价格类 / 🌐 知识类 / ✍️ 创作类
  - **回答格式**规范：`📡 官网实时数据` vs `🌐 网络信息` 标注

#### 前端升级

- [components/chat.tsx](components/chat.tsx) — 快捷操作升级为「查·比·学」四按钮：
  - `⚓ 价格巡航` — 触发 DB 降价查询
  - `📊 品牌测评` — 触发 Web 搜索品牌对比
  - `📖 行业百科` — 触发 Web 搜索邮轮术语
  - `✍️ 爆款文案` — 触发 DB + 文案生成
  - 欢迎语更新为「游速达邮轮顾问」

#### 环境变量

- `.env.local` — 新增 `TAVILY_API_KEY=`（placeholder，需填入真实 key）

#### Bug 修复

- `lib/db/chat-store.ts` `loadChat()` — 过滤 `parts.length === 0` 的旧格式消息
- `app/api/chat/route.ts` — 拼接 `allMessages` 前增加防御性过滤

### 技术决策

- **Tavily vs SearXNG**：选 Tavily 免费层（1000 次/月），无需自建服务器
- **ToolLoopAgent vs 手动 streamText**：ToolLoopAgent 统一管理工具循环/停止条件，代码更简洁
- **cruiseEncyclopedia 独立工具**：固定限定搜索域，比 webSearch + includeDomains 参数更稳定

### 工具总览

| 分类 | 数量 | 工具 |
|------|------|------|
| 🔒 价格类（DB） | 11 | searchDeals / getTopPriceDrops / getPriceHistory / getRegionalPrices / compareCruises / getStats / getBrandOverview / analyzePrices / getTrackingOverview / listDestinations / listCabinTypes |
| 🌐 知识类（Web） | 2 | webSearch / cruiseEncyclopedia |
| ✍️ 创作类 | 2 | generateCopywriting / generateChart |

---

## Phase 4: 待规划

- [ ] 搜索结果缓存（减少 Tavily API 调用次数）
- [ ] 工具调用监控仪表盘
- [ ] 文案生成用更强模型（prepareStep 动态切换）
- [ ] 数据导出（Excel/PDF）
- [ ] 海报生成

---

## 生产部署 ✅

### 服务器信息

- **IP**: 211.149.161.68，SSH 端口 22000
- **OS**: Ubuntu 22.04，1.9GB RAM，30GB 磁盘
- **域名**: https://www.cruiseswift.com
- **备案**: 进行中（未备案期间 HTTPS 可访问，HTTP 80 端口被拦截）

### 部署架构

```
本地 Mac
  └── cruise_crawler (Python/FastAPI, 端口 9000)
        └── rsync → /data/cruise_deals.db (59MB)

服务器 211.149.161.68
  ├── Nginx (80/443)
  │     ├── 80 → 301 redirect HTTPS
  │     └── 443 → proxy_pass 127.0.0.1:3000
  ├── PM2 → cruise_agent (Next.js, 端口 3000)
  └── /data/cruise_deals.db (只读，DB_PATH 环境变量指定)
```

### 已完成

- Node.js 22 + pnpm + PM2 安装，PM2 开机自启 (systemd)
- Nginx 反代配置（大缓冲区 128k/256k、gzip、静态资源长缓存）
- Let's Encrypt SSL 证书（acme.sh + DNS-01 验证，90 天自动续期）
- 2GB Swap（防止构建 OOM）
- `/data/cruise_deals.db` 初始同步

### 关键脚本

- [scripts/deploy.sh](scripts/deploy.sh) — 代码部署（`--update` rsync + build + pm2 reload）
- [scripts/sync_db.sh](scripts/sync_db.sh) — 数据库同步到服务器

### 常用运维命令

```bash
# 更新部署
cd "/Users/zionhuang/My project/cruise_agent"
./scripts/deploy.sh --update

# 同步数据库
cd "/Users/zionhuang/My project/cruise_crawler"
./scripts/sync_db.sh

# 查看服务状态
ssh -p 22000 root@211.149.161.68 'pm2 status'

# 查看应用日志
ssh -p 22000 root@211.149.161.68 'pm2 logs cruise_agent --lines 50'
```

### 注意事项

- **备案问题**：未备案期间国内运营商会随机拦截 HTTPS 请求（SNI 检测），导致部分 JS chunk 加载失败（ERR_CONNECTION_CLOSED），备案完成后自动解决
- **证书续期**：acme.sh DNS 手动模式需每 90 天手动更新 TXT 记录续期，备案完成后可切换到 HTTP 验证实现全自动续期
- **DB 同步**：每次爬取新数据后执行 `sync_db.sh`，服务器端实时生效（Next.js 无缓存，每次请求直接读 SQLite）

---

## Phase 3.1: Agent 灵活化 ✅

### 问题

用户问"最便宜的航线"，agent 返回"降价幅度最大的"而非"价格最低的"。
- 原因：system prompt 核心策略强制偏向"话题性 deal"，交互规则写死"优先推荐降价幅度大的 deal"
- tool description 也带有营销偏见（如"这是发现最具话题性 deal 的关键工具"）

### 已完成

#### System Prompt 重写

- [lib/ai/prompts.ts](lib/ai/prompts.ts) — 完全重写 `buildSystemPrompt()`
  - 去掉"核心策略：发现话题性 Deal"等预设偏见
  - 去掉"当用户意图模糊时，优先推荐降价幅度大的 deal"规则
  - 新增**核心原则**：精准理解用户意图，选择正确的工具
  - 新增工具-意图映射表（"最便宜的"→ searchDeals price ASC，"降价最多的"→ getTopPriceDrops）
  - 保留品牌/层级/舱位等数据参考信息
  - 小红书文案策略移至 generateCopywriting 工具内部，不再污染全局 prompt

#### 新增 AI 工具（2 个，总计 14 个）

- [lib/ai/tools/get-regional-prices.ts](lib/ai/tools/get-regional-prices.ts) — 跨区域价格对比（US/GB/AU/EU/CA/SG），含 USD 换算和节省百分比
- [lib/ai/tools/get-stats.ts](lib/ai/tools/get-stats.ts) — 整体统计概览（总量、品牌数、均价、各品牌最低价排行、价格分布）

#### 数据层增强

- [lib/db/queries.ts](lib/db/queries.ts) — 新增查询函数：
  - `getRegionalPrices(dealId)` — 查 regional_prices 表各区域价格
  - `getOverallStats()` — 全局统计（总 deal 数、品牌最低价排行、价格分布）

#### 工具描述优化

- [lib/ai/tools/get-top-drops.ts](lib/ai/tools/get-top-drops.ts) — 去掉"话题性""小红书推广"措辞，明确注明"不等于最便宜"
- [lib/ai/tools/get-hot-deals.ts](lib/ai/tools/get-hot-deals.ts) — 去掉"最值得推广"措辞，明确注明"按折扣深度排序，非绝对价格"

---

## Phase 5: PC 端 UI + 聊天历史 + 主动通知 ✅

详见 [phase5-upgrade.md](phase5-upgrade.md)

#### 数据层 — agent.db (可写 SQLite)

- [lib/db/agent-db.ts](lib/db/agent-db.ts) — 独立写库连接 (WAL + 外键)，自动建表 (chats/messages/notifications/notification_config)
- [lib/db/chat-store.ts](lib/db/chat-store.ts) — 聊天 CRUD: createChat / loadChat / saveMessages / updateChatTitle / deleteChat / getChatList (游标分页)
- [lib/db/notification-store.ts](lib/db/notification-store.ts) — 通知 CRUD: createNotification / getUnread / markRead / markAllRead / getConfig

#### 路由重构 + 消息持久化

- [app/page.tsx](app/page.tsx) — 根路径 redirect → `/chat`
- [app/chat/page.tsx](app/chat/page.tsx) — `createChat()` → redirect `/chat/[id]`
- [app/chat/[id]/page.tsx](app/chat/[id]/page.tsx) — `loadChat(id)` → `<Chat id initialMessages />`
- [app/api/chat/route.ts](app/api/chat/route.ts) — 持久化改造：
  - `prepareSendMessagesRequest` — 前端只发最后一条消息，服务端从 DB 加载历史
  - `saveMessages` — 用户消息立即保存 + AI 回复 onFinish 保存
  - `consumeStream` — 确保客户端断开也能完整保存
  - `createIdGenerator` — 服务端生成消息 ID (msg-前缀)
  - 首条消息自动提取标题 (前 50 字)
- [app/api/history/route.ts](app/api/history/route.ts) — GET 聊天列表 (游标分页)
- [app/api/chat/[id]/route.ts](app/api/chat/[id]/route.ts) — DELETE 删除聊天 (CASCADE 删消息)

#### Sidebar 桌面端布局

- [app/chat/layout.tsx](app/chat/layout.tsx) — `SidebarProvider` + `AppSidebar` + `SidebarInset`，cookie 持久化折叠状态
- [components/app-sidebar.tsx](components/app-sidebar.tsx) — 品牌 header + 新建对话 + 聊天历史 + 通知铃铛 + 主题切换
- [components/sidebar-history.tsx](components/sidebar-history.tsx) — SWR Infinite 分页 + 日期分组 (今天/昨天/最近7天/最近30天/更早) + 删除
- [components/chat-header.tsx](components/chat-header.tsx) — SidebarToggle + 新建对话 (sidebar 收起时显示)
- [components/sidebar-toggle.tsx](components/sidebar-toggle.tsx) — 带 Tooltip 的 sidebar 切换按钮
- [components/theme-toggle.tsx](components/theme-toggle.tsx) — 主题切换 (SidebarMenuButton 形态)
- [hooks/use-mobile.ts](hooks/use-mobile.ts) — `useIsMobile()` (768px 断点)
- [components/chat.tsx](components/chat.tsx) — 重构：接收 `id` + `initialMessages` props，移除内置 header

#### shadcn/ui 基础组件

- [components/ui/sidebar.tsx](components/ui/sidebar.tsx) — 完整 Sidebar 组件系统
- [components/ui/tooltip.tsx](components/ui/tooltip.tsx) — Radix Tooltip
- [components/ui/sheet.tsx](components/ui/sheet.tsx) — Sheet (移动端抽屉)
- [components/ui/separator.tsx](components/ui/separator.tsx) — Radix Separator
- [components/ui/skeleton.tsx](components/ui/skeleton.tsx) — 骨架屏

#### 通知系统

- [app/api/notifications/route.ts](app/api/notifications/route.ts) — GET (未读/全部) + PATCH (标记已读)
- [app/api/cron/check-prices/route.ts](app/api/cron/check-prices/route.ts) — Cron 端点：检查降价 > 阈值 → 创建通知
- [components/notification-bell.tsx](components/notification-bell.tsx) — 铃铛 + Badge + Popover 通知面板 (30s SWR 轮询)

#### CSS + 新增依赖

- [app/globals.css](app/globals.css) — 新增 sidebar 色彩变量 (light/dark) + @theme 映射
- `swr`, `date-fns`, `@radix-ui/react-{slot,tooltip,dialog,separator,dropdown-menu,popover}`

### 架构决策

- **独立 agent.db** — 与 cruise_deals.db 分离，保持爬虫数据只读
- **游标分页** — `ending_before` 模式，适合实时数据
- **只发最后一条** — `prepareSendMessagesRequest` 只传最新消息，服务端从 DB 补全
- **Polling 通知** — 30s SWR 轮询，无需 SSE/WebSocket
- **Cookie 侧边栏** — 折叠状态 cookie 持久化，SSR 可读取
