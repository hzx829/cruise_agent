import { NextResponse } from 'next/server';
import {
  getOutTradeNo,
  getPaidAt,
  getTotalAmount,
  getTradeNo,
  getTradeStatus,
  parseCnyAmountToCents,
  queryAlipayTrade,
} from '@/lib/billing/alipay';
import {
  fulfillPaidBillingOrder,
  listOrdersForPaymentReconcile,
  recordPaymentEvent,
} from '@/lib/db/billing-store';

function requireCron(req: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function POST(req: Request) {
  const authError = requireCron(req);
  if (authError) return authError;

  const orders = listOrdersForPaymentReconcile(20);
  let fulfilled = 0;
  let checked = 0;

  for (const order of orders) {
    try {
      const result = await queryAlipayTrade(order.outTradeNo);
      checked += 1;
      const outTradeNo = getOutTradeNo(result) || order.outTradeNo;
      const tradeStatus = getTradeStatus(result);
      const totalAmount = getTotalAmount(result);
      const amountCents = parseCnyAmountToCents(totalAmount);

      recordPaymentEvent({
        orderId: order.id,
        outTradeNo,
        providerTradeNo: getTradeNo(result),
        eventType: 'query',
        tradeStatus,
        signatureValid: true,
        raw: result,
      });

      if (tradeStatus && amountCents != null) {
        const fulfillResult = fulfillPaidBillingOrder({
          outTradeNo,
          alipayTradeNo: getTradeNo(result),
          tradeStatus,
          amountCents,
          paidAt: getPaidAt(result),
        });
        if (fulfillResult.ok) fulfilled += 1;
      }
    } catch (error) {
      recordPaymentEvent({
        orderId: order.id,
        outTradeNo: order.outTradeNo,
        eventType: 'query_error',
        signatureValid: false,
        raw: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return NextResponse.json({ checked, fulfilled });
}
