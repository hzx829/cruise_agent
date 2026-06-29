import { NextResponse } from 'next/server';
import {
  alipayDateToIso,
  getAlipayAppId,
  getAlipaySellerId,
  parseCnyAmountToCents,
  verifyAlipayNotify,
} from '@/lib/billing/alipay';
import {
  fulfillPaidBillingOrder,
  getBillingOrderByOutTradeNo,
  recordPaymentEvent,
} from '@/lib/db/billing-store';

const SUCCESS_TRADE_STATUSES = new Set(['TRADE_SUCCESS', 'TRADE_FINISHED']);

function maskPaymentPayload(payload: Record<string, string>) {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (['buyer_id', 'buyer_user_id', 'buyer_logon_id'].includes(key)) {
      masked[key] = value.length <= 4 ? '***' : `${value.slice(0, 2)}***${value.slice(-2)}`;
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

async function readPayload(req: Request): Promise<Record<string, string>> {
  const formData = await req.formData();
  const payload: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    payload[key] = typeof value === 'string' ? value : value.name;
  }
  return payload;
}

function text(value: string, status = 200) {
  return new NextResponse(value, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export async function POST(req: Request) {
  let payload: Record<string, string>;
  try {
    payload = await readPayload(req);
  } catch (error) {
    console.error('[billing:alipay] failed to parse notify payload', error);
    return text('fail');
  }

  const outTradeNo = payload.out_trade_no ?? null;
  const order = outTradeNo ? getBillingOrderByOutTradeNo(outTradeNo) : null;
  let signatureValid = false;

  try {
    signatureValid = verifyAlipayNotify(payload);
  } catch (error) {
    console.error('[billing:alipay] notify verify threw', error);
  }

  recordPaymentEvent({
    orderId: order?.id ?? null,
    outTradeNo,
    providerTradeNo: payload.trade_no ?? null,
    eventType: 'notify',
    tradeStatus: payload.trade_status ?? null,
    signatureValid,
    raw: maskPaymentPayload(payload),
  });

  if (!signatureValid) return text('fail');
  if (payload.app_id !== getAlipayAppId()) return text('fail');

  const sellerId = getAlipaySellerId();
  if (sellerId && payload.seller_id !== sellerId) return text('fail');
  if (!order || !outTradeNo) return text('fail');

  const amountCents = parseCnyAmountToCents(payload.total_amount);
  if (amountCents == null || amountCents !== order.amountCents) {
    return text('fail');
  }

  const tradeStatus = payload.trade_status;
  if (!tradeStatus || !SUCCESS_TRADE_STATUSES.has(tradeStatus)) {
    return text('success');
  }

  const result = fulfillPaidBillingOrder({
    outTradeNo,
    alipayTradeNo: payload.trade_no ?? null,
    tradeStatus,
    amountCents,
    paidAt: alipayDateToIso(payload.gmt_payment),
  });

  return text(result.ok ? 'success' : 'fail');
}
