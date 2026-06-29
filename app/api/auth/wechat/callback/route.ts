import { NextResponse } from 'next/server';
import {
  consumeOAuthState,
  createSessionForUser,
  getRequestUser,
  getSessionSetCookieHeader,
  migrateAnonymousUserIdToUser,
  migrateAnonymousUserToUser,
  sanitizeNextPath,
} from '@/lib/auth/session';
import {
  fetchWeChatProfile,
  upsertWeChatUser,
  WECHAT_PROVIDER,
} from '@/lib/auth/wechat';

function getAppOrigin(req: Request): string {
  const url = new URL(req.url);
  if (
    url.host.startsWith('localhost') ||
    url.host.startsWith('127.0.0.1') ||
    url.host.startsWith('[::1]')
  ) {
    return url.origin;
  }
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  return url.origin;
}

function redirectToLogin(origin: string, error: string, nextPath = '/chat') {
  const redirectUrl = new URL('/login', origin);
  redirectUrl.searchParams.set('error', error);
  redirectUrl.searchParams.set('next', sanitizeNextPath(nextPath));
  return NextResponse.redirect(redirectUrl);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const appOrigin = getAppOrigin(req);
  const code = url.searchParams.get('code');
  const stateValue = url.searchParams.get('state');

  if (!code) {
    return redirectToLogin(appOrigin, 'missing_code');
  }

  const state = consumeOAuthState(WECHAT_PROVIDER, stateValue);

  if (!state) {
    return redirectToLogin(appOrigin, 'invalid_state');
  }

  try {
    const profile = await fetchWeChatProfile(code);
    const user = upsertWeChatUser(WECHAT_PROVIDER, profile);
    const currentUser = getRequestUser(req);

    if (state.user_id && state.user_id !== user.id) {
      migrateAnonymousUserIdToUser(state.user_id, user.id);
    } else {
      migrateAnonymousUserToUser(currentUser, user.id);
    }

    const session = createSessionForUser(user.id);
    const response = NextResponse.redirect(
      new URL(sanitizeNextPath(state.next_path), appOrigin),
    );
    response.headers.append('Set-Cookie', getSessionSetCookieHeader(session));
    return response;
  } catch (error) {
    console.error('[auth:wechat] callback failed', error);
    return redirectToLogin(appOrigin, 'wechat_callback_failed', state.next_path);
  }
}
