/**
 * chat-store.ts — 聊天 CRUD
 *
 * 提供创建、加载、保存、删除聊天等操作。
 * 消息以 AI SDK UIMessage 格式存储 (parts 序列化为 JSON)。
 */
import { generateId, type UIMessage } from 'ai';
import agentDb from './agent-db';

// ── 类型 ──────────────────────────────────────────────────

export interface ChatRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  chat_id: string;
  role: string;
  parts_json: string;
  created_at: string;
}

// ── Prepared Statements ───────────────────────────────────

const stmtInsertChat = agentDb.prepare(
  'INSERT INTO chats (id) VALUES (?)',
);

const stmtGetChat = agentDb.prepare(
  'SELECT * FROM chats WHERE id = ?',
);

const stmtGetMessages = agentDb.prepare(
  'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC',
);

const stmtInsertMessage = agentDb.prepare(
  'INSERT OR REPLACE INTO messages (id, chat_id, role, parts_json, created_at) VALUES (?, ?, ?, ?, ?)',
);

const stmtUpdateTitle = agentDb.prepare(
  'UPDATE chats SET title = ? WHERE id = ?',
);

const stmtTouchChat = agentDb.prepare(
  'UPDATE chats SET updated_at = datetime(\'now\') WHERE id = ?',
);

const stmtDeleteChat = agentDb.prepare(
  'DELETE FROM chats WHERE id = ?',
);

const stmtListChatsFirst = agentDb.prepare(
  'SELECT id, title, created_at, updated_at FROM chats ORDER BY updated_at DESC LIMIT ?',
);

const stmtListChatsBefore = agentDb.prepare(
  `SELECT id, title, created_at, updated_at FROM chats
   WHERE updated_at < (SELECT updated_at FROM chats WHERE id = ?)
   ORDER BY updated_at DESC LIMIT ?`,
);

// ── 事务 ──────────────────────────────────────────────────

const insertManyMessages = agentDb.transaction((msgs: Array<{
  id: string;
  chatId: string;
  role: string;
  partsJson: string;
  createdAt: string;
}>) => {
  for (const m of msgs) {
    stmtInsertMessage.run(
      m.id, m.chatId, m.role, m.partsJson, m.createdAt,
    );
  }
});

// ── 公开 API ──────────────────────────────────────────────

export function createChat(id?: string): string {
  const chatId = id ?? generateId();
  stmtInsertChat.run(chatId);
  return chatId;
}

export function loadChat(id: string): { title: string; messages: UIMessage[] } {
  const chat = stmtGetChat.get(id) as ChatRow | undefined;
  if (!chat) throw new Error(`Chat not found: ${id}`);

  const rows = stmtGetMessages.all(id) as MessageRow[];

  const messages: UIMessage[] = rows
    .map((row) => ({
      id: row.id,
      role: row.role as UIMessage['role'],
      parts: JSON.parse(row.parts_json) as UIMessage['parts'],
    }))
    // createAgentUIStreamResponse 要求每条消息至少有一个 part
    .filter((msg) => Array.isArray(msg.parts) && msg.parts.length > 0);

  return { title: chat.title, messages };
}

export function saveMessages(chatId: string, messages: UIMessage[]): void {
  const payload = messages.map((msg) => ({
    id: msg.id,
    chatId,
    role: msg.role,
    partsJson: JSON.stringify(msg.parts),
    createdAt: new Date().toISOString(),
  }));

  insertManyMessages(payload);
  stmtTouchChat.run(chatId);
}

export function updateChatTitle(chatId: string, title: string): void {
  stmtUpdateTitle.run(title, chatId);
}

export function deleteChat(chatId: string): void {
  stmtDeleteChat.run(chatId); // CASCADE 会自动删消息
}

export function getChatList(options?: {
  limit?: number;
  endingBefore?: string;
}): ChatRow[] {
  const limit = options?.limit ?? 20;

  if (options?.endingBefore) {
    return stmtListChatsBefore.all(options.endingBefore, limit) as ChatRow[];
  }
  return stmtListChatsFirst.all(limit) as ChatRow[];
}
