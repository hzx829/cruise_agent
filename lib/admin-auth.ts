import { NextResponse } from 'next/server';
import { getAuthenticatedRequestUser } from '@/lib/auth/session';

function isAdminRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'root';
}

export function isAdminAuthEnabled(): boolean {
  return Boolean(process.env.ADMIN_TOKEN);
}

export function requireAdmin(req: Request): NextResponse | null {
  const user = getAuthenticatedRequestUser(req);
  if (isAdminRole(user?.role)) return null;

  const expectedToken = process.env.ADMIN_TOKEN;
  const token = req.headers.get('x-admin-token');
  if (expectedToken && token === expectedToken) return null;
  if (!expectedToken && process.env.NODE_ENV !== 'production') return null;

  return NextResponse.json(
    { error: 'Unauthorized', authRequired: true },
    { status: 401 },
  );
}

export function requireRoot(req: Request): NextResponse | null {
  const user = getAuthenticatedRequestUser(req);
  if (user?.role === 'root') return null;
  if (!process.env.ADMIN_TOKEN && process.env.NODE_ENV !== 'production') return null;

  return NextResponse.json(
    { error: 'Root role required', authRequired: true },
    { status: 403 },
  );
}
