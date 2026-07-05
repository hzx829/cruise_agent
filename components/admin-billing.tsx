'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ReceiptText,
  RefreshCcw,
  Search,
  WalletCards,
} from 'lucide-react';

interface AdminBillingOrder {
  id: string;
  userId: string;
  planId: string;
  outTradeNo: string;
  provider: string;
  subject: string;
  amountCents: number;
  currency: string;
  quotaMessages: number;
  status: string;
  alipayTradeNo: string | null;
  tradeStatus: string | null;
  paidAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  userDisplayName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  userBalance: number;
}

interface PaymentEvent {
  id: string;
  orderId: string | null;
  outTradeNo: string | null;
  providerTradeNo: string | null;
  eventType: string;
  tradeStatus: string | null;
  signatureValid: boolean;
  rawJson: string;
  createdAt: string;
}

interface CreditLedgerEntry {
  id: string;
  userId: string;
  orderId: string | null;
  runId: string | null;
  delta: number;
  reason: string;
  note: string | null;
  createdBy: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface AdminBillingResponse {
  orders: AdminBillingOrder[];
  events: PaymentEvent[];
  ledger: CreditLedgerEntry[];
  authRequired: boolean;
}

const TOKEN_STORAGE_KEY = 'cruise_agent_admin_token';
const STATUS_OPTIONS = ['', 'created', 'paying', 'fulfilled', 'closed', 'refunded'];

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

function userLabel(order: AdminBillingOrder): string {
  return order.userDisplayName || order.userEmail || order.userPhone || order.userId;
}

function paramsFromFilters(filters: {
  q: string;
  status: string;
  orderKey: string;
  userId: string;
  limit: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('limit', filters.limit);
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.status) params.set('status', filters.status);
  if (filters.orderKey.trim()) params.set('orderKey', filters.orderKey.trim());
  if (filters.userId.trim()) params.set('userId', filters.userId.trim());
  return params;
}

export function AdminBilling() {
  const [data, setData] = useState<AdminBillingResponse | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [orderKey, setOrderKey] = useState('');
  const [userId, setUserId] = useState('');
  const [limit, setLimit] = useState('100');
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [adjustUserId, setAdjustUserId] = useState('');
  const [adjustDelta, setAdjustDelta] = useState('10');
  const [adjustNote, setAdjustNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo<HeadersInit>(() => {
    const nextHeaders: Record<string, string> = {};
    if (token) nextHeaders['x-admin-token'] = token;
    return nextHeaders;
  }, [token]);

  const handleResponse = useCallback(async <T,>(res: Response): Promise<T> => {
    const contentType = res.headers.get('content-type') ?? '';
    const json = contentType.includes('application/json')
      ? await res.json().catch(() => ({}))
      : {};

    if (!res.ok) {
      if (res.status === 401) setAuthRequired(true);
      throw new Error(typeof json.error === 'string' ? json.error : '请求失败');
    }

    return json as T;
  }, []);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = paramsFromFilters({ q, status, orderKey, userId, limit });
      const response = await fetch(`/api/admin/billing?${params}`, {
        cache: 'no-store',
        headers,
      });
      const nextData = await handleResponse<AdminBillingResponse>(response);
      setData(nextData);
      setAuthRequired(nextData.authRequired);
      setMessage(`已加载 ${nextData.orders.length} 个订单`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [handleResponse, headers, limit, orderKey, q, status, userId]);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
    setToken(storedToken);
    setTokenInput(storedToken);
  }, []);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  function saveToken() {
    const trimmed = tokenInput.trim();
    window.localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
    setToken(trimmed);
    setMessage('管理 token 已保存');
  }

  async function adjustCredits() {
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/billing/credits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(headers as Record<string, string>),
        },
        body: JSON.stringify({
          userId: adjustUserId,
          delta: Number(adjustDelta),
          note: adjustNote,
        }),
      });
      const json = await handleResponse<{ balance: number }>(response);
      setMessage(`额度已调整，当前余额 ${json.balance}`);
      setUserId(adjustUserId);
      await loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : '调账失败');
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="border-b px-4 py-3 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <ReceiptText className="size-5 text-primary" />
              Billing
            </h1>
            <p className="text-sm text-muted-foreground">
              订单、支付事件和额度流水
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {authRequired && (
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" />
                <input
                  value={tokenInput}
                  onChange={(event) => setTokenInput(event.target.value)}
                  placeholder="ADMIN_TOKEN"
                  className="h-9 w-44 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  type="password"
                />
                <button
                  onClick={saveToken}
                  className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
                  type="button"
                >
                  保存 token
                </button>
              </div>
            )}
            <button
              onClick={loadBilling}
              className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
              disabled={loading}
              type="button"
            >
              <RefreshCcw className="size-4" />
              刷新
            </button>
          </div>
        </div>
      </div>

      <div className="border-b px-4 py-3 md:px-6">
        <div className="grid gap-2 lg:grid-cols-[minmax(180px,1fr)_150px_190px_190px_110px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="搜索订单 / 用户 / 支付宝交易号"
              className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option || 'all'} value={option}>
                {option || '全部状态'}
              </option>
            ))}
          </select>
          <input
            value={orderKey}
            onChange={(event) => setOrderKey(event.target.value)}
            placeholder="事件订单号"
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="流水 user id"
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
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

      <div className="grid gap-5 px-4 py-5 md:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-5">
          <div className="overflow-hidden rounded-md border">
            <div className="border-b px-3 py-2 text-sm font-semibold">订单</div>
            {loading && !data ? (
              <p className="p-4 text-sm text-muted-foreground">加载中...</p>
            ) : (data?.orders ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">暂无订单</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">订单</th>
                      <th className="px-3 py-2 font-medium">用户</th>
                      <th className="px-3 py-2 font-medium">金额</th>
                      <th className="px-3 py-2 font-medium">额度</th>
                      <th className="px-3 py-2 font-medium">状态</th>
                      <th className="px-3 py-2 font-medium">支付宝</th>
                      <th className="px-3 py-2 font-medium">时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.orders.map((order) => (
                      <tr key={order.id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium">{order.subject}</div>
                          <button
                            type="button"
                            onClick={() => {
                              setOrderKey(order.outTradeNo);
                              setUserId(order.userId);
                              setAdjustUserId(order.userId);
                            }}
                            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                          >
                            {order.outTradeNo}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <div>{userLabel(order)}</div>
                          <div className="text-xs text-muted-foreground">
                            {order.userBalance} credits
                          </div>
                        </td>
                        <td className="px-3 py-2">{formatMoney(order.amountCents)}</td>
                        <td className="px-3 py-2">{order.quotaMessages}</td>
                        <td className="px-3 py-2">{order.status}</td>
                        <td className="px-3 py-2">
                          <div>{order.tradeStatus || '-'}</div>
                          <div className="text-xs text-muted-foreground">
                            {order.alipayTradeNo || '-'}
                          </div>
                        </td>
                        <td className="px-3 py-2">{formatTime(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-md border">
            <div className="border-b px-3 py-2 text-sm font-semibold">
              支付事件
            </div>
            {(data?.events ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">暂无事件</p>
            ) : (
              <div className="divide-y">
                {data?.events.map((event) => (
                  <details key={event.id} className="px-3 py-2">
                    <summary className="cursor-pointer text-sm">
                      {event.eventType} · {event.tradeStatus || '-'} ·{' '}
                      {event.signatureValid ? 'valid' : 'invalid'} ·{' '}
                      {formatTime(event.createdAt)}
                    </summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted/30 p-3 text-xs">
                      {JSON.stringify(JSON.parse(event.rawJson), null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="min-w-0 space-y-5">
          <section className="rounded-md border p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <WalletCards className="size-4" />
              手工调账
            </h2>
            <div className="mt-3 space-y-2">
              <input
                value={adjustUserId}
                onChange={(event) => setAdjustUserId(event.target.value)}
                placeholder="user id"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                value={adjustDelta}
                onChange={(event) => setAdjustDelta(event.target.value)}
                placeholder="delta"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                value={adjustNote}
                onChange={(event) => setAdjustNote(event.target.value)}
                placeholder="note"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={adjustCredits}
                className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90"
              >
                提交
              </button>
            </div>
          </section>

          <section className="overflow-hidden rounded-md border">
            <div className="border-b px-3 py-2 text-sm font-semibold">
              额度流水
            </div>
            {(data?.ledger ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">暂无流水</p>
            ) : (
              data?.ledger.map((entry) => (
                <div key={entry.id} className="border-b p-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(entry.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {entry.userId}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {entry.note || entry.reason}
                  </p>
                  {entry.expiresAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      expires {formatTime(entry.expiresAt)}
                    </p>
                  )}
                </div>
              ))
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
