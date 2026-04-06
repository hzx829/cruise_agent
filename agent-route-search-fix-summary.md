# Agent 航线搜索准确性修复总结

更新日期：2026-04-05

## 背景

本轮修改主要针对以下几个问题：

1. 用户要求的是精确线路条件时，Agent 会用相近但不符合条件的结果充数。
2. 目的地搜索结果按舱位逐条展开，导致同一航次重复展示，信息噪音过大。
3. “东地中海 / 爱琴海 / 雅典往返 / 途径圣托里尼”这类查询缺少硬过滤能力，准确率不足。
4. UI 没有明确区分“往返”和“开口”，用户容易误判结果是否符合要求。

本次改动的核心原则是：

- 线路准确性优先于价格。
- 查不到符合条件的航次时，直接返回“没有合适线路”，而不是给近似结果。
- 默认按“航次”聚合结果，只显示最低起价。
- 只有用户明确指定房型时，才显示对应房型价格。

## 具体修改

### 1. 查询层增强

文件：

- `lib/db/types.ts`
- `lib/db/queries.ts`
- `lib/cruise/search-utils.ts`

新增或增强了以下查询能力：

- `departurePort`
  - 支持按出发港/母港硬过滤。
- `arrivalPort`
  - 支持按抵达港硬过滤。
- `itineraryIncludes`
  - 支持必须经停某港，例如 Santorini / JTR。
- `itineraryExcludes`
  - 支持排除某些经停港。
- `roundtrip`
  - 支持严格“往返”判定。
  - “雅典往返”不会再把 `雅典→拉文纳` 或 `拉文纳→雅典` 当作符合条件的结果。
- `routeRegion`
  - 支持 `aegean` / `eastern_mediterranean` / `western_mediterranean`。
  - 当前是基于起止港、目的地、行程经停港的启发式判定。

同时增加了一套地点别名和港口三字码匹配能力，支持：

- Athens / Piraeus / PIR / ATH
- Santorini / JTR
- Ravenna / RAV
- Rome / Civitavecchia / CIV / ROM
- Kusadasi / KUS / ADB
- 以及常见的希腊群岛、亚得里亚海、地中海港口简称

### 2. 航次聚合逻辑

文件：

- `lib/db/queries.ts`

默认搜索结果不再按舱位逐条返回，而是先按“同一航次”聚合，再取最低价：

- 同一航次的判定维度包括：
  - 品牌
  - 线路名
  - 船名
  - 出发港
  - 目的地
  - itinerary
  - 天数
  - 出发日期
  - 结束日期
- 默认只保留该航次最低起价的那一条记录
- 若用户指定 `cabinType`，则先按房型过滤，再按航次聚合，只保留该房型在每个航次的一条价格

这解决了原来同一航次因为内舱/海景/阳台/套房分多条刷屏的问题。

### 3. AI 工具入参和出参增强

文件：

- `lib/ai/tools/search-deals.ts`

`searchDeals` 工具新增了：

- `departurePort`
- `arrivalPort`
- `itineraryIncludes`
- `itineraryExcludes`
- `roundtrip`
- `routeRegion`

工具返回结果中也新增了：

- `departurePort`
- `arrivalPort`
- `routeStartPort`
- `routeEndPort`
- `routeLabel`
- `routeType`

其中：

- `routeType = roundtrip` 表示往返
- `routeType = open_jaw` 表示开口

这样前端可以直接显示用户真正关心的线路结构，而不是只看目的地名称。

### 4. Prompt 约束加强

文件：

- `lib/ai/prompts.ts`

增加了明确规则：

- 线路准确性优先于价格
- 用户说“往返”时，绝不能用开口航线代替
- 用户说“途径/经停/包含”某港时，必须用 `itineraryIncludes`
- 查不到结果时，默认直接说“未找到符合条件的航次”
- 默认展示按航次聚合后的结果
- 默认不要主动罗列每个舱位价格
- 只有用户明确指定房型时，才按该房型报价

这一层的作用是让模型调用工具时更符合业务要求，而不是自己猜。

### 5. 前端展示优化

文件：

- `components/message.tsx`
- `components/deal-card.tsx`

搜索结果展示调整为：

- 文案从“找到 X 条航线”改为“找到 X 个匹配航次”
- 默认显示“已按航次去重，仅显示每个航次的最低起价”
- 指定房型时显示“已按航次去重，显示指定房型价格”

卡片新增：

- `routeLabel`
  - 例如：`Athens (Piraeus) 往返`
  - 或：`PIR → RAV`
- `routeType`
  - 明确显示“往返”或“开口”
- 欧元价格符号支持
  - `EUR` 显示为 `€`

这样用户一眼就能看出结果是否真的是往返，避免“看上去像对，实际上是开口”的问题。

## 验证结果

本轮做了三类验证：

### 1. 静态检查

- `./node_modules/.bin/tsc --noEmit`
- `./node_modules/.bin/eslint ...`

均通过。

### 2. 数据库实测场景

使用真实数据库 `../cruise_crawler/data/cruise_deals.db` 做了抽查。

#### 场景 A：`雅典往返 + 途径圣托里尼`

结果只保留严格往返航次，不再混入开口线。

#### 场景 B：`NCL + 雅典/比港 + 往返 + 圣托里尼`

结果为 `0`。

这说明当前逻辑已经不会再用 NCL 的 `PIR → RAV` / `RAV → PIR` 开口航线冒充“雅典往返”。

#### 场景 C：`Greek Isles + 8 月`

结果按航次聚合后输出，不再把同一航次的多个舱位全部展开。

#### 场景 D：`NCL + balcony + Greek Isles + 8 月`

结果只保留每个航次的一条 Balcony 价格，不再出现同航次重复刷屏。

## 这轮改动解决了什么

本次已经明确解决了以下问题：

- “查不到合适线路时不要乱推荐”
- “往返不能拿开口代替”
- “必须途径某港时要硬匹配”
- “默认结果按航次汇总，不按舱位刷屏”
- “结果里明确显示开口/往返”

## 仍然存在的边界

### 1. 航区分类仍然是启发式，不是结构化字段

目前 `aegean / eastern_mediterranean / western_mediterranean` 仍然依赖：

- 目的地文本
- itinerary 文本
- 起止港文本
- 常见港口别名和三字码

相比之前已经明显更严格，但它仍然不是数据库里的标准化字段，因此不能保证所有品牌、所有写法都完全无误。

### 2. 最彻底的方案仍然在爬虫/入库层

如果后续要进一步提高准确率，建议在 `cruise_crawler` 侧补标准化字段，例如：

- `embark_port`
- `disembark_port`
- `is_roundtrip`
- `visited_ports_json`
- `route_region`

一旦这些字段在入库阶段标准化，Agent 查询层就不需要再靠文本和别名做启发式判断，准确率会更稳定。

## 本轮涉及文件

- `lib/cruise/search-utils.ts`
- `lib/db/types.ts`
- `lib/db/queries.ts`
- `lib/ai/tools/search-deals.ts`
- `lib/ai/prompts.ts`
- `components/message.tsx`
- `components/deal-card.tsx`

