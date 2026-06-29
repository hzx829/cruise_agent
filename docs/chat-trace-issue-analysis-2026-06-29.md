# Chat Trace Issue Analysis - 2026-06-29

## Scope

排查这 3 个线上 chat：

- `M3M0Xpzn4mX4Fajg`
- `GCyLNV9QLPRMf3Kj`
- `oIi01Vo4VpiHqKQR`

证据来自线上服务器 `/data/agent.db` 和 PM2 日志。注意：本地 `data/agent.db` 里没有这 3 个 chat，不能用本地库判断。

## Summary

这不是单个工具慢或某条航线没数据，而是 agent stream 收尾与坏历史消息共同导致的问题：

1. `finish_reason=length` 或 `finish_reason=tool-calls` 时，服务端仍把 run 记成 `completed`，于是保存了只有工具过程、没有最终正文的 assistant 消息。
2. 中间 step 的工具参数校验失败触发 `onError` 后，会立刻保存“生成中断”fallback；但同一个 run 后面可能继续完成，造成一轮里同时出现失败 fallback 和正常回复。
3. malformed tool part 被保存进历史消息，例如 `tool-searchDeals');?></function>`。下一轮加载历史时 AI SDK 校验失败，run 创建后就卡在 `running`，没有 steps。
4. 对比“新加坡 vs 加勒比”时，intent hard constraints 把 `Singapore` 约束套到加勒比查询上，导致 `destination=Caribbean + departurePort=Singapore + itineraryIncludes=Singapore`，搜索结果自然为 0。

## Per Chat Findings

### `M3M0Xpzn4mX4Fajg`

第一轮正常：

- run `87g6N7OC4ZqwCq5z`
- `finish_reason=stop`
- `status=completed`
- assistant 正文约 807 字

第二轮有中间错误痕迹：

- run `Ax05DiSx7CY5oOtp`
- PM2 日志里有工具参数校验失败：`limit: "20"` 字符串数字
- DB 里先保存了一条“这次生成中断了...”fallback
- 随后同一个用户问题又保存了正常对比答案

第三轮是不完整完成：

- run `wtOTqMhCB0Sfm9fz`
- `finish_reason=length`
- `status=completed`
- assistant text len 只有 23/34 左右，只剩“我来帮您生成一篇...”这类开头
- 没有最终推文正文

### `GCyLNV9QLPRMf3Kj`

关键 run：

- run `GytOBAKCQ37PrdLO`
- 多次工具参数校验失败：
  - `webSearch.maxResults` 被模型传成 `"5"`
  - `searchDeals.limit` 被模型传成 `"15"`
  - `searchDeals.itineraryIncludes` 被传成 `"Caribbean"` 或字符串化数组
- 最终 `finish_reason=tool-calls`，但 run 仍被记为 `completed`
- assistant 里保存了 malformed tool part：`tool-searchDeals');?></function>`

后续 run：

- run `nV173NGGToqOFzEK`
- `status=running`
- 0 steps
- PM2 报：`No tool schema found for tool part searchDeals');?></function>`

说明坏历史消息已经污染后续请求。

### `oIi01Vo4VpiHqKQR`

首轮：

- run `Ee3Np8ghzi2qgXLn`
- `finish_reason=tool-calls`
- `status=completed`
- assistant 正文只有工具前言，没有最终对比结论
- 保存了 malformed tool part

后续 3 个 run：

- `cSmwImahYPZfY1JV`
- `9ksUDWLofagvPjzb`
- `T1OZ1Xe59jeqeRwj`

都停在：

- `status=running`
- `ended_at=null`
- `tool_step_count=0`
- 没有 step/timing

原因同上：加载历史时 malformed tool part 触发 AI SDK 校验失败，stream 没真正进入 agent loop。

## Code Paths

### `app/api/chat/route.ts`

问题点：

- `onError` 里立即 `saveMessages()` fallback。中间 step 错误也会走这里，因此 fallback 会过早落库。
- `onFinish` 只根据 `isAborted` 和 `malformedToolArtifactCount` 决定 run 状态。
- `finishReason=length`、`finishReason=tool-calls` 没被视为不完整。
- `assistantTextLen > 0` 就扣费，但这次 trace 里 20 多字的工具前言也满足条件。

### `lib/ai/message-content.ts`

问题点：

- malformed 检测主要看 text 里的伪工具调用。
- 未知 `tool-*` part type 没有统一过滤。
- 保存进 DB 后，下一轮作为历史消息传回 AI SDK，会因为找不到 tool schema 直接失败。

### `lib/ai/agent.ts`

问题点：

- `stopWhen: stepCountIs(6)` 到上限时，如果最后一步仍是 `tool-calls`，当前保存逻辑会把它当完成。
- `applyHardConstraintsToSearchDealsInput()` 会把 hard constraints 合并到所有 `searchDeals` 调用。
- 对比类问题里，`Singapore` 约束会污染 `Caribbean` 分支查询。

### Tool schemas

问题点：

- `limit`、`maxResults` 只接受 number，不接受模型常见的字符串数字。
- `itineraryIncludes` 只接受 string array，不接受单个 string 或字符串化 JSON array。

## Fix Plan

优先级从高到低：

1. 保存前过滤未知 `tool-*` part，历史加载时也兜底过滤，避免坏历史拖死后续请求。
2. `onFinish` 中把 `finishReason=length` / `tool-calls` 且正文不足的 run 标为 `error` 或 `aborted`，保存明确 fallback，不再记 `completed`。
3. `onError` 不直接落库 fallback，至少延迟到最终 `onFinish` 决定是否真的失败。
4. 工具 schema 增加宽容预处理：
   - `z.coerce.number()` for `limit` / `maxResults`
   - string 或 JSON string -> array for `itineraryIncludes`
5. hard constraints 改成只对同一查询维度生效。比较问题里，不要把新加坡约束套到加勒比分支。
6. 对历史脏数据做一次性清理：
   - malformed assistant message 删除或替换成安全 fallback
   - 老的 `running` run 按超时标记为 `error`

## Data Cleanup Candidates

建议清理这些线上记录：

- `GCyLNV9QLPRMf3Kj`
  - malformed assistant message: `msg-57kvczAavFsdgBhd`
  - stuck run: `nV173NGGToqOFzEK`
- `oIi01Vo4VpiHqKQR`
  - malformed assistant message: `msg-kysrWONaN5beOTLG`
  - stuck runs: `cSmwImahYPZfY1JV`, `9ksUDWLofagvPjzb`, `T1OZ1Xe59jeqeRwj`
- `M3M0Xpzn4mX4Fajg`
  - incomplete assistant message: `msg-aIZjHbAzuewN54Iz`
  - misleading fallback message: `msg-9KUdra7WDl6b3ztE`

清理前先备份 `/data/agent.db`。
