import { NextResponse } from 'next/server';
import { isAdminAuthEnabled, requireAdmin } from '@/lib/admin-auth';
import {
  listAgentRuns,
  type AgentRunWithSteps,
  type AgentTraceStep,
} from '@/lib/db/agent-trace-store';

export const dynamic = 'force-dynamic';

function getSearchParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)?.trim();
  return value || undefined;
}

function getLimit(url: URL): number | undefined {
  const value = url.searchParams.get('limit');
  if (!value) return undefined;
  const limit = Number(value);
  return Number.isFinite(limit) ? limit : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function sourceDomains(step: AgentTraceStep): string[] {
  const output = asRecord(step.toolOutputSummary);
  const sources = Array.isArray(output.sources) ? output.sources : [];
  return sources
    .map((source) => asRecord(source).domain)
    .filter((domain): domain is string => typeof domain === 'string');
}

function csvEscape(value: unknown): string {
  const text = Array.isArray(value) ? value.join('; ') : String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsv(runs: AgentRunWithSteps[]): string {
  const header = [
    'created_at',
    'run_id',
    'chat_id',
    'status',
    'model',
    'detected_intent',
    'user_query',
    'duration_ms',
    'finish_reason',
    'assistant_text_len',
    'total_tokens',
    'prompt_version',
    'step_count',
    'tool_names',
    'search_deals_counts',
    'coverage_statuses',
    'web_queries',
    'source_domains',
  ];

  const rows = runs.map((run) => {
    const searchDealOutputs = run.steps
      .filter((step) => step.toolName === 'searchDeals')
      .map((step) => asRecord(step.toolOutputSummary));
    const webOutputs = run.steps
      .filter((step) => step.toolName === 'webSearch')
      .map((step) => asRecord(step.toolOutputSummary));

    return [
      run.created_at,
      run.id,
      run.chat_id,
      run.status,
      run.model,
      run.detected_intent,
      run.user_query,
      run.duration_ms,
      run.finish_reason,
      run.assistant_text_len,
      run.total_tokens,
      run.prompt_version,
      run.stepCount,
      run.toolNames,
      searchDealOutputs.map((output) => output.count),
      searchDealOutputs.map((output) => output.coverageStatus),
      webOutputs.map((output) => output.query ?? output.requestedQuery),
      [...new Set(run.steps.flatMap(sourceDomains))],
    ].map(csvEscape).join(',');
  });

  return [header.join(','), ...rows].join('\n');
}

export async function GET(req: Request) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const runs = listAgentRuns({
    limit: getLimit(url),
    q: getSearchParam(url, 'q'),
    intent: getSearchParam(url, 'intent'),
    tool: getSearchParam(url, 'tool'),
    from: getSearchParam(url, 'from'),
    to: getSearchParam(url, 'to'),
  });

  if (url.searchParams.get('format') === 'csv') {
    return new NextResponse(buildCsv(runs), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="agent-traces.csv"',
      },
    });
  }

  return NextResponse.json({
    runs,
    authRequired: isAdminAuthEnabled(),
  });
}
