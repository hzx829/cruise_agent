# Billing Launch Plan

目标：用户在网站登录后，通过支付宝扫码支付购买额度，并用额度完成 AI 对话闭环。

## 当前基础

- 已有自托管 `users`、`auth_sessions`、`auth_identities`。
- 已有微信扫码登录。
- `/chat` 和 `/api/chat` 已要求真实登录用户。
- 已有 `ADMIN_TOKEN` 保护的 admin 页面基础。
- 缺少订单、支付事件、额度流水、购买页和支付排障页。

## 决策

当前卖额度包，不接自动续费。

原因：

- 支付宝回调、退款、过期、对账都更简单。
- 与 AI 成本更直接相关。
- 不需要先做自动续费、取消订阅。

第一版继续使用 `agent.db`。上线前必须保证 `/data/agent.db` 有异地备份；等真实付费用户稳定后，再迁到 Postgres。

## 定价逻辑

外部锚点按 2026-07-02 可见公开信息取样：

- [Kimi 会员](https://www.kimi.com/zh-cn/help/membership/membership-pricing) 是月费 + 额度池，主力档在 ¥49 / ¥99 / ¥199 / ¥699。
- [Kimi 会员权益](https://www.kimi.com/zh-cn/help/membership/membership-overview) 把高成本 Agent 能力放进额度池，普通 Chat 不消耗额度。
- [豆包付费服务协议](https://www.doubao.com/legal/ey01) 体现的是期限权益 + 可自动续费，用户可查询付费权益和余量。
- [Z.AI API Pricing](https://docs.z.ai/guides/overview/pricing) 和 [阿里云百炼计费](https://help.aliyun.com/zh/model-studio/model-pricing) 都是按输入/输出 Token 或调用成本计费；产品侧不适合把这种复杂度直接暴露给用户。

本产品不卖“无限用会员”，而卖额度包：

- 邮轮问答通常会连续追问、比价、改条件，50/200 次太少，会让用户不敢用。
- 每次完整 AI 回复按点数扣费，比直接向用户展示 Token 计费更容易理解。
- 额度约束能覆盖模型、搜索工具、价格分析和未来高成本能力，避免无限用带来的成本失控。
- 当前先不做自动续费，降低支付宝签约、取消、续费失败、退款和到期任务复杂度。

但“额度”不能长期等同于“消息次数”。本产品的 Agent 有两类成本：

- 私有数据库工具：`searchDeals`、`getTopPriceDrops`、`getPriceHistory` 等，边际查询成本很低，主要消耗模型输入/输出 token。
- 网络工具：`webSearch`、`cruiseEncyclopedia`，会额外消耗 Tavily API credit；当前代码默认 `fast` 搜索，未开启 `advanced`，通常 1 次搜索约 1 credit。

成本公式：

```text
单次成本 =
  模型输入 token / 1_000_000 * 模型输入单价
+ 模型输出 token / 1_000_000 * 模型输出单价
+ web_search_calls * Tavily 单次成本
+ 基础设施和支付通道摊销
```

当前 `.env.local` 使用 `zhipu/glm-5`。按 Z.AI 公开价格，GLM-5 为 input $1 / 1M tokens、output $3.2 / 1M tokens；Tavily pay-as-you-go 为 $0.008 / credit，basic/fast/ultra-fast search 为 1 credit，advanced 为 2 credits。

本地 trace 目前只有 3 条 completed run 有完整 token 数据，样本不足，但能说明方向：

| 样本 | intent | 工具 | prompt tokens | completion tokens | total tokens |
| --- | --- | --- | ---: | ---: | ---: |
| p50 | price_quote | 私有库 1 次 | 15,734 | 1,883 | 17,617 |
| avg | price_quote | 私有库 1 次 | 15,314 | 1,768 | 17,082 |
| max | price_quote | 私有库 1 次 | 15,734 | 2,267 | 18,001 |

按 `glm-5` 估算，纯私有库报价 run 的模型成本约 $0.021，也就是约 ¥0.14-0.15/次（按 1 USD ≈ 6.8 CNY 粗算）。这意味着如果仍然“一次完整回复扣 1 点额度”，会明显低估成本。

因此计费改成“额度点数 + 加权扣点”：

- 私有库报价/分析：典型扣 12 点。
- 私有库 + 1 次 `webSearch` / `cruiseEncyclopedia`：典型扣 17 点。
- 市场供给、评测、对比类如果触发 2 次网络搜索：典型扣 22 点。
- 长输出会按实际 output tokens 增加扣点；当前不设置额外高阶研究档。

这样用户看到的是可用额度点数，而不是“保证能完整跑 N 次 `glm-5` agent”。产品页面不再把额度写成“次数”。

旧价格的问题：

| 旧包 | 价格 | 额度 | 单次价格 |
| --- | ---: | ---: | ---: |
| 体验包 | ¥19 | 50 | ¥0.380 |
| 标准包 | ¥49 | 200 | ¥0.245 |

当前价格：

| 额度包 | 价格 | 额度点数 | 点数单价 | 适合场景 |
| --- | ---: | ---: | ---: | --- |
| 轻量额度包 | ¥29 | 600 | ¥0.048 | 偶尔查价、保存方案 |
| 标准额度包 | ¥89 | 3000 | ¥0.030 | 持续比价、跟进降价 |
| 专业额度包 | ¥199 | 8000 | ¥0.025 | 高频选品、多目的地对比 |

折算为当前 `glm-5` agent 的大致可用量：

| 额度包 | 私有库报价，约 12 点/次 | 含 1 次网络搜索，约 17 点/次 | 含 2 次网络搜索，约 22 点/次 |
| --- | ---: | ---: | ---: |
| 轻量额度包 | 50 次 | 35 次 | 27 次 |
| 标准额度包 | 250 次 | 176 次 | 136 次 |
| 专业额度包 | 666 次 | 470 次 | 363 次 |

价格判断：

- 轻量档压低门槛，低于 Kimi 主付费入门价，适合个人用户先付费验证。
- 标准档接近国内主流 AI 入门月费区间，但给到足够大的 3000 点额度，作为默认推荐档。
- 专业档对齐 ¥199 级别的专业订阅，单点成本最低，服务高频运营场景。
- 三档之间保持明显额度梯度，避免用户只因为差几块钱纠结。

实现边界：

- 当前“额度包”语义是一次性购买额度，支付成功立即发放；用完可以再次购买。
- 当前版本不做自动续费，也不强制月末清零。
- 当前代码按 completed run 的实际 token 和 web search credit 估算扣点，最低 8 点，最高 60 点。
- 如果后续要严格实现自然月/订阅周期，需要在订单或权益表补 `period_start`、`period_end`、到期扣减或重置任务。

## 数据

新增四类表：

- `billing_plans`：可售额度包。
- `billing_orders`：本地订单和支付宝交易号。
- `payment_events`：支付宝通知、查询、手工事件。
- `credit_ledger`：额度加减流水。

余额从 `credit_ledger` 汇总。额度包支付成功加额度；一次成功 agent run 按实际 token 和网络搜索成本扣点。

## 用户流程

1. 未登录用户进入登录页，使用现有微信扫码登录。
2. 用户进入 `/billing` 查看余额和套餐。
3. 选择套餐后创建订单。
4. 跳转支付宝收银台扫码支付。
5. 支付宝异步通知 `/api/billing/alipay/notify`。
6. 后端验签、验金额、验订单、幂等发额度。
7. `/billing/return` 轮询订单状态。
8. `/api/chat` 在调用模型前检查额度，不足返回 402。

## 接口

- `GET /api/billing/me`
- `POST /api/billing/orders`
- `GET /api/billing/orders/[id]`
- `GET /api/billing/alipay/page-pay?orderId=...`
- `POST /api/billing/alipay/notify`
- `POST /api/cron/payments/reconcile`
- `GET /api/admin/billing`
- `POST /api/admin/billing/credits`

## 支付规则

- 只信支付宝异步通知和主动查询。
- `return_url` 只用于展示，不发额度。
- 回调必须验签。
- 必须校验 `app_id`、`seller_id`、`out_trade_no`、`total_amount`。
- 只在 `TRADE_SUCCESS` / `TRADE_FINISHED` 发额度。
- 重复通知必须幂等。
- 支付事件原样入库，敏感信息脱敏。

## 环境变量

```env
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_ALIPAY_PUBLIC_KEY=
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do
ALIPAY_SELLER_ID=
ALIPAY_NOTIFY_URL=https://www.cruiseswift.com/api/billing/alipay/notify
ALIPAY_RETURN_URL=https://www.cruiseswift.com/billing/return

CHAT_BILLING_ENABLED=true
CRON_SECRET=
ROOT_USER_IDS=
```

## 上线检查

- 支付宝沙箱和正式环境各跑一单。
- 重复 notify 不重复发额度。
- 金额篡改不发额度。
- 未支付订单不发额度。
- 没有额度时 `/api/chat` 返回购买入口。
- 支付成功后余额立即可用。
- admin 能查订单、事件、余额，能手工补额度。
