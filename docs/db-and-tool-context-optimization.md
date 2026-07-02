# DB 与 Tool Context 优化

目标：先保证 agent 回答质量，再做可量化、可回滚的成本优化。当前决策是不做启发式省 token，宁愿多给上下文。

## 原则

- 不用正则或模糊关键词猜测“这轮是否需要旧 tool 结果”。
- 不用摘要替代价格、日期、港口、船名、币种、URL、coverage、source、confidence 等事实字段。
- 不默认裁剪长尾数据；只有工具参数显式传入 `limit` 时才截断。
- 可以做确定性结构整理，但不能让 agent 失去校验、追问、对比所需的信息。
- 真要省 token，先加 trace 统计并做问答 eval，再决定裁剪点。

## 本地数据规模

| 数据 | 规模 |
| --- | ---: |
| `deals` | 37,056 |
| `price_history` | 1,884,256 |
| `agent_runs` | 12 |
| `messages` | 238 |

## DB 优化

这些优化不改变 agent prompt，优先级高。

### 1. `price_history` 索引

`getRecentPriceChanges` 当前会扫 `price_history` 并临时排序，本地 p50 约 3.65s。

```sql
CREATE INDEX IF NOT EXISTS ix_price_history_recorded_at
ON price_history(recorded_at DESC);

CREATE INDEX IF NOT EXISTS ix_price_history_deal_recorded
ON price_history(deal_id, recorded_at);
```

第二个索引也能让 `getPriceHistory(dealId)` 避免按 `deal_id` 查完后再临时排序。

### 2. 扣点事务原子化

现在是 chat 开始前查余额，完成后插入负流水。并发请求可能同时通过前置检查，最后把余额打成负数。

建议新增 `tryChargeChatCredit`：

- 同一个 SQLite transaction 内读取余额并插入流水。
- 如果允许小额负数，要写成明确产品策略。
- 如果不允许负数，扣费失败要标记 run 的 billing 状态，避免“已回答但没扣款”无痕发生。

### 3. 去掉 `ORDER BY datetime(created_at)`

`created_at` 是 ISO 字符串，直接 `ORDER BY created_at DESC` 能走索引。包一层 `datetime()` 会触发临时排序。

涉及 billing orders / ledger / events / reconcile，以及 agent traces 列表。

### 4. `searchDeals` 的 coverage count 轻量化

`searchDealsCore` 当前会拉候选 deal、补 route/perks、JS 过滤排序，再取 limit。宽查询还能接受，但 coverage 的 relaxed count 没必要走完整 hydrate。

建议拆成：

- `countDealsForCoverage` 只走轻量 count。
- 只有最终返回给 agent 的结果才 attach route/perks。

## Tool 分层

信息分层不是把数据藏起来，也不是让模型只能看到摘要。正确形态是 tool 有不同信息颗粒度，但模型始终有路径拿到全量数据。

| 层 | Tool 形态 | 模型是否可拿到 | 内容 |
| --- | --- | --- | --- |
| `discovery` | `searchDeals` / `getTopPriceDrops` | 是 | 候选列表、价格、日期、coverage、核心路线事实 |
| `detail` | `getDealDetails(detailLevel="standard")` | 是 | 单个 deal 的完整结构化字段、route、perks、source |
| `full` | `getDealDetails(detailLevel="full")` | 是 | detail + `raw_data` |
| `history` | `getPriceHistory` | 是 | 完整价格历史 + summary |
| `runtime` | 非 tool | 否 | user、intent、budget、correlation state |
| `trace` | 非 tool | 否 | 原始 tool input/output、bytes、估算 tokens、耗时 |

如果以后要减少默认 prompt，可以把 discovery 层做得更紧，但必须保留 detail/full tool，并在工具描述里明确“需要核验、追问、写文案、解释原因时按 dealId 拉详情”。

## 已实施

- 历史上下文不再用启发式追问识别；最近 4 条 assistant 的 tool parts 按固定窗口保留。
- 新增 `getDealDetails` 作为详情层工具；`standard` 返回完整结构化字段，`full` 额外返回 `raw_data`。
- `searchDeals` / `getTopPriceDrops` 保留 raw/display、route source/confidence/completeness、perksRaw、URL 等字段。
- `compareCruises` 保留原始字段和 URL，避免对比时比检索结果少上下文。
- `getPriceHistory` 默认返回完整历史，同时保留 summary。
- `listDestinations` 支持 `query` / `limit`；不传 `limit` 时不截断。
- `webSearch` 默认 4 条、最多 8 条、snippet 320 字符，并保留 `sources` / `results` 兼容字段。
- `cruiseEncyclopedia` 保留 320 字符 snippet、专家域名列表和 disclaimer。

## 不做

- 不做“用户像是在追问才保留 tool result”的正则判断。
- 不做“默认只给最近 6 个价格点”的历史裁剪。
- 不做“默认只给热门 15 个目的地”的列表裁剪。
- 不做为了省 token 的低成本模型路由。
- 不假设有 deep research 功能。

## 下一步

1. 给 trace 增加每次 tool result 的 `bytes` 和估算 tokens。
2. 做 10-20 条固定问答 eval，记录是否引用错价格、日期、港口、来源。
3. 只对 eval 证明无损的字段做裁剪，并保留一键回滚。
4. 先落 DB 索引和扣点事务优化。
