'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  CircleDollarSign,
  CreditCard,
  History,
  Loader2,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  WalletCards,
  Zap,
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
  billingEnabled: boolean;
  plans: BillingPlan[];
  orders: BillingOrder[];
  ledger: CreditLedgerEntry[];
  alipayConfigured: boolean;
}

const PLAN_META: Record<
  string,
  {
    tag: string;
    audience: string;
    highlighted?: boolean;
    features: string[];
  }
> = {
  monthly_lite: {
    tag: '轻用',
    audience: '偶尔查价',
    features: ['600 点额度', '约 50 次私有库报价', '用完可续买'],
  },
  monthly_standard: {
    tag: '推荐',
    audience: '持续跟进',
    highlighted: true,
    features: ['3000 点额度', '约 250 次私有库报价', '适合持续比价'],
  },
  monthly_pro: {
    tag: '高频',
    audience: '批量选品',
    features: ['8000 点额度', '约 660 次私有库报价', '最低单点成本'],
  },
};

function formatMoney(amountCents: number): string {
  const amount = amountCents / 100;
  return amount % 1 === 0 ? `¥${amount.toFixed(0)}` : `¥${amount.toFixed(2)}`;
}

function formatQuota(value: number): string {
  return value.toLocaleString('zh-CN');
}

function formatUnitPrice(plan: BillingPlan): string {
  if (plan.quotaMessages <= 0) return '-';
  return `¥${(plan.amountCents / 100 / plan.quotaMessages).toFixed(3)}/点`;
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

function statusClass(status: string): string {
  if (status === 'fulfilled') {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (status === 'created' || status === 'paying') {
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }
  return 'bg-muted text-muted-foreground';
}

function getQuotaRange(plans: BillingPlan[]): string {
  const quotas = plans.map((plan) => plan.quotaMessages).filter((quota) => quota > 0);
  if (quotas.length === 0) return '-';
  return `${formatQuota(Math.min(...quotas))} - ${formatQuota(Math.max(...quotas))}`;
}

function getBestValuePlan(plans: BillingPlan[]): BillingPlan | null {
  return plans.reduce<BillingPlan | null>((best, plan) => {
    if (plan.quotaMessages <= 0) return best;
    if (!best) return plan;
    const currentUnit = plan.amountCents / plan.quotaMessages;
    const bestUnit = best.amountCents / best.quotaMessages;
    return currentUnit < bestUnit ? plan : best;
  }, null);
}

export function BillingDashboard() {
  const [data, setData] = useState<BillingMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingPlanId, setCreatingPlanId] = useState<string | null>(null);
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

  const quotaRange = useMemo(() => getQuotaRange(data?.plans ?? []), [data?.plans]);
  const bestValuePlan = useMemo(
    () => getBestValuePlan(data?.plans ?? []),
    [data?.plans],
  );

  async function buy(planId: string) {
    setCreatingPlanId(planId);
    setError(null);
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
    <main className="min-h-dvh bg-muted/20 text-foreground">
      <div className="border-b bg-background px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <WalletCards className="size-5 text-primary" />
              额度与套餐
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              额度包、订单和扣费流水
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/chat"
              className="inline-flex h-9 items-center gap-1 rounded-md border bg-background px-3 text-sm hover:bg-muted"
            >
              <ArrowLeft className="size-4" />
              返回对话
            </Link>
            <button
              onClick={loadBilling}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1 rounded-md border bg-background px-3 text-sm hover:bg-muted disabled:opacity-50"
              type="button"
            >
              <RefreshCcw className="size-4" />
              刷新
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="border-b bg-background px-4 py-2 md:px-6">
          <div className="mx-auto flex max-w-7xl items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 md:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <section className="rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">可用额度</p>
                <WalletCards className="size-4 text-primary" />
              </div>
              <p className="mt-3 text-4xl font-semibold tracking-normal">
                {formatQuota(data?.balance ?? 0)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">按 token 和搜索扣点</p>
            </section>

            <section className="rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">额度包区间</p>
                <CalendarDays className="size-4 text-emerald-600" />
              </div>
              <p className="mt-3 text-2xl font-semibold">{quotaRange}</p>
              <p className="mt-1 text-sm text-muted-foreground">点/包</p>
            </section>

            <section className="rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">支付与计费</p>
                <ShieldCheck className="size-4 text-amber-600" />
              </div>
              <p className="mt-3 text-lg font-semibold">
                {data?.alipayConfigured ? '支付宝已启用' : '支付宝未配置'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data?.billingEnabled ? '对话会扣额度' : '当前不扣额度'}
              </p>
            </section>
          </div>

          <section className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">额度包</h2>
                <p className="text-sm text-muted-foreground">
                  私有库报价约 12 点；含一次网络搜索约 17 点
                </p>
              </div>
              {bestValuePlan && (
                <p className="text-sm text-muted-foreground">
                  最低 {formatUnitPrice(bestValuePlan)}
                </p>
              )}
            </div>

            {loading && !data ? (
              <div className="flex h-40 items-center justify-center rounded-lg border bg-background text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                加载套餐
              </div>
            ) : (data?.plans ?? []).length === 0 ? (
              <div className="rounded-lg border bg-background p-5 text-sm text-muted-foreground">
                暂无可购买套餐
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-3">
                {(data?.plans ?? []).map((plan) => {
                  const meta = PLAN_META[plan.id] ?? {
                    tag: '额度包',
                    audience: '按需使用',
                    features: [`${formatQuota(plan.quotaMessages)} 点额度`],
                  };
                  const creating = creatingPlanId === plan.id;
                  return (
                    <article
                      key={plan.id}
                      className={`flex min-h-[280px] flex-col rounded-lg border bg-background p-5 ${
                        meta.highlighted ? 'border-primary shadow-sm' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold">{plan.name}</h3>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${
                                meta.highlighted
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {meta.tag}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {meta.audience}
                          </p>
                        </div>
                        {meta.highlighted ? (
                          <BadgeCheck className="size-5 shrink-0 text-primary" />
                        ) : (
                          <CreditCard className="size-5 shrink-0 text-muted-foreground" />
                        )}
                      </div>

                      <div className="mt-5">
                        <div className="flex items-end gap-1">
                          <span className="text-3xl font-semibold">
                            {formatMoney(plan.amountCents)}
                          </span>
                          <span className="pb-1 text-sm text-muted-foreground">/包</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatQuota(plan.quotaMessages)} 点，{formatUnitPrice(plan)}
                        </p>
                      </div>

                      <div className="mt-5 space-y-2 text-sm">
                        {meta.features.map((feature) => (
                          <div key={feature} className="flex items-center gap-2">
                            <Check className="size-4 text-emerald-600" />
                            <span>{feature}</span>
                          </div>
                        ))}
                      </div>

                      {plan.description && (
                        <p className="mt-4 text-sm text-muted-foreground">
                          {plan.description}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => buy(plan.id)}
                        disabled={!data?.alipayConfigured || creatingPlanId != null}
                        className={`mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm disabled:opacity-50 ${
                          meta.highlighted
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'border bg-background hover:bg-muted'
                        }`}
                      >
                        {creating ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CreditCard className="size-4" />
                        )}
                        {creating ? '创建订单' : data?.alipayConfigured ? '购买额度包' : '暂不可购买'}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ReceiptText className="size-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">订单</h2>
            </div>
            <div className="overflow-hidden rounded-lg border bg-background">
              {(data?.orders ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">暂无订单</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
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
                          <td className="px-3 py-3">
                            <div className="font-medium">{order.subject}</div>
                            <div className="text-xs text-muted-foreground">
                              {order.outTradeNo}
                            </div>
                          </td>
                          <td className="px-3 py-3">{formatMoney(order.amountCents)}</td>
                          <td className="px-3 py-3">
                            {formatQuota(order.quotaMessages)} 点
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs ${statusClass(
                                order.status,
                              )}`}
                            >
                              {statusLabel(order.status)}
                            </span>
                          </td>
                          <td className="px-3 py-3">{formatTime(order.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </section>

        <aside className="min-w-0 space-y-5">
          <section className="rounded-lg border bg-background p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CircleDollarSign className="size-4 text-primary" />
              计费规则
            </h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex gap-3">
                <Zap className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <p>完成回复后按模型 token 和网络搜索次数扣点。</p>
              </div>
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <p>购买后按点发放，当前版本不自动续费。</p>
              </div>
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <p>支付成功后由服务端回调确认到账。</p>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border bg-background">
            <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
              <History className="size-4 text-muted-foreground" />
              额度流水
            </div>
            {(data?.ledger ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">暂无流水</p>
            ) : (
              <div className="divide-y">
                {data?.ledger.map((entry) => (
                  <div key={entry.id} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`text-sm font-semibold ${
                          entry.delta > 0
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-foreground'
                        }`}
                      >
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
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
