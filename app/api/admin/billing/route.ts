import { NextResponse } from 'next/server';
import { isAdminAuthEnabled, requireAdmin } from '@/lib/admin-auth';
import {
  listAdminBillingOrders,
  listAdminCreditLedger,
  listAdminPaymentEvents,
} from '@/lib/db/billing-store';

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
  const q = getSearchParam(url, 'q');
  const status = getSearchParam(url, 'status');
  const orderKey = getSearchParam(url, 'orderKey');
  const userId = getSearchParam(url, 'userId');
  const limit = getLimit(url);

  return NextResponse.json({
    orders: listAdminBillingOrders({ q, status, limit }),
    events: listAdminPaymentEvents({ orderKey, limit }),
    ledger: listAdminCreditLedger({ userId, limit }),
    authRequired: isAdminAuthEnabled(),
  });
}
