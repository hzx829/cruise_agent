'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Loader2,
  RefreshCcw,
  WalletCards,
} from 'lucide-react';

interface BillingPlan {
  id: string;
  name: string;
  description: string | null;
  amountCents: number;
  currency: string;
  quotaMessages: number;
}

interface BillingOrder {
  id: string;
  outTradeNo: string;
  subject: string;
  amountCents: number;
  quotaMessages: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
}

interface CreditLedgerEntry {
  id: string;
  delta: number;
  reason: string;
  note: string | null;
  createdAt: string;
}

interface BillingMeResponse {
  balance: number;
  plans: BillingPlan[];
  orders: BillingOrder[];
  ledger: CreditLedgerEntry[];
  alipayConfigured: boolean;
}

function formatMoney(amountCents: number): string {
  return `¥${(amountCents / 100).toFixed(2)}`;
}

function formatTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    created: '待支付',
    paying: '支付中',
    fulfilled: '已到账',
    closed: '已关闭',
    refunded: '已退款',
  };
  return labels[status] ?? status;
}

export function BillingDashboard() {
  const [data, setData] = useState<BillingMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingPlanId, setCreatingPlanId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadBilling() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/billing/me', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || '加载失败');
      }
      setData(json as BillingMeResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBilling();
  }, []);

  async function buy(planId: string) {
    setCreatingPlanId(planId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/billing/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || '创建订单失败');
      }
      window.location.assign(json.payUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建订单失败');
    } finally {
      setCreatingPlanId(null);
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="border-b px-4 py-4 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <WalletCards className="size-5 text-primary" />
              额度
            </h1>
            <p className="text-sm text-muted-foreground">
              当前余额和支付记录
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/chat"
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
            >
              返回对话
            </Link>
            <button
              onClick={loadBilling}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
              type="button"
            >
              <RefreshCcw className="size-4" />
              刷新
            </button>
          </div>
        </div>
      </div>

      {(message || error) && (
        <div className="border-b px-4 py-2 md:px-6">
          <div
            className={`flex items-center gap-2 text-sm ${
              error ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {error ? (
              <AlertCircle className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            <span>{error || message}</span>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 md:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-background p-4">
              <p className="text-sm text-muted-foreground">可用额度</p>
              <p className="mt-2 text-3xl font-semibold">{data?.balance ?? 0}</p>
            </div>
            <div className="rounded-md border bg-background p-4">
              <p className="text-sm text-muted-foreground">支付状态</p>
              <p className="mt-2 text-lg font-medium">
                {data?.alipayConfigured ? '已启用' : '暂未配置'}
              </p>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold">购买额度</h2>
            {loading && !data ? (
              <div className="flex h-32 items-center justify-center rounded-md border text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                加载中
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(data?.plans ?? []).map((plan) => (
                  <article key={plan.id} className="rounded-md border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{plan.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {plan.description}
                        </p>
                      </div>
                      <CreditCard className="size-5 text-primary" />
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-2xl font-semibold">
                          {formatMoney(plan.amountCents)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {plan.quotaMessages} 次
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => buy(plan.id)}
                        disabled={!data?.alipayConfigured || creatingPlanId != null}
                        className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {creatingPlanId === plan.id ? '创建中' : '购买'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold">订单</h2>
            <div className="overflow-hidden rounded-md border">
              {(data?.orders ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">暂无订单</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-muted/40 text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">订单</th>
                        <th className="px-3 py-2 font-medium">金额</th>
                        <th className="px-3 py-2 font-medium">额度</th>
                        <th className="px-3 py-2 font-medium">状态</th>
                        <th className="px-3 py-2 font-medium">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.orders.map((order) => (
                        <tr key={order.id} className="border-t">
                          <td className="px-3 py-2">
                            <div className="font-medium">{order.subject}</div>
                            <div className="text-xs text-muted-foreground">
                              {order.outTradeNo}
                            </div>
                          </td>
                          <td className="px-3 py-2">{formatMoney(order.amountCents)}</td>
                          <td className="px-3 py-2">{order.quotaMessages}</td>
                          <td className="px-3 py-2">{statusLabel(order.status)}</td>
                          <td className="px-3 py-2">{formatTime(order.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold">额度流水</h2>
          <div className="rounded-md border">
            {(data?.ledger ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">暂无流水</p>
            ) : (
              data?.ledger.map((entry) => (
                <div key={entry.id} className="border-b p-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">
                      {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(entry.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {entry.note || entry.reason}
                  </p>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
