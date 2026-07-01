'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  RefreshCcw,
  Search,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

interface ManagedUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  isAnonymous: boolean;
  createdAt: string;
  updatedAt: string | null;
  balance: number;
  chatCount: number;
  activeSessionCount: number;
}

interface AdminUsersResponse {
  users: ManagedUser[];
}

const ROLE_OPTIONS = ['', 'user', 'admin', 'root'];
const STATUS_OPTIONS = ['', 'active', 'disabled'];

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

function userLabel(user: ManagedUser): string {
  return user.displayName || user.email || user.phone || user.id;
}

function paramsFromFilters(filters: {
  q: string;
  role: string;
  status: string;
  limit: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('limit', filters.limit);
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.role) params.set('role', filters.role);
  if (filters.status) params.set('status', filters.status);
  return params;
}

export function AdminUsers() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState('100');
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(
    () => ({ q, role, status, limit }),
    [limit, q, role, status],
  );

  const handleResponse = useCallback(async <T,>(res: Response): Promise<T> => {
    const contentType = res.headers.get('content-type') ?? '';
    const json = contentType.includes('application/json')
      ? await res.json().catch(() => ({}))
      : {};

    if (!res.ok) {
      throw new Error(
        typeof json.error === 'string' ? json.error : '请求失败',
      );
    }

    return json as T;
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = paramsFromFilters(filters);
      const response = await fetch(`/api/admin/users?${params}`, {
        cache: 'no-store',
      });
      const data = await handleResponse<AdminUsersResponse>(response);
      setUsers(data.users);
      setMessage(`已加载 ${data.users.length} 个用户`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filters, handleResponse]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function updateUser(
    userId: string,
    patch: Partial<Pick<ManagedUser, 'role' | 'status'>>,
  ) {
    setSavingUserId(userId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );
      const data = await handleResponse<{ user: ManagedUser }>(response);
      setUsers((current) =>
        current.map((user) => (user.id === userId ? data.user : user)),
      );
      setMessage(`${userLabel(data.user)} 已更新`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="border-b px-4 py-3 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <UsersRound className="size-5 text-primary" />
              Users
            </h1>
            <p className="text-sm text-muted-foreground">
              root 管理用户、管理员和账号状态。
            </p>
          </div>
          <button
            onClick={loadUsers}
            className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
            disabled={loading}
            type="button"
          >
            <RefreshCcw className="size-4" />
            刷新
          </button>
        </div>
      </div>

      <div className="border-b px-4 py-3 md:px-6">
        <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_150px_150px_110px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="搜索用户 / 昵称 / 邮箱 / 手机"
              className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option || 'all'} value={option}>
                {option || '全部角色'}
              </option>
            ))}
          </select>
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
          <select
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
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

      <div className="px-4 py-5 md:px-6">
        <div className="overflow-hidden rounded-md border">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">加载中...</p>
          ) : users.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">暂无用户</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] text-sm">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">用户</th>
                    <th className="px-3 py-2 font-medium">角色</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="px-3 py-2 font-medium">额度</th>
                    <th className="px-3 py-2 font-medium">会话</th>
                    <th className="px-3 py-2 font-medium">登录</th>
                    <th className="px-3 py-2 font-medium">创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {user.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={user.avatarUrl}
                              alt=""
                              className="size-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                              <ShieldCheck className="size-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {userLabel(user)}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {user.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={user.role}
                          disabled={savingUserId === user.id}
                          onChange={(event) =>
                            void updateUser(user.id, {
                              role: event.target.value,
                            })
                          }
                          className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                          <option value="root">root</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={user.status === 'active' ? 'active' : 'disabled'}
                          disabled={savingUserId === user.id}
                          onChange={(event) =>
                            void updateUser(user.id, {
                              status: event.target.value,
                            })
                          }
                          className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="active">active</option>
                          <option value="disabled">disabled</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">{user.balance}</td>
                      <td className="px-3 py-2">{user.chatCount}</td>
                      <td className="px-3 py-2">
                        {user.activeSessionCount} active
                      </td>
                      <td className="px-3 py-2">{formatTime(user.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
