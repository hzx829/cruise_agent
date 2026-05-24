/**
 * agent.db — 可写 SQLite 连接
 *
 * 独立于 cruise_deals.db (只读)，用于存储:
 * - 聊天会话 + 消息 (持久化 AI SDK UIMessage)
 * - 通知 (价格变动、新航线等)
 * - 通知配置
 * - Agent Prompt 版本
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';

const AGENT_DB_PATH =
  process.env.AGENT_DB_PATH ||
  path.resolve(process.cwd(), 'data/agent.db');

// 确保 data 目录存在
mkdirSync(path.dirname(AGENT_DB_PATH), { recursive: true });

const agentDb = new Database(AGENT_DB_PATH);
agentDb.pragma('journal_mode = WAL');
agentDb.pragma('foreign_keys = ON');

// ── 自动建表 ──────────────────────────────────────────────

agentDb.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    parts_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data_json TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
  CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

  CREATE TABLE IF NOT EXISTS notification_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT OR IGNORE INTO notification_config (key, value) VALUES
    ('daily_digest_enabled', 'true'),
    ('daily_digest_time', '09:00'),
    ('price_drop_threshold', '10'),
    ('notify_brands', '["carnival","ncl","royal_caribbean_cn"]');

  CREATE TABLE IF NOT EXISTS agent_prompts (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'archived')),
    content TEXT NOT NULL,
    change_note TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    activated_at TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_prompts_active
    ON agent_prompts(status)
    WHERE status = 'active';

  CREATE INDEX IF NOT EXISTS idx_agent_prompts_status_version
    ON agent_prompts(status, version DESC);

  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    chat_id TEXT,
    prompt_id TEXT,
    prompt_version INTEGER,
    prompt_hash TEXT,
    model TEXT,
    user_query TEXT,
    detected_intent TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    duration_ms INTEGER,
    finish_reason TEXT,
    is_aborted INTEGER NOT NULL DEFAULT 0,
    assistant_text_len INTEGER,
    empty_assistant_count INTEGER,
    tool_step_count INTEGER NOT NULL DEFAULT 0,
    tool_result_count INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    error_type TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_agent_runs_chat_id ON agent_runs(chat_id);
  CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs(created_at);

  CREATE TABLE IF NOT EXISTS agent_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    step_number INTEGER NOT NULL,
    tool_call_id TEXT,
    tool_name TEXT,
    started_at TEXT,
    ended_at TEXT,
    duration_ms INTEGER,
    success INTEGER,
    error_type TEXT,
    error_message TEXT,
    raw_tool_input_json TEXT,
    effective_tool_input_json TEXT,
    tool_input_json TEXT,
    tool_output_summary_json TEXT,
    tool_output_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agent_steps_run_id ON agent_steps(run_id);
  CREATE INDEX IF NOT EXISTS idx_agent_steps_tool_name ON agent_steps(tool_name);
`);

function columnExists(tableName: string, columnName: string): boolean {
  const rows = agentDb.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  return rows.some((row) => row.name === columnName);
}

function ensureColumn(
  tableName: 'agent_runs' | 'agent_steps',
  columnName: string,
  definition: string,
): void {
  if (columnExists(tableName, columnName)) return;
  agentDb.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

ensureColumn('agent_runs', 'prompt_version', 'INTEGER');
ensureColumn('agent_runs', 'prompt_hash', 'TEXT');
ensureColumn('agent_runs', 'status', "TEXT NOT NULL DEFAULT 'running'");
ensureColumn('agent_runs', 'started_at', 'TEXT');
ensureColumn('agent_runs', 'ended_at', 'TEXT');
ensureColumn('agent_runs', 'duration_ms', 'INTEGER');
ensureColumn('agent_runs', 'finish_reason', 'TEXT');
ensureColumn('agent_runs', 'is_aborted', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('agent_runs', 'assistant_text_len', 'INTEGER');
ensureColumn('agent_runs', 'empty_assistant_count', 'INTEGER');
ensureColumn('agent_runs', 'tool_step_count', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('agent_runs', 'tool_result_count', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('agent_runs', 'prompt_tokens', 'INTEGER');
ensureColumn('agent_runs', 'completion_tokens', 'INTEGER');
ensureColumn('agent_runs', 'total_tokens', 'INTEGER');
ensureColumn('agent_runs', 'error_type', 'TEXT');
ensureColumn('agent_runs', 'error_message', 'TEXT');
ensureColumn('agent_runs', 'updated_at', 'TEXT');

ensureColumn('agent_steps', 'tool_call_id', 'TEXT');
ensureColumn('agent_steps', 'started_at', 'TEXT');
ensureColumn('agent_steps', 'ended_at', 'TEXT');
ensureColumn('agent_steps', 'duration_ms', 'INTEGER');
ensureColumn('agent_steps', 'success', 'INTEGER');
ensureColumn('agent_steps', 'error_type', 'TEXT');
ensureColumn('agent_steps', 'error_message', 'TEXT');
ensureColumn('agent_steps', 'raw_tool_input_json', 'TEXT');
ensureColumn('agent_steps', 'effective_tool_input_json', 'TEXT');
ensureColumn('agent_steps', 'tool_output_hash', 'TEXT');
ensureColumn('agent_steps', 'updated_at', 'TEXT');

agentDb.exec(`
  UPDATE agent_runs
  SET started_at = COALESCE(started_at, created_at),
      updated_at = COALESCE(updated_at, created_at),
      status = COALESCE(status, 'running')
  WHERE started_at IS NULL OR updated_at IS NULL OR status IS NULL;

  UPDATE agent_steps
  SET started_at = COALESCE(started_at, created_at),
      ended_at = COALESCE(ended_at, created_at),
      updated_at = COALESCE(updated_at, created_at),
      effective_tool_input_json = COALESCE(effective_tool_input_json, tool_input_json),
      success = COALESCE(success, 1)
  WHERE started_at IS NULL
     OR ended_at IS NULL
     OR updated_at IS NULL
     OR effective_tool_input_json IS NULL
     OR success IS NULL;

  CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
  CREATE INDEX IF NOT EXISTS idx_agent_steps_tool_call_id ON agent_steps(tool_call_id);
`);

export default agentDb;
