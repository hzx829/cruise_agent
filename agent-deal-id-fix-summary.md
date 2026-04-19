# Agent dealId 串联失败修复总结

更新日期：2026-04-06

## 背景

本次问题来自一条典型链路：

1. 用户先让 Agent 找“降价最多的航线”。
2. Agent 成功通过 `getTopPriceDrops` 找到目标航线。
3. Agent 又去查这条航线的价格历史，也能查到。
4. 但在继续调用 `generateCopywriting` 生成小红书文案时，返回：
   - `未找到该航线，请检查 ID 是否正确。`

用户看到的现象是：

- 前一步明明已经拿到了正确航线。
- 中间价格历史也查到了。
- 最后生成文案却说“航线未找到”。

这说明问题不是数据不存在，而是工具串联时传参出了问题。

## 结论

根因不是 `cruise_crawler` 数据缺失，而是 `cruise_agent` 对 `dealId` 的类型定义错误。

`cruise_crawler` 的 SQLite 中，`deals.id` 是字符串主键，而且是固定 16 位十六进制字符串，例如：

- `9c3f17a445e50aed`
- `0002017fc35617a4`

但 `cruise_agent` 中不同工具对 `dealId` 的定义不一致：

- `getPriceHistory` 使用的是字符串 `dealId`
- `getRegionalPrices` 使用的是字符串 `dealId`
- `generateCopywriting` 却把 `dealId` 定义成了数字
- `compareCruises` 也把 `dealIds` 定义成了数字数组

这会直接导致模型在多工具串联时，被错误 schema 误导。

## 为什么会出现“前面能查到，后面又查不到”

### 1. `getTopPriceDrops` 返回的是字符串主键

降价排行工具返回的 `id` 来自数据库 `deals.id`，是字符串主键。

真实数据库抽查结果：

- `9c3f17a445e50aed | 7-DAY GLACIER DISCOVERY NORTHBOUND | Westerdam | 769 | 1209 | 36.4`

这里的第一列就是后续所有工具应该继续传递的唯一 `dealId`。

### 2. `getPriceHistory` 正常，是因为它接受字符串

`getPriceHistory` 的 schema 原本就是：

- `dealId: z.string()`

所以只要模型沿用上一工具的 `id` 原值，它就能正常查到价格历史。

### 3. `generateCopywriting` 失败，是因为它错误要求数字

修复前，`generateCopywriting` 的 schema 是：

- `dealId: z.number()`

但运行时查库又是：

- `queries.getDealById(String(dealId))`

这意味着它虽然最后会转成字符串去查库，但输入阶段已经把模型引导错了。

模型看到 schema 里要求数字，极容易把以下任意数字误当成 `dealId`：

- 排名
- `dropPct`
- 价格
- 列表序号

你给的历史记录里，第一条航线里有一个数值正好是 `36`，而系统后面又提示“未找到该航线”，这和“模型把 `36` 当 dealId 传给文案工具”这一现象是高度一致的。

换句话说：

- 不是航线不存在
- 不是数据库没这条数据
- 而是文案工具拿错了主键

## 与 `cruise_crawler` 的关系

这次问题的数据源是 `cruise_crawler`，但 bug 不在爬虫侧。

确认结果如下：

- `cruise_crawler` 中 `deals.id` 字段定义正确，为字符串主键
- `price_history.deal_id` 也使用同一套字符串 ID
- `cruise_crawler` 数据本身没有“ID 丢失”问题

因此：

- `cruise_crawler` 负责产出正确 ID
- `cruise_agent` 负责消费 ID
- 真正出错的是 `cruise_agent` 的 AI 工具 schema，与爬虫数据库主键类型不一致

## 本次修复

### 1. 新增统一的 `dealId` schema

文件：

- `lib/ai/tools/schemas.ts`

新增统一定义：

- `dealId` 必须是 16 位十六进制字符串
- 必须直接复用上一工具返回的 `id`
- 不能拿排名、价格或列表序号代替

同时新增了 `dealIdsSchema`，用于多航线对比工具。

### 2. 修复文案工具入参类型

文件：

- `lib/ai/tools/generate-copywriting.ts`

修改内容：

- `dealId: z.number()` 改为统一字符串 schema
- `queries.getDealById(String(dealId))` 改为 `queries.getDealById(dealId)`
- 错误提示改为更明确的版本，指出应传入上一工具返回的字符串 `dealId`

这样模型不会再被错误的数字 schema 误导。

### 3. 修复对比工具入参类型

文件：

- `lib/ai/tools/compare-cruises.ts`

修改内容：

- `dealIds: z.array(z.number())` 改为统一字符串数组 schema
- 查询逻辑直接使用字符串 ID

这个问题虽然不是本次主诉，但属于同类 bug，顺手一起修掉更稳妥。

### 4. 统一其他依赖 `dealId` 的工具定义

文件：

- `lib/ai/tools/get-price-history.ts`
- `lib/ai/tools/get-regional-prices.ts`

修改内容：

- 都改为复用同一个统一 schema

这样可以确保同一套主键规则在所有工具里保持一致，不会再出现“某个工具接受字符串、另一个工具要求数字”的情况。

### 5. 加强 prompt 约束

文件：

- `lib/ai/prompts.ts`

新增规则：

- `dealId` 是 16 位十六进制字符串
- 必须直接复用工具结果里的 `id`
- 不能把排名、价格或第几条结果当作 `dealId`

这一层的作用是进一步降低模型误传参数的概率。

### 6. 修复降价排行结果渲染字段不一致

文件：

- `components/message.tsx`

`getTopPriceDrops` 工具实际返回的是 `deals`，而前端分支此前按 `drops` 读取。虽然这不是“航线未找到”的直接根因，但属于同一条链路上的兼容问题，这次一起修掉了。

## 验证结果

### 1. 数据库验证

直接查询 `../cruise_crawler/data/cruise_deals.db`，确认：

- `deals.id` 为 16 位十六进制字符串
- `price_history.deal_id` 与 `deals.id` 使用同一套字符串主键
- 降价榜第一条航线的 ID 确实是字符串，不是数字

### 2. 静态检查

执行：

- `npm run lint`

结果：

- 通过

### 3. 构建验证

执行：

- `npm run build`

结果：

- 通过

## 这次修复解决了什么

本次已经明确解决：

- “前一步查到航线，后一步生成文案却提示未找到”
- “同一套数据库主键在不同工具里类型不一致”
- “模型被错误数字 schema 误导，拿错字段当 dealId”
- “多航线对比工具也存在同类 ID 类型风险”

## 后续建议

### 1. 所有与数据库主键相关的工具都应复用统一 schema

不要在各个工具里各自手写 `z.string()` 或 `z.number()`，否则同类问题还会复发。

### 2. 工具描述要明确“原样复用上一工具返回的 id”

对 Agent 来说，光说“Deal ID”不够，必须告诉它：

- 这是字符串主键
- 不是排名
- 不是价格

### 3. 若后续引入更多 agent 工具，优先检查串联参数类型

这类 bug 的特点是：

- 单个工具看起来都“能跑”
- 但一旦串起来，模型就可能因为 schema 不一致而传错参数

因此后续新增工具时，建议优先检查：

- 主键类型是否统一
- 枚举值是否统一
- 返回字段名和前端读取字段名是否一致

## 相关文件

- `lib/ai/tools/schemas.ts`
- `lib/ai/tools/generate-copywriting.ts`
- `lib/ai/tools/compare-cruises.ts`
- `lib/ai/tools/get-price-history.ts`
- `lib/ai/tools/get-regional-prices.ts`
- `lib/ai/prompts.ts`
- `components/message.tsx`

