import { generateId } from 'ai';
import { createHash } from 'crypto';
import agentDb from './agent-db';

interface CreateAgentRunInput {
  chatId: string;
  userId?: string | null;
  model: string;
  userQuery: string;
  detectedIntent?: string;
  promptId?: string | null;
  promptVersion?: number | null;
  promptHash?: string | null;
  startedAt?: string;
}

interface SaveAgentStepInput {
  runId: string;
  stepNumber: number;
  toolName: string;
  toolInput: unknown;
  toolOutput: unknown;
}

interface SaveAgentToolCallInput {
  runId: string;
  stepNumber?: number;
  toolCallId?: string | null;
  toolName: string;
  rawToolInput: unknown;
  effectiveToolInput: unknown;
  toolOutput?: unknown;
  durationMs?: number | null;
  success: boolean;
  error?: unknown;
  startedAt?: string | null;
  endedAt?: string | null;
}

interface SaveAgentStepTimingInput {
  runId: string;
  stepNumber: number;
  modelProvider?: string | null;
  modelId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number | null;
  modelDurationMs?: number | null;
  toolWallTimeMs?: number | null;
  toolDurationMs?: number | null;
  toolCallCount?: number | null;
  toolResultCount?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  finishReason?: string | null;
}

export interface UpdateAgentRunInput {
  runId: string;
  status: 'running' | 'completed' | 'error' | 'aborted';
  endedAt?: string | null;
  durationMs?: number | null;
  finishReason?: string | null;
  isAborted?: boolean;
  assistantTextLen?: number | null;
  emptyAssistantCount?: number | null;
  toolStepCount?: number | null;
  toolResultCount?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  error?: unknown;
}

export interface AgentRunRow {
  id: string;
  chat_id: string | null;
  prompt_id: string | null;
  prompt_version: number | null;
  prompt_hash: string | null;
  model: string | null;
  user_query: string | null;
  user_id: string | null;
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
}

interface AgentRunListRow extends AgentRunRow {
  step_count: number;
  tool_names: string | null;
}

interface AgentStepRow {
  id: number;
  run_id: string;
  step_number: number;
  tool_call_id: string | null;
  tool_name: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  success: number | null;
  error_type: string | null;
  error_message: string | null;
  raw_tool_input_json: string | null;
  effective_tool_input_json: string | null;
  tool_input_json: string | null;
  tool_output_summary_json: string | null;
  tool_output_hash: string | null;
  created_at: string;
  updated_at: string | null;
}

interface AgentStepTimingRow {
  id: number;
  run_id: string;
  step_number: number;
  model_provider: string | null;
  model_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  model_duration_ms: number | null;
  tool_wall_time_ms: number | null;
  tool_duration_ms: number | null;
  tool_call_count: number | null;
  tool_result_count: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  finish_reason: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface AgentTraceStep {
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

export interface AgentStepTiming {
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

export interface AgentTimingSummary {
  runDurationMs: number | null;
  observedDurationMs: number | null;
  stepDurationMs: number | null;
  modelDurationMs: number | null;
  toolWallTimeMs: number | null;
  toolDurationMs: number | null;
  unattributedDurationMs: number | null;
  stepTimingCount: number;
}

export interface AgentRunWithSteps extends AgentRunRow {
  stepCount: number;
  toolNames: string[];
  steps: AgentTraceStep[];
  stepTimings: AgentStepTiming[];
  timingSummary: AgentTimingSummary;
}

export interface ListAgentRunsInput {
  limit?: number;
  q?: string;
  intent?: string;
  tool?: string;
  from?: string;
  to?: string;
}

const stmtInsertAgentRun = agentDb.prepare(
  `INSERT INTO agent_runs
     (
       id, chat_id, user_id, prompt_id, prompt_version, prompt_hash, model,
       user_query, detected_intent, status, started_at
     )
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const stmtInsertAgentStep = agentDb.prepare(
  `INSERT INTO agent_steps
     (
       run_id, step_number, tool_call_id, tool_name, started_at, ended_at,
       duration_ms, success, error_type, error_message, raw_tool_input_json,
       effective_tool_input_json, tool_input_json, tool_output_summary_json,
       tool_output_hash
     )
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const stmtUpsertAgentStepTiming = agentDb.prepare(
  `INSERT INTO agent_step_timings
     (
       run_id, step_number, model_provider, model_id, started_at, ended_at,
       duration_ms, model_duration_ms, tool_wall_time_ms, tool_duration_ms,
       tool_call_count, tool_result_count, prompt_tokens, completion_tokens,
       total_tokens, finish_reason
     )
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(run_id, step_number) DO UPDATE SET
       model_provider = excluded.model_provider,
       model_id = excluded.model_id,
       started_at = excluded.started_at,
       ended_at = excluded.ended_at,
       duration_ms = excluded.duration_ms,
       model_duration_ms = excluded.model_duration_ms,
       tool_wall_time_ms = excluded.tool_wall_time_ms,
       tool_duration_ms = excluded.tool_duration_ms,
       tool_call_count = excluded.tool_call_count,
       tool_result_count = excluded.tool_result_count,
       prompt_tokens = excluded.prompt_tokens,
       completion_tokens = excluded.completion_tokens,
       total_tokens = excluded.total_tokens,
       finish_reason = excluded.finish_reason,
       updated_at = datetime('now')`,
);

const stmtUpdateAgentRun = agentDb.prepare(
  `UPDATE agent_runs
   SET status = ?,
       ended_at = ?,
       duration_ms = ?,
       finish_reason = ?,
       is_aborted = ?,
       assistant_text_len = ?,
       empty_assistant_count = ?,
       tool_step_count = ?,
       tool_result_count = ?,
       prompt_tokens = ?,
       completion_tokens = ?,
       total_tokens = ?,
       error_type = ?,
       error_message = ?,
       updated_at = datetime('now')
   WHERE id = ?`,
);

function compactJson(value: unknown, maxLength = 8000): string | null {
  if (value === undefined) return null;
  try {
    const json = JSON.stringify(value);
    return json.length > maxLength
      ? `${json.slice(0, maxLength)}...`
      : json;
  } catch {
    return JSON.stringify({ unserializable: true });
  }
}

function hashJson(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return createHash('sha256')
      .update(JSON.stringify(value))
      .digest('hex');
  } catch {
    return createHash('sha256').update('[unserializable]').digest('hex');
  }
}

function getErrorInfo(error: unknown): {
  errorType: string | null;
  errorMessage: string | null;
} {
  if (!error) return { errorType: null, errorMessage: null };
  if (error instanceof Error) {
    return {
      errorType: error.name || 'Error',
      errorMessage: error.message || String(error),
    };
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      errorType:
        typeof record.name === 'string'
          ? record.name
          : typeof record.type === 'string'
            ? record.type
            : 'Error',
      errorMessage:
        typeof record.message === 'string'
          ? record.message
          : JSON.stringify(record).slice(0, 1000),
    };
  }
  return { errorType: 'Error', errorMessage: String(error) };
}

function summarizeArray(value: unknown): { count: number } | undefined {
  return Array.isArray(value) ? { count: value.length } : undefined;
}

function summarizeToolOutput(output: unknown): unknown {
  if (!output || typeof output !== 'object') return output;

  const record = output as Record<string, unknown>;
  const sources = Array.isArray(record.sources)
    ? record.sources.map((source) => {
        if (!source || typeof source !== 'object') return source;
        const sourceRecord = source as Record<string, unknown>;
        return {
          domain: sourceRecord.domain,
          sourceType: sourceRecord.sourceType,
          url: sourceRecord.url,
        };
      })
    : undefined;

  return {
    available: record.available,
    count: record.count,
    resultCount: record.resultCount,
    groupedBySailing: record.groupedBySailing,
    coverageStatus: record.coverageStatus,
    noResultReason: record.noResultReason,
    exactMatch: record.exactMatch,
    appliedFilters: record.appliedFilters,
    query: record.query,
    requestedQuery: record.requestedQuery,
    purpose: record.purpose,
    sourcePreference: record.sourcePreference,
    dataSource: record.dataSource,
    deals: summarizeArray(record.deals),
    results: summarizeArray(record.results),
    sources,
  };
}

function parseStoredJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 50;
  return Math.min(Math.max(Math.trunc(value), 1), 200);
}

function isFilled(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function mapStep(row: AgentStepRow): AgentTraceStep {
  const effectiveToolInput = parseStoredJson(
    row.effective_tool_input_json ?? row.tool_input_json,
  );
  return {
    id: row.id,
    runId: row.run_id,
    stepNumber: row.step_number,
    toolCallId: row.tool_call_id,
    toolName: row.tool_name,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    success: row.success == null ? null : Boolean(row.success),
    errorType: row.error_type,
    errorMessage: row.error_message,
    rawToolInput: parseStoredJson(row.raw_tool_input_json),
    effectiveToolInput,
    toolInput: parseStoredJson(row.tool_input_json),
    toolOutputSummary: parseStoredJson(row.tool_output_summary_json),
    toolOutputHash: row.tool_output_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStepTiming(row: AgentStepTimingRow): AgentStepTiming {
  return {
    id: row.id,
    runId: row.run_id,
    stepNumber: row.step_number,
    modelProvider: row.model_provider,
    modelId: row.model_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    modelDurationMs: row.model_duration_ms,
    toolWallTimeMs: row.tool_wall_time_ms,
    toolDurationMs: row.tool_duration_ms,
    toolCallCount: row.tool_call_count,
    toolResultCount: row.tool_result_count,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    finishReason: row.finish_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sumNullable<T>(
  values: T[],
  select: (value: T) => number | null,
): number | null {
  let sum = 0;
  let seen = false;
  for (const value of values) {
    const item = select(value);
    if (item == null || !Number.isFinite(item)) continue;
    sum += item;
    seen = true;
  }
  return seen ? sum : null;
}

function summarizeTiming(
  runDurationMs: number | null,
  stepTimings: AgentStepTiming[],
  toolSteps: AgentTraceStep[],
): AgentTimingSummary {
  const stepDurationMs = sumNullable(stepTimings, (step) => step.durationMs);
  const stepToolDurationMs = sumNullable(stepTimings, (step) => step.toolDurationMs);
  const stepToolWallTimeMs = sumNullable(stepTimings, (step) => step.toolWallTimeMs);
  const modelDurationMs = sumNullable(stepTimings, (step) => step.modelDurationMs);
  const fallbackToolDurationMs = sumNullable(toolSteps, (step) => step.durationMs);
  const toolDurationMs = stepToolDurationMs ?? fallbackToolDurationMs;
  const toolWallTimeMs = stepToolWallTimeMs ?? fallbackToolDurationMs;
  const observedDurationMs = stepDurationMs ?? toolDurationMs;
  const unattributedDurationMs =
    runDurationMs == null || observedDurationMs == null
      ? null
      : Math.max(0, runDurationMs - observedDurationMs);

  return {
    runDurationMs,
    observedDurationMs,
    stepDurationMs,
    modelDurationMs,
    toolWallTimeMs,
    toolDurationMs,
    unattributedDurationMs,
    stepTimingCount: stepTimings.length,
  };
}

export function createAgentRun(input: CreateAgentRunInput): string {
  const runId = generateId();
  stmtInsertAgentRun.run(
    runId,
    input.chatId,
    input.userId ?? null,
    input.promptId ?? null,
    input.promptVersion ?? null,
    input.promptHash ?? null,
    input.model,
    input.userQuery,
    input.detectedIntent ?? null,
    'running',
    input.startedAt ?? new Date().toISOString(),
  );
  return runId;
}

export function saveAgentStep(input: SaveAgentStepInput): void {
  saveAgentToolCall({
    runId: input.runId,
    stepNumber: input.stepNumber,
    toolName: input.toolName,
    rawToolInput: input.toolInput,
    effectiveToolInput: input.toolInput,
    toolOutput: input.toolOutput,
    success: true,
  });
}

export function saveAgentToolCall(input: SaveAgentToolCallInput): void {
  const outputSummary = input.success
    ? summarizeToolOutput(input.toolOutput)
    : undefined;
  const { errorType, errorMessage } = getErrorInfo(input.error);
  stmtInsertAgentStep.run(
    input.runId,
    input.stepNumber ?? 0,
    input.toolCallId ?? null,
    input.toolName,
    input.startedAt ?? null,
    input.endedAt ?? null,
    input.durationMs ?? null,
    input.success ? 1 : 0,
    errorType,
    errorMessage,
    compactJson(input.rawToolInput),
    compactJson(input.effectiveToolInput),
    compactJson(input.effectiveToolInput),
    compactJson(outputSummary),
    hashJson(input.toolOutput),
  );
}

export function saveAgentStepTiming(input: SaveAgentStepTimingInput): void {
  stmtUpsertAgentStepTiming.run(
    input.runId,
    input.stepNumber,
    input.modelProvider ?? null,
    input.modelId ?? null,
    input.startedAt ?? null,
    input.endedAt ?? null,
    input.durationMs ?? null,
    input.modelDurationMs ?? null,
    input.toolWallTimeMs ?? null,
    input.toolDurationMs ?? null,
    input.toolCallCount ?? 0,
    input.toolResultCount ?? 0,
    input.promptTokens ?? null,
    input.completionTokens ?? null,
    input.totalTokens ?? null,
    input.finishReason ?? null,
  );
}

export function updateAgentRun(input: UpdateAgentRunInput): void {
  const { errorType, errorMessage } = getErrorInfo(input.error);
  stmtUpdateAgentRun.run(
    input.status,
    input.endedAt ?? null,
    input.durationMs ?? null,
    input.finishReason ?? null,
    input.isAborted ? 1 : 0,
    input.assistantTextLen ?? null,
    input.emptyAssistantCount ?? null,
    input.toolStepCount ?? null,
    input.toolResultCount ?? null,
    input.promptTokens ?? null,
    input.completionTokens ?? null,
    input.totalTokens ?? null,
    errorType,
    errorMessage,
    input.runId,
  );
}

export function listAgentRuns(
  input: ListAgentRunsInput = {},
): AgentRunWithSteps[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (isFilled(input.q)) {
    const like = `%${input.q.trim()}%`;
    where.push(
      '(ar.user_query LIKE ? OR ar.id LIKE ? OR ar.chat_id LIKE ?)',
    );
    params.push(like, like, like);
  }

  if (isFilled(input.intent)) {
    where.push('ar.detected_intent = ?');
    params.push(input.intent.trim());
  }

  if (isFilled(input.tool)) {
    where.push(
      `EXISTS (
        SELECT 1 FROM agent_steps ast
        WHERE ast.run_id = ar.id AND ast.tool_name = ?
      )`,
    );
    params.push(input.tool.trim());
  }

  if (isFilled(input.from)) {
    where.push('ar.created_at >= ?');
    params.push(input.from.trim());
  }

  if (isFilled(input.to)) {
    where.push('ar.created_at <= ?');
    params.push(input.to.trim());
  }

  const sql = `
    SELECT
      ar.*,
      (
        SELECT COUNT(*)
        FROM agent_steps ast
        WHERE ast.run_id = ar.id
      ) AS step_count,
      (
        SELECT GROUP_CONCAT(DISTINCT ast.tool_name)
        FROM agent_steps ast
        WHERE ast.run_id = ar.id AND ast.tool_name IS NOT NULL
      ) AS tool_names
    FROM agent_runs ar
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY datetime(ar.created_at) DESC, ar.created_at DESC
    LIMIT ?
  `;

  const rows = agentDb
    .prepare(sql)
    .all(...params, normalizeLimit(input.limit)) as AgentRunListRow[];

  if (rows.length === 0) return [];

  const runIds = rows.map((row) => row.id);
  const placeholders = runIds.map(() => '?').join(',');
  const stepRows = agentDb
    .prepare(
      `SELECT *
       FROM agent_steps
       WHERE run_id IN (${placeholders})
       ORDER BY run_id, step_number ASC, id ASC`,
    )
    .all(...runIds) as AgentStepRow[];

  const stepsByRun = new Map<string, AgentTraceStep[]>();
  for (const row of stepRows) {
    const steps = stepsByRun.get(row.run_id) ?? [];
    steps.push(mapStep(row));
    stepsByRun.set(row.run_id, steps);
  }

  const stepTimingRows = agentDb
    .prepare(
      `SELECT *
       FROM agent_step_timings
       WHERE run_id IN (${placeholders})
       ORDER BY run_id, step_number ASC, id ASC`,
    )
    .all(...runIds) as AgentStepTimingRow[];

  const stepTimingsByRun = new Map<string, AgentStepTiming[]>();
  for (const row of stepTimingRows) {
    const stepTimings = stepTimingsByRun.get(row.run_id) ?? [];
    stepTimings.push(mapStepTiming(row));
    stepTimingsByRun.set(row.run_id, stepTimings);
  }

  return rows.map((row) => {
    const steps = stepsByRun.get(row.id) ?? [];
    const stepTimings = stepTimingsByRun.get(row.id) ?? [];

    return {
      id: row.id,
      chat_id: row.chat_id,
      user_id: row.user_id,
      prompt_id: row.prompt_id,
      prompt_version: row.prompt_version,
      prompt_hash: row.prompt_hash,
      model: row.model,
      user_query: row.user_query,
      detected_intent: row.detected_intent,
      status: row.status,
      started_at: row.started_at,
      ended_at: row.ended_at,
      duration_ms: row.duration_ms,
      finish_reason: row.finish_reason,
      is_aborted: row.is_aborted,
      assistant_text_len: row.assistant_text_len,
      empty_assistant_count: row.empty_assistant_count,
      tool_step_count: row.tool_step_count,
      tool_result_count: row.tool_result_count,
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      total_tokens: row.total_tokens,
      error_type: row.error_type,
      error_message: row.error_message,
      created_at: row.created_at,
      updated_at: row.updated_at,
      stepCount: row.step_count,
      toolNames: row.tool_names
        ? row.tool_names.split(',').filter(Boolean)
        : [],
      steps,
      stepTimings,
      timingSummary: summarizeTiming(row.duration_ms, stepTimings, steps),
    };
  });
}
