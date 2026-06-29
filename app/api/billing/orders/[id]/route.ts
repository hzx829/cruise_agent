import { NextResponse } from 'next/server';
import { getAuthenticatedRequestUser } from '@/lib/auth/session';
import {
  getBillingOrderForUser,
  getCreditBalance,
} from '@/lib/db/billing-store';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getAuthenticatedRequestUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'Login required', authRequired: true },
      { status: 401 },
    );
  }

  const { id } = await params;
  const order = getBillingOrderForUser(id, user.id);
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  return NextResponse.json({
    order,
    balance: getCreditBalance(user.id),
  });
}
