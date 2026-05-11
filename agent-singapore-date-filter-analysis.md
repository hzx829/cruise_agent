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

但 Agent 曾回复没有找到符合条件的航线。进一步检查聊天 `OvvFBO7UGXB1dWV6` 后发现：

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
- 将默认 prompt 模板从补丁式禁令重构为 `cruise-agent-routing-v3-grouped`：用产品口径、工具与上下文、结果处理、少量 golden examples 四个高层分组表达业务语义。

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

用户指出 prompt 里有较多「不要」「必须」「绝不」这类措辞。这个判断是对的：官方最佳实践并不是完全禁止约束词，而是更推荐用清楚、具体、正向、可测试的说明来表达目标行为。

参考资料：

- OpenAI Help Center: [Best practices for prompt engineering with the OpenAI API](https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-openai-api)
- OpenAI API Docs: [Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices)
- Anthropic Claude Docs: [Prompt engineering overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview)
- Anthropic Claude Docs: [Claude prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)

这些建议对本项目的启发：

- OpenAI 建议把指令放在清晰位置，用分隔结构组织上下文，并且把模糊描述改成具体、可执行的目标。
- OpenAI reasoning 指南强调模型更适合简洁直接的提示，用标题、Markdown 或 XML 这类分隔符表达结构，而不是把大量人工推理步骤写进 prompt。
- Anthropic 建议先定义成功标准和 eval；格式和行为控制上，优先告诉模型要做什么，而不是堆叠禁止项。
- Anthropic 也提醒，不是所有失败都应靠 prompt 修；延迟、成本、结构化约束、工具选择和执行层纠偏，很多时候更适合在系统设计里处理。

### 本项目的 prompt 原则

新的原则是「prompt 表达业务语义，代码保证结构化可靠性」：

1. Prompt 保留角色、数据源边界、工具路由、参数路由和少量典型示例。
2. Prompt 使用正向规则，例如“停靠港写入 itineraryIncludes”“奢华泛称覆盖 premium/luxury”。
3. Prompt 中的例子写成「用户问题 → 工具入参重点 → 回答策略」，减少「正确/错误做法」对照。
4. 明确约束词只用于真正高风险语义，例如用户排除条件、价格源覆盖边界、dealId 原样复用。
5. 日期解析、港口别名、奢华泛称归一、trace/eval 交给代码和测试兜底。

### 实施后的结构

`DEFAULT_SYSTEM_PROMPT_TEMPLATE` 已改为 `cruise-agent-routing-v3-grouped`：

- 模板长度从约 6300 字符降到约 3000 字符。
- 删除大段工具清单、重复交互规则和「正确做法/错误做法」补丁。
- 保留四个产品友好的高层分组：产品口径、工具与上下文、结果处理、示例。
- `currentDate` 和品牌覆盖信息归入「工具与上下文」，避免产品口径段落混入太多运行时细节。
- 保留 5 个高价值示例：新加坡停靠、新加坡出发、strict luxury、高风险天津港、雅典往返。
- 通过 `prompt_profile` 版本标记，让旧 active prompt 可以被自动识别为过期模板。

### 更稳的系统设计

Prompt 不作为唯一防线，链路按层处理：

1. Intent parser 提取明确约束。
2. Tool schema 描述字段适用场景。
3. Tool wrapper 在执行前归一化和纠偏参数。
4. Search 层用港口别名和 structured route stops 做匹配。
5. Trace 保存 effective input，方便复盘。
6. Regression eval 覆盖典型中文查询。

这样即使模型某次仍然输出偏窄参数，执行层也能纠正明显误杀；同时 prompt 更短、更清楚，也更接近 OpenAI 和 Anthropic 的推荐方式。

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

Prompt 优化后验证：

- active prompt 已更新到 version 6。
- active prompt 带有 `prompt_profile: cruise-agent-routing-v3-grouped` 标记。
- active prompt 长度约 3028 字符，较 version 4 约 6489 字符明显缩短。
- active prompt 现在是 4 个 `##` 高层分组。
- active prompt 中 `必须` 为 0 次，`不能` 为 0 次；`不要` 仅保留在用户排除条件示例中。

## 运行注意事项

1. 代码修复需要重启或重新部署 `cruise_agent` 服务后生效。
2. 数据库 active prompt version 6 已热更新，当前本地数据库会使用 `cruise-agent-routing-v3-grouped` prompt。
3. 由于 `agent_runs` 对聊天 `OvvFBO7UGXB1dWV6` 没有记录，后续需要单独检查 trace 写入链路。
4. 回放问题时不要只看模型原始 tool input，应优先看 effective input 和 `appliedFilters`。

## 后续建议

1. 增加 Agent regression eval：
   - 停靠新加坡，5月27号到6月3号之间
   - 从新加坡出发，5月27号到6月3号之间
   - 经停雅典的豪华游轮
   - 只看 Silversea/Regent 这类高奢品牌
2. 修复 `agent_runs` 缺失问题，让 run trace 和 message tool parts 能互相对齐。
3. 把 prompt 版本、tool effective input、数据库 applied filters 一起展示在调试页面，减少下次排查成本。
4. 定期用实际失败样本回测 prompt，不再用追加禁令的方式修单点问题。
