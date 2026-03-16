/**
 * notification-store.ts — 通知 CRUD
 *
 * 管理价格变动、新航线等通知的创建、查询、标记已读。
 */
import { generateId } from 'ai';
import agentDb from './agent-db';

// ── 类型 ──────────────────────────────────────────────────

export interface NotificationRow {
  id: string;
  type: string;            // 'price_drop' | 'new_deal' | 'daily_digest'
  title: string;
  body: string | null;
  data_json: string | null;
  read: number;            // 0 | 1
  created_at: string;
}

export interface CreateNotificationInput {
  type: string;
  title: string;
  body?: string;
  data?: unknown;
}

export interface NotificationConfigMap {
  daily_digest_enabled: string;
  daily_digest_time: string;
  price_drop_threshold: string;
  notify_brands: string;
  [key: string]: string;
}

// ── Prepared Statements ───────────────────────────────────

const stmtInsert = agentDb.prepare(
  'INSERT INTO notifications (id, type, title, body, data_json) VALUES (?, ?, ?, ?, ?)',
);

const stmtGetUnread = agentDb.prepare(
  'SELECT * FROM notifications WHERE read = 0 ORDER BY created_at DESC LIMIT ?',
);

const stmtGetAll = agentDb.prepare(
  'SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?',
);

const stmtMarkRead = agentDb.prepare(
  'UPDATE notifications SET read = 1 WHERE id = ?',
);

const stmtMarkAllRead = agentDb.prepare(
  'UPDATE notifications SET read = 1 WHERE read = 0',
);

const stmtUnreadCount = agentDb.prepare(
  'SELECT COUNT(*) as count FROM notifications WHERE read = 0',
);

const stmtGetConfig = agentDb.prepare(
  'SELECT key, value FROM notification_config',
);

const stmtSetConfig = agentDb.prepare(
  'INSERT OR REPLACE INTO notification_config (key, value) VALUES (?, ?)',
);

// ── 公开 API ──────────────────────────────────────────────

export function createNotification(input: CreateNotificationInput): string {
  const id = generateId();
  stmtInsert.run(
    id,
    input.type,
    input.title,
    input.body ?? null,
    input.data ? JSON.stringify(input.data) : null,
  );
  return id;
}

export function getUnreadNotifications(limit = 50): NotificationRow[] {
  return stmtGetUnread.all(limit) as NotificationRow[];
}

export function getAllNotifications(limit = 50): NotificationRow[] {
  return stmtGetAll.all(limit) as NotificationRow[];
}

export function getUnreadCount(): number {
  const row = stmtUnreadCount.get() as { count: number };
  return row.count;
}

export function markNotificationRead(id: string): void {
  stmtMarkRead.run(id);
}

export function markAllNotificationsRead(): void {
  stmtMarkAllRead.run();
}

export function getNotificationConfig(): NotificationConfigMap {
  const rows = stmtGetConfig.all() as Array<{ key: string; value: string }>;
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }
  return config as NotificationConfigMap;
}

export function setNotificationConfig(key: string, value: string): void {
  stmtSetConfig.run(key, value);
}
