import { NextResponse } from 'next/server';
import { getAuthenticatedRequestUser } from '@/lib/auth/session';
import {
  getBillingOrderForUser,
  markBillingOrderPaying,
} from '@/lib/db/billing-store';
import {
  createAlipayPagePayHtml,
  isAlipayConfigured,
} from '@/lib/billing/alipay';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = getAuthenticatedRequestUser(req);
  if (!user) {
    return NextResponse.redirect(new URL('/login?next=/billing', req.url));
  }

  if (!isAlipayConfigured()) {
    return NextResponse.json(
      { error: 'Alipay is not configured.' },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const orderId = url.searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required.' }, { status: 400 });
  }

  const order = getBillingOrderForUser(orderId, user.id);
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  if (order.status === 'fulfilled') {
    return NextResponse.redirect(new URL(`/billing/return?orderId=${order.id}`, req.url));
  }
  if (order.status !== 'created' && order.status !== 'paying') {
    return NextResponse.json(
      { error: 'Order is no longer payable.' },
      { status: 409 },
    );
  }

  const payingOrder = markBillingOrderPaying(order.id, user.id) ?? order;
  const html = createAlipayPagePayHtml(payingOrder);
  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
