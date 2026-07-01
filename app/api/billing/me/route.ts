import { NextResponse } from 'next/server';
import { getAuthenticatedRequestUser } from '@/lib/auth/session';
import {
  getCreditBalance,
  listActiveBillingPlans,
  listCreditLedger,
  listRecentBillingOrders,
} from '@/lib/db/billing-store';
import { isAlipayConfigured } from '@/lib/billing/alipay';
import { isChatBillingEnabled } from '@/lib/billing/config';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = getAuthenticatedRequestUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'Login required', authRequired: true },
      { status: 401 },
    );
  }

  return NextResponse.json({
    balance: getCreditBalance(user.id),
    billingEnabled: isChatBillingEnabled(),
    plans: listActiveBillingPlans(),
    orders: listRecentBillingOrders(user.id, 10),
    ledger: listCreditLedger(user.id, 20),
    alipayConfigured: isAlipayConfigured(),
  });
}
