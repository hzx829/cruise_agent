'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { WalletCards } from 'lucide-react';
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';

interface BillingMeResponse {
  balance: number;
  billingEnabled: boolean;
  plans: Array<{
    quotaMessages: number;
  }>;
}

const fetcher = async (url: string): Promise<BillingMeResponse | null> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Failed to load billing status');
  return response.json() as Promise<BillingMeResponse>;
};

function getQuotaBase(data: BillingMeResponse | null | undefined): number {
  const balance = data?.balance ?? 0;
  const planQuotas = (data?.plans ?? [])
    .map((plan) => plan.quotaMessages)
    .filter((quota) => quota > 0)
    .sort((a, b) => a - b);
  const nearestPlanQuota = planQuotas.find((quota) => quota >= balance);
  return Math.max(nearestPlanQuota ?? balance ?? 1, 1);
}

export function BillingStatus() {
  const { state, isMobile } = useSidebar();
  const { data, isLoading } = useSWR<BillingMeResponse | null>(
    '/api/billing/me',
    fetcher,
    {
      revalidateOnFocus: true,
    },
  );

  if (state === 'collapsed' && !isMobile) {
    return (
      <SidebarMenuButton tooltip="额度" asChild>
        <Link href="/billing">
          <WalletCards />
          <span>额度</span>
        </Link>
      </SidebarMenuButton>
    );
  }

  const quotaBase = getQuotaBase(data);
  const balance = data?.balance ?? 0;
  const billingEnabled = data?.billingEnabled ?? false;
  const progress = billingEnabled
    ? Math.min(100, Math.max(0, (balance / quotaBase) * 100))
    : 100;
  const isEmpty = billingEnabled && balance <= 0;
  const isLow = billingEnabled && balance > 0 && progress <= 20;
  const valueLabel = isLoading
    ? '...'
    : billingEnabled
      ? `${balance}/${quotaBase}`
      : '不限量';
  const detailLabel = billingEnabled
    ? isEmpty
      ? '额度已用完'
      : `剩余 ${balance} 点`
    : '当前不扣额度';
  const barColor = isEmpty
    ? 'bg-destructive'
    : isLow
      ? 'bg-amber-500'
      : 'bg-primary';

  return (
    <Link
      href="/billing"
      className="block rounded-md p-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <WalletCards className="size-4 shrink-0" />
          <span className="truncate">额度</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {valueLabel}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{detailLabel}</div>
    </Link>
  );
}
