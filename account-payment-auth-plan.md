# cruise_agent 账号系统与支付接入方案

日期：2026-05-24

## 结论

`cruise_agent` 现在是 Next.js 16 App Router 应用：邮轮数据读 `cruise_deals.db`，聊天、通知、prompt、agent trace 写入 `agent.db`。当前没有用户维度，聊天历史、通知、删除接口都是全局共享。接支付宝网页支付前，必须先补上用户归属、会话鉴权、订单状态机和支付回调验签。

推荐路线：

1. 账号层采用“自托管账号系统”，不要再上 Authing 这类完整 IAM。
2. 登录框架优先用 Better Auth，而不是完全手写会话逻辑。它支持 `better-sqlite3`、PostgreSQL、匿名用户、通用 OAuth，能覆盖当前栈和微信扫码登录的自定义 OAuth 需求。
3. 生产收费前，把可写业务库从 SQLite 迁到 PostgreSQL。开发/MVP 可先接入现有 `agent.db`，但真实付费订单、权益、支付事件建议放 PostgreSQL，并配置备份、审计和迁移脚本。
4. Supabase 可以作为“托管 Postgres + Auth”的通用 SaaS 选择，但不是本项目第一推荐。原因是 Supabase Auth 当前内置社交登录列表不含微信；微信要走自定义 OAuth，而本项目部署在国内服务器、支付也面向支付宝，核心链路放国内 RDS/自托管 Postgres 更稳。
5. 支付宝用官方/主流 Node OpenAPI SDK 接 `alipay.trade.page.pay`。支付成功只信异步 `notify_url`，`return_url` 只做展示；回调必须验签、校验 app_id/seller_id/金额/订单号，并做幂等更新。

## 方案比较

| 方案 | 优点 | 问题 | 结论 |
| --- | --- | --- | --- |
| Authing | 微信登录开箱即用、管理台完整 | 对当前需求偏重；用户数据和登录流程被外部平台托管；后续支付权益仍要自建 | 不推荐继续用 |
| Supabase Auth + Supabase Postgres | Next.js SSR 文档成熟；JWT + Postgres/RLS 一体化；邮箱、OTP、常见 OAuth 省心 | 内置社交 provider 不含微信；微信仍要自定义 OAuth；国内访问和回调稳定性需实测；RLS 会改变当前后端读写模型 | 可作为备选，不作为首选 |
| Better Auth + 自有 DB | 保持账号数据在自己库里；支持 SQLite/Postgres；可用 Generic OAuth 接微信；比完全手写安全边界清晰 | 仍要写微信 profile 映射、业务权限、支付权益 | 推荐 |
| 完全自建 sessions + OAuth | 最轻、完全可控 | session 轮换、CSRF、账号绑定、登出全部设备、匿名迁移都要自己处理 | 只在登录需求极窄时考虑 |

## 推荐架构

```text
Browser
  |
  | HttpOnly Secure SameSite=Lax session cookie
  v
Next.js App Router
  |
  |-- Better Auth /api/auth/*
  |     |-- email/anonymous/session
  |     `-- WeChat Generic OAuth callback
  |
  |-- App APIs
  |     |-- /api/chat, /api/history, /api/notifications
  |     `-- requireUser() + owner_user_id filtering
  |
  |-- Billing APIs
  |     |-- create order
  |     |-- create Alipay page-pay form
  |     |-- Alipay notify webhook
  |     `-- reconcile/query job
  |
  |-- writable app DB: PostgreSQL before paid launch
  `-- read-only crawler DB: cruise_deals.db
```

保留 `cruise_deals.db` 作为只读搜索数据源，短期不必把爬虫数据库一起迁移。账号、聊天、通知、订单、支付事件、权益放在新的可写 app DB。为了减少一次性改动，开发阶段可以先把这些表加到 `agent.db`，但支付上线前应完成 PostgreSQL 迁移。

## 账号设计

核心实体：

```sql
users (
  id text primary key,
  display_name text,
  avatar_url text,
  email text unique,
  phone text unique,
  role text not null default 'user',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

auth_identities (
  id text primary key,
  user_id text not null references users(id),
  provider text not null,
  provider_user_id text not null,
  provider_union_id text,
  raw_profile_json jsonb,
  created_at timestamptz not null default now(),
  unique(provider, provider_user_id)
);
```

Better Auth 会生成它自己的 `user/session/account` 等表。上面的 `users/auth_identities` 可以二选一：

1. 若采用 Better Auth 原生表，则新增 `user_profiles` 承载业务字段，把微信 `openid/unionid` 放进账号/identity 记录或扩展字段。
2. 若想保持业务命名清晰，则用 Better Auth adapter 的 schema 配置或映射，把业务 profile 与 auth user 关联。

建议先走第一种，少改框架默认行为。业务代码只依赖一个 `getCurrentUser()`，不要到处直接读 Better Auth 表。

## 登录流程

### 匿名用户

首屏仍允许直接使用聊天，但创建一个匿名 session。这样可以：

- 新用户无感试用。
- 聊天历史先归属匿名用户。
- 用户扫码登录后，把匿名用户的聊天、通知、偏好迁移到正式用户。

需要明确免费额度，例如匿名用户每日 N 条消息、不能使用价格追踪通知、不能创建支付订单。

### 微信扫码登录

微信开放平台网站应用登录是 OAuth2 授权码模式。实现方式：

1. 前端点击“微信登录”。
2. 后端生成 `state`，写入短期 cookie/DB，跳转到微信二维码授权地址。
3. 用户扫码授权后，微信回调 `redirect_uri?code=...&state=...`。
4. 后端校验 `state`，用 `code` 换 `access_token/openid/unionid`。
5. 调用 userinfo 获取昵称、头像等基础资料。
6. 用 `unionid` 优先匹配已有账号；没有 unionid 时用当前网站应用的 `openid` 匹配。
7. 创建或更新用户，建立 session。
8. 如果当前有匿名用户，把匿名数据迁移到正式用户。

注意点：

- 网站应用和公众号/小程序的 `appid` 不同，PC 扫码用开放平台网站应用。
- `redirect_uri` 域名必须和微信开放平台配置一致。
- `state` 必须防 CSRF，并有过期时间。
- 不长期保存微信 access token，除非后续确实需要调用微信接口；如需保存，必须加密。

### 邮箱/手机号

第一阶段不建议做密码登录。国内用户更自然的是微信扫码，支付后也可用支付宝订单号/微信 identity 找回。后续需要补充账号找回时，再加邮箱 magic link 或短信登录。

## API 改造

需要把所有用户数据接口加上 `user_id` 过滤：

- `chats.owner_user_id`
- `messages` 通过 `chat_id` 间接归属用户
- `notifications.owner_user_id`
- `notification_config.owner_user_id`
- `agent_runs.user_id`

必须保护的接口：

- `POST /api/chat`：登录/匿名 session 必须存在；保存消息时写入 owner。
- `GET /api/history`：只返回当前用户 chats。
- `DELETE /api/chat/[id]`：只能删除自己的 chat。
- `GET/PATCH /api/notifications`：只读写当前用户通知。
- `/admin/*`：继续支持 `ADMIN_TOKEN`，后续可迁移为 `role = 'admin'`。

兼容迁移：

1. 新增 owner 字段允许 nullable。
2. 首次上线后，历史全局聊天可挂到一个 `legacy_user` 或仅管理员可见。
3. 新写入必须带 owner。
4. 稳定后把 owner 字段改为 not null。

## 支付宝网页支付设计

支付对象建议先定义为“权益包”或“订阅计划”，不要直接和聊天消息强绑定。

```sql
plans (
  id text primary key,
  name text not null,
  amount_cents integer not null,
  currency text not null default 'CNY',
  quota_messages integer,
  valid_days integer,
  active boolean not null default true
);

orders (
  id text primary key,
  user_id text not null references users(id),
  plan_id text not null references plans(id),
  out_trade_no text not null unique,
  amount_cents integer not null,
  currency text not null default 'CNY',
  status text not null,
  alipay_trade_no text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

payment_events (
  id text primary key,
  provider text not null,
  event_type text not null,
  out_trade_no text,
  provider_trade_no text,
  raw_json jsonb not null,
  signature_valid boolean not null,
  created_at timestamptz not null default now()
);

entitlements (
  id text primary key,
  user_id text not null references users(id),
  source_order_id text not null references orders(id),
  quota_messages integer,
  valid_from timestamptz not null,
  valid_until timestamptz,
  status text not null default 'active'
);
```

订单状态机：

```text
created -> paying -> paid -> fulfilled
        -> closed
        -> refunded / partially_refunded
```

接口：

- `POST /api/billing/orders`：登录用户创建订单，生成 `out_trade_no`，状态 `created`。
- `POST /api/billing/alipay/page-pay`：校验订单属于当前用户且金额未变，调用支付宝网页支付，返回自动提交表单或跳转 HTML。
- `POST /api/billing/alipay/notify`：支付宝异步通知，无需用户 session；验签、校验金额和商户信息，幂等更新订单，写 `payment_events`，发放权益，返回 `success`。
- `GET /billing/return`：同步返回页，只展示“正在确认/已确认”，必要时调用本方订单查询，不在这里发权益。
- `POST /api/cron/payments/reconcile`：定时查 `paying/created` 超时订单，调用支付宝交易查询补偿。

支付宝回调验收规则：

- 验证支付宝签名。
- 校验 `app_id` 是自己的应用。
- 校验 `seller_id` 或商户号。
- 用 `out_trade_no` 找本地订单。
- 校验 `total_amount` 与本地订单金额完全一致。
- 只在 `TRADE_SUCCESS` 或 `TRADE_FINISHED` 时置为 paid。
- 对同一 `out_trade_no` 重复通知必须幂等。
- `notify_url` 必须公网 HTTPS 可访问。
- 日志记录原始通知，但敏感字段脱敏。

## 环境变量

```env
APP_URL=https://www.cruiseswift.com
AUTH_SECRET=...

# App DB
APP_DATABASE_URL=postgres://...
# 开发阶段可临时使用
AGENT_DB_PATH=/data/agent.db

# WeChat Open Platform website app
WECHAT_APP_ID=...
WECHAT_APP_SECRET=...
WECHAT_REDIRECT_URI=https://www.cruiseswift.com/api/auth/callback/wechat

# Alipay
ALIPAY_APP_ID=...
ALIPAY_PRIVATE_KEY=...
ALIPAY_PUBLIC_KEY=...
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do
ALIPAY_NOTIFY_URL=https://www.cruiseswift.com/api/billing/alipay/notify
ALIPAY_RETURN_URL=https://www.cruiseswift.com/billing/return
ALIPAY_SELLER_ID=...
```

密钥不要进入 git。生产建议用证书模式或至少 RSA2，并限制服务器文件权限。

## 实施阶段

### Phase 0：基础准备

- 确认是否上 PostgreSQL。推荐阿里云 RDS PostgreSQL；如果仍用 SQLite，必须先做定时备份和恢复演练。
- 引入迁移机制，不再只依赖 `CREATE TABLE IF NOT EXISTS`。
- 新增 `getCurrentUser()` / `requireUser()` / `requireAdmin()` 统一入口。

### Phase 1：账号与 session

- 安装 Better Auth。
- 配置 SQLite 开发环境，预留 PostgreSQL 生产配置。
- 增加匿名 session。
- 增加登录/登出 UI，侧边栏 footer 显示用户头像和账户入口。
- 写入 `owner_user_id` 并保护聊天历史、删除、通知接口。

### Phase 2：微信扫码登录

- 在微信开放平台创建网站应用，配置授权回调域。
- 用 Generic OAuth 或自定义 route 接扫码登录。
- 完成 `openid/unionid` 账号绑定。
- 实现匿名用户数据迁移。
- 增加登录失败、取消授权、重复绑定的处理。

### Phase 3：付费订单

- 设计首个计划，例如 `pro_monthly` 或 `credit_pack_100`。
- 建表：plans/orders/payment_events/entitlements。
- 接支付宝沙箱网页支付。
- 实现 notify 验签和幂等发放权益。
- 加 reconciliation job。
- 后台页面查看订单和支付事件。

### Phase 4：上线前硬化

- PostgreSQL 迁移完成。
- 数据备份和恢复演练。
- 支付回调压测和重复通知测试。
- 全链路日志和告警。
- 订单金额、权益发放、退款/关闭订单人工处理流程。

## 风险与决策点

- 是否必须支持国内手机号登录：如果要做短信，成本、风控和实名合规会明显上升，建议晚于微信登录。
- Supabase 是否可用：如果未来要快速做管理后台、RLS、对象存储，可以单独评估；不要为了“流行”迁移核心登录。
- SQLite 是否能撑 MVP：技术上可以，但收费上线前不建议让订单和权益长期留在单机 SQLite。
- 微信 unionid 是否一定返回：取决于开放平台绑定情况。实现时必须兼容只有 openid 的情况。
- 支付模式：如果卖的是订阅，需额外设计续费、取消、到期任务；如果卖的是点数包，状态机更简单。

## 推荐任务清单

1. 决定生产 app DB：阿里云 RDS PostgreSQL 优先。
2. 引入 Better Auth，先开匿名 session。
3. 给 chats/notifications/agent_runs 加 owner 字段并改 API。
4. 接微信扫码登录并打通匿名迁移。
5. 设计第一个付费 plan。
6. 接支付宝沙箱：page pay、notify、return、query。
7. 上线前做支付回调重复通知、金额篡改、订单归属、退款/关闭测试。

## 当前实施状态

2026-05-24 已先落地一个轻量自托管账号内核，用于尽快跑通微信扫码登录闭环：

- `users`、`auth_sessions`、`auth_identities`、`auth_oauth_states` 已加入 `agent.db`。
- `chats`、`notifications`、`agent_runs` 已加入用户归属字段。
- 新增 `GET /api/auth/wechat/start` 和 `GET /api/auth/wechat/callback`。
- 新增 `GET /api/auth/me`、`POST /api/auth/logout`。
- 新增 `GET /api/auth/dev/wechat`，设置 `AUTH_DEV_WECHAT_LOGIN=true` 后可本地模拟微信登录。
- 侧边栏已显示登录入口、用户头像/昵称和退出登录。

微信开放平台申请完成后，需要配置：

```env
APP_URL=https://www.cruiseswift.com
WECHAT_APP_ID=...
WECHAT_APP_SECRET=...
WECHAT_REDIRECT_URI=https://www.cruiseswift.com/api/auth/wechat/callback
```

本地闭环测试可临时配置：

```env
AUTH_DEV_WECHAT_LOGIN=true
```

上线前再决定是否把当前轻量 auth 内核迁到 Better Auth。现在的数据表边界与 Better Auth 迁移不冲突，业务代码已通过 `getRequestUser()` / `ensureRequestUser()` 这类入口隔离。

## 参考资料

- Supabase Auth 概览：https://supabase.com/docs/guides/auth/
- Supabase Next.js SSR Auth：https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase Custom OAuth/OIDC Providers：https://supabase.com/docs/guides/auth/custom-oauth-providers
- Better Auth Basic Usage：https://better-auth.com/docs/basic-usage
- Better Auth SQLite Adapter：https://better-auth.com/docs/adapters/sqlite
- Better Auth Generic OAuth：https://better-auth.com/docs/plugins/generic-oauth
- 支付宝电脑网站支付文档入口：https://opendocs.alipay.com/open/270/alipay.trade.page.pay/
- 支付宝 Node SDK：https://www.npmjs.com/package/alipay-sdk
- 微信开放平台网站应用微信登录：https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html
