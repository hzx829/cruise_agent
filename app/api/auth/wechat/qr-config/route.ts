import { NextResponse } from 'next/server';
import {
  createOAuthState,
  getRequestUser,
  sanitizeNextPath,
} from '@/lib/auth/session';
import {
  getWeChatQrLoginConfig,
  isWeChatConfigured,
  WECHAT_PROVIDER,
} from '@/lib/auth/wechat';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const nextPath = sanitizeNextPath(url.searchParams.get('next'));

  if (!isWeChatConfigured()) {
    return NextResponse.json(
      { error: 'WeChat Open Platform credentials are not configured.' },
      { status: 503 },
    );
  }

  const currentUser = getRequestUser(req);
  const state = createOAuthState({
    provider: WECHAT_PROVIDER,
    nextPath,
    userId: currentUser?.id ?? null,
  });

  return NextResponse.json(getWeChatQrLoginConfig(req, state));
}
