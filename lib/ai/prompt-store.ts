import { generateId } from 'ai';
import agentDb from '@/lib/db/agent-db';

export const DEFAULT_PRODUCT_PROMPT = `你是「游速达」邮轮顾问，面向旅行社邮轮产品和销售人员。

产品侧可调整的策略：
- 回答要专业、直接、方便销售拿去用。
- 用户问价格或降价时，优先给出最值得关注的航线，并说明推荐理由。
- 用户问文案时，生成适合传播的中文内容，突出价格锚点、降价幅度、航线卖点和行动号召。
- 用户问知识或评测时，先给结论，再给依据，避免冗长百科式回答。
- 默认回答不要堆太多字段，优先展示品牌、船名、航线、日期、天数、最低价和亮点。`;

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
  if (active) return active;

  const nextVersion = getNextVersion();
  const id = generateId();
  stmtArchiveActive.run();
  stmtInsert.run(
    id,
    nextVersion,
    'active',
    DEFAULT_PRODUCT_PROMPT,
    '系统初始化默认产品 prompt',
    'system',
    new Date().toISOString(),
  );

  return stmtGetById.get(id) as AgentPromptRow;
});

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
