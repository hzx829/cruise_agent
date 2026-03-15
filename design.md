# Cruise Agent — 邮轮特价智能助手 实施方案

关联: [cruise_crawler](../cruise_crawler/design.md) | [chatbot 参考](../chatbot/README.md)

---

## 1. 产品定位

为旅行社邮轮部提供一个**对话式 AI 助手**，核心能力:

1. **查询低价航线** — 按目的地/品牌/日期/价格筛选，发现最优惠的邮轮 deals
2. **价格分析** — 趋势对比、历史价格追踪、同航线横向比较
3. **小红书文案** — 根据 deal 自动生成种草文案（标题 + 正文 + 标签）
4. **数据图表** — 价格分布/趋势图，直接在聊天中展示
5. **海报生成** — 基于 deal 信息生成推广海报（后期）

---

## 2. 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 框架 | **Next.js 15 (App Router)** | AI SDK 原生支持，SSR + API Routes |
| AI SDK | **ai v6 + @ai-sdk/react** | streamText、useChat、ToolLoopAgent |
| LLM Provider | **@ai-sdk/openai** (GPT-4.1-mini) | 工具调用稳定，中文好，性价比高 |
| 数据库 | **直连 cruise_crawler 的 SQLite** | 复用爬虫数据，无需同步 |
| SQLite 驱动 | **better-sqlite3** | Node.js 原生 SQLite，同步查询性能好 |
| UI 组件 | **shadcn/ui + Tailwind CSS** | 参考 chatbot 项目 |
| 图表 | **Recharts** | React 图表库，适合嵌入聊天 |
| Schema 验证 | **Zod** | AI SDK 工具的 inputSchema 必须用 |
| 包管理 | **pnpm** | 与 chatbot 项目一致 |

### 模型策略

| 用途 | 模型 | 原因 |
|------|------|------|
| 对话 + 工具调用 | GPT-4.1-mini | 工具调用精准，速度快，成本低 |
| 文案生成 | Claude Sonnet 4 | 中文创作能力强 |
| 标题摘要 | GPT-4.1-nano | 简单任务用最便宜模型 |

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js App (cruise_agent)            │
│                                                         │
│  ┌──────────────┐   ┌────────────────────────────────┐  │
│  │   Frontend   │   │        API Routes              │  │
│  │              │   │                                │  │
│  │  useChat()   │──▶│  POST /api/chat                │  │
│  │  + 图表组件   │   │    streamText + tools          │  │
│  │  + 文案卡片   │   │                                │  │
│  └──────────────┘   │  ┌──────────────────────────┐  │  │
│                     │  │      Agent Tools          │  │  │
│                     │  │                          │  │  │
│                     │  │  • searchDeals           │  │  │
│                     │  │  • analyzePrices         │  │  │
│                     │  │  • compareCruises        │  │  │
│                     │  │  • generateCopywriting   │  │  │
│                     │  │  • generateChart         │  │  │
│                     │  │  • getPriceHistory       │  │  │
│                     │  │  • getBrandOverview      │  │  │
│                     │  └───────────┬──────────────┘  │  │
│                     └─────────────┼──────────────────┘  │
│                                   │                     │
│                     ┌─────────────▼──────────────────┐  │
│                     │     Data Layer (lib/db/)        │  │
│                     │     better-sqlite3              │  │
│                     │     → cruise_crawler/data/      │  │
│                     │        cruise_deals.db          │  │
│                     └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 4. 项目结构

```
cruise_agent/
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── .env.local                   # OPENAI_API_KEY, DB_PATH
├── design.md                    # 本文档
│
├── app/
│   ├── layout.tsx               # 根布局 (ThemeProvider)
│   ├── globals.css              # Tailwind 全局样式
│   ├── page.tsx                 # 首页 → 直接进入聊天
│   │
│   └── api/
│       └── chat/
│           └── route.ts         # 核心: streamText + tools
│
├── components/
│   ├── chat.tsx                 # 聊天主组件 (useChat)
│   ├── message.tsx              # 消息渲染 (文本 + 工具结果)
│   ├── multimodal-input.tsx     # 输入框 (快捷命令提示)
│   ├── deal-card.tsx            # Deal 卡片组件
│   ├── deal-list.tsx            # Deal 列表组件
│   ├── price-chart.tsx          # 价格图表组件 (Recharts)
│   ├── copywriting-card.tsx     # 文案展示/复制组件
│   ├── brand-overview.tsx       # 品牌概览组件
│   ├── quick-actions.tsx        # 快捷操作按钮
│   └── ui/                      # shadcn/ui 基础组件
│       ├── button.tsx
│       ├── card.tsx
│       ├── badge.tsx
│       ├── scroll-area.tsx
│       └── ...
│
├── lib/
│   ├── ai/
│   │   ├── agent.ts             # ToolLoopAgent 定义
│   │   ├── prompts.ts           # System Prompt
│   │   └── tools/               # 工具定义 ★核心
│   │       ├── search-deals.ts
│   │       ├── analyze-prices.ts
│   │       ├── compare-cruises.ts
│   │       ├── generate-copywriting.ts
│   │       ├── generate-chart.ts
│   │       ├── get-price-history.ts
│   │       └── get-brand-overview.ts
│   │
│   ├── db/
│   │   ├── index.ts             # SQLite 连接 (better-sqlite3)
│   │   ├── queries.ts           # 查询函数
│   │   └── types.ts             # DB 类型定义
│   │
│   └── utils.ts                 # 工具函数
│
└── public/
    └── favicon.ico
```

---

## 5. 核心实现

### 5.1 数据层 — 直连 cruise_crawler SQLite

```typescript
// lib/db/index.ts
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH
  || path.resolve(__dirname, '../../../../cruise_crawler/data/cruise_deals.db');

const db = new Database(DB_PATH, { readonly: true });

// 开启 WAL 模式允许并发读
db.pragma('journal_mode = WAL');

export default db;
```

```typescript
// lib/db/queries.ts — 关键查询

export function searchDeals(filters: {
  brand?: string;
  destination?: string;
  priceMin?: number;
  priceMax?: number;
  sailDateFrom?: string;
  sailDateTo?: string;
  durationMin?: number;
  durationMax?: number;
  cabinType?: string;
  sortBy?: 'price' | 'sail_date' | 'duration_days';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}) {
  // 动态构建 WHERE 子句
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.brand) {
    conditions.push('d.brand_id = ?');
    params.push(filters.brand);
  }
  if (filters.destination) {
    conditions.push('d.destination LIKE ?');
    params.push(`%${filters.destination}%`);
  }
  if (filters.priceMin) {
    conditions.push('d.price >= ?');
    params.push(filters.priceMin);
  }
  // ... 其他筛选条件

  const where = conditions.length > 0
    ? 'WHERE ' + conditions.join(' AND ')
    : '';

  const orderBy = `ORDER BY d.${filters.sortBy || 'price'} ${filters.sortOrder || 'ASC'}`;
  const limit = `LIMIT ${filters.limit || 20}`;

  const sql = `
    SELECT d.*, b.name as brand_name, b.name_cn as brand_name_cn
    FROM deals d
    LEFT JOIN brands b ON d.brand_id = b.id
    ${where}
    ${orderBy}
    ${limit}
  `;

  return db.prepare(sql).all(...params);
}

export function getPriceStats(filters?: { brand?: string; destination?: string }) {
  // 返回: 最低价、最高价、均价、中位数、各价格区间分布
}

export function getPriceHistory(dealId: string) {
  return db.prepare(`
    SELECT price, price_currency, recorded_at
    FROM price_history
    WHERE deal_id = ?
    ORDER BY recorded_at ASC
  `).all(dealId);
}

export function getBrandSummary() {
  return db.prepare(`
    SELECT b.id, b.name, b.name_cn, b.brand_group,
           COUNT(d.id) as deal_count,
           MIN(d.price) as min_price,
           AVG(d.price) as avg_price,
           MAX(d.price) as max_price
    FROM brands b
    LEFT JOIN deals d ON b.id = d.brand_id
    GROUP BY b.id
    ORDER BY deal_count DESC
  `).all();
}

export function getDestinations() {
  return db.prepare(`
    SELECT destination, COUNT(*) as count,
           MIN(price) as min_price, AVG(price) as avg_price
    FROM deals
    WHERE destination IS NOT NULL
    GROUP BY destination
    ORDER BY count DESC
  `).all();
}
```

### 5.2 Agent 定义

```typescript
// lib/ai/agent.ts
import { ToolLoopAgent } from 'ai';
import { openai } from '@ai-sdk/openai';
import { systemPrompt } from './prompts';
import { searchDeals } from './tools/search-deals';
import { analyzePrices } from './tools/analyze-prices';
import { compareCruises } from './tools/compare-cruises';
import { generateCopywriting } from './tools/generate-copywriting';
import { generateChart } from './tools/generate-chart';
import { getPriceHistory } from './tools/get-price-history';
import { getBrandOverview } from './tools/get-brand-overview';

export const cruiseAgent = new ToolLoopAgent({
  model: openai('gpt-4.1-mini'),
  instructions: systemPrompt,
  tools: {
    searchDeals,
    analyzePrices,
    compareCruises,
    generateCopywriting,
    generateChart,
    getPriceHistory,
    getBrandOverview,
  },
});
```

### 5.3 System Prompt

```typescript
// lib/ai/prompts.ts
export const systemPrompt = `你是一个邮轮特价航线智能助手，服务对象是旅行社的邮轮部门工作人员。

## 你的核心能力

1. **查询低价航线**: 从数据库中搜索最优惠的邮轮 deals，支持按品牌、目的地、价格、日期、时长等筛选
2. **价格分析**: 统计价格分布、对比不同品牌/航线价格、追踪价格变动趋势
3. **横向对比**: 将相似航线放在一起对比（同目的地、同时段、同舱型）
4. **小红书文案**: 根据 deal 信息生成有吸引力的种草文案，包含标题、正文、标签
5. **数据图表**: 生成价格趋势图、品牌对比图等可视化图表

## 数据来源

数据来自 cruise_crawler 爬虫系统，目前覆盖:
- **Carnival** (嘉年华邮轮) — USD 定价
- **NCL** (诺唯真邮轮) — USD 定价
- **Royal Caribbean China** (皇家加勒比中国) — CNY 定价

## 交互规则

- 用中文回答
- 价格展示时注明货币单位 (USD/CNY)
- 查询结果较多时先给摘要，用户要求再展示详情
- 生成文案时主动建议合适的小红书标签
- 用 emoji 让回复更生动 🚢
- 涉及价格对比时，提醒用户不同货币的 deal 不能直接比较

## 品牌 ID 映射

| 品牌名 | brand_id | 货币 |
|--------|----------|------|
| 嘉年华/Carnival | carnival | USD |
| 诺唯真/NCL | ncl | USD |
| 皇家加勒比中国 | royal_caribbean_cn | CNY |

## 舱型映射

| 英文 | 中文 |
|------|------|
| interior/inside | 内舱 |
| oceanview | 海景舱 |
| balcony | 阳台舱 |
| suite | 套房 |
| mini-suite | 迷你套房 |
| haven | Haven 套房 |
| studio | 单人舱 |
`;
```

### 5.4 工具定义

#### searchDeals — 搜索特价航线

```typescript
// lib/ai/tools/search-deals.ts
import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const searchDeals = tool({
  description: '搜索邮轮特价航线。支持按品牌、目的地、价格范围、出发日期、航行天数、舱位类型等筛选。',
  inputSchema: z.object({
    brand: z.string().optional()
      .describe('品牌 ID: carnival, ncl, royal_caribbean_cn'),
    destination: z.string().optional()
      .describe('目的地关键词，如 Caribbean, Alaska, 济州'),
    priceMin: z.number().optional()
      .describe('最低价格'),
    priceMax: z.number().optional()
      .describe('最高价格'),
    sailDateFrom: z.string().optional()
      .describe('最早出发日期 YYYY-MM-DD'),
    sailDateTo: z.string().optional()
      .describe('最晚出发日期 YYYY-MM-DD'),
    durationMin: z.number().optional()
      .describe('最短天数'),
    durationMax: z.number().optional()
      .describe('最长天数'),
    cabinType: z.string().optional()
      .describe('舱位类型: interior, oceanview, balcony, suite'),
    sortBy: z.enum(['price', 'sail_date', 'duration_days']).optional()
      .describe('排序字段，默认按价格'),
    limit: z.number().optional()
      .describe('返回数量，默认20，最多50'),
  }),
  execute: async (params) => {
    const deals = queries.searchDeals({
      ...params,
      limit: Math.min(params.limit || 20, 50),
    });
    return {
      count: deals.length,
      deals: deals.map(d => ({
        id: d.id,
        brand: d.brand_name_cn || d.brand_name,
        dealName: d.deal_name,
        shipName: d.ship_name,
        destination: d.destination,
        itinerary: d.itinerary,
        durationDays: d.duration_days,
        price: d.price,
        currency: d.price_currency,
        cabinType: d.cabin_type,
        sailDate: d.sail_date,
        perks: d.perks ? JSON.parse(d.perks) : [],
        dealUrl: d.deal_url,
      })),
    };
  },
});
```

#### analyzePrices — 价格分析

```typescript
// lib/ai/tools/analyze-prices.ts
import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const analyzePrices = tool({
  description: '分析价格数据。返回统计信息: 最低价、最高价、均价、价格分布、各品牌/目的地的价格对比。',
  inputSchema: z.object({
    brand: z.string().optional(),
    destination: z.string().optional(),
    groupBy: z.enum(['brand', 'destination', 'cabin_type', 'duration']).optional()
      .describe('分组维度'),
  }),
  execute: async (params) => {
    const stats = queries.getPriceStats(params);
    return stats;
  },
});
```

#### generateCopywriting — 生成小红书文案

```typescript
// lib/ai/tools/generate-copywriting.ts
import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const generateCopywriting = tool({
  description: '根据指定的邮轮 deal 信息生成小红书种草文案。包含吸引眼球的标题、正文和标签。',
  inputSchema: z.object({
    dealId: z.string().optional()
      .describe('指定 deal ID 生成文案'),
    brand: z.string().optional()
      .describe('品牌，用于查找最佳 deal'),
    destination: z.string().optional()
      .describe('目的地，用于查找最佳 deal'),
    style: z.enum(['种草', '攻略', '对比评测', '限时抢购']).optional()
      .describe('文案风格，默认种草'),
    includeEmoji: z.boolean().optional()
      .describe('是否使用 emoji，默认 true'),
  }),
  execute: async (params) => {
    // 获取 deal 数据
    let deal;
    if (params.dealId) {
      deal = queries.getDealById(params.dealId);
    } else {
      const deals = queries.searchDeals({
        brand: params.brand,
        destination: params.destination,
        sortBy: 'price',
        limit: 1,
      });
      deal = deals[0];
    }

    if (!deal) {
      return { error: '未找到匹配的航线信息' };
    }

    // 返回 deal 数据，让 LLM 基于这些数据生成文案
    // 文案生成由 LLM 自身完成（利用 system prompt 中的指导）
    return {
      dealInfo: {
        brand: deal.brand_name_cn || deal.brand_name,
        shipName: deal.ship_name,
        destination: deal.destination,
        itinerary: deal.itinerary,
        durationDays: deal.duration_days,
        price: deal.price,
        currency: deal.price_currency,
        cabinType: deal.cabin_type,
        sailDate: deal.sail_date,
        perks: deal.perks ? JSON.parse(deal.perks) : [],
        dealUrl: deal.deal_url,
      },
      style: params.style || '种草',
      instruction: '请基于以上信息生成小红书文案，包含: 1) 标题(带emoji，20字内) 2) 正文(300-500字) 3) 标签(5-8个)',
    };
  },
});
```

#### generateChart — 生成图表数据

```typescript
// lib/ai/tools/generate-chart.ts
import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const generateChart = tool({
  description: '生成图表数据，用于在聊天中展示可视化图表。支持价格分布图、品牌对比图、价格趋势图。',
  inputSchema: z.object({
    chartType: z.enum([
      'price_distribution',   // 价格分布直方图
      'brand_comparison',     // 品牌价格对比条形图
      'price_trend',          // 价格趋势折线图
      'destination_overview', // 目的地概览
      'duration_price',       // 天数-价格散点图
    ]).describe('图表类型'),
    brand: z.string().optional(),
    destination: z.string().optional(),
    dealId: z.string().optional()
      .describe('用于价格趋势图的 deal ID'),
  }),
  execute: async (params) => {
    switch (params.chartType) {
      case 'brand_comparison':
        return {
          chartType: 'bar',
          title: '各品牌价格对比',
          data: queries.getBrandSummary(),
        };
      case 'price_distribution':
        return {
          chartType: 'histogram',
          title: '价格分布',
          data: queries.getPriceDistribution(params),
        };
      case 'price_trend':
        return {
          chartType: 'line',
          title: '价格趋势',
          data: queries.getPriceHistory(params.dealId!),
        };
      case 'destination_overview':
        return {
          chartType: 'bar',
          title: '热门目的地',
          data: queries.getDestinations(),
        };
      case 'duration_price':
        return {
          chartType: 'scatter',
          title: '天数 vs 价格',
          data: queries.getDurationPriceData(params),
        };
    }
  },
});
```

### 5.5 API 路由

```typescript
// app/api/chat/route.ts
import { convertToModelMessages, streamText, UIMessage, stepCountIs } from 'ai';
import { cruiseAgent } from '@/lib/ai/agent';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // 使用 ToolLoopAgent
  return cruiseAgent.stream({
    messages: await convertToModelMessages(messages),
  }).toUIMessageStreamResponse();

  // 或者不用 Agent 类，直接用 streamText:
  // const result = streamText({
  //   model: openai('gpt-4.1-mini'),
  //   system: systemPrompt,
  //   messages: await convertToModelMessages(messages),
  //   tools: { searchDeals, analyzePrices, ... },
  //   stopWhen: stepCountIs(5),
  // });
  // return result.toUIMessageStreamResponse();
}
```

### 5.6 前端聊天组件

```typescript
// components/chat.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { DealCard } from './deal-card';
import { PriceChart } from './price-chart';
import { CopywritingCard } from './copywriting-card';

export function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });

  return (
    <div className="flex flex-col h-screen">
      {/* 消息列表 */}
      <div className="flex-1 overflow-auto p-4">
        {messages.map((message) => (
          <div key={message.id}>
            {message.parts.map((part, i) => {
              switch (part.type) {
                case 'text':
                  return <MarkdownRenderer key={i} text={part.text} />;

                // 工具结果渲染为自定义组件
                case 'tool-searchDeals':
                  if (part.state === 'output-available') {
                    return <DealList key={i} deals={part.output.deals} />;
                  }
                  return <LoadingCard key={i} text="正在搜索航线..." />;

                case 'tool-generateChart':
                  if (part.state === 'output-available') {
                    return <PriceChart key={i} data={part.output} />;
                  }
                  return <LoadingCard key={i} text="正在生成图表..." />;

                case 'tool-generateCopywriting':
                  if (part.state === 'output-available') {
                    return <CopywritingCard key={i} data={part.output} />;
                  }
                  return <LoadingCard key={i} text="正在撰写文案..." />;

                // 其他工具的 loading/结果展示 ...
              }
            })}
          </div>
        ))}
      </div>

      {/* 输入区 */}
      <ChatInput onSend={sendMessage} disabled={status === 'streaming'} />
    </div>
  );
}
```

---

## 6. 交互场景示例

### 场景 1: 查找低价航线

```
用户: 帮我找最便宜的加勒比航线

→ Agent 调用 searchDeals({ destination: 'Caribbean', sortBy: 'price', limit: 10 })
→ 返回 DealCard 列表
→ Agent 总结: "找到10条加勒比航线，最低$183起 (Carnival 3天墨西哥航线)，
   平均$245/人。最适合小红书推广的是这几条..."
```

### 场景 2: 价格分析

```
用户: 对比一下三个品牌的价格

→ Agent 调用 analyzePrices({ groupBy: 'brand' })
→ Agent 调用 generateChart({ chartType: 'brand_comparison' })
→ 渲染条形图 + 文字分析
→ "从数据来看，Carnival 均价最低 ($293)，适合主打性价比。
    皇家加勒比中国站以人民币定价，均价 ¥3,492..."
```

### 场景 3: 生成小红书文案

```
用户: 给这个 $183 的墨西哥航线写个小红书文案

→ Agent 调用 generateCopywriting({ dealId: 'xxx', style: '限时抢购' })
→ 展示 CopywritingCard:
   标题: "💥$183起！3天墨西哥邮轮 人均不到1300元！"
   正文: "姐妹们！这个价格我真的疯了..." [可一键复制]
   标签: #邮轮旅行 #嘉年华邮轮 #墨西哥 #特价邮轮 ...
```

### 场景 4: 价格趋势

```
用户: 这个航线价格有变化吗？

→ Agent 调用 getPriceHistory({ dealId: 'xxx' })
→ Agent 调用 generateChart({ chartType: 'price_trend', dealId: 'xxx' })
→ 渲染折线图
→ "过去一周价格稳定在 $183，建议尽快推广！"
```

---

## 7. 分阶段实施

### Phase 1: MVP — 对话 + 查询 (1-2天)

- [x] 项目初始化 (Next.js + AI SDK + shadcn/ui)
- [ ] 数据层: better-sqlite3 连接 cruise_crawler DB
- [ ] 查询函数: searchDeals, getBrandSummary, getDestinations
- [ ] 工具: searchDeals, getBrandOverview
- [ ] API Route: /api/chat (streamText)
- [ ] 前端: 基础聊天界面 + DealCard
- [ ] System Prompt

### Phase 2: 分析 + 图表 (1-2天)

- [ ] 查询函数: getPriceStats, getPriceHistory, getPriceDistribution
- [ ] 工具: analyzePrices, getPriceHistory, generateChart, compareCruises
- [ ] 前端: PriceChart 组件 (Recharts)
- [ ] 前端: 图表嵌入聊天消息

### Phase 3: 文案生成 (1天)

- [ ] 工具: generateCopywriting
- [ ] 前端: CopywritingCard (标题/正文/标签/一键复制)
- [ ] 多模型策略: 文案生成用 Claude

### Phase 4: 增强体验 (2-3天)

- [ ] 快捷操作按钮 (预设问题)
- [ ] 消息持久化 (可选，参考 chatbot 的 Drizzle 方案)
- [ ] 海报模板生成 (HTML → Canvas → 图片)
- [ ] 暗色主题
- [ ] 移动端适配

---

## 8. 环境变量

```bash
# .env.local
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx     # 用于文案生成 (可选)

# 数据库路径 (相对于 cruise_agent 项目根目录)
DB_PATH=../cruise_crawler/data/cruise_deals.db
```

---

## 9. 与 chatbot 参考项目的关系

| 维度 | chatbot (参考) | cruise_agent (本项目) |
|------|---------------|----------------------|
| 认证 | NextAuth (邮箱+游客) | **不需要** (内部工具) |
| 数据库 | PostgreSQL + Drizzle | **SQLite** (只读连接 crawler DB) |
| 消息持久化 | 完整方案 (Message_v2 表) | **Phase 4 可选** |
| Artifact 系统 | 4 种 artifact | **不需要** (图表直接嵌入) |
| 工具 | 4 个 (weather, document...) | **7 个** (全部领域专用) |
| 模型 | 多厂商 (AI Gateway) | **OpenAI 为主** + Claude 文案 |
| 流式恢复 | Redis + resumable-stream | **不需要** (内部工具) |
| 限流 | IP + 用户配额 | **不需要** (内部工具) |

**复用的设计模式:**
- useChat + streamText 的前后端协作模式
- 工具的高阶函数模式 (闭包注入上下文)
- 消息 parts 渲染模式 (根据 tool part type 渲染不同组件)
- shadcn/ui 组件体系

---

## 10. 后续扩展方向

- **更多爬虫数据** — 随着 cruise_crawler Phase 2/3 完成，自动获得更多品牌数据
- **汇率转换** — 自动将 USD/CNY 统一为人民币展示
- **竞品对比** — 同航线不同品牌的自动对比
- **定时推送** — 新低价 deal 主动通知
- **海报模板** — 多套小红书海报模板，一键导出
- **批量文案** — 选择多个 deal 批量生成文案
- **RAG 增强** — 接入邮轮评测/攻略知识库，让文案更专业
