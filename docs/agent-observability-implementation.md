# Agent Observability Implementation Plan

本文档记录 `cruise_agent` 的 agent trace 现状、业界参考方案和 P0-P2 落地计划。目标是让工具调用、输入输出、耗时、错误、prompt/model 版本和回归评估都能被 Codex 读取，并形成“trace -> 诊断 -> 修改 -> eval”的闭环。

## 背景

当前项目已经有 trace MVP：

- `agent_runs` / `agent_steps` 存在于 `data/agent.db`。
- `/admin/agent-traces` 可以查看 run、tool input 和 output summary。
- `scripts/evaluate-natural-agent-traces.mjs` 可以基于历史 trace 检查部分自然语言路由用例。

但它仍偏调试日志，还不是完整可观测系统。主要缺口：

- run 结束状态、耗时、错误、finish reason 没有结构化落库。
- tool 级别没有 `duration_ms`、`success`、`error_type`、`tool_call_id`。
- `prompt_id` 字段存在但没有写入，缺少 prompt version/hash。
- `searchDeals` 的 raw input 和 hard-constraint 后 effective input 没有同时保留。
- eval 依赖已有历史 trace，不能主动生成回归 trace。
- Codex 要读 trace 时只能查 SQLite 或 CSV，缺少聚合诊断视图。

## 业界参考

主流做法是把 agent run 表达为 trace，把 LLM call、tool call、retrieval、guardrail、evaluator 表达为 span/observation：

- OpenTelemetry GenAI semantic conventions：标准化 model/tool span、错误态、输入输出和大字段截断/外部存储策略。
- AI SDK v6 telemetry：支持 OpenTelemetry，`ToolLoopAgent` 提供 `experimental_onToolCallFinish`，可拿到 tool `durationMs`、`success` 和 `output/error`。
- Langfuse / LangSmith / Phoenix / MLflow：都围绕 traces、token/cost、prompt version、evals 和 feedback 建闭环。
- OpenAI Agents SDK / trace grading：强调 trace 不只看发生了什么，还要对决策、工具调用和最终结果打分，推动系统性优化。

## P0: Trace Contract

目标：把当前日志升级成可靠的结构化 trace。

Run 级字段：

- `started_at` / `ended_at` / `duration_ms`
- `status`: `running` / `completed` / `error` / `aborted`
- `finish_reason` / `is_aborted`
- `assistant_text_len` / `empty_assistant_count`
- `tool_step_count` / `tool_result_count`
- `prompt_id` / `prompt_version` / `prompt_hash`
- `total_tokens` / `prompt_tokens` / `completion_tokens`
- `error_type` / `error_message`

Tool 级字段：

- `tool_call_id`
- `started_at` / `ended_at` / `duration_ms`
- `success`
- `error_type` / `error_message`
- `raw_tool_input_json`
- `effective_tool_input_json`
- `tool_input_json` 保持为 effective input，兼容现有 UI/eval。
- `tool_output_summary_json`
- `tool_output_hash`

## P1: Codex-Readable Inspect

目标：Codex 可以快速读取近期 trace，不需要人工打开 UI。

新增 CLI：

```bash
npm run trace:inspect -- --since 24h --format markdown
npm run trace:inspect -- --tool searchDeals --status error --format jsonl
```

输出包含：

- run 概览、耗时、状态、tokens、prompt version。
- tool timeline、每个 tool 的 input/output summary、耗时和错误。
- 自动诊断 flags：
  - `empty_answer`
  - `slow_run`
  - `slow_tool`
  - `search_gap_without_web`
  - `tool_loop_repeated`
  - `zero_tool_but_tool_expected`
  - `web_no_sources`

## P2: Active Smoke + Trace Eval

目标：回归评估不再依赖“DB 里刚好有历史 query”。

新增固定数据集：

- `scripts/natural-agent-smoke-cases.mjs`

增强 eval：

- `npm run eval:natural-agent` 仍检查已有 trace。
- 支持 `--cases=...` 指定数据集。
- 支持 `--since-run-start=...` 只评估本轮新生成 trace。

新增主动运行脚本：

```bash
npm run smoke:natural-agent -- --base-url http://localhost:3000
```

流程：

1. 记录本轮开始时间。
2. 对每条 smoke case 调用 `/api/chat`，消费完整 SSE 流，触发服务端写 trace。
3. 调用 trace eval，只检查本轮 run。
4. 输出 Markdown/JSON 结果，失败时非 0 退出码。

这让 prompt、tool schema 和 routing 改动可以进入稳定回归流程。需要真实模型和本地/测试环境服务时运行；CI 可配置 API key 后启用。

## 后续 P3

当前阶段建议继续用 SQLite + 管理页 + CLI。等 trace 数据量和协作需求上来后，再按 OpenTelemetry/GenAI 语义导出到 Langfuse、Phoenix、MLflow 或 Grafana Tempo，避免过早引入平台运维成本。
