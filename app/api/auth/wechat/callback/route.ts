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

function redirectToLogin(origin: string, error: string, nextPath = '/chat') {
  const redirectUrl = new URL('/login', origin);
  redirectUrl.searchParams.set('error', error);
  redirectUrl.searchParams.set('next', sanitizeNextPath(nextPath));
  return NextResponse.redirect(redirectUrl);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateValue = url.searchParams.get('state');
  const state = consumeOAuthState(WECHAT_PROVIDER, stateValue);

  if (!state) {
    return redirectToLogin(url.origin, 'invalid_state');
  }

  if (!code) {
    return redirectToLogin(url.origin, 'missing_code', state.next_path);
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
      new URL(sanitizeNextPath(state.next_path), url.origin),
    );
    response.headers.append('Set-Cookie', getSessionSetCookieHeader(session));
    return response;
  } catch (error) {
    console.error('[auth:wechat] callback failed', error);
    return redirectToLogin(url.origin, 'wechat_callback_failed', state.next_path);
  }
}
