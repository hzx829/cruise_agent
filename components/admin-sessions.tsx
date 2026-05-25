'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  MessageSquareText,
  RefreshCcw,
  Search,
  UserRound,
} from 'lucide-react';

interface AdminChatSession {
  id: string;
  ownerUserId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    email: string | null;
    phone: string | null;
    role: string | null;
    status: string | null;
    isAnonymous: boolean | null;
  };
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  lastMessage: {
    id: string | null;
    role: string | null;
    createdAt: string | null;
    preview: string;
  };
  runCount: number;
  latestRun: {
    id: string | null;
    status: string | null;
    intent: string | null;
    durationMs: number | null;
    createdAt: string | null;
    query: string | null;
  };
  activeAuthSessionCount: number;
  lastAuthSessionAt: string | null;
}

interface AdminSessionsResponse {
  sessions: AdminChatSession[];
  authRequired: boolean;
}

const TOKEN_STORAGE_KEY = 'cruise_agent_admin_token';

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

function formatDuration(value: number | null): string {
  if (value == null) return '-';
  if (value >= 60_000) return `${(value / 60_000).toFixed(1)}min`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

function paramsFromFilters(filters: {
  q: string;
  userId: string;
  limit: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('limit', filters.limit);
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.userId.trim()) params.set('userId', filters.userId.trim());
  return params;
}

function userLabel(session: AdminChatSession): string {
  return (
    session.owner.displayName ||
    session.owner.email ||
    session.owner.phone ||
    session.owner.id ||
    'unowned'
  );
}

export function AdminSessions() {
  const [sessions, setSessions] = useState<AdminChatSession[]>([]);
  const [selectedSession, setSelectedSession] =
    useState<AdminChatSession | null>(null);
  const [q, setQ] = useState('');
  const [userId, setUserId] = useState('');
  const [limit, setLimit] = useState('100');
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
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
      throw new Error(
        typeof json.error === 'string' ? json.error : '请求失败',
      );
    }

    return json as T;
  }, []);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = paramsFromFilters({ q, userId, limit });
      const res = await fetch(`/api/admin/sessions?${params}`, {
        cache: 'no-store',
        headers,
      });
      const data = await handleResponse<AdminSessionsResponse>(res);
      setSessions(data.sessions);
      setAuthRequired(data.authRequired);
      setSelectedSession((current) => {
        if (!current) return data.sessions[0] ?? null;
        return (
          data.sessions.find((session) => session.id === current.id) ??
          data.sessions[0] ??
          null
        );
      });
      setMessage(`已加载 ${data.sessions.length} 个 session`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [handleResponse, headers, limit, q, userId]);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
    setToken(storedToken);
    setTokenInput(storedToken);

    const params = new URLSearchParams(window.location.search);
    const initialQ = params.get('q');
    const initialUserId = params.get('userId');
    if (initialQ) setQ(initialQ);
    if (initialUserId) setUserId(initialUserId);
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  function saveToken() {
    const trimmed = tokenInput.trim();
    window.localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
    setToken(trimmed);
    setMessage('管理 token 已保存');
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="border-b bg-background px-4 py-3 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <MessageSquareText className="size-5 text-primary" />
              User Sessions
            </h1>
            <p className="text-sm text-muted-foreground">
              查看所有用户的聊天会话、账号信息、最近消息和关联 agent run。
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
                  className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted"
                  type="button"
                >
                  保存 token
                </button>
              </div>
            )}
            <Link
              href="/admin/agent-traces"
              className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted"
            >
              Agent Trace
            </Link>
            <button
              onClick={loadSessions}
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
        <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_minmax(180px,260px)_120px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="搜索 session / 用户 / 消息 / query"
              className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="按 user id 过滤"
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="50">50 条</option>
            <option value="100">100 条</option>
            <option value="200">200 条</option>
            <option value="500">500 条</option>
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

      <div className="grid min-h-[calc(100dvh-154px)] grid-cols-1 lg:grid-cols-[430px_minmax(0,1fr)]">
        <aside className="border-b bg-muted/20 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
            <UserRound className="size-4" />
            Sessions
          </div>
          <div className="max-h-[42dvh] overflow-auto lg:max-h-[calc(100dvh-202px)]">
            {loading && (
              <p className="px-4 py-3 text-sm text-muted-foreground">加载中...</p>
            )}
            {!loading && sessions.length === 0 && (
              <p className="px-4 py-4 text-sm text-muted-foreground">
                暂无 session。
              </p>
            )}
            {!loading &&
              sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  className={`w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted ${
                    selectedSession?.id === session.id
                      ? 'bg-primary/10'
                      : 'bg-background'
                  }`}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">
                      {session.title || session.id}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatTime(session.updatedAt)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{userLabel(session)}</span>
                    <span>{session.messageCount} msgs</span>
                    <span>{session.runCount} runs</span>
                    <span>{session.activeAuthSessionCount} active auth</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {session.lastMessage.preview}
                  </p>
                </button>
              ))}
          </div>
        </aside>

        <section className="min-w-0">
          {selectedSession ? (
            <SessionDetails session={selectedSession} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              选择一个 session。
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function SessionDetails({ session }: { session: AdminChatSession }) {
  return (
    <div className="min-w-0">
      <div className="border-b px-4 py-3 md:px-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{session.title}</h2>
            <p className="text-sm text-muted-foreground">{session.id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/agent-traces?q=${encodeURIComponent(session.id)}`}
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
            >
              查看相关 Trace
            </Link>
            {session.owner.id && (
              <Link
                href={`/admin/sessions?userId=${encodeURIComponent(session.owner.id)}`}
                className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
              >
                查看该用户全部会话
              </Link>
            )}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Meta label="owner" value={userLabel(session)} />
          <Meta label="user id" value={session.owner.id || '-'} />
          <Meta label="user status" value={session.owner.status || '-'} />
          <Meta
            label="anonymous"
            value={session.owner.isAnonymous == null ? '-' : String(session.owner.isAnonymous)}
          />
          <Meta label="messages" value={`${session.messageCount}`} />
          <Meta label="user/assistant" value={`${session.userMessageCount}/${session.assistantMessageCount}`} />
          <Meta label="active auth sessions" value={`${session.activeAuthSessionCount}`} />
          <Meta label="last auth" value={formatTime(session.lastAuthSessionAt)} />
          <Meta label="created" value={formatTime(session.createdAt)} />
          <Meta label="updated" value={formatTime(session.updatedAt)} />
          <Meta label="runs" value={`${session.runCount}`} />
          <Meta label="latest run" value={session.latestRun.id || '-'} />
        </div>
      </div>

      <div className="border-b px-4 py-4 md:px-6">
        <h3 className="mb-2 text-sm font-semibold">Last Message</h3>
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{session.lastMessage.role || '-'}</span>
            <span>{formatTime(session.lastMessage.createdAt)}</span>
            <span>{session.lastMessage.id || '-'}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6">
            {session.lastMessage.preview}
          </p>
        </div>
      </div>

      <div className="px-4 py-4 md:px-6">
        <h3 className="mb-2 text-sm font-semibold">Latest Run</h3>
        {session.latestRun.id ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Meta label="run id" value={session.latestRun.id} />
            <Meta label="status" value={session.latestRun.status || '-'} />
            <Meta label="intent" value={session.latestRun.intent || '-'} />
            <Meta
              label="duration"
              value={formatDuration(session.latestRun.durationMs)}
            />
            <div className="md:col-span-2 xl:col-span-4">
              <p className="text-xs uppercase text-muted-foreground">query</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {session.latestRun.query || '-'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            这个 session 还没有 agent run。
          </p>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}
