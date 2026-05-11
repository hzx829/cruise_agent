# Agent 新加坡日期筛选问题技术分析

更新日期：2026-05-11

## 背景

测试问题来自用户查询：

```text
有什么停靠新加坡的奢华游轮，5月27号到6月3号之间
```

预期结果中应包含 Disney Adventure 的新加坡航线。数据库中确实存在 2026-05-27 到 2026-06-03 范围内、与 Singapore 相关的 Disney 航次，例如：

- `4-Night Singapore from Singapore`，2026-05-28 到 2026-06-01
- `3-Night Singapore from Singapore`，2026-06-01 到 2026-06-04

但 Agent 回复没有找到符合条件的航线。进一步检查聊天 `eBjNGCAnarGDdxYh` 后发现：

- `agent_runs` 表里没有对应记录，说明当前运行环境没有把这次 run trace 正常写入。
- 从 `messages.parts_json` 里仍能看到工具调用。
- 实际工具调用包含日期范围，但第二次 `searchDeals` 的参数仍带着 `tier: "luxury"`。
- Disney Adventure 在当前数据分层里属于 `premium`，因此被 `luxury` 硬过滤误杀。

这说明问题不是单纯的「时间没有进入结构化数据」，而是多个筛选层叠加后的误杀：

1. 日期需要稳定进入 `sailDateFrom` / `sailDateTo`。
2. 「停靠新加坡」应进入 `itineraryIncludes`，不能默认当成 `departurePort`。
3. 中文里的「奢华/豪华游轮」很多时候是泛称，不能默认等价于严格 `tier = luxury`。
4. 当前运行使用的是数据库里的 active prompt，代码里的默认 prompt 模板改动不会自动生效。

## 根因

### 1. 日期约束没有作为硬约束贯穿链路

用户说「5月27号到6月3号之间」时，Agent 需要把它结构化为：

```json
{
  "sailDateFrom": "2026-05-27",
  "sailDateTo": "2026-06-03"
}
```

在当前日期为 2026-05-11、时区为 Asia/Shanghai 的上下文里，未写年份的 5 月到 6 月范围应推断为 2026 年。

如果这个信息只存在于自然语言上下文里，而没有进入工具参数，数据库查询层就无法执行日期过滤。

### 2. 「停靠」语义和「出发」语义混淆

「停靠新加坡」「经停新加坡」「途经新加坡」表达的是 itinerary 中包含 Singapore，应该映射到：

```json
{
  "itineraryIncludes": ["Singapore"]
}
```

只有用户明确说「从新加坡出发」「新加坡上船」「新加坡母港」时，才应映射到：

```json
{
  "departurePort": "Singapore"
}
```

这类语义分流如果只依赖 prompt 里的提醒，稳定性不够高。它应该同时存在于 intent 解析、工具 schema 描述、工具调用归一化三个层面。

### 3. 「奢华」被过度解释成严格 luxury tier

中文里的「奢华游轮」「豪华邮轮」经常只是用户对高品质航线的泛称，不一定是在指定数据库分层里的 `luxury`。

对这次查询而言，Disney Adventure 不属于 `luxury` tier，而属于 `premium`。如果模型把「奢华游轮」直接转成：

```json
{
  "tier": "luxury"
}
```

就会把 Disney 结果排除掉。

更稳妥的策略是：

- 用户明确说「只看 luxury tier」「限定高奢品牌」「Silversea/Regent/Explora 这类高奢品牌」时，使用 `tier = luxury`。
- 用户只是泛称「豪华/奢华游轮」时，不加 tier，或扩展为 `["premium", "luxury"]`。

### 4. Active prompt 来自数据库

本地代码里的 `prompt-template.ts` 不是唯一 prompt 来源。运行时优先使用数据库里的 active prompt。

这次排查发现 active prompt 仍是旧版本，因此仅修改代码中的默认 prompt 模板不足以改变当前服务行为。已经在 `data/agent.db` 中新增 active prompt version 3，加入了日期、停靠港、奢华泛称的参数规则。这个数据库热修复不属于 git 跟踪文件。

同时，代码层面的工具参数归一化需要重启或重新部署服务后才会生效。

## 已完成修复

### cruise_agent

#### Intent 解析

文件：

- `lib/ai/intent.ts`

改动：

- 为 `CruiseHardConstraints` 增加 `sailDateFrom` / `sailDateTo`。
- 支持中文日期范围解析，例如「5月27号到6月3号之间」。
- 支持 `itineraryIncludes` 的显式识别。
- 增加「停靠/经停/途经/包含/靠港/到访」这类语义识别。
- 避免把停靠港误判为出发港，除非用户明确表达「从/出发/上船/母港」。

#### 工具入参归一化

文件：

- `lib/ai/agent.ts`

改动：

- 增加 `applyHardConstraintsToSearchDealsInput(rawInput, intentContext)`。
- 在 `searchDeals` 真正执行前，将 intent 硬约束注入工具参数。
- 对泛称「豪华/奢华游轮」导致的 `tier: "luxury"` 做防误杀处理：在没有明确高奢限定词时扩展为 `["premium", "luxury"]`。
- `createCruiseAgent` 使用带 intentContext 的 tool factory。

#### Trace 记录

文件：

- `app/api/chat/route.ts`
- `lib/db/agent-trace-store.ts`

改动：

- `onStepFinish` 保存 `searchDeals` 的 effective input，而不是只保存模型原始输入。
- 工具输出摘要增加 `appliedFilters`，方便回放排查。

#### Prompt 和 schema

文件：

- `lib/ai/prompt-template.ts`
- `lib/ai/tools/search-deals.ts`
- `lib/ai/tools/schemas.ts`

改动：

- 在工具 schema 中明确 `itineraryIncludes` 和 `sailDateFrom` / `sailDateTo` 的用法。
- 在 tier schema 中说明中文「豪华/奢华」不一定等价于严格 luxury。
- 在默认 prompt 模板中补充日期、停靠港、奢华泛称规则。

### curise_crawler

#### API 日期过滤

文件：

- `src/web/app.py`

改动：

- `/api/deals` 新增 `sail_date_from` / `sail_date_to` 查询参数。
- SQL 查询层增加 `Deal.sail_date >= sail_date_from` 和 `Deal.sail_date <= sail_date_to`。
- 兼容测试里直接调用 FastAPI handler 时 `Query(None)` 对象没有被框架转换的情况。

#### 前端日期筛选

文件：

- `src/web/static/index.html`

改动：

- 增加「出发日期从」「到」两个 date input。
- `loadDeals()` 将日期参数传给 API。
- `resetFilters()` 会清空日期条件。

#### 回归测试

文件：

- `tests/test_web_i18n_api.py`

改动：

- 增加 `test_api_deals_filters_by_sail_date_range`。
- 构造一条范围内 Disney 航次和一条范围外 Disney 航次，验证 API 只返回范围内结果。

## Prompt 最佳实践分析

用户指出 prompt 里有较多「不要」「必须」「绝不」这类措辞。这个判断是对的：官方最佳实践并不是完全禁止负向或强制词，但更推荐用正向、具体、可执行的规则描述目标行为。

参考资料：

- OpenAI Help Center: [Best practices for prompt engineering with the OpenAI API](https://help.openai.com/en/articles/6654000-how-to-improve-your-prompts)
- Anthropic Claude Docs: [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)

OpenAI 的建议重点是：与其只说不要做什么，不如说明应该做什么。Anthropic 的建议也相近：正向示例和正向行为描述通常比负向示例或禁止式指令更有效。

### 对本项目的影响

当前 Agent prompt 里出现大量「不要」「必须」「绝不」会带来几个风险：

- 模型可能过度字面化执行某条局部限制，忽略用户真实意图。
- 多条强制规则互相覆盖时，模型更难判断优先级。
- 负向描述只告诉模型避开什么，却没有稳定给出替代动作。
- 越来越多的补丁式禁令会让 prompt 难维护，也难定位是哪条规则影响了工具参数。

这次 `tier = luxury` 的问题就是典型例子：与其反复写「不要把奢华泛称当作 luxury」，更稳定的写法是给出正向路由规则。

### 推荐写法

#### 不推荐

```text
不要把停靠新加坡当成新加坡出发。
不要在用户说奢华游轮时一定使用 luxury。
必须使用日期过滤。
```

#### 推荐

```text
参数路由规则：

当用户说「停靠/经停/途经/包含/靠港/到访 + 港口」时：
- 将港口写入 itineraryIncludes。

当用户说「从/出发/上船/母港 + 港口」时：
- 将港口写入 departurePort。

当用户给出具体日期或日期范围时：
- 将最早出发日期写入 sailDateFrom。
- 将最晚出发日期写入 sailDateTo。

当用户只用「豪华/奢华游轮」泛称高品质航线时：
- tier 留空，或使用 ["premium", "luxury"]。

当用户明确限定「只看高奢品牌/luxury tier/Silversea/Regent/Explora」时：
- 使用 tier = "luxury"。
```

### 更稳的系统设计

Prompt 应该负责表达业务语义，但不能作为唯一防线。建议分层处理：

1. Intent parser 提取硬约束。
2. Tool schema 描述字段适用场景。
3. Tool wrapper 在执行前归一化和纠偏参数。
4. Trace 保存 effective input，方便复盘。
5. Regression eval 覆盖典型中文查询。

这样即使模型某次仍然输出了偏窄参数，执行层也能把明显的误杀纠正回来。

## 验证

已执行：

```bash
npm run lint
npx tsc --noEmit
python -m pytest tests/test_web_i18n_api.py
python -m ruff check src/web/app.py tests/test_web_i18n_api.py
```

结果：

- `cruise_agent` lint 通过。
- `cruise_agent` TypeScript 编译检查通过。
- `curise_crawler` API 测试通过。
- `curise_crawler` ruff 检查通过。

数据侧手工验证显示，在 `2026-05-27` 到 `2026-06-03`、Singapore、`premium/luxury` 条件下可以查到 Disney Adventure 相关航次。

## 运行注意事项

1. 代码修复需要重启或重新部署 `cruise_agent` 服务后生效。
2. 数据库 active prompt version 3 已热更新，当前本地数据库会立即使用新 prompt。
3. 由于 `agent_runs` 对聊天 `eBjNGCAnarGDdxYh` 没有记录，后续需要单独检查 trace 写入链路。
4. 回放问题时不要只看模型原始 tool input，应优先看 effective input 和 `appliedFilters`。

## 后续建议

1. 将 active prompt 从补丁式禁令改成「参数路由表 + few-shot examples」结构。
2. 增加 Agent regression eval：
   - 停靠新加坡，5月27号到6月3号之间
   - 从新加坡出发，5月27号到6月3号之间
   - 经停雅典的豪华游轮
   - 只看 Silversea/Regent 这类高奢品牌
3. 修复 `agent_runs` 缺失问题，让 run trace 和 message tool parts 能互相对齐。
4. 把 prompt 版本、tool effective input、数据库 applied filters 一起展示在调试页面，减少下次排查成本。
