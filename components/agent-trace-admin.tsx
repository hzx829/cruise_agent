'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Download,
  KeyRound,
  RefreshCcw,
  Search,
  Wrench,
} from 'lucide-react';

interface AgentTraceStep {
  id: number;
  runId: string;
  stepNumber: number;
  toolCallId: string | null;
  toolName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  success: boolean | null;
  errorType: string | null;
  errorMessage: string | null;
  rawToolInput: unknown;
  effectiveToolInput: unknown;
  toolInput: unknown;
  toolOutputSummary: unknown;
  toolOutputHash: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface AgentStepTiming {
  id: number;
  runId: string;
  stepNumber: number;
  modelProvider: string | null;
  modelId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  modelDurationMs: number | null;
  toolWallTimeMs: number | null;
  toolDurationMs: number | null;
  toolCallCount: number | null;
  toolResultCount: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  finishReason: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface AgentTimingSummary {
  runDurationMs: number | null;
  observedDurationMs: number | null;
  stepDurationMs: number | null;
  modelDurationMs: number | null;
  toolWallTimeMs: number | null;
  toolDurationMs: number | null;
  unattributedDurationMs: number | null;
  stepTimingCount: number;
}

interface AgentRunWithSteps {
  id: string;
  chat_id: string | null;
  prompt_id: string | null;
  prompt_version: number | null;
  prompt_hash: string | null;
  model: string | null;
  user_query: string | null;
  detected_intent: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  finish_reason: string | null;
  is_aborted: number | null;
  assistant_text_len: number | null;
  empty_assistant_count: number | null;
  tool_step_count: number | null;
  tool_result_count: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  error_type: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
  stepCount: number;
  toolNames: string[];
  steps: AgentTraceStep[];
  stepTimings: AgentStepTiming[];
  timingSummary: AgentTimingSummary;
}

interface TraceListResponse {
  runs: AgentRunWithSteps[];
  authRequired: boolean;
}

const TOKEN_STORAGE_KEY = 'cruise_agent_admin_token';

const INTENT_OPTIONS = [
  '',
  'price_quote',
  'market_supply',
  'review',
  'comparison',
  'copywriting',
  'analytics',
  'general',
];

const TOOL_OPTIONS = [
  '',
  'searchDeals',
  'webSearch',
  'cruiseEncyclopedia',
  'getPriceHistory',
  'compareCruises',
  'generateCopywriting',
  'generateChart',
];

function formatTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stringify(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function formatDuration(value: number | null): string {
  if (value == null) return '-';
  if (value >= 60_000) return `${(value / 60_000).toFixed(1)}min`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}s`;
  if (value >= 1_000) return `${(value / 1000).toFixed(2)}s`;
  return `${value}ms`;
}

function paramsFromFilters(filters: {
  q: string;
  intent: string;
  tool: string;
  limit: string;
  format?: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('limit', filters.limit);
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.intent) params.set('intent', filters.intent);
  if (filters.tool) params.set('tool', filters.tool);
  if (filters.format) params.set('format', filters.format);
  return params;
}

export function AgentTraceAdmin() {
  const [runs, setRuns] = useState<AgentRunWithSteps[]>([]);
  const [selectedRun, setSelectedRun] = useState<AgentRunWithSteps | null>(null);
  const [q, setQ] = useState('');
  const [intent, setIntent] = useState('');
  const [tool, setTool] = useState('');
  const [limit, setLimit] = useState('50');
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo<HeadersInit>(() => {
    const nextHeaders: Record<string, string> = {};
    if (token) nextHeaders['x-admin-token'] = token;
    return nextHeaders;
  }, [token]);

  const handleResponse = useCallback(async <T,>(res: Response): Promise<T> => {
    const contentType = res.headers.get('content-type') ?? '';
    const json = contentType.includes('application/json')
      ? await res.json().catch(() => ({}))
      : {};

    if (!res.ok) {
      if (res.status === 401) setAuthRequired(true);
      throw new Error(
        typeof json.error === 'string' ? json.error : '请求失败',
      );
    }

    return json as T;
  }, []);

  const loadTraces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = paramsFromFilters({ q, intent, tool, limit });
      const res = await fetch(`/api/admin/agent-traces?${params}`, {
        cache: 'no-store',
        headers,
      });
      const data = await handleResponse<TraceListResponse>(res);
      setRuns(data.runs);
      setAuthRequired(data.authRequired);
      setSelectedRun((current) => {
        if (!current) return data.runs[0] ?? null;
        return data.runs.find((run) => run.id === current.id) ?? data.runs[0] ?? null;
      });
      setMessage(`已加载 ${data.runs.length} 条 run`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [handleResponse, headers, intent, limit, q, tool]);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
    setToken(storedToken);
    setTokenInput(storedToken);
  }, []);

  useEffect(() => {
    void loadTraces();
  }, [loadTraces]);

  function saveToken() {
    const trimmed = tokenInput.trim();
    window.localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
    setToken(trimmed);
    setMessage('管理 token 已保存');
  }

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const params = paramsFromFilters({
        q,
        intent,
        tool,
        limit,
        format: 'csv',
      });
      const res = await fetch(`/api/admin/agent-traces?${params}`, { headers });
      if (!res.ok) {
        await handleResponse<unknown>(res);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'agent-traces.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage('CSV 已导出');
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="border-b bg-background px-4 py-3 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <Activity className="size-5 text-primary" />
              Agent Trace
            </h1>
            <p className="text-sm text-muted-foreground">
              查看工具路由、覆盖缺口和网络来源。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {authRequired && (
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" />
                <input
                  value={tokenInput}
                  onChange={(event) => setTokenInput(event.target.value)}
                  placeholder="ADMIN_TOKEN"
                  className="h-9 w-44 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  type="password"
                />
                <button
                  onClick={saveToken}
                  className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted"
                  type="button"
                >
                  保存 token
                </button>
              </div>
            )}
            <button
              onClick={exportCsv}
              className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
              disabled={exporting}
              title="导出当前筛选结果"
              type="button"
            >
              <Download className="size-4" />
              导出 CSV
            </button>
            <button
              onClick={loadTraces}
              className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
              disabled={loading}
              title="刷新 trace"
              type="button"
            >
              <RefreshCcw className="size-4" />
              刷新
            </button>
          </div>
        </div>
      </div>

      <div className="border-b px-4 py-3 md:px-6">
        <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_180px_180px_120px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="搜索 query / run / chat"
              className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <select
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {INTENT_OPTIONS.map((option) => (
              <option key={option || 'all'} value={option}>
                {option || '全部 intent'}
              </option>
            ))}
          </select>
          <select
            value={tool}
            onChange={(event) => setTool(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {TOOL_OPTIONS.map((option) => (
              <option key={option || 'all'} value={option}>
                {option || '全部 tool'}
              </option>
            ))}
          </select>
          <select
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="25">25 条</option>
            <option value="50">50 条</option>
            <option value="100">100 条</option>
            <option value="200">200 条</option>
          </select>
        </div>
      </div>

      {(message || error) && (
        <div className="border-b px-4 py-2 md:px-6">
          <div
            className={`flex items-center gap-2 text-sm ${
              error ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {error ? (
              <AlertCircle className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            <span>{error || message}</span>
          </div>
        </div>
      )}

      <div className="grid min-h-[calc(100dvh-154px)] grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="border-b bg-muted/20 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
            <Wrench className="size-4" />
            Runs
          </div>
          <div className="max-h-[42dvh] overflow-auto lg:max-h-[calc(100dvh-202px)]">
            {loading && (
              <p className="px-4 py-3 text-sm text-muted-foreground">加载中...</p>
            )}
            {!loading && runs.length === 0 && (
              <div className="px-4 py-4 text-sm text-muted-foreground">
                <p>暂无 trace。</p>
                <p className="mt-2">
                  Trace 只记录当前功能上线后经同一实例发出的新消息，历史聊天不会回填。
                </p>
              </div>
            )}
            {!loading &&
              runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  className={`w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted ${
                    selectedRun?.id === run.id ? 'bg-primary/10' : 'bg-background'
                  }`}
                  type="button"
                >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">
                    {run.detected_intent || 'unknown'}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatTime(run.created_at)}
                  </span>
                </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{run.status || 'unknown'}</span>
                    <span>{formatDuration(run.duration_ms)}</span>
                    {run.total_tokens != null && <span>{run.total_tokens} tokens</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {run.user_query || '(empty query)'}
                  </p>
                  <ToolChips tools={run.toolNames} />
                </button>
              ))}
          </div>
        </aside>

        <section className="min-w-0">
          {selectedRun ? (
            <TraceDetails run={selectedRun} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">选择一条 run。</p>
          )}
        </section>
      </div>
    </main>
  );
}

function ToolChips({ tools }: { tools: string[] }) {
  if (tools.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">no tools</p>;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {tools.map((toolName) => (
        <span
          key={toolName}
          className="rounded-sm border bg-background px-1.5 py-0.5 text-xs text-muted-foreground"
        >
          {toolName}
        </span>
      ))}
    </div>
  );
}

function TraceDetails({ run }: { run: AgentRunWithSteps }) {
  return (
    <div className="min-w-0">
      <div className="border-b px-4 py-3 md:px-6">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <Meta label="run" value={run.id} />
          <Meta label="chat" value={run.chat_id || '-'} />
          <Meta label="model" value={run.model || '-'} />
          <Meta label="status" value={run.status || '-'} />
          <Meta label="duration" value={formatDuration(run.duration_ms)} />
          <Meta label="finish" value={run.finish_reason || '-'} />
          <Meta label="tokens" value={String(run.total_tokens ?? '-')} />
          <Meta label="prompt" value={run.prompt_version ? `v${run.prompt_version}` : '-'} />
        </div>
        {run.error_message && (
          <p className="mt-3 text-sm text-destructive">
            {run.error_type || 'Error'}: {run.error_message}
          </p>
        )}
        <p className="mt-3 text-base font-medium">{run.user_query || '(empty query)'}</p>
        <TimingBreakdown summary={run.timingSummary} />
      </div>

      <StepTimingTimeline timings={run.stepTimings} />

      {run.steps.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">这条 run 没有工具调用。</p>
      ) : (
        <div>
          {run.steps.map((step) => (
            <section key={step.id} className="border-b px-4 py-4 md:px-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-sm bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                    Step {step.stepNumber}
                  </span>
                  <h2 className="text-sm font-semibold">
                    {step.toolName || 'unknown tool'}
                  </h2>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDuration(step.durationMs)} · {step.success === false ? 'error' : 'ok'} · {formatTime(step.createdAt)}
                </span>
              </div>
              {step.errorMessage && (
                <p className="mb-3 text-sm text-destructive">
                  {step.errorType || 'Error'}: {step.errorMessage}
                </p>
              )}
              <div className="grid gap-3 xl:grid-cols-2">
                <TraceJson
                  title="Input"
                  value={step.effectiveToolInput ?? step.toolInput}
                />
                <TraceJson title="Output Summary" value={step.toolOutputSummary} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TimingBreakdown({ summary }: { summary: AgentTimingSummary }) {
  const items = [
    ['run total', summary.runDurationMs],
    [
      summary.stepTimingCount > 0 ? 'step total' : 'observed',
      summary.observedDurationMs,
    ],
    ['model/stream', summary.modelDurationMs],
    ['tool wall', summary.toolWallTimeMs],
    ['tool sum', summary.toolDurationMs],
    ['unattributed', summary.unattributedDurationMs],
  ] as const;

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 border-l pl-3">
          <p className="text-xs uppercase text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-medium">{formatDuration(value)}</p>
        </div>
      ))}
      <div className="min-w-0 border-l pl-3">
        <p className="text-xs uppercase text-muted-foreground">step records</p>
        <p className="truncate text-sm font-medium">{summary.stepTimingCount}</p>
      </div>
    </div>
  );
}

function StepTimingTimeline({ timings }: { timings: AgentStepTiming[] }) {
  if (timings.length === 0) {
    return (
      <div className="border-b px-4 py-3 text-sm text-muted-foreground md:px-6">
        No LLM step timing recorded for this run. Older traces only expose tool
        duration and the remaining time as unattributed.
      </div>
    );
  }

  return (
    <div className="border-b px-4 py-4 md:px-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">LLM Step Timeline</h2>
        <span className="text-xs text-muted-foreground">
          {timings.length} steps
        </span>
      </div>
      <div className="space-y-3">
        {timings.map((timing) => {
          const model =
            timing.modelProvider && timing.modelId
              ? `${timing.modelProvider}/${timing.modelId}`
              : timing.modelId || '-';

          return (
            <div key={timing.id} className="border-l pl-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-sm bg-muted px-2 py-1 text-xs font-medium">
                  Step {timing.stepNumber}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTime(timing.startedAt)} - {formatTime(timing.endedAt)}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-7">
                <Meta label="total" value={formatDuration(timing.durationMs)} />
                <Meta
                  label="model/stream"
                  value={formatDuration(timing.modelDurationMs)}
                />
                <Meta
                  label="tool wall"
                  value={formatDuration(timing.toolWallTimeMs)}
                />
                <Meta
                  label="tool sum"
                  value={formatDuration(timing.toolDurationMs)}
                />
                <Meta
                  label="tools"
                  value={`${timing.toolCallCount ?? 0}/${timing.toolResultCount ?? 0}`}
                />
                <Meta
                  label="tokens"
                  value={`${timing.totalTokens ?? '-'} (${timing.promptTokens ?? '-'}/${timing.completionTokens ?? '-'})`}
                />
                <Meta
                  label="finish"
                  value={`${timing.finishReason || '-'} @ ${model}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}

function TraceJson({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/20">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <pre className="max-h-72 overflow-auto p-3 text-xs leading-5">
        {stringify(value)}
      </pre>
    </div>
  );
}
