# Cruise Agent — 实施进展

## Phase 1: MVP — 对话 + 查询 ✅

### 已完成

#### 数据层
- [lib/db/index.ts](lib/db/index.ts) — better-sqlite3 单例连接，readonly 模式
- [lib/db/types.ts](lib/db/types.ts) — TypeScript 接口定义 (DealRow, BrandRow, SearchFilters 等)
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

## Phase 2: 增强 (待开始)

- [ ] 消息持久化 (SQLite / localStorage)
- [ ] 文案生成用 Claude 模型 (prepareStep 切换)
- [ ] 流式工具调用进度提示
- [ ] 响应式移动端布局优化
- [ ] 深色模式

## Phase 3: 高级功能 (待开始)

- [ ] 价格监控告警
- [ ] 数据导出 (Excel/PDF)
- [ ] 海报生成
- [ ] 多轮对话记忆优化
