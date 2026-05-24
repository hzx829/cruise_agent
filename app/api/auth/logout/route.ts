import { NextResponse } from 'next/server';
import {
  getClearSessionCookieHeader,
  revokeRequestSession,
} from '@/lib/auth/session';

export async function POST(req: Request) {
  revokeRequestSession(req);
  const response = NextResponse.json({ success: true });
  response.headers.append('Set-Cookie', getClearSessionCookieHeader());
  return response;
}
