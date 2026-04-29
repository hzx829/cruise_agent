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
`);

export default agentDb;
