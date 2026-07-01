import { NextResponse } from 'next/server';
import { requireRoot } from '@/lib/admin-auth';
import { listManagedUsers } from '@/lib/db/admin-user-store';

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
  const authError = requireRoot(req);
  if (authError) return authError;

  const url = new URL(req.url);
  return NextResponse.json({
    users: listManagedUsers({
      q: getSearchParam(url, 'q'),
      role: getSearchParam(url, 'role'),
      status: getSearchParam(url, 'status'),
      limit: getLimit(url),
    }),
  });
}
