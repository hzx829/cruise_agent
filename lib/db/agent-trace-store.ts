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
