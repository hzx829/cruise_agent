import { NextResponse } from 'next/server';
import { getAuthenticatedRequestUser } from '@/lib/auth/session';
import { createBillingOrder } from '@/lib/db/billing-store';
import { isAlipayConfigured } from '@/lib/billing/alipay';

export async function POST(req: Request) {
  const user = getAuthenticatedRequestUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'Login required', authRequired: true },
      { status: 401 },
    );
  }

  if (!isAlipayConfigured()) {
    return NextResponse.json(
      { error: 'Alipay is not configured.' },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { planId?: unknown };
  const planId = typeof body.planId === 'string' ? body.planId : '';
  if (!planId) {
    return NextResponse.json({ error: 'planId is required.' }, { status: 400 });
  }

  try {
    const order = createBillingOrder({ userId: user.id, planId });
    return NextResponse.json({
      order,
      payUrl: `/api/billing/alipay/page-pay?orderId=${encodeURIComponent(order.id)}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to create order.',
      },
      { status: 400 },
    );
  }
}
