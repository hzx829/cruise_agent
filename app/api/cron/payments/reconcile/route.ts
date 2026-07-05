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
import { getBillingOrderTimeoutMinutes } from '@/lib/billing/config';
import {
  fulfillPaidBillingOrder,
  listOrdersForPaymentReconcile,
  markBillingOrderClosed,
  recordPaymentEvent,
} from '@/lib/db/billing-store';

const SUCCESS_TRADE_STATUSES = new Set(['TRADE_SUCCESS', 'TRADE_FINISHED']);

function requireCron(req: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured.' },
      { status: 503 },
    );
  }
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function isOrderExpired(
  order: { createdAt: string },
  timeoutMinutes: number,
): boolean {
  const createdAt = new Date(order.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt > timeoutMinutes * 60_000;
}

export async function POST(req: Request) {
  const authError = requireCron(req);
  if (authError) return authError;

  const orders = listOrdersForPaymentReconcile(20);
  const timeoutMinutes = getBillingOrderTimeoutMinutes();
  let fulfilled = 0;
  let closed = 0;
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

      if (
        tradeStatus &&
        SUCCESS_TRADE_STATUSES.has(tradeStatus) &&
        amountCents != null
      ) {
        const fulfillResult = fulfillPaidBillingOrder({
          outTradeNo,
          alipayTradeNo: getTradeNo(result),
          tradeStatus,
          amountCents,
          paidAt: getPaidAt(result),
        });
        if (fulfillResult.ok) fulfilled += 1;
        continue;
      }

      if (tradeStatus === 'TRADE_CLOSED' || isOrderExpired(order, timeoutMinutes)) {
        const closedOrder = markBillingOrderClosed({
          orderId: order.id,
          tradeStatus: tradeStatus ?? 'LOCAL_TIMEOUT',
        });
        if (closedOrder?.status === 'closed') closed += 1;
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

  return NextResponse.json({ checked, fulfilled, closed });
}
