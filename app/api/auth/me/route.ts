import { NextResponse } from 'next/server';
import {
  applySessionCookie,
  ensureRequestUser,
  toPublicUser,
} from '@/lib/auth/session';

export async function GET(req: Request) {
  const auth = ensureRequestUser(req);
  const response = NextResponse.json({
    user: toPublicUser(auth.user),
    authenticated: !auth.user.isAnonymous,
  });
  applySessionCookie(response, auth);
  return response;
}
