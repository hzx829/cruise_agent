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
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT,
    avatar_url TEXT,
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auth_identities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    provider_union_id TEXT,
    raw_profile_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(provider, provider_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_auth_identities_user_id
    ON auth_identities(user_id);
  CREATE INDEX IF NOT EXISTS idx_auth_identities_union_id
    ON auth_identities(provider_union_id);

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
    ON auth_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash
    ON auth_sessions(token_hash);

  CREATE TABLE IF NOT EXISTS auth_oauth_states (
    state TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    next_path TEXT NOT NULL,
    user_id TEXT,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_auth_oauth_states_expires_at
    ON auth_oauth_states(expires_at);

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
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
    owner_user_id TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data_json TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
  CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

  CREATE TABLE IF NOT EXISTS billing_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',
    quota_messages INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO billing_plans
    (id, name, description, amount_cents, currency, quota_messages, active, sort_order)
  VALUES
    ('starter_50', '体验包', '适合短期找船和比价', 1900, 'CNY', 50, 1, 10),
    ('standard_200', '标准包', '适合持续跟进价格和方案', 4900, 'CNY', 200, 1, 20);

  CREATE TABLE IF NOT EXISTS billing_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    out_trade_no TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'alipay',
    subject TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',
    quota_messages INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'created',
    alipay_trade_no TEXT,
    trade_status TEXT,
    paid_at TEXT,
    fulfilled_at TEXT,
    closed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES billing_plans(id)
  );

  CREATE INDEX IF NOT EXISTS idx_billing_orders_user_id
    ON billing_orders(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_billing_orders_status
    ON billing_orders(status, created_at DESC);

  CREATE TABLE IF NOT EXISTS payment_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    order_id TEXT,
    out_trade_no TEXT,
    provider_trade_no TEXT,
    event_type TEXT NOT NULL,
    trade_status TEXT,
    signature_valid INTEGER NOT NULL DEFAULT 0,
    raw_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES billing_orders(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_payment_events_order_id
    ON payment_events(order_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_payment_events_out_trade_no
    ON payment_events(out_trade_no, created_at DESC);

  CREATE TABLE IF NOT EXISTS credit_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    order_id TEXT,
    run_id TEXT,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    note TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES billing_orders(id) ON DELETE SET NULL,
    FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id
    ON credit_ledger(user_id, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_order_purchase
    ON credit_ledger(order_id, reason)
    WHERE order_id IS NOT NULL AND reason = 'purchase';
  CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_run_chat
    ON credit_ledger(run_id, reason)
    WHERE run_id IS NOT NULL AND reason = 'chat';

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
    user_id TEXT,
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
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
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

  CREATE TABLE IF NOT EXISTS agent_step_timings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    step_number INTEGER NOT NULL,
    model_provider TEXT,
    model_id TEXT,
    started_at TEXT,
    ended_at TEXT,
    duration_ms INTEGER,
    model_duration_ms INTEGER,
    tool_wall_time_ms INTEGER,
    tool_duration_ms INTEGER,
    tool_call_count INTEGER NOT NULL DEFAULT 0,
    tool_result_count INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    finish_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(run_id, step_number),
    FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agent_step_timings_run_id
    ON agent_step_timings(run_id);
`);

function columnExists(tableName: string, columnName: string): boolean {
  const rows = agentDb.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  return rows.some((row) => row.name === columnName);
}

function ensureColumn(
  tableName:
    | 'users'
    | 'chats'
    | 'notifications'
    | 'agent_runs'
    | 'agent_steps'
    | 'agent_step_timings',
  columnName: string,
  definition: string,
): void {
  if (columnExists(tableName, columnName)) return;
  try {
    agentDb.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('duplicate column name')
    ) {
      return;
    }
    throw error;
  }
}

ensureColumn('users', 'default_departure_location', 'TEXT');
ensureColumn('chats', 'owner_user_id', 'TEXT REFERENCES users(id) ON DELETE SET NULL');
ensureColumn(
  'notifications',
  'owner_user_id',
  'TEXT REFERENCES users(id) ON DELETE CASCADE',
);
ensureColumn('agent_runs', 'user_id', 'TEXT REFERENCES users(id) ON DELETE SET NULL');
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

ensureColumn('agent_step_timings', 'model_provider', 'TEXT');
ensureColumn('agent_step_timings', 'model_id', 'TEXT');
ensureColumn('agent_step_timings', 'started_at', 'TEXT');
ensureColumn('agent_step_timings', 'ended_at', 'TEXT');
ensureColumn('agent_step_timings', 'duration_ms', 'INTEGER');
ensureColumn('agent_step_timings', 'model_duration_ms', 'INTEGER');
ensureColumn('agent_step_timings', 'tool_wall_time_ms', 'INTEGER');
ensureColumn('agent_step_timings', 'tool_duration_ms', 'INTEGER');
ensureColumn('agent_step_timings', 'tool_call_count', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('agent_step_timings', 'tool_result_count', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('agent_step_timings', 'prompt_tokens', 'INTEGER');
ensureColumn('agent_step_timings', 'completion_tokens', 'INTEGER');
ensureColumn('agent_step_timings', 'total_tokens', 'INTEGER');
ensureColumn('agent_step_timings', 'finish_reason', 'TEXT');
ensureColumn('agent_step_timings', 'updated_at', 'TEXT');

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

  UPDATE agent_step_timings
  SET started_at = COALESCE(started_at, created_at),
      ended_at = COALESCE(ended_at, created_at),
      updated_at = COALESCE(updated_at, created_at),
      tool_call_count = COALESCE(tool_call_count, 0),
      tool_result_count = COALESCE(tool_result_count, 0)
  WHERE started_at IS NULL
     OR ended_at IS NULL
     OR updated_at IS NULL
     OR tool_call_count IS NULL
     OR tool_result_count IS NULL;

  CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
  CREATE INDEX IF NOT EXISTS idx_agent_runs_user_id ON agent_runs(user_id);
  CREATE INDEX IF NOT EXISTS idx_chats_owner_user_id ON chats(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_owner_user_id ON notifications(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_agent_steps_tool_call_id ON agent_steps(tool_call_id);
  CREATE INDEX IF NOT EXISTS idx_agent_step_timings_run_id
    ON agent_step_timings(run_id);
`);

export default agentDb;
