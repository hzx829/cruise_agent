import { NextResponse } from 'next/server';
import {
  getRequestUser,
  toPublicUser,
} from '@/lib/auth/session';

export async function GET(req: Request) {
  const user = getRequestUser(req);
  return NextResponse.json({
    user: user ? toPublicUser(user) : null,
    authenticated: Boolean(user && !user.isAnonymous),
  });
}
