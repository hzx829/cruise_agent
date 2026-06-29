# Billing Launch Plan

目标：用户在网站登录后，通过支付宝扫码支付购买额度，并用额度完成 AI 对话闭环。

## 当前基础

- 已有自托管 `users`、`auth_sessions`、`auth_identities`。
- 已有微信扫码登录。
- `/chat` 和 `/api/chat` 已要求真实登录用户。
- 已有 `ADMIN_TOKEN` 保护的 admin 页面基础。
- 缺少订单、支付事件、额度流水、购买页和支付排障页。

## 决策

第一版卖额度包，不做订阅。

原因：

- 支付宝回调、退款、过期、对账都更简单。
- 与 AI 成本更直接相关。
- 不需要先做会员等级、自动续费、取消订阅。

第一版继续使用 `agent.db`。上线前必须保证 `/data/agent.db` 有异地备份；等真实付费用户稳定后，再迁到 Postgres。

## 数据

新增四类表：

- `billing_plans`：可售额度包。
- `billing_orders`：本地订单和支付宝交易号。
- `payment_events`：支付宝通知、查询、手工事件。
- `credit_ledger`：额度加减流水。

余额从 `credit_ledger` 汇总。支付成功加额度；一次成功 agent run 扣 1。

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

CRON_SECRET=
```

## 上线检查

- 支付宝沙箱和正式环境各跑一单。
- 重复 notify 不重复发额度。
- 金额篡改不发额度。
- 未支付订单不发额度。
- 没有额度时 `/api/chat` 返回购买入口。
- 支付成功后余额立即可用。
- admin 能查订单、事件、余额，能手工补额度。
