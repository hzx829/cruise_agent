# Agent 空流卡住问题排查与修复计划

更新日期：2026-05-10

## 背景

部署后的 `cruise_agent` 在给南京地区用户测试时，出现页面看起来卡住、没有正式回复的问题。排查范围包括本地日志、生产 PM2 日志、Nginx access/error log、`agent.db` 中的 agent trace 和消息持久化记录。

结论：这次更像是 agent 生成/流式消息收尾问题，不是南京网络完全访问不到服务。

## 现场证据

### 1. 服务与网络层

- 生产部署版本：`e59ce4f`
- PM2 状态：`cruise_agent` online
- 健康检查通过：
  - `/chat` 200
  - `/admin/agent-traces` 200
  - `/api/admin/agent-traces?limit=1` 200
- Nginx 中南京用户 IP `221.226.197.4` 的 `/api/chat` 请求能到达服务，返回状态多为 200。

这说明问题不是“用户请求没有到服务端”。

### 2. 南京用户失败段

南京用户在 2026-05-10 17:48-17:53 +0800 附近连续测试时，多次 `/api/chat` 返回 200，但响应体极小，典型为 `260 bytes`。

对应 `agent.db` 中的消息保存结果：

- `msg-ftO6jhU8U635m6JD`
- `msg-7pQyLCPc6m1wMuaO`
- `msg-KXzRUZO1O7OTAGju`
- `msg-fJadEbxhEhRtPH9H`
- `msg-EToc3aeEabF8fDo0`
- `msg-2XOfvsSsfk3eYqzA`

这些 assistant 消息的 `parts_json` 基本都是：

```json
[
  { "type": "step-start" },
  { "type": "text", "text": "", "state": "streaming" },
  { "type": "text", "text": "", "state": "streaming" }
]
```

统计特征：

- `textLen = 0`
- `reasoningLen = 0`
- `toolCount = 0`
- 对应 `agent_runs.step_count = 0`

前端 `components/message.tsx` 会隐藏 `step-start` 和空文本，因此用户看到的就是 assistant 没有真正回复，体感上像“卡住”。

### 3. 另一个慢卡类型

本地日志中还看到 `/api/chat` 请求耗时达到 `80s`、`2.0min`。期间 agent 会连续调用多个工具，例如：

- `webSearch`
- `searchDeals`
- `cruiseEncyclopedia`

生产 trace 中也有一类 run 跑了多步工具但最终文本为空，例如某次 run 的消息包含 8 个 tool part，但 `textLen = 0`。这说明除了“完全没进工具”的空流问题，还有“工具循环结束后没有最终 answer”的问题。

### 4. 部署相关噪声

PM2 历史日志中还出现过：

- `EADDRINUSE: address already in use :::3000`
- `Failed to find Server Action "x"`

这两个不是本次南京卡住的主证据，但需要记入运维风险：

- `EADDRINUSE` 表示之前有端口占用/重复进程，可能导致过重启或 upstream 短暂断开。
- `Failed to find Server Action` 通常是用户打开旧构建页面后继续操作，新服务找不到旧 action id。建议测试前强刷页面。

## 初步根因判断

### 主因 A：空 assistant 消息被当成正常完成并保存

`app/api/chat/route.ts` 的 `onFinish` 会把 `finishedMessages` 中新增的 assistant 消息直接保存。当前没有判断这条消息是否有可展示内容。

当 AI SDK / ToolLoopAgent 返回了只有 `step-start` 和空 `text` 的消息时，后端仍会保存它；前端又不渲染这些 part，于是用户看到空白。

风险文件：

- `app/api/chat/route.ts`
- `lib/db/chat-store.ts`
- `components/message.tsx`

### 主因 B：ToolLoopAgent 到达停止条件后不保证产出最终文本

`lib/ai/agent.ts` 当前使用：

```ts
stopWhen: stepCountIs(8)
```

如果模型在多轮工具调用里一直继续找资料，跑到 8 步后停止，可能没有留下最终回答文本。这个问题在复杂查询和用户连续追问时更容易出现。

### 主因 C：缺少“可见内容”级别的自动化回归

现在 smoke 更偏语义行为，没有强制检查：

- HTTP 200 之后是否有可见文本
- DB 中 assistant 消息是否只有空 part
- 工具跑完后是否输出最终回答
- 前端最后一条消息是否停在 loading/空白状态

## 修复方案

### Fix 1：保存前过滤空 assistant 消息

新增一个 `hasRenderableContent(message)` 判断：

- 有非空 `text` part：通过
- 有可渲染 tool output：通过
- 只有 `step-start`、`reasoning`、空 `text`：不通过

在 `app/api/chat/route.ts` 的 `onFinish` 中：

- 如果新 assistant 消息没有可展示内容，不要直接保存为空白。
- 写入一条兜底 assistant 消息，例如：

```text
这次生成没有拿到有效回复，我先把请求停在这里。你可以点重试，我会换一种更短的方式回答。
```

更好的版本是把兜底文案设计成用户可理解的错误态，不暴露 “ToolLoopAgent / part / DB” 等内部词。

### Fix 2：工具循环后强制收束

在 `createCruiseAgent()` 的 step 策略中加入收束逻辑：

- 前 1-4 步正常开放意图相关工具。
- 到第 5/6 步后，如果已有工具结果，则关闭工具或只保留极少工具，要求模型基于已有结果给最终答案。
- 到第 7 步必须强制输出最终回答，不再继续查。

目标不是简单把 `stepCountIs(8)` 改小，而是避免“查资料查到停机，没有回答”。

### Fix 3：长任务兜底和超时提示

对 `/api/chat` 增加更明确的超时/异常处理：

- 记录每次 run 的开始、结束、是否有文本输出、工具步数、耗时。
- 当模型/工具异常退出时，返回一个可见错误消息。
- 对慢响应增加用户可见提示，例如“正在查公开资料，可能需要几十秒”，避免误判为没反应。

### Fix 4：前端显示空结果错误态

`components/message.tsx` 里可以加一个兜底：

- 如果 assistant 消息没有任何可渲染 part，且不是当前 streaming 状态，显示“这次没有生成有效内容，请重试”。

后端修复是主线，前端兜底是最后一道保护。

### Fix 5：部署/旧页面风险处理

针对 `Failed to find Server Action`：

- 测试时要求部署后强刷页面。
- 可以在页面加载时加入 build/version 标记，检测版本变化后提示刷新。
- 对 `/chat` 相关页面尽量减少依赖 Server Action；聊天发送已走 `/api/chat`，后续继续保持 API route 风格。

## 测试方案

### 接口层 smoke

直接请求 `/api/chat`，记录：

- HTTP status
- total time
- response body size
- 是否包含非空 assistant text
- 是否包含 tool output

失败条件：

- HTTP 200 但 body 极小，且无可见文本
- 请求结束后 DB 中 assistant `textLen = 0` 且 `toolCount = 0`
- 工具步数达到上限但最终 `textLen = 0`

### DB 断言

每个 run 结束后检查 `agent.db`：

```sql
select
  m.chat_id,
  m.id,
  m.role,
  m.created_at,
  m.parts_json
from messages m
where m.role = 'assistant'
order by datetime(m.created_at) desc
limit 20;
```

解析 `parts_json` 后断言：

- assistant 必须有非空 text，或有可渲染 tool output，或有明确错误态。
- 不允许只保存 `step-start + empty text`。

### 前端 E2E

用 Playwright 覆盖：

1. 新建聊天，发送简单问答。
2. 发送南京失败段复现 prompt：
   - “我对这个答案不满意，你不能给我162条的航线让我选。我说了我是一个很挑剔的客户，我要骂你了，我有空看这么多吗，给你一次机会，重新回答”
   - “你还能不理我？”
   - “我今年暑假想去欧洲做邮轮，2大1小，帮我推荐一个性价比高的方案，船不能太差，”
3. 发送工具链复杂 prompt，例如：
   - “你能搜到诺唯真邮轮的一个66天的航线嘛？”
   - “4月12日的”

验收：

- 发送按钮恢复可用。
- 最后一条 assistant 有可见文本、可见工具卡片或明确错误态。
- 页面不能停在永久 loading dots。

### 运维侧验证

部署后执行：

```bash
./scripts/deploy-fast.ps1 -Mode status
ssh -p 22000 root@211.149.161.68 "pm2 logs cruise_agent --lines 100 --nostream"
ssh -p 22000 root@211.149.161.68 "grep 'POST /api/chat' /var/log/nginx/access.log | tail -n 20"
```

重点看：

- 是否还有 `EADDRINUSE`
- `/api/chat` 是否出现大量极小响应体
- Nginx error log 是否还有 `upstream prematurely closed connection`

## 建议优先级

1. 先做 Fix 1：后端不再保存空 assistant，且返回可见兜底。
2. 再做 Fix 2：工具循环收束，避免跑满 8 步无最终答案。
3. 补 Fix 4：前端空消息兜底。
4. 最后把南京失败 prompt 加入自动化 smoke/eval。

## 验收标准

- 相同南京失败 prompt 连续跑 10 次，不出现空白 assistant。
- `agent.db` 最近 50 条 assistant 消息中没有 `textLen=0 && toolCount=0` 的正常完成消息。
- 工具跑到多步后，仍能输出最终总结或明确失败提示。
- Nginx `/api/chat` 200 响应不再出现大量 `260 bytes` 类空流结果。
