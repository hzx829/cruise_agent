#!/usr/bin/env node

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CASES as DEFAULT_CASES } from './natural-agent-smoke-cases.mjs';

function parseArgs(argv) {
  return {
    allowMissing: argv.includes('--allow-missing'),
    json: argv.includes('--json'),
    casesPath: argv.find((arg) => arg.startsWith('--cases='))?.slice('--cases='.length),
    caseIds:
      argv
        .find((arg) => arg.startsWith('--case='))
        ?.slice('--case='.length)
        .split(',')
        .map((value) => Number(value.trim()))
        .filter(Number.isFinite) ?? [],
    sinceRunStart:
      argv.find((arg) => arg.startsWith('--since-run-start='))?.slice(
        '--since-run-start='.length,
      ) ||
      argv.find((arg) => arg.startsWith('--from='))?.slice('--from='.length),
    dbPath:
      argv.find((arg) => arg.startsWith('--db='))?.slice('--db='.length) ||
      process.env.AGENT_DB_PATH ||
      path.resolve(process.cwd(), 'data/agent.db'),
  };
}

async function loadCases(casesPath) {
  if (!casesPath) return DEFAULT_CASES;

  const resolved = path.resolve(process.cwd(), casesPath);
  if (!existsSync(resolved)) {
    throw new Error(`cases file not found: ${resolved}`);
  }

  if (resolved.endsWith('.json')) {
    const { readFile } = await import('node:fs/promises');
    const parsed = JSON.parse(await readFile(resolved, 'utf8'));
    return Array.isArray(parsed) ? parsed : parsed.cases;
  }

  const mod = await import(`file://${resolved}`);
  return mod.CASES ?? mod.default;
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function textOf(value) {
  return JSON.stringify(value ?? '');
}

const MALFORMED_TOOL_ARTIFACT_PATTERN =
  /\b(?:ActionCreators|StackNavigator)\b|(?:^|\s)(?:webSearch|searchDeals|cruiseEncyclopedia|lookupShips)\s*\(/i;

function getLatestRun(db, query, options) {
  const where = ['user_query = ?'];
  const params = [query];
  if (options.sinceRunStart) {
    where.push('datetime(created_at) >= datetime(?)');
    params.push(options.sinceRunStart);
  }

  return db
    .prepare(
      `SELECT *
       FROM agent_runs
       WHERE ${where.join(' AND ')}
       ORDER BY datetime(created_at) DESC, created_at DESC
       LIMIT 1`,
    )
    .get(...params);
}

function getRunSteps(db, runId) {
  return db
    .prepare(
      `SELECT *
       FROM agent_steps
       WHERE run_id = ?
       ORDER BY step_number ASC, id ASC`,
    )
    .all(runId)
    .map((step) => ({
      ...step,
      input: parseJson(step.tool_input_json),
      output: parseJson(step.tool_output_summary_json),
    }));
}

function getAssistantText(db, run) {
  if (!run.chat_id) return '';

  const row = db
    .prepare(
      `SELECT parts_json
       FROM messages
       WHERE chat_id = ?
         AND role = 'assistant'
         AND created_at >= ?
       ORDER BY datetime(created_at) DESC, created_at DESC
       LIMIT 1`,
    )
    .get(run.chat_id, run.created_at);

  const parts = parseJson(row?.parts_json);
  if (!Array.isArray(parts)) return '';

  return parts
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      return typeof part.text === 'string' ? part.text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function hasSearchDealsGap(steps) {
  return steps
    .filter((step) => step.tool_name === 'searchDeals')
    .some((step) => {
      const output = step.output && typeof step.output === 'object' ? step.output : {};
      return (
        output.count === 0 ||
        output.coverageStatus === 'no_exact_match' ||
        output.coverageStatus === 'source_gap_possible'
      );
    });
}

function includesTerm(haystack, term) {
  return haystack.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

function evaluateCase(db, smokeCase, options) {
  const run = getLatestRun(db, smokeCase.query, options);
  if (!run) {
    return {
      id: smokeCase.id,
      query: smokeCase.query,
      status: 'missing',
      details: ['没有找到这条 query 的 agent run'],
    };
  }

  const steps = getRunSteps(db, run.id);
  const assistantText = getAssistantText(db, run);
  const toolNames = steps.map((step) => step.tool_name).filter(Boolean);
  const failures = [];

  const allowedStatuses = options.sinceRunStart
    ? ['completed']
    : ['completed', 'running'];
  if (run.status && !allowedStatuses.includes(run.status)) {
    failures.push(`run status=${run.status}`);
  }

  if (run.assistant_text_len === 0 || run.empty_assistant_count > 0) {
    failures.push('assistant 输出为空或不可渲染');
  }

  if (MALFORMED_TOOL_ARTIFACT_PATTERN.test(assistantText)) {
    failures.push('assistant 输出包含伪工具调用残片');
  }

  if (
    smokeCase.expectedIntent &&
    run.detected_intent !== smokeCase.expectedIntent
  ) {
    failures.push(
      `intent=${run.detected_intent || 'null'}，期望 ${smokeCase.expectedIntent}`,
    );
  }

  for (const toolName of smokeCase.requiredTools ?? []) {
    if (!toolNames.includes(toolName)) {
      failures.push(`缺少工具调用 ${toolName}`);
    }
  }

  if (smokeCase.requiredAnyTool) {
    const hasAny = smokeCase.requiredAnyTool.some((toolName) =>
      toolNames.includes(toolName),
    );
    if (!hasAny) {
      failures.push(`缺少任一工具调用：${smokeCase.requiredAnyTool.join(' / ')}`);
    }
  }

  if (smokeCase.requireWebIfSearchDealsGap && hasSearchDealsGap(steps)) {
    if (!toolNames.includes('webSearch')) {
      failures.push('searchDeals 覆盖缺口后没有调用 webSearch');
    }
  }

  for (const toolName of smokeCase.forbiddenTools ?? []) {
    if (toolNames.includes(toolName)) {
      failures.push(`不应调用 ${toolName}`);
    }
  }

  for (const [toolName, terms] of Object.entries(smokeCase.requiredInputTerms ?? {})) {
    const inputText = steps
      .filter((step) => step.tool_name === toolName)
      .map((step) => textOf(step.input))
      .join('\n');

    for (const term of terms) {
      if (!includesTerm(inputText, term)) {
        failures.push(`${toolName} input 缺少 ${term}`);
      }
    }
  }

  for (const [toolName, terms] of Object.entries(smokeCase.forbiddenInputTerms ?? {})) {
    const inputText = steps
      .filter((step) => step.tool_name === toolName)
      .map((step) => textOf(step.input))
      .join('\n');

    for (const term of terms) {
      if (includesTerm(inputText, term)) {
        failures.push(`${toolName} input 不应包含 ${term}`);
      }
    }
  }

  for (const term of smokeCase.forbiddenResponseTerms ?? []) {
    if (includesTerm(assistantText, term)) {
      failures.push(`回答不应包含 ${term}`);
    }
  }

  return {
    id: smokeCase.id,
    query: smokeCase.query,
    runId: run.id,
    status: failures.length ? 'fail' : 'pass',
    details: failures,
    intent: run.detected_intent,
    tools: [...new Set(toolNames)],
  };
}

function printMarkdown(results, options) {
  console.log('# Natural Agent Trace Eval\n');
  console.log(`DB: \`${options.dbPath}\``);
  if (options.sinceRunStart) {
    console.log(`Since run start: \`${options.sinceRunStart}\``);
  }
  console.log('');
  console.log('| # | 状态 | 用例 | intent | tools | 说明 |');
  console.log('|---|------|------|--------|-------|------|');
  for (const result of results) {
    console.log(
      [
        result.id,
        result.status,
        result.query,
        result.intent ?? '-',
        result.tools?.join(', ') || '-',
        result.details.join('; ') || '-',
      ]
        .map((value) => String(value).replaceAll('|', '\\|'))
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    );
  }
}

const options = parseArgs(process.argv.slice(2));

if (!existsSync(options.dbPath)) {
  console.error(`agent db not found: ${options.dbPath}`);
  process.exit(1);
}

const cases = await loadCases(options.casesPath);
if (!Array.isArray(cases)) {
  console.error('cases file must export an array or { cases: [...] }');
  process.exit(1);
}
const selectedCases = options.caseIds.length
  ? cases.filter((smokeCase) => options.caseIds.includes(smokeCase.id))
  : cases;

const db = new Database(options.dbPath, { readonly: true });
const results = selectedCases.map((smokeCase) => evaluateCase(db, smokeCase, options));
db.close();

if (options.json) {
  console.log(JSON.stringify({ dbPath: options.dbPath, results }, null, 2));
} else {
  printMarkdown(results, options);
}

const hasBlockingResult = results.some(
  (result) =>
    result.status === 'fail' ||
    (result.status === 'missing' && !options.allowMissing),
);

process.exitCode = hasBlockingResult ? 1 : 0;
