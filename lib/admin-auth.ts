import { NextResponse } from 'next/server';

export function isAdminAuthEnabled(): boolean {
  return Boolean(process.env.ADMIN_TOKEN);
}

export function requireAdmin(req: Request): NextResponse | null {
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken) return null;

  const token = req.headers.get('x-admin-token');
  if (token === expectedToken) return null;

  return NextResponse.json(
    { error: 'Unauthorized', authRequired: true },
    { status: 401 },
  );
}
