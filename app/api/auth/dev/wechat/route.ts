import { NextResponse } from 'next/server';
import {
  createSessionForUser,
  getRequestUser,
  getSessionSetCookieHeader,
  migrateAnonymousUserToUser,
  sanitizeNextPath,
} from '@/lib/auth/session';
import {
  createDevWeChatProfile,
  upsertWeChatUser,
  WECHAT_DEV_PROVIDER,
} from '@/lib/auth/wechat';

export async function GET(req: Request) {
  if (process.env.AUTH_DEV_WECHAT_LOGIN !== 'true') {
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
  const response = NextResponse.redirect(new URL(nextPath, url.origin));
  response.headers.append('Set-Cookie', getSessionSetCookieHeader(session));
  return response;
}
