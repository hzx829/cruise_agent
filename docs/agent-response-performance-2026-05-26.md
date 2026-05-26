# Agent Response Performance Notes

Date: 2026-05-26

## Trace Findings

Local trace showed the main slow path was not the cruise DB tools. A representative run took about 51s: tool wall time was under 1s, while the GLM final synthesis step took about 44s and produced more than 2k output tokens from a very large tool-result context.

Production traces were less complete because older runs did not persist `agent_step_timings`, but PM2 logs and stored tool rows showed repeated web-search loops: several requests called `webSearch` or `cruiseEncyclopedia` 3-5 times before summarizing, with some runs finishing around 50-60s or aborting.

## Is This Too Forced?

The change is intentionally a budget policy, not a blanket capability cut.

What changed:

- Tool loops now converge earlier after useful evidence is gathered.
- Web tools have per-turn budgets by intent instead of unlimited model-directed retries.
- Final answers have a default output-token budget.
- Search tools return fewer but more relevant results by default.

Why this should not materially hurt normal answer quality:

- Price and inventory answers still use direct DB tools first.
- Market-supply/review/comparison tasks still get web search, but with 1-2 focused searches instead of open-ended repeated searches.
- Advanced web search is not removed; it is moved behind an explicit env switch because it has higher latency/cost.

Where quality could be affected:

- Broad research prompts asking for exhaustive market mapping may need more than two searches.
- Long-form copywriting may need a larger output budget than the new default.
- Ambiguous follow-up questions can suffer if intent detection classifies them as `general` and gives only one web call.

Mitigation:

- `CHAT_MAX_OUTPUT_TOKENS` can raise final answer length without code changes.
- `TAVILY_SEARCH_DEPTH` can switch default search depth.
- `ALLOW_ADVANCED_WEB_SEARCH=true` enables advanced Tavily search for deeper retrieval.
- Future work should add an explicit "deep research" mode instead of letting every chat turn behave like deep research.

## Best-Practice Check

AI SDK guidance supports this shape. `ToolLoopAgent` is designed as a reasoning-and-acting loop, but the SDK exposes `stopWhen`, `prepareStep`, `activeTools`, `maxOutputTokens`, and timeouts as control surfaces for exactly this reason:

- Loop control stops when a stop condition is met, and `prepareStep` can modify tools/messages/settings between steps.
- `activeTools` limits which tools are available for a step.
- Message modification can summarize tool results before the next model step to reduce token usage.
- `maxOutputTokens` and `timeout` are supported agent settings.

Sources:

- https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent
- https://www.mintlify.com/vercel/ai/agents/loop-control

Tavily guidance also supports conservative defaults:

- `search_depth` now includes `advanced`, `basic`, `fast`, and `ultra-fast`; `advanced` has higher relevance but higher latency and costs 2 credits, while `basic`/`fast`/`ultra-fast` cost 1 credit.
- `max_results` defaults to 5, and setting it too high may return lower-quality results.
- `auto_parameters` may set `search_depth` to `advanced`; setting depth explicitly is recommended when cost/latency needs control.
- `include_raw_content` should usually be avoided in the chat path; for full page content, use a two-step search-then-extract flow.

Sources:

- https://docs.tavily.com/documentation/api-reference/endpoint/search
- https://docs.tavily.com/documentation/best-practices/best-practices-search

## Web Search API Decision

We should keep Tavily Search API for now, but update our usage pattern:

- Default `search_depth` to `fast` for lower latency.
- Support `TAVILY_SEARCH_DEPTH` for runtime tuning.
- Keep `advanced` behind `ALLOW_ADVANCED_WEB_SEARCH=true`.
- Keep `max_results` low in the agent path.
- Include Tavily usage metadata in tool output for future trace analysis.
- Do not enable `auto_parameters` by default because it may silently choose `advanced`.
- Do not enable raw content in chat responses; add a separate extract/fetch step only for explicit deep research.

This is a reversible policy layer. If trace eval shows answer quality drops for a specific intent, increase only that intent's web budget or add a separate deep-research tool path.
