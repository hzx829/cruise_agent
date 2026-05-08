import { generateId } from 'ai';
import agentDb from '@/lib/db/agent-db';
import {
  DEFAULT_SYSTEM_PROMPT_TEMPLATE,
  buildTemplateFromLegacyProductPrompt,
  isLegacyProductPromptContent,
} from './prompt-template';

export interface AgentPromptRow {
  id: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  content: string;
  change_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
}

export interface PromptListResult {
  active: AgentPromptRow;
  drafts: AgentPromptRow[];
  history: AgentPromptRow[];
}

interface SavePromptDraftInput {
  content: string;
  changeNote?: string | null;
  createdBy?: string | null;
}

const stmtGetActive = agentDb.prepare(
  'SELECT * FROM agent_prompts WHERE status = ? ORDER BY version DESC LIMIT 1',
);

const stmtGetById = agentDb.prepare(
  'SELECT * FROM agent_prompts WHERE id = ?',
);

const stmtGetNextVersion = agentDb.prepare(
  'SELECT COALESCE(MAX(version), 0) + 1 as version FROM agent_prompts',
);

const stmtInsert = agentDb.prepare(
  `INSERT INTO agent_prompts (
    id, version, status, content, change_note, created_by, activated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

const stmtArchiveActive = agentDb.prepare(
  `UPDATE agent_prompts
   SET status = 'archived', updated_at = datetime('now')
   WHERE status = 'active'`,
);

const stmtActivate = agentDb.prepare(
  `UPDATE agent_prompts
   SET status = 'active', activated_at = datetime('now'), updated_at = datetime('now')
   WHERE id = ?`,
);

const stmtListByStatus = agentDb.prepare(
  'SELECT * FROM agent_prompts WHERE status = ? ORDER BY version DESC',
);

const ensureDefaultActivePromptTx = agentDb.transaction(() => {
  const active = stmtGetActive.get('active') as AgentPromptRow | undefined;
  if (active) {
    if (isLegacyProductPromptContent(active.content)) {
      return migrateLegacyProductPrompt(active);
    }
    return active;
  }

  const nextVersion = getNextVersion();
  const id = generateId();
  stmtArchiveActive.run();
  stmtInsert.run(
    id,
    nextVersion,
    'active',
    DEFAULT_SYSTEM_PROMPT_TEMPLATE,
    '系统初始化默认完整 prompt 模板',
    'system',
    new Date().toISOString(),
  );

  return stmtGetById.get(id) as AgentPromptRow;
});

function migrateLegacyProductPrompt(active: AgentPromptRow): AgentPromptRow {
  const id = generateId();
  stmtArchiveActive.run();
  stmtInsert.run(
    id,
    getNextVersion(),
    'active',
    buildTemplateFromLegacyProductPrompt(active.content),
    `系统迁移：基于 v${active.version} 生成完整 prompt 模板`,
    'system',
    new Date().toISOString(),
  );

  return stmtGetById.get(id) as AgentPromptRow;
}

const savePromptDraftTx = agentDb.transaction((input: SavePromptDraftInput) => {
  const id = generateId();
  stmtInsert.run(
    id,
    getNextVersion(),
    'draft',
    normalizePromptContent(input.content),
    input.changeNote || null,
    input.createdBy || null,
    null,
  );

  return stmtGetById.get(id) as AgentPromptRow;
});

const activatePromptTx = agentDb.transaction((id: string) => {
  const prompt = stmtGetById.get(id) as AgentPromptRow | undefined;
  if (!prompt) {
    throw new Error(`Prompt not found: ${id}`);
  }

  if (prompt.status === 'active') {
    return prompt;
  }

  stmtArchiveActive.run();
  stmtActivate.run(id);
  return stmtGetById.get(id) as AgentPromptRow;
});

const rollbackPromptTx = agentDb.transaction((id: string) => {
  const source = stmtGetById.get(id) as AgentPromptRow | undefined;
  if (!source) {
    throw new Error(`Prompt not found: ${id}`);
  }

  const newId = generateId();
  stmtArchiveActive.run();
  stmtInsert.run(
    newId,
    getNextVersion(),
    'active',
    source.content,
    `回滚自 v${source.version}`,
    'system',
    new Date().toISOString(),
  );

  return stmtGetById.get(newId) as AgentPromptRow;
});

function normalizePromptContent(content: string): string {
  const normalized = content.trim();
  if (!normalized) {
    throw new Error('Prompt content cannot be empty.');
  }
  return normalized;
}

function getNextVersion(): number {
  const row = stmtGetNextVersion.get() as { version: number };
  return row.version;
}

export function getActiveProductPrompt(): AgentPromptRow {
  return ensureDefaultActivePromptTx();
}

export function getActivePromptTemplate(): AgentPromptRow {
  return ensureDefaultActivePromptTx();
}

export function getPromptById(id: string): AgentPromptRow | undefined {
  return stmtGetById.get(id) as AgentPromptRow | undefined;
}

export function savePromptDraft(input: SavePromptDraftInput): AgentPromptRow {
  return savePromptDraftTx(input);
}

export function activatePrompt(id: string): AgentPromptRow {
  return activatePromptTx(id);
}

export function rollbackPrompt(id: string): AgentPromptRow {
  return rollbackPromptTx(id);
}

export function listPrompts(): PromptListResult {
  const active = getActiveProductPrompt();
  return {
    active,
    drafts: stmtListByStatus.all('draft') as AgentPromptRow[],
    history: stmtListByStatus.all('archived') as AgentPromptRow[],
  };
}
