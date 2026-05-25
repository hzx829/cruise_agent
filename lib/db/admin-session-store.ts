import agentDb from './agent-db';

interface AdminSessionRow {
  id: string;
  owner_user_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
  user_display_name: string | null;
  user_avatar_url: string | null;
  user_email: string | null;
  user_phone: string | null;
  user_role: string | null;
  user_status: string | null;
  user_is_anonymous: number | null;
  message_count: number;
  user_message_count: number;
  assistant_message_count: number;
  last_message_id: string | null;
  last_message_role: string | null;
  last_message_parts_json: string | null;
  last_message_at: string | null;
  run_count: number;
  latest_run_id: string | null;
  latest_run_status: string | null;
  latest_run_intent: string | null;
  latest_run_duration_ms: number | null;
  latest_run_created_at: string | null;
  latest_run_query: string | null;
  active_auth_session_count: number;
  last_auth_session_at: string | null;
}

export interface AdminChatSession {
  id: string;
  ownerUserId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    email: string | null;
    phone: string | null;
    role: string | null;
    status: string | null;
    isAnonymous: boolean | null;
  };
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  lastMessage: {
    id: string | null;
    role: string | null;
    createdAt: string | null;
    preview: string;
  };
  runCount: number;
  latestRun: {
    id: string | null;
    status: string | null;
    intent: string | null;
    durationMs: number | null;
    createdAt: string | null;
    query: string | null;
  };
  activeAuthSessionCount: number;
  lastAuthSessionAt: string | null;
}

export interface ListAdminChatSessionsInput {
  limit?: number;
  q?: string;
  userId?: string;
}

function normalizeLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 100;
  return Math.min(Math.max(Math.trunc(value), 1), 500);
}

function isFilled(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function textFromMessageParts(parts: unknown): string {
  if (!Array.isArray(parts)) return '';

  return parts
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const record = part as Record<string, unknown>;
      if (record.type === 'text' && typeof record.text === 'string') {
        return record.text;
      }
      if (typeof record.type === 'string' && record.type.startsWith('tool-')) {
        return `[${record.type.replace(/^tool-/, '')}]`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function truncate(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function mapRow(row: AdminSessionRow): AdminChatSession {
  const lastMessageText = textFromMessageParts(
    parseJson(row.last_message_parts_json),
  );

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    owner: {
      id: row.owner_user_id,
      displayName: row.user_display_name,
      avatarUrl: row.user_avatar_url,
      email: row.user_email,
      phone: row.user_phone,
      role: row.user_role,
      status: row.user_status,
      isAnonymous:
        row.user_is_anonymous == null ? null : Boolean(row.user_is_anonymous),
    },
    messageCount: row.message_count,
    userMessageCount: row.user_message_count,
    assistantMessageCount: row.assistant_message_count,
    lastMessage: {
      id: row.last_message_id,
      role: row.last_message_role,
      createdAt: row.last_message_at,
      preview: truncate(lastMessageText || '(empty message)'),
    },
    runCount: row.run_count,
    latestRun: {
      id: row.latest_run_id,
      status: row.latest_run_status,
      intent: row.latest_run_intent,
      durationMs: row.latest_run_duration_ms,
      createdAt: row.latest_run_created_at,
      query: row.latest_run_query,
    },
    activeAuthSessionCount: row.active_auth_session_count,
    lastAuthSessionAt: row.last_auth_session_at,
  };
}

export function listAdminChatSessions(
  input: ListAdminChatSessionsInput = {},
): AdminChatSession[] {
  const where: string[] = [];
  const params: unknown[] = [];
  const now = new Date().toISOString();

  if (isFilled(input.q)) {
    const like = `%${input.q.trim()}%`;
    where.push(
      `(
        c.id LIKE ?
        OR c.title LIKE ?
        OR c.owner_user_id LIKE ?
        OR u.display_name LIKE ?
        OR u.email LIKE ?
        OR u.phone LIKE ?
        OR EXISTS (
          SELECT 1 FROM messages msg
          WHERE msg.chat_id = c.id AND msg.parts_json LIKE ?
        )
        OR EXISTS (
          SELECT 1 FROM agent_runs arq
          WHERE arq.chat_id = c.id AND arq.user_query LIKE ?
        )
      )`,
    );
    params.push(like, like, like, like, like, like, like, like);
  }

  if (isFilled(input.userId)) {
    where.push('c.owner_user_id = ?');
    params.push(input.userId.trim());
  }

  const rows = agentDb
    .prepare(
      `
      SELECT
        c.id,
        c.owner_user_id,
        c.title,
        c.created_at,
        c.updated_at,
        u.display_name AS user_display_name,
        u.avatar_url AS user_avatar_url,
        u.email AS user_email,
        u.phone AS user_phone,
        u.role AS user_role,
        u.status AS user_status,
        u.is_anonymous AS user_is_anonymous,
        (
          SELECT COUNT(*)
          FROM messages msg
          WHERE msg.chat_id = c.id
        ) AS message_count,
        (
          SELECT COUNT(*)
          FROM messages msg
          WHERE msg.chat_id = c.id AND msg.role = 'user'
        ) AS user_message_count,
        (
          SELECT COUNT(*)
          FROM messages msg
          WHERE msg.chat_id = c.id AND msg.role = 'assistant'
        ) AS assistant_message_count,
        lm.id AS last_message_id,
        lm.role AS last_message_role,
        lm.parts_json AS last_message_parts_json,
        lm.created_at AS last_message_at,
        (
          SELECT COUNT(*)
          FROM agent_runs ar
          WHERE ar.chat_id = c.id
        ) AS run_count,
        lr.id AS latest_run_id,
        lr.status AS latest_run_status,
        lr.detected_intent AS latest_run_intent,
        lr.duration_ms AS latest_run_duration_ms,
        lr.created_at AS latest_run_created_at,
        lr.user_query AS latest_run_query,
        (
          SELECT COUNT(*)
          FROM auth_sessions auth
          WHERE auth.user_id = c.owner_user_id
            AND auth.revoked_at IS NULL
            AND datetime(auth.expires_at) > datetime(?)
        ) AS active_auth_session_count,
        (
          SELECT MAX(auth.created_at)
          FROM auth_sessions auth
          WHERE auth.user_id = c.owner_user_id
        ) AS last_auth_session_at
      FROM chats c
      LEFT JOIN users u ON u.id = c.owner_user_id
      LEFT JOIN messages lm ON lm.id = (
        SELECT msg.id
        FROM messages msg
        WHERE msg.chat_id = c.id
        ORDER BY datetime(msg.created_at) DESC, msg.created_at DESC
        LIMIT 1
      )
      LEFT JOIN agent_runs lr ON lr.id = (
        SELECT ar.id
        FROM agent_runs ar
        WHERE ar.chat_id = c.id
        ORDER BY datetime(ar.created_at) DESC, ar.created_at DESC
        LIMIT 1
      )
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY datetime(c.updated_at) DESC, c.updated_at DESC
      LIMIT ?
      `,
    )
    .all(now, ...params, normalizeLimit(input.limit)) as AdminSessionRow[];

  return rows.map(mapRow);
}
