#!/usr/bin/env node

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_SLOW_RUN_MS = 30_000;
const DEFAULT_SLOW_TOOL_MS = 5_000;

function parseArgs(argv) {
  const options = {
    dbPath:
      process.env.AGENT_DB_PATH ||
      path.resolve(process.cwd(), 'data/agent.db'),
    format: 'markdown',
    limit: 20,
    q: '',
    intent: '',
    tool: '',
    status: '',
    since: '',
    slowRunMs: DEFAULT_SLOW_RUN_MS,
    slowToolMs: DEFAULT_SLOW_TOOL_MS,
  };

  for (const arg of argv) {
    if (arg === '--json') options.format = 'json';
    else if (arg === '--jsonl') options.format = 'jsonl';
    else if (arg === '--markdown') options.format = 'markdown';
    else if (arg.startsWith('--format=')) options.format = arg.slice(9);
    else if (arg.startsWith('--db=')) options.dbPath = arg.slice(5);
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice(8));
    else if (arg.startsWith('--q=')) options.q = arg.slice(4);
    else if (arg.startsWith('--intent=')) options.intent = arg.slice(9);
    else if (arg.startsWith('--tool=')) options.tool = arg.slice(7);
    else if (arg.startsWith('--status=')) options.status = arg.slice(9);
    else if (arg.startsWith('--since=')) options.since = arg.slice(8);
    else if (arg.startsWith('--slow-run-ms=')) {
      options.slowRunMs = Number(arg.slice(14));
    } else if (arg.startsWith('--slow-tool-ms=')) {
      options.slowToolMs = Number(arg.slice(15));
    }
  }

  options.limit = normalizeLimit(options.limit);
  options.slowRunMs = Number.isFinite(options.slowRunMs)
    ? options.slowRunMs
    : DEFAULT_SLOW_RUN_MS;
  options.slowToolMs = Number.isFinite(options.slowToolMs)
    ? options.slowToolMs
    : DEFAULT_SLOW_TOOL_MS;
  return options;
}

function normalizeLimit(value) {
  if (!Number.isFinite(value)) return 20;
  return Math.min(Math.max(Math.trunc(value), 1), 200);
}

function parseSince(value) {
  if (!value) return null;
  const relative = value.match(/^(\d+)(m|h|d)$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const multiplier = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return new Date(Date.now() - amount * multiplier).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function hasColumn(db, tableName, columnName) {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((row) => row.name === columnName);
}

function hasTable(db, tableName) {
  return Boolean(
    db
      .prepare(
        `SELECT 1
         FROM sqlite_master
         WHERE type = 'table' AND name = ?
         LIMIT 1`,
      )
      .get(tableName),
  );
}

function selectColumn(db, tableName, columnName, fallback = 'NULL') {
  return hasColumn(db, tableName, columnName)
    ? columnName
    : `${fallback} AS ${columnName}`;
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function sumNullable(values, select) {
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

function summarizeTiming(runDurationMs, stepTimings, toolSteps) {
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

function loadRuns(db, options) {
  const since = parseSince(options.since);
  const runColumns = [
    'id',
    'chat_id',
    selectColumn(db, 'agent_runs', 'prompt_id'),
    selectColumn(db, 'agent_runs', 'prompt_version'),
    selectColumn(db, 'agent_runs', 'prompt_hash'),
    'model',
    'user_query',
    'detected_intent',
    selectColumn(db, 'agent_runs', 'status', "'unknown'"),
    selectColumn(db, 'agent_runs', 'started_at', 'created_at'),
    selectColumn(db, 'agent_runs', 'ended_at'),
    selectColumn(db, 'agent_runs', 'duration_ms'),
    selectColumn(db, 'agent_runs', 'finish_reason'),
    selectColumn(db, 'agent_runs', 'is_aborted', '0'),
    selectColumn(db, 'agent_runs', 'assistant_text_len'),
    selectColumn(db, 'agent_runs', 'empty_assistant_count'),
    selectColumn(db, 'agent_runs', 'tool_step_count'),
    selectColumn(db, 'agent_runs', 'tool_result_count'),
    selectColumn(db, 'agent_runs', 'prompt_tokens'),
    selectColumn(db, 'agent_runs', 'completion_tokens'),
    selectColumn(db, 'agent_runs', 'total_tokens'),
    selectColumn(db, 'agent_runs', 'error_type'),
    selectColumn(db, 'agent_runs', 'error_message'),
    'created_at',
  ];

  const where = [];
  const params = [];

  if (options.q) {
    const like = `%${options.q}%`;
    where.push('(user_query LIKE ? OR id LIKE ? OR chat_id LIKE ?)');
    params.push(like, like, like);
  }
  if (options.intent) {
    where.push('detected_intent = ?');
    params.push(options.intent);
  }
  if (options.status && hasColumn(db, 'agent_runs', 'status')) {
    where.push('status = ?');
    params.push(options.status);
  }
  if (since) {
    where.push('datetime(created_at) >= datetime(?)');
    params.push(since);
  }
  if (options.tool) {
    where.push(
      `EXISTS (
        SELECT 1 FROM agent_steps ast
        WHERE ast.run_id = agent_runs.id AND ast.tool_name = ?
      )`,
    );
    params.push(options.tool);
  }

  const rows = db
    .prepare(
      `SELECT ${runColumns.join(', ')}
       FROM agent_runs
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY datetime(created_at) DESC, created_at DESC
       LIMIT ?`,
    )
    .all(...params, options.limit);

  if (rows.length === 0) return [];

  const ids = rows.map((run) => run.id);
  const placeholders = ids.map(() => '?').join(',');
  const stepColumns = [
    'id',
    'run_id',
    'step_number',
    selectColumn(db, 'agent_steps', 'tool_call_id'),
    'tool_name',
    selectColumn(db, 'agent_steps', 'started_at', 'created_at'),
    selectColumn(db, 'agent_steps', 'ended_at'),
    selectColumn(db, 'agent_steps', 'duration_ms'),
    selectColumn(db, 'agent_steps', 'success'),
    selectColumn(db, 'agent_steps', 'error_type'),
    selectColumn(db, 'agent_steps', 'error_message'),
    selectColumn(db, 'agent_steps', 'raw_tool_input_json'),
    selectColumn(db, 'agent_steps', 'effective_tool_input_json'),
    'tool_input_json',
    'tool_output_summary_json',
    selectColumn(db, 'agent_steps', 'tool_output_hash'),
    'created_at',
  ];
  const stepRows = db
    .prepare(
      `SELECT ${stepColumns.join(', ')}
       FROM agent_steps
       WHERE run_id IN (${placeholders})
       ORDER BY run_id, step_number ASC, id ASC`,
    )
    .all(...ids)
    .map((step) => ({
      id: step.id,
      runId: step.run_id,
      stepNumber: step.step_number,
      toolCallId: step.tool_call_id,
      toolName: step.tool_name,
      startedAt: step.started_at,
      endedAt: step.ended_at,
      durationMs: step.duration_ms,
      success: step.success == null ? null : Boolean(step.success),
      errorType: step.error_type,
      errorMessage: step.error_message,
      rawToolInput: parseJson(step.raw_tool_input_json),
      effectiveToolInput: parseJson(step.effective_tool_input_json ?? step.tool_input_json),
      toolInput: parseJson(step.tool_input_json),
      outputSummary: parseJson(step.tool_output_summary_json),
      outputHash: step.tool_output_hash,
      createdAt: step.created_at,
    }));

  const stepsByRun = new Map();
  for (const step of stepRows) {
    const steps = stepsByRun.get(step.runId) ?? [];
    steps.push(step);
    stepsByRun.set(step.runId, steps);
  }

  const stepTimingRows = hasTable(db, 'agent_step_timings')
    ? db
        .prepare(
          `SELECT
             id,
             run_id,
             step_number,
             ${selectColumn(db, 'agent_step_timings', 'model_provider')},
             ${selectColumn(db, 'agent_step_timings', 'model_id')},
             ${selectColumn(db, 'agent_step_timings', 'started_at')},
             ${selectColumn(db, 'agent_step_timings', 'ended_at')},
             ${selectColumn(db, 'agent_step_timings', 'duration_ms')},
             ${selectColumn(db, 'agent_step_timings', 'model_duration_ms')},
             ${selectColumn(db, 'agent_step_timings', 'tool_wall_time_ms')},
             ${selectColumn(db, 'agent_step_timings', 'tool_duration_ms')},
             ${selectColumn(db, 'agent_step_timings', 'tool_call_count')},
             ${selectColumn(db, 'agent_step_timings', 'tool_result_count')},
             ${selectColumn(db, 'agent_step_timings', 'prompt_tokens')},
             ${selectColumn(db, 'agent_step_timings', 'completion_tokens')},
             ${selectColumn(db, 'agent_step_timings', 'total_tokens')},
             ${selectColumn(db, 'agent_step_timings', 'finish_reason')},
             created_at
           FROM agent_step_timings
           WHERE run_id IN (${placeholders})
           ORDER BY run_id, step_number ASC, id ASC`,
        )
        .all(...ids)
        .map((step) => ({
          id: step.id,
          runId: step.run_id,
          stepNumber: step.step_number,
          modelProvider: step.model_provider,
          modelId: step.model_id,
          startedAt: step.started_at,
          endedAt: step.ended_at,
          durationMs: step.duration_ms,
          modelDurationMs: step.model_duration_ms,
          toolWallTimeMs: step.tool_wall_time_ms,
          toolDurationMs: step.tool_duration_ms,
          toolCallCount: step.tool_call_count,
          toolResultCount: step.tool_result_count,
          promptTokens: step.prompt_tokens,
          completionTokens: step.completion_tokens,
          totalTokens: step.total_tokens,
          finishReason: step.finish_reason,
          createdAt: step.created_at,
        }))
    : [];

  const stepTimingsByRun = new Map();
  for (const stepTiming of stepTimingRows) {
    const stepTimings = stepTimingsByRun.get(stepTiming.runId) ?? [];
    stepTimings.push(stepTiming);
    stepTimingsByRun.set(stepTiming.runId, stepTimings);
  }

  return rows.map((run) => {
    const steps = stepsByRun.get(run.id) ?? [];
    const stepTimings = stepTimingsByRun.get(run.id) ?? [];
    return {
      id: run.id,
      chatId: run.chat_id,
      promptId: run.prompt_id,
      promptVersion: run.prompt_version,
      promptHash: run.prompt_hash,
      model: run.model,
      userQuery: run.user_query,
      detectedIntent: run.detected_intent,
      status: run.status,
      startedAt: run.started_at,
      endedAt: run.ended_at,
      durationMs: run.duration_ms,
      finishReason: run.finish_reason,
      isAborted: Boolean(run.is_aborted),
      assistantTextLen: run.assistant_text_len,
      emptyAssistantCount: run.empty_assistant_count,
      toolStepCount: run.tool_step_count,
      toolResultCount: run.tool_result_count,
      promptTokens: run.prompt_tokens,
      completionTokens: run.completion_tokens,
      totalTokens: run.total_tokens,
      errorType: run.error_type,
      errorMessage: run.error_message,
      createdAt: run.created_at,
      toolNames: [...new Set(steps.map((step) => step.toolName).filter(Boolean))],
      steps,
      stepTimings,
      timingSummary: summarizeTiming(run.duration_ms, stepTimings, steps),
    };
  });
}

function hasSearchGap(step) {
  if (step.toolName !== 'searchDeals') return false;
  const output = asRecord(step.outputSummary);
  return (
    output.count === 0 ||
    output.coverageStatus === 'no_exact_match' ||
    output.coverageStatus === 'source_gap_possible'
  );
}

function getFlags(run, options) {
  const flags = [];
  const hasWebSearch = run.steps.some((step) => step.toolName === 'webSearch');
  const repeatedTools = new Map();

  for (const step of run.steps) {
    repeatedTools.set(step.toolName, (repeatedTools.get(step.toolName) ?? 0) + 1);
    if ((step.durationMs ?? 0) >= options.slowToolMs) flags.push('slow_tool');
    if (step.success === false) flags.push('tool_error');
    if (hasSearchGap(step) && !hasWebSearch) flags.push('search_gap_without_web');
    if (step.toolName === 'webSearch') {
      const output = asRecord(step.outputSummary);
      const sources = Array.isArray(output.sources) ? output.sources : [];
      if (sources.length === 0 && (output.resultCount === 0 || output.results?.count === 0)) {
        flags.push('web_no_sources');
      }
    }
  }

  for (const [, count] of repeatedTools) {
    if (count >= 3) flags.push('tool_loop_repeated');
  }

  if ((run.durationMs ?? 0) >= options.slowRunMs) flags.push('slow_run');
  if ((run.timingSummary?.modelDurationMs ?? 0) >= options.slowRunMs) {
    flags.push('slow_model_stream');
  }
  if ((run.timingSummary?.unattributedDurationMs ?? 0) >= options.slowRunMs) {
    flags.push('slow_unattributed');
  }
  if ((run.assistantTextLen ?? 1) === 0 || (run.emptyAssistantCount ?? 0) > 0) {
    flags.push('empty_answer');
  }
  if (run.status && !['completed', 'unknown'].includes(run.status)) {
    flags.push(`run_${run.status}`);
  }
  if (
    run.steps.length === 0 &&
    ['price_quote', 'market_supply', 'review', 'comparison', 'copywriting', 'analytics'].includes(
      run.detectedIntent,
    )
  ) {
    flags.push('zero_tool_but_tool_expected');
  }

  return [...new Set(flags)];
}

function enrichRuns(runs, options) {
  return runs.map((run) => ({
    ...run,
    flags: getFlags(run, options),
  }));
}

function compact(value, max = 700) {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function formatDuration(ms) {
  if (ms == null) return '-';
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${ms}ms`;
}

function printMarkdown(runs, options) {
  console.log('# Agent Trace Inspect\n');
  console.log(`DB: \`${options.dbPath}\``);
  if (options.since) console.log(`Since: \`${options.since}\``);
  console.log('');

  if (runs.length === 0) {
    console.log('No runs matched the filters.');
    return;
  }

  for (const run of runs) {
    console.log(`## ${run.createdAt} ${run.status || 'unknown'} ${run.id}`);
    console.log('');
    console.log(`- query: ${run.userQuery || '(empty)'}`);
    console.log(`- intent/model: ${run.detectedIntent || '-'} / ${run.model || '-'}`);
    console.log(`- duration: ${formatDuration(run.durationMs)}, finish: ${run.finishReason || '-'}`);
    console.log(
      `- timing: observed=${formatDuration(run.timingSummary.observedDurationMs)}, step=${formatDuration(run.timingSummary.stepDurationMs)}, model/stream=${formatDuration(run.timingSummary.modelDurationMs)}, tool_wall=${formatDuration(run.timingSummary.toolWallTimeMs)}, tool_sum=${formatDuration(run.timingSummary.toolDurationMs)}, unattributed=${formatDuration(run.timingSummary.unattributedDurationMs)}`,
    );
    console.log(
      `- tokens: total=${run.totalTokens ?? '-'}, input=${run.promptTokens ?? '-'}, output=${run.completionTokens ?? '-'}`,
    );
    console.log(
      `- prompt: v${run.promptVersion ?? '-'} ${run.promptHash ? run.promptHash.slice(0, 12) : '-'}`,
    );
    console.log(`- tools: ${run.toolNames.join(', ') || 'none'}`);
    console.log(`- flags: ${run.flags.join(', ') || 'none'}`);
    if (run.errorMessage) console.log(`- error: ${run.errorType || 'Error'}: ${run.errorMessage}`);
    console.log('');

    if (run.stepTimings.length > 0) {
      console.log('### LLM Step Timeline');
      console.log('');
      for (const timing of run.stepTimings) {
        const model =
          timing.modelProvider && timing.modelId
            ? `${timing.modelProvider}/${timing.modelId}`
            : timing.modelId || '-';
        console.log(
          `- step ${timing.stepNumber}: total=${formatDuration(timing.durationMs)}, model/stream=${formatDuration(timing.modelDurationMs)}, tool_wall=${formatDuration(timing.toolWallTimeMs)}, tool_sum=${formatDuration(timing.toolDurationMs)}, tools=${timing.toolCallCount ?? 0}/${timing.toolResultCount ?? 0}, tokens=${timing.totalTokens ?? '-'} (${timing.promptTokens ?? '-'}/${timing.completionTokens ?? '-'}), finish=${timing.finishReason || '-'}, model=${model}`,
        );
      }
      console.log('');
    } else if (run.timingSummary.unattributedDurationMs != null) {
      console.log(
        `Step timing was not recorded for this run; unattributed time is ${formatDuration(run.timingSummary.unattributedDurationMs)}.`,
      );
      console.log('');
    }

    for (const step of run.steps) {
      console.log(
        `### Step ${step.stepNumber} ${step.toolName || 'unknown'} ${formatDuration(step.durationMs)} ${step.success === false ? 'error' : 'ok'}`,
      );
      if (step.errorMessage) {
        console.log(`error: ${step.errorType || 'Error'}: ${step.errorMessage}`);
      }
      console.log('');
      console.log('input:');
      console.log('```json');
      console.log(compact(step.effectiveToolInput ?? step.toolInput));
      console.log('```');
      console.log('output summary:');
      console.log('```json');
      console.log(compact(step.outputSummary));
      console.log('```');
      console.log('');
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.dbPath)) {
    console.error(`agent db not found: ${options.dbPath}`);
    process.exit(1);
  }

  const db = new Database(options.dbPath, { readonly: true });
  const runs = enrichRuns(loadRuns(db, options), options);
  db.close();

  if (options.format === 'json') {
    console.log(JSON.stringify({ dbPath: options.dbPath, runs }, null, 2));
  } else if (options.format === 'jsonl') {
    for (const run of runs) console.log(JSON.stringify(run));
  } else {
    printMarkdown(runs, options);
  }
}

main();
