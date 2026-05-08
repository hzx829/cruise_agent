import { generateId } from 'ai';
import agentDb from './agent-db';

interface CreateAgentRunInput {
  chatId: string;
  model: string;
  userQuery: string;
  detectedIntent?: string;
  promptId?: string | null;
}

interface SaveAgentStepInput {
  runId: string;
  stepNumber: number;
  toolName: string;
  toolInput: unknown;
  toolOutput: unknown;
}

export interface AgentRunRow {
  id: string;
  chat_id: string | null;
  prompt_id: string | null;
  model: string | null;
  user_query: string | null;
  detected_intent: string | null;
  created_at: string;
}

interface AgentRunListRow extends AgentRunRow {
  step_count: number;
  tool_names: string | null;
}

interface AgentStepRow {
  id: number;
  run_id: string;
  step_number: number;
  tool_name: string | null;
  tool_input_json: string | null;
  tool_output_summary_json: string | null;
  created_at: string;
}

export interface AgentTraceStep {
  id: number;
  runId: string;
  stepNumber: number;
  toolName: string | null;
  toolInput: unknown;
  toolOutputSummary: unknown;
  createdAt: string;
}

export interface AgentRunWithSteps extends AgentRunRow {
  stepCount: number;
  toolNames: string[];
  steps: AgentTraceStep[];
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
     (id, chat_id, prompt_id, model, user_query, detected_intent)
   VALUES (?, ?, ?, ?, ?, ?)`,
);

const stmtInsertAgentStep = agentDb.prepare(
  `INSERT INTO agent_steps
     (run_id, step_number, tool_name, tool_input_json, tool_output_summary_json)
   VALUES (?, ?, ?, ?, ?)`,
);

function compactJson(value: unknown, maxLength = 8000): string {
  try {
    const json = JSON.stringify(value);
    return json.length > maxLength
      ? `${json.slice(0, maxLength)}...`
      : json;
  } catch {
    return JSON.stringify({ unserializable: true });
  }
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
  return {
    id: row.id,
    runId: row.run_id,
    stepNumber: row.step_number,
    toolName: row.tool_name,
    toolInput: parseStoredJson(row.tool_input_json),
    toolOutputSummary: parseStoredJson(row.tool_output_summary_json),
    createdAt: row.created_at,
  };
}

export function createAgentRun(input: CreateAgentRunInput): string {
  const runId = generateId();
  stmtInsertAgentRun.run(
    runId,
    input.chatId,
    input.promptId ?? null,
    input.model,
    input.userQuery,
    input.detectedIntent ?? null,
  );
  return runId;
}

export function saveAgentStep(input: SaveAgentStepInput): void {
  stmtInsertAgentStep.run(
    input.runId,
    input.stepNumber,
    input.toolName,
    compactJson(input.toolInput),
    compactJson(summarizeToolOutput(input.toolOutput)),
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

  return rows.map((row) => ({
    id: row.id,
    chat_id: row.chat_id,
    prompt_id: row.prompt_id,
    model: row.model,
    user_query: row.user_query,
    detected_intent: row.detected_intent,
    created_at: row.created_at,
    stepCount: row.step_count,
    toolNames: row.tool_names
      ? row.tool_names.split(',').filter(Boolean)
      : [],
    steps: stepsByRun.get(row.id) ?? [],
  }));
}
