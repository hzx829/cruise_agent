'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCcw, XCircle } from 'lucide-react';

interface BillingOrder {
  id: string;
  subject: string;
  amountCents: number;
  quotaMessages: number;
  status: string;
  outTradeNo: string;
}

interface OrderResponse {
  order: BillingOrder;
  balance: number;
}

function formatMoney(amountCents: number): string {
  return `¥${(amountCents / 100).toFixed(2)}`;
}

function statusText(status: string): string {
  if (status === 'fulfilled') return '已到账';
  if (status === 'paying') return '确认中';
  if (status === 'created') return '待支付';
  if (status === 'closed') return '已关闭';
  if (status === 'refunded') return '已退款';
  return status;
}

export function BillingReturn({ orderId }: { orderId: string | null }) {
  const [data, setData] = useState<OrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));

  const loadOrder = useCallback(async () => {
    if (!orderId) {
      setError('缺少订单号');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/billing/orders/${orderId}`, {
        cache: 'no-store',
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || '订单查询失败');
      }
      setData(json as OrderResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '订单查询失败');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    if (!orderId || data?.order.status === 'fulfilled') return;
    const timer = window.setInterval(() => {
      void loadOrder();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [data?.order.status, loadOrder, orderId]);

  const fulfilled = data?.order.status === 'fulfilled';

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-md rounded-md border bg-background p-6">
        <div className="flex items-center gap-3">
          {error ? (
            <XCircle className="size-8 text-destructive" />
          ) : fulfilled ? (
            <CheckCircle2 className="size-8 text-emerald-600" />
          ) : (
            <Loader2 className="size-8 animate-spin text-primary" />
          )}
          <div>
            <h1 className="text-lg font-semibold">
              {error ? '支付确认失败' : fulfilled ? '额度已到账' : '正在确认支付'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {data?.order ? statusText(data.order.status) : '查询订单状态'}
            </p>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        {data?.order && (
          <div className="mt-5 space-y-3 rounded-md border bg-muted/20 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">订单</span>
              <span className="text-right">{data.order.outTradeNo}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">金额</span>
              <span>{formatMoney(data.order.amountCents)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">额度</span>
              <span>{data.order.quotaMessages} 点</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">余额</span>
              <span>{data.balance}</span>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadOrder}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCcw className="size-4" />
            刷新
          </button>
          <Link
            href="/billing"
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            查看额度
          </Link>
          <Link
            href="/chat"
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90"
          >
            继续对话
          </Link>
        </div>
      </section>
    </main>
  );
}
