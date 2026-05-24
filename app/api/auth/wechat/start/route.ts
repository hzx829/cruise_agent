import { NextResponse } from 'next/server';
import {
  createOAuthState,
  getRequestUser,
  sanitizeNextPath,
} from '@/lib/auth/session';
import {
  buildWeChatAuthorizeUrl,
  isWeChatConfigured,
  WECHAT_PROVIDER,
} from '@/lib/auth/wechat';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const nextPath = sanitizeNextPath(url.searchParams.get('next'));

  if (!isWeChatConfigured()) {
    const redirectUrl = new URL('/login', url.origin);
    redirectUrl.searchParams.set('next', nextPath);
    redirectUrl.searchParams.set('error', 'wechat_not_configured');
    return NextResponse.redirect(redirectUrl);
  }

  const currentUser = getRequestUser(req);
  const state = createOAuthState({
    provider: WECHAT_PROVIDER,
    nextPath,
    userId: currentUser?.id ?? null,
  });

  return NextResponse.redirect(buildWeChatAuthorizeUrl(req, state));
}
