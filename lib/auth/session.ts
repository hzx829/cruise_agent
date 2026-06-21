import { createHash, randomBytes } from 'crypto';
import agentDb from '@/lib/db/agent-db';

export const AUTH_COOKIE_NAME = 'cruise_session';

const SESSION_TTL_DAYS = 30;
const OAUTH_STATE_TTL_MINUTES = 10;

export interface AuthUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  isAnonymous: boolean;
  defaultDepartureLocation: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface UserRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  is_anonymous: number;
  default_departure_location: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface AuthSessionCommit {
  token: string;
  expiresAt: Date;
}

export interface RequestAuthResult {
  user: AuthUser;
  sessionCommit?: AuthSessionCommit;
}

export interface OAuthStateRow {
  state: string;
  provider: string;
  next_path: string;
  user_id: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

const stmtFindUserBySession = agentDb.prepare(`
  SELECT u.*
  FROM auth_sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = ?
    AND s.revoked_at IS NULL
    AND datetime(s.expires_at) > datetime(?)
    AND u.status = 'active'
  LIMIT 1
`);

const stmtFindUserById = agentDb.prepare(`
  SELECT * FROM users WHERE id = ? LIMIT 1
`);

const stmtInsertAnonymousUser = agentDb.prepare(`
  INSERT INTO users (id, display_name, is_anonymous)
  VALUES (?, ?, 1)
`);

const stmtInsertSession = agentDb.prepare(`
  INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
  VALUES (?, ?, ?, ?)
`);

const stmtRevokeSession = agentDb.prepare(`
  UPDATE auth_sessions
  SET revoked_at = datetime('now'), updated_at = datetime('now')
  WHERE token_hash = ? AND revoked_at IS NULL
`);

const stmtInsertOAuthState = agentDb.prepare(`
  INSERT INTO auth_oauth_states (state, provider, next_path, user_id, expires_at)
  VALUES (?, ?, ?, ?, ?)
`);

const stmtGetOAuthState = agentDb.prepare(`
  SELECT *
  FROM auth_oauth_states
  WHERE state = ?
    AND provider = ?
    AND used_at IS NULL
    AND datetime(expires_at) > datetime(?)
  LIMIT 1
`);

const stmtUseOAuthState = agentDb.prepare(`
  UPDATE auth_oauth_states
  SET used_at = datetime('now')
  WHERE state = ? AND used_at IS NULL
`);

const migrateAnonymousData = agentDb.transaction(
  (sourceUserId: string, targetUserId: string) => {
    agentDb
      .prepare('UPDATE chats SET owner_user_id = ? WHERE owner_user_id = ?')
      .run(targetUserId, sourceUserId);
    agentDb
      .prepare('UPDATE notifications SET owner_user_id = ? WHERE owner_user_id = ?')
      .run(targetUserId, sourceUserId);
    agentDb
      .prepare('UPDATE agent_runs SET user_id = ? WHERE user_id = ?')
      .run(targetUserId, sourceUserId);
    agentDb
      .prepare(
        `UPDATE users
         SET status = 'merged', updated_at = datetime('now')
         WHERE id = ? AND is_anonymous = 1`,
      )
      .run(sourceUserId);
  },
);

function createId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString('hex')}`;
}

function createToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMinutes(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

export function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    isAnonymous: Boolean(row.is_anonymous),
    defaultDepartureLocation: row.default_departure_location,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, pair) => {
    const index = pair.indexOf('=');
    if (index < 0) return acc;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

export function getSessionTokenFromRequest(req: Request): string | null {
  return parseCookieHeader(req.headers.get('cookie'))[AUTH_COOKIE_NAME] ?? null;
}

export function getUserBySessionToken(token: string | null): AuthUser | null {
  if (!token) return null;
  const row = stmtFindUserBySession.get(
    hashToken(token),
    new Date().toISOString(),
  ) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function getUserById(userId: string | null | undefined): AuthUser | null {
  if (!userId) return null;
  const row = stmtFindUserById.get(userId) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function getRequestUser(req: Request): AuthUser | null {
  return getUserBySessionToken(getSessionTokenFromRequest(req));
}

export function getAuthenticatedRequestUser(req: Request): AuthUser | null {
  const user = getRequestUser(req);
  return user && !user.isAnonymous ? user : null;
}

export function getCookieStoreUser(cookieStore: {
  get(name: string): { value: string } | undefined;
}): AuthUser | null {
  return getUserBySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null);
}

export function getAuthenticatedCookieStoreUser(cookieStore: {
  get(name: string): { value: string } | undefined;
}): AuthUser | null {
  const user = getCookieStoreUser(cookieStore);
  return user && !user.isAnonymous ? user : null;
}

export function createAnonymousUser(): AuthUser {
  const userId = createId('usr');
  stmtInsertAnonymousUser.run(userId, '访客');
  const row = agentDb
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(userId) as UserRow;
  return mapUser(row);
}

export function createSessionForUser(userId: string): AuthSessionCommit {
  const token = createToken();
  const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);
  stmtInsertSession.run(
    createId('ses'),
    userId,
    hashToken(token),
    expiresAt.toISOString(),
  );
  return { token, expiresAt };
}

export function ensureRequestUser(req: Request): RequestAuthResult {
  const existingUser = getRequestUser(req);
  if (existingUser) return { user: existingUser };

  const anonymousUser = createAnonymousUser();
  const sessionCommit = createSessionForUser(anonymousUser.id);
  return { user: anonymousUser, sessionCommit };
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    expires?: Date;
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Lax' | 'Strict' | 'None';
    path?: string;
  },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

export function getSessionSetCookieHeader(commit: AuthSessionCommit): string {
  return serializeCookie(AUTH_COOKIE_NAME, commit.token, {
    expires: commit.expiresAt,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
  });
}

export function getClearSessionCookieHeader(): string {
  return serializeCookie(AUTH_COOKIE_NAME, '', {
    expires: new Date(0),
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
  });
}

export function applySessionCookie(
  response: Response,
  auth: RequestAuthResult,
): void {
  if (!auth.sessionCommit) return;
  response.headers.append(
    'Set-Cookie',
    getSessionSetCookieHeader(auth.sessionCommit),
  );
}

export function revokeRequestSession(req: Request): void {
  const token = getSessionTokenFromRequest(req);
  if (!token) return;
  stmtRevokeSession.run(hashToken(token));
}

export function sanitizeNextPath(nextPath: string | null | undefined): string {
  if (!nextPath) return '/chat';
  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) return '/chat';
  return nextPath;
}

export function createOAuthState(input: {
  provider: string;
  nextPath: string;
  userId?: string | null;
}): string {
  const state = createToken();
  const expiresAt = addMinutes(new Date(), OAUTH_STATE_TTL_MINUTES);
  stmtInsertOAuthState.run(
    state,
    input.provider,
    sanitizeNextPath(input.nextPath),
    input.userId ?? null,
    expiresAt.toISOString(),
  );
  return state;
}

export function consumeOAuthState(
  provider: string,
  state: string | null,
): OAuthStateRow | null {
  if (!state) return null;
  const row = stmtGetOAuthState.get(
    state,
    provider,
    new Date().toISOString(),
  ) as OAuthStateRow | undefined;
  if (!row) return null;
  stmtUseOAuthState.run(state);
  return row;
}

export function migrateAnonymousUserToUser(
  sourceUser: AuthUser | null,
  targetUserId: string,
): void {
  if (!sourceUser?.isAnonymous || sourceUser.id === targetUserId) return;
  migrateAnonymousData(sourceUser.id, targetUserId);
}

export function migrateAnonymousUserIdToUser(
  sourceUserId: string | null | undefined,
  targetUserId: string,
): void {
  migrateAnonymousUserToUser(getUserById(sourceUserId), targetUserId);
}

export function toPublicUser(user: AuthUser) {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    isAnonymous: user.isAnonymous,
    defaultDepartureLocation: user.defaultDepartureLocation,
  };
}
