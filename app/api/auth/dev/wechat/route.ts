import { NextResponse } from 'next/server';
import {
  createSessionForUser,
  getRequestUser,
  getSessionSetCookieHeader,
  migrateAnonymousUserToUser,
  sanitizeNextPath,
} from '@/lib/auth/session';
import { isDevWeChatLoginAllowed } from '@/lib/auth/dev-login';
import {
  createDevWeChatProfile,
  upsertWeChatUser,
  WECHAT_DEV_PROVIDER,
} from '@/lib/auth/wechat';

function firstForwardedHeaderValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null;
}

function getPublicOrigin(req: Request): string {
  const forwardedHost = firstForwardedHeaderValue(
    req.headers.get('x-forwarded-host'),
  );
  const host = forwardedHost || req.headers.get('host');
  if (!host) return new URL(req.url).origin;

  if (
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('[::1]')
  ) {
    return new URL(req.url).origin;
  }

  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }

  const forwardedProto = firstForwardedHeaderValue(
    req.headers.get('x-forwarded-proto'),
  );
  const proto =
    forwardedProto || (host.startsWith('localhost') ? 'http' : 'https');

  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  if (!isDevWeChatLoginAllowed(req.headers)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = new URL(req.url);
  const nextPath = sanitizeNextPath(url.searchParams.get('next'));
  const seed = url.searchParams.get('seed') || 'local';
  const currentUser = getRequestUser(req);
  const user = upsertWeChatUser(
    WECHAT_DEV_PROVIDER,
    createDevWeChatProfile(seed),
  );

  migrateAnonymousUserToUser(currentUser, user.id);

  const session = createSessionForUser(user.id);
  const response = NextResponse.redirect(new URL(nextPath, getPublicOrigin(req)));
  response.headers.append('Set-Cookie', getSessionSetCookieHeader(session));
  return response;
}
