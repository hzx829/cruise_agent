# 游速达 Agent 升级设计方案：从「价格搬运工」到「智能邮轮顾问」

> 基于 [Gemini 讨论](https://gemini.google.com/share/aa450622ebd2) 的产品升级思路，结合 Vercel AI SDK v6 Agent 最佳实践的技术实现方案。

---

## 1. 升级目标

### 现状分析

当前 `cruise_agent` 是一个**纯价格工具**：
- 所有 14 个 tools 都是数据库查询工具（searchDeals, getTopPriceDrops, analyzePrices...）
- System Prompt 将所有品牌/DB schema 信息硬编码
- 不支持开放式问题（邮轮评测、目的地攻略、穿搭建议等）
- 没有数据源隔离——模型无法区分「确定性数据」和「生成式数据」

### 升级后定位

**「查·比·学」三合一邮轮智能顾问**：

| 能力维度 | 对应入口 | 数据源 | 场景 |
|----------|---------|--------|------|
| ⚓ 价格巡航 | 爬虫私有库 tools | SQLite DB | 实时价格、降价、比价 |
| 📊 品牌测评 | 全网搜索 tool | Web Search API | 船龄、设施、达人评价、对比 |
| 📖 行业百科 | 全网搜索 + 知识库 | Web Search + 固定源 | 攻略、术语、获客文案 |

### 核心原则

1. **价格数据零幻觉**：价格必须且只能来自爬虫 DB，严禁网络搜索或 LLM 编造
2. **百科信息有溯源**：网络搜索结果必须标注来源
3. **智能路由**：模型自动判断用哪类工具，无需用户手动切换

---

## 2. 架构设计

### 2.1 新架构图

```
┌─────────────────────────────────────────────────────────────┐
│                   Next.js App (cruise_agent)                 │
│                                                             │
│  ┌──────────────┐   ┌────────────────────────────────────┐  │
│  │   Frontend   │   │   POST /api/chat                   │  │
│  │              │   │                                    │  │
│  │  useChat()   │──▶│   ToolLoopAgent.stream()           │  │
│  │  + 快捷入口   │   │   ┌──────────────────────────┐    │  │
│  │  + 来源标签   │   │   │ 🧠 Routing Prompt         │    │  │
│  │              │   │   │ (智能判断用哪类工具)       │    │  │
│  └──────────────┘   │   └──────────┬───────────────┘    │  │
│                     │              │                     │  │
│                     │   ┌──────────▼───────────────┐    │  │
│                     │   │      Agent Tools          │    │  │
│                     │   │                          │    │  │
│                     │   │ ┌─ 🔒 价格类 (DB) ─────┐ │    │  │
│                     │   │ │ searchDeals           │ │    │  │
│                     │   │ │ getTopPriceDrops      │ │    │  │
│                     │   │ │ getHotDeals           │ │    │  │
│                     │   │ │ getPriceHistory       │ │    │  │
│                     │   │ │ getRegionalPrices     │ │    │  │
│                     │   │ │ compareCruises        │ │    │  │
│                     │   │ │ getStats              │ │    │  │
│                     │   │ │ getBrandOverview      │ │    │  │
│                     │   │ │ analyzePrices         │ │    │  │
│                     │   │ │ getTrackingOverview   │ │    │  │
│                     │   │ │ listDestinations      │ │    │  │
│                     │   │ │ listCabinTypes        │ │    │  │
│                     │   │ └───────────────────────┘ │    │  │
│                     │   │                          │    │  │
│                     │   │ ┌─ 🌐 知识类 (Web) ────┐ │    │  │
│                     │   │ │ webSearch             │ │    │  │
│                     │   │ │ cruiseEncyclopedia    │ │    │  │
│                     │   │ └───────────────────────┘ │    │  │
│                     │   │                          │    │  │
│                     │   │ ┌─ ✍️ 创作类 ──────────┐ │    │  │
│                     │   │ │ generateCopywriting   │ │    │  │
│                     │   │ │ generateChart         │ │    │  │
│                     │   │ └───────────────────────┘ │    │  │
│                     │   └──────────────────────────┘    │  │
│                     └────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               Data Layer                              │   │
│  │  ┌─────────────────┐    ┌──────────────────────────┐ │   │
│  │  │ SQLite (爬虫DB)  │    │  Web Search API          │ │   │
│  │  │ cruise_deals.db  │    │  (Tavily / SearXNG)      │ │   │
│  │  └─────────────────┘    └──────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 工具分类

| 分类 | 工具名 | 数据源 | 说明 |
|------|--------|--------|------|
| 🔒 **价格类** | searchDeals | DB | 多维度搜索航线 |
| 🔒 **价格类** | getTopPriceDrops | DB | 降价幅度最大 |
| 🔒 **价格类** | getHotDeals | DB | deal_score 最高 |
| 🔒 **价格类** | getPriceHistory | DB | 价格变动历史 |
| 🔒 **价格类** | getRegionalPrices | DB | 各区域价格对比 |
| 🔒 **价格类** | compareCruises | DB | 并排对比航线 |
| 🔒 **价格类** | getStats | DB | 统计概览 |
| 🔒 **价格类** | getBrandOverview | DB | 品牌统计 |
| 🔒 **价格类** | analyzePrices | DB | 价格分析 |
| 🔒 **价格类** | getTrackingOverview | DB | 追踪概览 |
| 🔒 **价格类** | listDestinations | DB | 目的地列表 |
| 🔒 **价格类** | listCabinTypes | DB | 舱位类型 |
| 🌐 **知识类** | webSearch | Web API | 通用网络搜索 |
| 🌐 **知识类** | cruiseEncyclopedia | Web API | 邮轮专业百科（限定搜索域） |
| ✍️ **创作类** | generateCopywriting | DB + LLM | 营销文案 |
| ✍️ **创作类** | generateChart | DB | 图表可视化 |

---

## 3. 新增工具实现

### 3.1 Web Search Tool — `webSearch`

**推荐方案：[Tavily Search API](https://tavily.com/)**

选择 Tavily 的理由：
- 专为 AI Agent 设计的搜索 API，返回结构化结果（title, url, content, score）
- 免费层 1000 次/月，够初期使用
- 支持 `include_domains` / `exclude_domains` 限定搜索范围
- 支持 `search_depth: "advanced"` 深度搜索
- 有 `@tavily/core` 官方 npm SDK

**备选方案：**
- **SearXNG** — 自建开源搜索引擎，无调用限制，但需要部署
- **Brave Search API** — 商用搜索 API，免费层 2000 次/月
- **Google Custom Search** — 100 次/天免费

```typescript
// lib/ai/tools/web-search.ts
import { tool } from 'ai';
import { z } from 'zod';

export const webSearch = tool({
  description: `在互联网上搜索邮轮相关信息。
用于回答非价格类问题，如：
- 邮轮品牌评测、船只设施、餐饮风格
- 目的地攻略、最佳旅游季节
- 邮轮行业新闻、航线调整
- 穿搭建议、登船须知
⚠️ 严禁用此工具查询价格！价格必须用 searchDeals 等数据库工具。`,
  inputSchema: z.object({
    query: z.string().describe('搜索关键词，建议用英文搜索以获取更多结果'),
    searchDepth: z.enum(['basic', 'advanced']).optional()
      .describe('搜索深度，复杂问题用 advanced'),
    maxResults: z.number().min(1).max(10).optional()
      .describe('返回结果数量，默认 5'),
    includeDomains: z.array(z.string()).optional()
      .describe('限定搜索域名，如 ["cruisecritic.com", "reddit.com"]'),
  }),
  execute: async ({ query, searchDepth, maxResults, includeDomains }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return { error: '搜索服务未配置', results: [] };
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: searchDepth || 'basic',
        max_results: maxResults || 5,
        include_domains: includeDomains,
        include_answer: true,
      }),
    });

    const data = await response.json();

    return {
      answer: data.answer || null,
      results: (data.results || []).map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.content?.slice(0, 500), // 截断防止 token 过多
        score: r.score,
      })),
      source: 'web_search',
      disclaimer: '以上信息来自互联网，仅供参考',
    };
  },
});
```

### 3.2 Cruise Encyclopedia Tool — `cruiseEncyclopedia`

专门面向邮轮专业网站的限定域搜索，提高专业性：

```typescript
// lib/ai/tools/cruise-encyclopedia.ts
import { tool } from 'ai';
import { z } from 'zod';

const CRUISE_EXPERT_DOMAINS = [
  'cruisecritic.com',      // 全球最大邮轮评测
  'cruisemapper.com',      // 船只技术参数
  'royalcaribbeanblog.com',// 皇家加勒比专题
  'crew-center.com',       // 行业内幕
];

export const cruiseEncyclopedia = tool({
  description: `从专业邮轮网站搜索百科信息。
适用于：
- 船只下水年份、吨位、载客量等技术参数
- 品牌定位、服务特色（如管家比例、米其林厨师）
- 专业评测和用户口碑
- 邮轮行业术语解释
比 webSearch 更精准，因为限定了权威邮轮网站。`,
  inputSchema: z.object({
    query: z.string().describe('搜索关键词，建议英文'),
    topic: z.enum([
      'ship_specs',      // 船只规格
      'brand_review',    // 品牌评测
      'destination',     // 目的地
      'onboard_life',    // 船上生活
      'industry_news',   // 行业新闻
      'general',         // 通用
    ]).optional().describe('搜索主题分类'),
  }),
  execute: async ({ query, topic }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return { error: '搜索服务未配置', results: [] };
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: `cruise ${query}`,
        search_depth: 'advanced',
        max_results: 5,
        include_domains: CRUISE_EXPERT_DOMAINS,
        include_answer: true,
      }),
    });

    const data = await response.json();

    return {
      answer: data.answer || null,
      results: (data.results || []).map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.content?.slice(0, 500),
        source: new URL(r.url).hostname,
      })),
      topic,
      source: 'cruise_encyclopedia',
      disclaimer: '信息来自专业邮轮评测网站，仅供参考',
    };
  },
});
```

---

## 4. System Prompt 重构

### 4.1 设计思路

现有 prompt 的问题：
1. **太长** — 把 brand 映射、tier 体系、字段说明全部塞进 system prompt (~2000+ tokens)
2. **没有路由逻辑** — 不区分价格查询和开放问题
3. **工具列表是静态说明** — 模型需要靠记忆匹配工具

重构策略：
- **分层 prompt**：核心角色 + 路由规则 + 工具使用指南 + 数据背景
- **显式路由规则**：在 prompt 中明确定义「什么问题用什么工具」
- **数据来源标注**：要求模型在回答中标注信息来源

### 4.2 新 Prompt 结构

```typescript
// lib/ai/prompts.ts — 重构后

export function buildSystemPrompt(): string {
  const activeBrands = getActiveBrandsStats();

  return `你是「游速达」智能邮轮顾问，服务于旅行社邮轮部门的专业人员。
你拥有两大能力：精准的官网实时价格数据，和丰富的邮轮行业知识。

## 核心身份

你不仅是价格查询工具，更是邮轮行业的「内行人」。你能：
1. 🔒 提供 100% 准确的官网爬虫价格数据（价格巡航）
2. 📊 对比不同品牌/航线的评测信息（品牌测评）
3. 📖 解答行业知识、目的地攻略（行业百科）
4. ✍️ 生成有传播力的营销文案（获客助手）

## ⚠️ 数据源路由规则（最重要！）

### 规则一：价格类问题 → 只用 DB 工具，严禁搜索

当用户询问以下内容时，**必须且只能**使用数据库工具（searchDeals、getTopPriceDrops 等）：
- 价格、报价、多少钱、费用
- 特价、降价、折扣、优惠
- 比价、最便宜、最贵
- 具体航线的价格变动

🚫 **严禁用 webSearch 查询价格！** 网上价格可能过时或不准确，会损害专业信任。

### 规则二：知识类问题 → 用搜索工具

当用户询问以下内容时，使用 webSearch 或 cruiseEncyclopedia：
- 邮轮品牌评测、船龄、设施、餐饮风格
- 目的地攻略、最佳旅游季节、签证
- 邮轮 vs 邮轮的对比（非价格维度）
- 行业术语、新手入门知识
- 登船须知、穿搭建议

### 规则三：混合问题 → 分步处理

用户问「这条降价航线值得买吗？」时：
1. 先用 DB 工具获取价格数据
2. 再用搜索工具补充背景信息（船只评测、目的地评价）
3. 综合回答，分别标注数据来源

### 规则四：文案类问题 → DB 数据 + LLM 创作

生成营销文案时：
1. 先获取航线价格数据
2. 可选用搜索补充卖点素材
3. 结合数据生成文案

## 工具使用指南

### 价格查询工具（数据来自官网爬虫，准确可靠）

| 工具 | 用途 | 使用时机 |
|------|------|----------|
| searchDeals | 多维度搜索航线 | 用户问价格、找航线 |
| getTopPriceDrops | 降价幅度最大 | 用户问"最大降价" |
| getHotDeals | deal_score 最高 | 用户问"性价比最高" |
| getPriceHistory | 价格变动历史 | 用户问"价格趋势" |
| getRegionalPrices | 各区域价格对比 | 用户问"各区域价格" |
| compareCruises | 并排对比航线 | 用户要比较多条航线 |
| getStats | 统计概览 | 用户问整体数据 |
| getBrandOverview | 品牌统计 | 用户问品牌概况 |
| analyzePrices | 价格分析 | 用户要价格分布分析 |
| listDestinations | 目的地列表 | 不确定目的地时先查 |
| listCabinTypes | 舱位类型 | 不确定舱位时先查 |

### 知识搜索工具（数据来自互联网，需标注来源）

| 工具 | 用途 | 使用时机 |
|------|------|----------|
| webSearch | 通用网络搜索 | 开放性问题、目的地攻略 |
| cruiseEncyclopedia | 专业邮轮百科 | 船只参数、品牌评测 |

### 创作工具

| 工具 | 用途 |
|------|------|
| generateCopywriting | 小红书风格推广文案 |
| generateChart | 可视化图表 |

## 回答格式规范

1. **价格信息**必须标注：
   - 数据来源标签：「📡 官网实时数据」
   - 数据同步时间（如有）
   - 提醒以官网为准

2. **百科信息**必须标注：
   - 数据来源标签：「🌐 网络信息」
   - 具体来源网站（如 Cruise Critic）
   - 「以上信息仅供参考」

3. **混合回答**分段标注：
   - 价格部分用「📡 官网实时数据」
   - 百科部分用「🌐 网络信息」

## 交互规则

1. 使用中文回复
2. 展示价格时注明货币（USD/CNY）
3. 人民币和美元航线不混在一起比价
4. 推荐航线时简要说明理由
5. 回答简洁有条理，适当使用 emoji
6. 默认按航次聚合，不主动罗列每个舱位价格
7. 只有用户指定房型时才按该房型报价
8. 数据库查无结果时直接说"未找到"，不编造

${buildTierSection(activeBrands)}
${buildBrandSection(activeBrands)}

## 价格追踪字段说明

| 字段 | 说明 |
|------|------|
| price_trend | up(涨) / down(降) / stable(稳) / new(新) |
| deal_score | 折扣深度 0~100 |
| price_highest | 历史最高价 |
| price_lowest | 历史最低价 |

## 舱位类型

| 英文 | 中文 | 定位 |
|------|------|------|
| interior/inside | 内舱 | 入门级 |
| oceanview | 海景舱 | 中档 |
| balcony | 阳台舱 | 主流 |
| mini-suite | 迷你套房 | 升级 |
| suite | 套房 | 高端 |
| haven | Haven 套房 | 顶级（NCL） |
`;
}
```

---

## 5. Agent 架构升级

### 5.1 使用 AI SDK v6 ToolLoopAgent

当前代码直接在 API route 中调 `streamText`，升级为 `ToolLoopAgent` 模式：

```typescript
// lib/ai/agent.ts — 新增

import { ToolLoopAgent, stepCountIs } from 'ai';
import { buildSystemPrompt } from './prompts';
import {
  searchDeals, getBrandOverview, analyzePrices,
  getPriceHistory, generateChart, compareCruises,
  generateCopywriting, getTopPriceDrops, getHotDeals,
  getTrackingOverview, listDestinations, listCabinTypes,
  getRegionalPrices, getStats,
} from './tools';
import { webSearch } from './tools/web-search';
import { cruiseEncyclopedia } from './tools/cruise-encyclopedia';

export function createCruiseAgent(model: any) {
  return new ToolLoopAgent({
    model,
    instructions: buildSystemPrompt(),
    tools: {
      // 🔒 价格类工具 (DB)
      searchDeals,
      getTopPriceDrops,
      getHotDeals,
      getPriceHistory,
      getRegionalPrices,
      compareCruises,
      getStats,
      getBrandOverview,
      analyzePrices,
      getTrackingOverview,
      listDestinations,
      listCabinTypes,
      // 🌐 知识类工具 (Web)
      webSearch,
      cruiseEncyclopedia,
      // ✍️ 创作类工具
      generateCopywriting,
      generateChart,
    },
    stopWhen: stepCountIs(8), // 允许更多步骤（DB查询+搜索+综合）
    onStepFinish: async ({ stepNumber, toolCalls, usage }) => {
      // 可选：记录 tool 调用日志，便于调试和优化
      if (toolCalls?.length) {
        console.log(`[Agent Step ${stepNumber}]`, 
          toolCalls.map(tc => tc.toolName).join(', '),
          `tokens: ${usage.totalTokens}`
        );
      }
    },
  });
}
```

### 5.2 API Route 简化

```typescript
// app/api/chat/route.ts — 重构后

import { createAgentUIStreamResponse, createIdGenerator, type UIMessage } from 'ai';
import { createCruiseAgent } from '@/lib/ai/agent';
import { loadChat, saveMessages, updateChatTitle, createChat } from '@/lib/db/chat-store';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { message, id }: { message: UIMessage; id: string } = await req.json();

  // DB 操作 (与现有逻辑一致)
  let previousMessages: UIMessage[] = [];
  try {
    const result = loadChat(id);
    previousMessages = result.messages;
  } catch {
    createChat(id);
  }
  const allMessages = [...previousMessages, message];
  saveMessages(id, [message]);

  const agent = createCruiseAgent(getModel());

  return createAgentUIStreamResponse({
    agent,
    uiMessages: allMessages,
    generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
    onFinish: async ({ messages: finishedMessages }) => {
      const existingIds = new Set(allMessages.map(m => m.id));
      const newMessages = finishedMessages.filter(m => !existingIds.has(m.id));
      if (newMessages.length > 0) {
        saveMessages(id, newMessages);
      }
      if (previousMessages.length === 0) {
        const title = extractTitle(message);
        updateChatTitle(id, title);
      }
    },
  });
}
```

---

## 6. 前端改进

### 6.1 快捷入口升级

从 3 个纯价格入口，升级为「查·比·学」三合一：

```typescript
const QUICK_ACTIONS = [
  // ⚓ 价格巡航 — 触发 DB 工具
  { 
    label: '⚓ 价格巡航', 
    text: '帮我找降价幅度最大的邮轮航线，特别关注高端和奢华品牌',
    description: '官网实时价格追踪',
  },
  // 📊 品牌测评 — 触发 Web Search
  { 
    label: '📊 品牌测评', 
    text: '帮我对比一下皇家加勒比和诺唯真邮轮的优缺点，包括设施、餐饮、服务',
    description: '全网深度对比分析',
  },
  // 📖 行业百科 — 触发 Web Search + 知识
  { 
    label: '📖 行业百科', 
    text: '邮轮行业有哪些常见术语需要了解？比如阳台房、套房礼遇、离港税这些',
    description: '从业者学习助手',
  },
  // ✍️ 获客文案 — 触发 DB + LLM
  { 
    label: '✍️ 爆款文案', 
    text: '找一个降价最多的航线，帮我生成小红书推广文案',
    description: '一键生成营销内容',
  },
];
```

### 6.2 来源标签组件

在消息渲染中区分数据来源：

```typescript
// components/source-badge.tsx
function SourceBadge({ source }: { source: 'db' | 'web' | 'mixed' }) {
  const config = {
    db: { label: '📡 官网实时数据', className: 'bg-green-100 text-green-800' },
    web: { label: '🌐 网络信息', className: 'bg-blue-100 text-blue-800' },
    mixed: { label: '📡+🌐 综合分析', className: 'bg-purple-100 text-purple-800' },
  };
  const { label, className } = config[source];
  return <span className={`text-xs px-2 py-0.5 rounded-full ${className}`}>{label}</span>;
}
```

---

## 7. 环境变量

新增：

```bash
# .env.local
# Web Search (选一个)
TAVILY_API_KEY=tvly-xxxxx      # Tavily Search API (推荐)
# SEARXNG_URL=http://localhost:8080  # 自建 SearXNG (备选)
# BRAVE_API_KEY=BSA-xxxxx      # Brave Search (备选)
```

---

## 8. 实施计划

### Phase 1: 核心功能（1-2 天）

- [ ] 安装 Tavily SDK 或实现 fetch 调用
- [ ] 实现 `webSearch` tool
- [ ] 实现 `cruiseEncyclopedia` tool
- [ ] 重构 System Prompt（添加路由规则）
- [ ] 更新 tools/index.ts 导出
- [ ] 测试路由逻辑（价格问题 → DB，知识问题 → Web）

### Phase 2: Agent 模式升级（1 天）

- [ ] 创建 `lib/ai/agent.ts`（ToolLoopAgent 封装）
- [ ] 重构 `api/chat/route.ts` 使用 `createAgentUIStreamResponse`
- [ ] 验证多步工具调用（先搜索再综合回答）

### Phase 3: 前端优化（1 天）

- [ ] 更新快捷入口按钮
- [ ] 添加来源标签组件
- [ ] 搜索结果的 UI 渲染
- [ ] 调整 placeholder 根据入口切换

### Phase 4: 质量优化（持续）

- [ ] 调优 Prompt 路由准确性
- [ ] 添加搜索结果缓存
- [ ] 工具调用日志和监控
- [ ] 专业邮轮知识库（可选：嵌入固定的 Cruise Critic 数据）

---

## 9. 风险和注意事项

### 价格幻觉防护

这是最核心的风险。防护措施：
1. **Prompt 硬编码规则**：明确禁止 webSearch 返回价格
2. **webSearch 工具 description**：写明「严禁用于查询价格」
3. **回答模板**：价格回答必须包含「📡 官网实时数据」标签
4. **后续可选**：添加 output validation middleware

### 搜索 API 成本控制

- Tavily 免费层 1000 次/月，约 33 次/天
- 对于内部 B 端工具足够初期使用
- 可通过缓存常见搜索减少调用
- 后续可迁移至自建 SearXNG 无限制

### Token 成本

- 新增 webSearch 结果会增加 context tokens
- 搜索结果截断到 500 字/条，5 条 = ~2500 字 ≈ 1000 tokens
- 建议先用 GPT-4.1-mini，成本可控

### 模型选型考虑

当前用 ZhiPu（GLM-4-flash），对 tool routing 的准确性可能不如 GPT-4.1-mini 或 Claude。
如果路由不准确，建议：
1. 优先尝试 GPT-4.1-mini（工具调用最稳定）
2. 或者添加 `prepareStep` 在首步强制分类，后续步骤再执行
