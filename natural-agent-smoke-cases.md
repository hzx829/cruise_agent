# 自然 Agent Smoke Cases

> 目标：每次改 prompt、工具描述或工具返回结构后，用这些用例人工回归“用户问什么，先答什么；源没覆盖，不偷换问题”。

| # | 用例 | 期望行为 | 失败信号 |
|---|------|----------|----------|
| 1 | 天津港有船吗？ | 先按天津港查直连价格源；0 条时说明已接入源暂未收录，再用 webSearch 查天津港/港口/船司公开信息 | 直接推荐上海，或说“天津没有船” |
| 2 | 天津港暑假最便宜的船 | 保留天津港和暑假日期；直连源无报价时不编价格，网络班期只标为参考 | 把网络 snippet 当实时价格 |
| 3 | 不要上海，只看天津港 | 严格围绕天津港；不输出上海备选 | 出现上海推荐或上海价格 |
| 4 | 上海也可以，天津优先 | 先答天津港精确结果/覆盖缺口，再把上海放在“放宽条件后的备选” | 上海结果盖过天津问题 |
| 5 | 天津港皇家加勒比有吗 | 同时保留港口和品牌；直连源无结果后查官方/网络公开信息 | 只按皇家加勒比查，不管天津港 |
| 6 | MSC 中国母港有哪些 | 可用直连价格源 + webSearch；回答中国母港市场，不局限于已接入价格源 | 只列数据库里存在的港口且不说明覆盖限制 |
| 7 | 雅典往返，不要开口 | searchDeals 使用 roundtrip=true；不能用开口航线替代 | 输出雅典到拉文纳等开口航线 |
| 8 | 经停圣托里尼 | 使用 itineraryIncludes 硬筛；无结果时说明精确条件无匹配 | 用目的地包含希腊替代经停条件 |
| 9 | 皇家和 MSC 餐饮哪个好 | 走 webSearch/cruiseEncyclopedia，按评测和船上体验答 | 调价格工具后只比价格 |
| 10 | 这条 deal 值得买吗 | 先查价格/历史，再补船只、目的地或口碑网络信息，并分来源 | 混淆直连价格和网络评价 |
| 11 | 不要联网，只看你接入的价格源 | 只用直连价格源，并明确覆盖限制 | 调 webSearch 或引用网络来源 |
| 12 | 帮我查网络上天津港最新邮轮信息 | 必须 webSearch，优先 official_schedule/official_first，并给来源链接/域名 | 只查直连价格源或不给来源 |

## 评估维度

- Constraint fidelity：港口、品牌、日期、往返、经停、排除条件是否被保留。
- Source honesty：是否区分直连价格源、网络公开信息、备选推测。
- Search fallback：直连价格源 0 条或覆盖不足时，是否按原约束查 web。
- Alternative labeling：放宽条件结果是否单独标成“放宽条件后的备选”。
- Citation quality：网络信息是否提供来源域名/链接，并避免把网络内容说成官网实时数据。

## Trace Eval

跑完这些用例后，可以用下面的脚本检查最近一次真实 run 的 intent、工具调用、关键 tool input 和部分回答禁用词：

```bash
npm run eval:natural-agent
```

本地数据库还没有完整跑过用例时，可先用允许缺失模式确认脚本本身可执行：

```bash
npm run eval:natural-agent -- --allow-missing
```

## Active Smoke Run

The smoke cases now live in `scripts/natural-agent-smoke-cases.mjs`.

To actively generate fresh traces against a running local app, start the app first and run:

```bash
npm run smoke:natural-agent -- --base-url http://localhost:3000
```

Useful variants:

```bash
npm run smoke:natural-agent -- --case=1,2,5
npm run eval:natural-agent -- --since-run-start=2026-05-24T00:00:00.000Z
npm run trace:inspect -- --since=24h --format markdown
```
