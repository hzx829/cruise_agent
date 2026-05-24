#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CASES as DEFAULT_CASES } from './natural-agent-smoke-cases.mjs';

function parseArgs(argv) {
  return {
    baseUrl:
      argv.find((arg) => arg.startsWith('--base-url='))?.slice('--base-url='.length) ||
      process.env.AGENT_BASE_URL ||
      'http://localhost:3000',
    dbPath:
      argv.find((arg) => arg.startsWith('--db='))?.slice('--db='.length) ||
      process.env.AGENT_DB_PATH ||
      path.resolve(process.cwd(), 'data/agent.db'),
    casesPath: argv.find((arg) => arg.startsWith('--cases='))?.slice('--cases='.length),
    json: argv.includes('--json'),
    dryRun: argv.includes('--dry-run'),
    caseIds:
      argv
        .find((arg) => arg.startsWith('--case='))
        ?.slice('--case='.length)
        .split(',')
        .map((value) => Number(value.trim()))
        .filter(Number.isFinite) ?? [],
    delayMs:
      Number(argv.find((arg) => arg.startsWith('--delay-ms='))?.slice('--delay-ms='.length)) ||
      0,
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildChatPayload(smokeCase) {
  return {
    id: `smoke-${smokeCase.id}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    message: {
      id: `msg-${randomUUID().replaceAll('-', '').slice(0, 16)}`,
      role: 'user',
      parts: [{ type: 'text', text: smokeCase.query, state: 'done' }],
    },
  };
}

async function runCase(baseUrl, smokeCase) {
  const url = new URL('/api/chat', baseUrl);
  const payload = buildChatPayload(smokeCase);
  const startedAt = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  return {
    id: smokeCase.id,
    query: smokeCase.query,
    chatId: payload.id,
    ok: response.ok,
    status: response.status,
    durationMs: Date.now() - startedAt,
    responseBytes: body.length,
    errorSnippet: response.ok ? '' : body.slice(0, 500),
  };
}

function printRunResults(results, runStartedAt) {
  console.log('# Natural Agent Smoke Run\n');
  console.log(`since-run-start: \`${runStartedAt}\``);
  console.log('');
  console.log('| # | HTTP | ms | bytes | query |');
  console.log('|---|------|----|-------|-------|');
  for (const result of results) {
    console.log(
      [
        result.id,
        result.ok ? 'ok' : `fail ${result.status}`,
        result.durationMs,
        result.responseBytes,
        result.query,
      ]
        .map((value) => String(value).replaceAll('|', '\\|'))
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    );
  }
  console.log('');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const allCases = await loadCases(options.casesPath);
  const cases = options.caseIds.length
    ? allCases.filter((smokeCase) => options.caseIds.includes(smokeCase.id))
    : allCases;

  if (!Array.isArray(cases) || cases.length === 0) {
    console.error('no smoke cases selected');
    process.exit(1);
  }

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          baseUrl: options.baseUrl,
          dbPath: options.dbPath,
          cases: cases.map((smokeCase) => ({
            id: smokeCase.id,
            query: smokeCase.query,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  const runStartedAt = new Date().toISOString();
  const results = [];
  for (const smokeCase of cases) {
    console.error(`[smoke] ${smokeCase.id}: ${smokeCase.query}`);
    results.push(await runCase(options.baseUrl, smokeCase));
    if (options.delayMs > 0) await sleep(options.delayMs);
  }

  if (options.json) {
    console.log(JSON.stringify({ runStartedAt, results }, null, 2));
  } else {
    printRunResults(results, runStartedAt);
  }

  const failedRequests = results.filter((result) => !result.ok);
  const evalArgs = [
    'scripts/evaluate-natural-agent-traces.mjs',
    `--db=${options.dbPath}`,
    `--since-run-start=${runStartedAt}`,
  ];
  if (options.casesPath) evalArgs.push(`--cases=${options.casesPath}`);
  if (options.caseIds.length) evalArgs.push(`--case=${options.caseIds.join(',')}`);
  if (options.json) evalArgs.push('--json');

  const evalResult = spawnSync(process.execPath, evalArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  if (failedRequests.length > 0) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = evalResult.status ?? 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
