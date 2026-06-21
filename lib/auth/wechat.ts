import { randomBytes } from 'crypto';
import agentDb from '@/lib/db/agent-db';
import { mapUser, type AuthUser } from './session';

export const WECHAT_PROVIDER = 'wechat_open';
export const WECHAT_DEV_PROVIDER = 'wechat_dev';

interface IdentityRow {
  user_id: string;
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

interface WeChatErrorPayload {
  errcode?: number;
  errmsg?: string;
}

interface WeChatTokenPayload extends WeChatErrorPayload {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  openid?: string;
  scope?: string;
  unionid?: string;
}

interface WeChatUserInfoPayload extends WeChatErrorPayload {
  openid?: string;
  nickname?: string;
  sex?: number;
  province?: string;
  city?: string;
  country?: string;
  headimgurl?: string;
  privilege?: string[];
  unionid?: string;
}

export interface WeChatProfile {
  openid: string;
  unionid: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  raw: Record<string, unknown>;
}

const stmtFindIdentity = agentDb.prepare(`
  SELECT user_id
  FROM auth_identities
  WHERE provider = ? AND provider_user_id = ?
  LIMIT 1
`);

const stmtFindUnionIdentity = agentDb.prepare(`
  SELECT user_id
  FROM auth_identities
  WHERE provider_union_id = ?
  ORDER BY created_at ASC
  LIMIT 1
`);

const stmtInsertUser = agentDb.prepare(`
  INSERT INTO users (id, display_name, avatar_url, is_anonymous)
  VALUES (?, ?, ?, 0)
`);

const stmtUpdateUser = agentDb.prepare(`
  UPDATE users
  SET display_name = COALESCE(?, display_name),
      avatar_url = COALESCE(?, avatar_url),
      is_anonymous = 0,
      status = 'active',
      updated_at = datetime('now')
  WHERE id = ?
`);

const stmtGetUser = agentDb.prepare('SELECT * FROM users WHERE id = ?');

const stmtUpsertIdentity = agentDb.prepare(`
  INSERT INTO auth_identities (
    id, user_id, provider, provider_user_id, provider_union_id, raw_profile_json
  )
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(provider, provider_user_id) DO UPDATE SET
    user_id = excluded.user_id,
    provider_union_id = excluded.provider_union_id,
    raw_profile_json = excluded.raw_profile_json,
    updated_at = datetime('now')
`);

function createId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString('hex')}`;
}

function getAppUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const url = new URL(req.url);
  return url.origin;
}

function getRedirectUri(req: Request): string {
  return (
    process.env.WECHAT_REDIRECT_URI ||
    `${getAppUrl(req)}/api/auth/wechat/callback`
  );
}

function requireWeChatConfig(): {
  appId: string;
  appSecret: string;
} {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('WeChat Open Platform credentials are not configured.');
  }
  return { appId, appSecret };
}

export function isWeChatConfigured(): boolean {
  return Boolean(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET);
}

export function getWeChatQrLoginConfig(req: Request, state: string) {
  const { appId } = requireWeChatConfig();
  return {
    appId,
    scope: 'snsapi_login',
    redirectUri: getRedirectUri(req),
    state,
  };
}

export function buildWeChatAuthorizeUrl(req: Request, state: string): string {
  const { appId } = requireWeChatConfig();
  const url = new URL('https://open.weixin.qq.com/connect/qrconnect');
  url.searchParams.set('appid', appId);
  url.searchParams.set('redirect_uri', getRedirectUri(req));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'snsapi_login');
  url.searchParams.set('state', state);
  return `${url.toString()}#wechat_redirect`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`WeChat request failed with HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function assertNoWeChatError(payload: WeChatErrorPayload, step: string): void {
  if (payload.errcode && payload.errcode !== 0) {
    throw new Error(
      `WeChat ${step} failed: ${payload.errcode} ${payload.errmsg ?? ''}`.trim(),
    );
  }
}

export async function fetchWeChatProfile(code: string): Promise<WeChatProfile> {
  const { appId, appSecret } = requireWeChatConfig();
  const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
  tokenUrl.searchParams.set('appid', appId);
  tokenUrl.searchParams.set('secret', appSecret);
  tokenUrl.searchParams.set('code', code);
  tokenUrl.searchParams.set('grant_type', 'authorization_code');

  const tokenPayload = await fetchJson<WeChatTokenPayload>(tokenUrl.toString());
  assertNoWeChatError(tokenPayload, 'token exchange');

  if (!tokenPayload.access_token || !tokenPayload.openid) {
    throw new Error('WeChat token response did not include access_token/openid.');
  }

  const userInfoUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
  userInfoUrl.searchParams.set('access_token', tokenPayload.access_token);
  userInfoUrl.searchParams.set('openid', tokenPayload.openid);
  userInfoUrl.searchParams.set('lang', 'zh_CN');

  const userInfo = await fetchJson<WeChatUserInfoPayload>(
    userInfoUrl.toString(),
  );
  assertNoWeChatError(userInfo, 'userinfo');

  const openid = userInfo.openid || tokenPayload.openid;
  if (!openid) {
    throw new Error('WeChat userinfo response did not include openid.');
  }

  return {
    openid,
    unionid: userInfo.unionid || tokenPayload.unionid || null,
    nickname: userInfo.nickname || null,
    avatarUrl: userInfo.headimgurl || null,
    raw: {
      token: {
        expires_in: tokenPayload.expires_in,
        openid: tokenPayload.openid,
        scope: tokenPayload.scope,
        unionid: tokenPayload.unionid,
      },
      userInfo,
    },
  };
}

function findExistingUserId(
  provider: string,
  profile: WeChatProfile,
): string | null {
  const byProvider = stmtFindIdentity.get(
    provider,
    profile.openid,
  ) as IdentityRow | undefined;
  if (byProvider?.user_id) return byProvider.user_id;

  if (!profile.unionid) return null;
  const byUnion = stmtFindUnionIdentity.get(profile.unionid) as
    | IdentityRow
    | undefined;
  return byUnion?.user_id ?? null;
}

export function upsertWeChatUser(
  provider: string,
  profile: WeChatProfile,
): AuthUser {
  const existingUserId = findExistingUserId(provider, profile);
  const userId = existingUserId ?? createId('usr');
  const displayName = profile.nickname || '微信用户';

  if (!existingUserId) {
    stmtInsertUser.run(userId, displayName, profile.avatarUrl);
  } else {
    stmtUpdateUser.run(displayName, profile.avatarUrl, userId);
  }

  stmtUpsertIdentity.run(
    createId('aid'),
    userId,
    provider,
    profile.openid,
    profile.unionid,
    JSON.stringify(profile.raw),
  );

  return mapUser(stmtGetUser.get(userId) as UserRow);
}

export function createDevWeChatProfile(seed = 'local'): WeChatProfile {
  return {
    openid: `dev-openid-${seed}`,
    unionid: `dev-unionid-${seed}`,
    nickname: '本地微信测试用户',
    avatarUrl: null,
    raw: {
      dev: true,
      seed,
    },
  };
}
