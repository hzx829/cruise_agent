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
  - `getHotDealsByTier()` — 按品牌层级获取高 deal_score 航线
  - `getRecentPriceChanges()` — 最近的价格变动记录
- `searchDeals()` 增强：支持 `priceTrend`、`tier`、`minScore` 筛选

#### 新增 AI 工具 (3 个，总计 10 个)

- [lib/ai/tools/get-top-drops.ts](lib/ai/tools/get-top-drops.ts) — 🔥 降价排行榜（核心工具，支持按品牌层级筛选）
- [lib/ai/tools/get-hot-deals.ts](lib/ai/tools/get-hot-deals.ts) — 💎 热门特价（高 deal_score 航线，按层级筛选）
- [lib/ai/tools/get-tracking-overview.ts](lib/ai/tools/get-tracking-overview.ts) — 📡 追踪系统概览

#### 工具增强

- `search-deals` — 新增 priceTrend/tier/minScore 参数，输出增加 brandTier/priceHighest/priceLowest/priceTrend 字段
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
  - 新增 3 个 tool part 处理器（getTopPriceDrops/getHotDeals/getTrackingOverview）
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

#### 工具 Fallback 机制

- [lib/ai/tools/get-top-drops.ts](lib/ai/tools/get-top-drops.ts) — 降价数据为空时自动回退到 deal_score 排序
  - 返回 `dataSource: 'deal_score'` 标记 + fallback 说明
  - 解决只爬了一两轮、尚无价格变动数据时用户查「降幅最大」返回空的问题

#### Bug 修复

- **Hydration mismatch** — 深色模式切换按钮 SSR/client 不一致，用 `useSyncExternalStore` + `useHasMounted()` 修复
- **Tier 数组验证** — LLM 传 `tier: ["luxury","premium"]` 但 schema 只接受单值，5 个文件改为 `z.union` + SQL `IN` 语法
- **better-sqlite3 原生模块** — `pnpm approve-builds` 允许编译
- **空结果引导** — 从「直接告知无数据」改为「仍调工具但不限制参数，用全量数据回答」

---

## Phase 4: 待开始

- [ ] 消息持久化 (SQLite / localStorage)
- [ ] 文案生成用 Claude 模型 (prepareStep 切换)
- [ ] 数据导出 (Excel/PDF)
- [ ] 海报生成
- [ ] 多轮对话记忆优化
