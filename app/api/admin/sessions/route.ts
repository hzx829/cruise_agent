import { NextResponse } from 'next/server';
import { isAdminAuthEnabled, requireAdmin } from '@/lib/admin-auth';
import { listAdminChatSessions } from '@/lib/db/admin-session-store';

export const dynamic = 'force-dynamic';

function getSearchParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)?.trim();
  return value || undefined;
}

function getLimit(url: URL): number | undefined {
  const value = url.searchParams.get('limit');
  if (!value) return undefined;
  const limit = Number(value);
  return Number.isFinite(limit) ? limit : undefined;
}

export async function GET(req: Request) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const sessions = listAdminChatSessions({
    limit: getLimit(url),
    q: getSearchParam(url, 'q'),
    userId: getSearchParam(url, 'userId'),
  });

  return NextResponse.json({
    sessions,
    authRequired: isAdminAuthEnabled(),
  });
}
