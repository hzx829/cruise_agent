import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { BillingDashboard } from '@/components/billing-dashboard';
import { getAuthenticatedCookieStoreUser } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: '额度与套餐 | 邮轮特价助手',
};

export default async function BillingPage() {
  const user = getAuthenticatedCookieStoreUser(await cookies());
  if (!user) {
    redirect('/login?next=/billing');
  }

  return <BillingDashboard />;
}
