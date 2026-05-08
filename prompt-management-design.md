# Cruise Agent Prompt 管理方案

## 背景

当前 `cruise_agent` 的 system prompt 由 `lib/ai/prompts.ts` 在服务端拼装，产品如果想调整 agent 表达方式、推荐口径或文案风格，需要开发改代码并重新发布。

项目团队目前是一个开发 + 一个产品，因此最有杠杆的改造是：把完整 `system prompt` 模板开放到前端管理页。产品可以直接调整角色、人设、工具路由、回答格式和推荐口径；代码只负责注入当前日期、品牌覆盖等运行时数据。

## 目标

- 产品可以在前端编辑、保存、发布、回滚 prompt。
- agent 请求实时读取当前线上 prompt，不需要重启服务。
- 每个 prompt 有版本记录，能追踪改动原因。
- Prompt 的全部静态文本都由产品在管理页维护；开发只维护运行时占位符替换和版本化发布能力。

## 非目标

- 第一版不做复杂账号系统。
- 第一版不做 A/B test。
- 第一版不做自动评测平台，只提供人工 smoke test 的基础入口。

## Prompt 分层

最终传给模型的 instructions 由两层组成：

```txt
System Prompt Template  产品可编辑，可版本化发布
Runtime Placeholders    代码动态替换，如当前日期、品牌覆盖、tier 覆盖
```

### System Prompt Template

产品可以直接调整：

- Agent 人设和语气。
- 工具路由规则和数据源标注方式。
- 回答结构和详略程度。
- 推荐优先级，例如更偏向降价幅度、客单价、奢华品牌话题性。
- 文案风格，例如小红书、旅行社销售、朋友圈短文案。
- 展示策略，例如默认展示几条、是否主动总结卖点。

默认模板仍带有推荐的价格可信度、工具路由和格式规则，但这些规则不再由代码锁死，产品可以在 `/admin/prompts` 中直接调整。

### Runtime Placeholders

仍由代码动态替换：

- `{{currentDate}}`：当前北京时间日期。
- `{{brandCoverageContext}}`：当前直连价格源中有数据的品牌、tier 覆盖和舱位覆盖。

## 数据模型

新增表：`agent_prompts`

```sql
CREATE TABLE IF NOT EXISTS agent_prompts (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'archived')),
  content TEXT NOT NULL,
  change_note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  activated_at TEXT
);
```

约束：

- 同一时间只能有一个 `active` prompt。
- 发布新版本时，旧 active 变为 `archived`。
- 回滚本质上是把某个历史版本复制成一个新 active 版本，避免篡改历史。

后续可选表：`agent_runs`

```sql
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  chat_id TEXT,
  prompt_id TEXT,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

用于排查某次回答具体使用了哪个 prompt。

## API 设计

```txt
GET  /api/admin/prompts
返回 active prompt、drafts、history。

POST /api/admin/prompts
保存草稿。

POST /api/admin/prompts/:id/activate
发布指定草稿或历史版本。

POST /api/admin/prompts/:id/rollback
把历史版本复制为新 active 版本。

POST /api/admin/prompts/preview
返回最终拼装后的 system prompt。
```

第一版如果配置了 `ADMIN_TOKEN`，API 需要 `x-admin-token` header；未配置时默认允许本地开发使用。

## 前端页面

新增页面：

```txt
/admin/prompts
```

页面能力：

- 查看当前线上版本。
- 编辑 prompt 内容。
- 保存草稿。
- 发布当前草稿。
- 查看历史版本。
- 基于历史版本恢复。
- 预览最终拼装后的 prompt。

## Agent 接入

当前 `lib/ai/agent.ts` 已经每次请求调用：

```ts
instructions: buildSystemPrompt()
```

`buildSystemPrompt()` 会读取当前线上完整模板，并替换运行时占位符：

```ts
export function buildSystemPrompt(promptTemplateOverride?: string): string {
  const activeBrands = getActiveBrandsStats();
  const promptTemplate =
    promptTemplateOverride ?? getActivePromptTemplate().content;

  return renderPromptTemplate(promptTemplate, {
    currentDate: buildCurrentDate(),
    brandCoverageContext: buildBrandCoverageContext(activeBrands),
  });
}
```

新 prompt 发布后，下一次 chat 请求会自动生效。

## 推荐工作流

1. 产品进入 `/admin/prompts`。
2. 基于当前线上版本修改 prompt。
3. 保存草稿，填写修改说明。
4. 预览最终拼装结果。
5. 用固定问题手动测试：
   - `帮我找降价幅度最大的邮轮航线`
   - `这条航线值得买吗？`
   - `皇家加勒比和诺唯真有什么区别？`
   - `帮我生成一条小红书推广文案`
6. 确认后发布。
7. 如果效果变差，回滚到上个稳定版本。

## 后续增强

- 每次 chat 记录使用的 prompt version。
- 增加 prompt diff 视图。
- 增加标准测试集和一键回归。
- 增加产品反馈入口，把点踩原因沉淀到 prompt 调优流程。
