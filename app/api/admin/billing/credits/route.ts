import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { adjustUserCredits, getCreditBalance } from '@/lib/db/billing-store';

export async function POST(req: Request) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const body = (await req.json().catch(() => ({}))) as {
    userId?: unknown;
    delta?: unknown;
    note?: unknown;
  };
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const delta =
    typeof body.delta === 'number'
      ? body.delta
      : typeof body.delta === 'string'
        ? Number(body.delta)
        : NaN;
  const note = typeof body.note === 'string' ? body.note.trim() : '';

  if (!userId) {
    return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
  }
  if (!Number.isInteger(delta) || delta === 0) {
    return NextResponse.json(
      { error: 'delta must be a non-zero integer.' },
      { status: 400 },
    );
  }

  const entry = adjustUserCredits({
    userId,
    delta,
    note,
    createdBy: 'admin',
  });

  return NextResponse.json({
    entry,
    balance: getCreditBalance(userId),
  });
}
