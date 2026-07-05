import agentDb from './agent-db';

export type ManagedUserRole = 'user' | 'admin' | 'root';
export type ManagedUserStatus = 'active' | 'disabled';

export interface ManagedUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  isAnonymous: boolean;
  createdAt: string;
  updatedAt: string | null;
  balance: number;
  chatCount: number;
  activeSessionCount: number;
}

interface ManagedUserRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  is_anonymous: number;
  created_at: string;
  updated_at: string | null;
  balance: number | null;
  chat_count: number;
  active_session_count: number;
}

const USER_ROLES = new Set<ManagedUserRole>(['user', 'admin', 'root']);
const USER_STATUSES = new Set<ManagedUserStatus>(['active', 'disabled']);

const managedUserSelect = `
  SELECT
    u.*,
    (
      SELECT COALESCE(SUM(remaining), 0)
      FROM credit_grants g
      WHERE g.user_id = u.id
        AND g.remaining > 0
        AND (g.expires_at IS NULL OR datetime(g.expires_at) > datetime('now'))
    ) AS balance,
    (
      SELECT COUNT(*)
      FROM chats c
      WHERE c.owner_user_id = u.id
    ) AS chat_count,
    (
      SELECT COUNT(*)
      FROM auth_sessions s
      WHERE s.user_id = u.id
        AND s.revoked_at IS NULL
        AND datetime(s.expires_at) > datetime('now')
    ) AS active_session_count
  FROM users u
`;

const stmtListManagedUsers = agentDb.prepare(`
  ${managedUserSelect}
  WHERE
    (? IS NULL OR u.role = ?)
    AND (? IS NULL OR u.status = ?)
    AND (
      ? IS NULL
      OR u.id LIKE ?
      OR u.display_name LIKE ?
      OR u.email LIKE ?
      OR u.phone LIKE ?
    )
  ORDER BY datetime(u.created_at) DESC, u.created_at DESC
  LIMIT ?
`);

const stmtGetManagedUser = agentDb.prepare(`
  ${managedUserSelect}
  WHERE u.id = ?
  LIMIT 1
`);

const stmtUpdateUserAccess = agentDb.prepare(`
  UPDATE users
  SET role = COALESCE(?, role),
      status = COALESCE(?, status),
      updated_at = datetime('now')
  WHERE id = ?
`);

const stmtActiveRootCount = agentDb.prepare(`
  SELECT COUNT(*) AS count
  FROM users
  WHERE role = 'root' AND status = 'active'
`);

function mapManagedUser(row: ManagedUserRow): ManagedUser {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    isAnonymous: Boolean(row.is_anonymous),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    balance: row.balance ?? 0,
    chatCount: row.chat_count,
    activeSessionCount: row.active_session_count,
  };
}

function normalizeRole(value: string | null | undefined): ManagedUserRole | null {
  if (!value) return null;
  if (!USER_ROLES.has(value as ManagedUserRole)) {
    throw new Error('Invalid role.');
  }
  return value as ManagedUserRole;
}

function normalizeStatus(
  value: string | null | undefined,
): ManagedUserStatus | null {
  if (!value) return null;
  if (!USER_STATUSES.has(value as ManagedUserStatus)) {
    throw new Error('Invalid status.');
  }
  return value as ManagedUserStatus;
}

function getActiveRootCount(): number {
  const row = stmtActiveRootCount.get() as { count: number } | undefined;
  return row?.count ?? 0;
}

export function listManagedUsers(input: {
  q?: string;
  role?: string;
  status?: string;
  limit?: number;
}): ManagedUser[] {
  const q = input.q?.trim();
  const like = q ? `%${q}%` : null;
  const role = input.role?.trim() || null;
  const status = input.status?.trim() || null;
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);

  return (
    stmtListManagedUsers.all(
      role,
      role,
      status,
      status,
      like,
      like,
      like,
      like,
      like,
      limit,
    ) as ManagedUserRow[]
  ).map(mapManagedUser);
}

export function updateManagedUser(input: {
  actorUserId: string;
  userId: string;
  role?: string | null;
  status?: string | null;
}): ManagedUser {
  return agentDb.transaction(() => {
    const current = stmtGetManagedUser.get(input.userId) as
      | ManagedUserRow
      | undefined;
    if (!current) throw new Error('User not found.');

    const nextRole = normalizeRole(input.role);
    const nextStatus = normalizeStatus(input.status);
    const wouldDemoteSelf =
      input.userId === input.actorUserId &&
      ((nextRole && nextRole !== 'root') ||
        (nextStatus && nextStatus !== 'active'));
    if (wouldDemoteSelf) {
      throw new Error('Root cannot demote or disable itself.');
    }

    const wouldRemoveActiveRoot =
      current.role === 'root' &&
      current.status === 'active' &&
      ((nextRole && nextRole !== 'root') ||
        (nextStatus && nextStatus !== 'active'));
    if (wouldRemoveActiveRoot && getActiveRootCount() <= 1) {
      throw new Error('At least one active root is required.');
    }

    stmtUpdateUserAccess.run(nextRole, nextStatus, input.userId);
    const updated = stmtGetManagedUser.get(input.userId) as ManagedUserRow;
    return mapManagedUser(updated);
  })();
}
