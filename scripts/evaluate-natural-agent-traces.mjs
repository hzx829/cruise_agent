#!/usr/bin/env node

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';

const CASES = [
  {
    id: 1,
    query: '天津港有船吗？',
    expectedIntent: 'market_supply',
    requiredTools: ['searchDeals', 'webSearch'],
    requiredInputTerms: { searchDeals: ['天津'], webSearch: ['天津'] },
    forbiddenResponseTerms: ['天津没有船'],
  },
  {
    id: 2,
    query: '天津港暑假最便宜的船',
    expectedIntent: 'price_quote',
    requiredTools: ['searchDeals'],
    requiredInputTerms: { searchDeals: ['天津'] },
    requireWebIfSearchDealsGap: true,
  },
  {
    id: 3,
    query: '不要上海，只看天津港',
    expectedIntent: 'market_supply',
    requiredInputTerms: { searchDeals: ['天津'] },
    forbiddenInputTerms: { webSearch: ['上海'] },
    forbiddenResponseTerms: ['上海出发', '上海母港', '上海港'],
  },
  {
    id: 4,
    query: '上海也可以，天津优先',
    expectedIntent: 'market_supply',
    requiredInputTerms: { searchDeals: ['天津'] },
  },
  {
    id: 5,
    query: '天津港皇家加勒比有吗',
    expectedIntent: 'market_supply',
    requiredTools: ['searchDeals'],
    requiredInputTerms: { searchDeals: ['天津', '皇家'] },
    requireWebIfSearchDealsGap: true,
  },
  {
    id: 6,
    query: 'MSC 中国母港有哪些',
    expectedIntent: 'market_supply',
    requiredTools: ['webSearch'],
    requiredInputTerms: { webSearch: ['MSC', '中国'] },
  },
  {
    id: 7,
    query: '雅典往返，不要开口',
    requiredTools: ['searchDeals'],
    requiredInputTerms: { searchDeals: ['雅典', 'true'] },
  },
  {
    id: 8,
    query: '经停圣托里尼',
    requiredTools: ['searchDeals'],
    requiredInputTerms: { searchDeals: ['圣托里尼'] },
  },
  {
    id: 9,
    query: '皇家和 MSC 餐饮哪个好',
    expectedIntent: 'comparison',
    requiredAnyTool: ['webSearch', 'cruiseEncyclopedia'],
    forbiddenTools: ['searchDeals'],
  },
  {
    id: 10,
    query: '这条 deal 值得买吗',
    requiredAnyTool: ['searchDeals', 'getPriceHistory', 'webSearch', 'cruiseEncyclopedia'],
  },
  {
    id: 11,
    query: '不要联网，只看你接入的价格源',
    forbiddenTools: ['webSearch', 'cruiseEncyclopedia'],
  },
  {
    id: 12,
    query: '帮我查网络上天津港最新邮轮信息',
    requiredTools: ['webSearch'],
    requiredInputTerms: { webSearch: ['天津'] },
  },
];

function parseArgs(argv) {
  return {
    allowMissing: argv.includes('--allow-missing'),
    json: argv.includes('--json'),
    dbPath:
      argv.find((arg) => arg.startsWith('--db='))?.slice('--db='.length) ||
      process.env.AGENT_DB_PATH ||
      path.resolve(process.cwd(), 'data/agent.db'),
  };
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

function getLatestRun(db, query) {
  return db
    .prepare(
      `SELECT *
       FROM agent_runs
       WHERE user_query = ?
       ORDER BY datetime(created_at) DESC, created_at DESC
       LIMIT 1`,
    )
    .get(query);
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

function evaluateCase(db, smokeCase) {
  const run = getLatestRun(db, smokeCase.query);
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

const db = new Database(options.dbPath, { readonly: true });
const results = CASES.map((smokeCase) => evaluateCase(db, smokeCase));
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
