import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { BillingReturn } from '@/components/billing-return';
import { getAuthenticatedCookieStoreUser } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: '支付确认 | 邮轮特价助手',
};

function getParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = getAuthenticatedCookieStoreUser(await cookies());
  const params = await searchParams;
  const orderId = getParam(params.orderId);

  if (!user) {
    redirect(`/login?next=/billing/return${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ''}`);
  }

  return <BillingReturn orderId={orderId} />;
}
