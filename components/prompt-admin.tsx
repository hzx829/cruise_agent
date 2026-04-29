'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  History,
  KeyRound,
  RefreshCcw,
  Rocket,
  Save,
  ShieldCheck,
} from 'lucide-react';

type PromptStatus = 'draft' | 'active' | 'archived';

interface AgentPrompt {
  id: string;
  version: number;
  status: PromptStatus;
  content: string;
  change_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
}

interface PromptListResponse {
  active: AgentPrompt;
  drafts: AgentPrompt[];
  history: AgentPrompt[];
  authRequired: boolean;
}

const TOKEN_STORAGE_KEY = 'cruise_agent_admin_token';

function statusLabel(status: PromptStatus): string {
  if (status === 'active') return '线上';
  if (status === 'draft') return '草稿';
  return '历史';
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

function promptTitle(prompt: AgentPrompt): string {
  return `v${prompt.version} · ${statusLabel(prompt.status)}`;
}

export function PromptAdmin() {
  const [data, setData] = useState<PromptListResponse | null>(null);
  const [selected, setSelected] = useState<AgentPrompt | null>(null);
  const [content, setContent] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [preview, setPreview] = useState('');
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const headers = useMemo<HeadersInit>(() => {
    const base: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) base['x-admin-token'] = token;
    return base;
  }, [token]);

  const handleResponse = useCallback(async <T,>(res: Response): Promise<T> => {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        setAuthRequired(true);
      }
      throw new Error(
        typeof json.error === 'string' ? json.error : '请求失败',
      );
    }
    return json as T;
  }, []);

  const loadPrompts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/prompts', {
        cache: 'no-store',
        headers,
      });
      const nextData = await handleResponse<PromptListResponse>(res);
      setData(nextData);
      setAuthRequired(nextData.authRequired);
      setSelected((current) => {
        if (!current) return nextData.active;
        const allPrompts = [
          nextData.active,
          ...nextData.drafts,
          ...nextData.history,
        ];
        return allPrompts.find((item) => item.id === current.id) ?? nextData.active;
      });
      setContent((currentContent) => currentContent || nextData.active.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [handleResponse, headers]);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
    setToken(storedToken);
    setTokenInput(storedToken);
  }, []);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  const allHistory = data ? [data.active, ...data.drafts, ...data.history] : [];
  const hasUnsavedChanges = selected
    ? content.trim() !== selected.content.trim()
    : content.trim().length > 0;

  function choosePrompt(prompt: AgentPrompt) {
    setSelected(prompt);
    setContent(prompt.content);
    setChangeNote(prompt.change_note ?? '');
    setPreview('');
    setMessage(null);
    setError(null);
  }

  async function saveDraft(): Promise<AgentPrompt | null> {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ content, changeNote }),
      });
      const json = await handleResponse<{ prompt: AgentPrompt }>(res);
      setSelected(json.prompt);
      setContent(json.prompt.content);
      setChangeNote(json.prompt.change_note ?? '');
      setMessage(`已保存草稿 v${json.prompt.version}`);
      await loadPrompts();
      return json.prompt;
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publishCurrent() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      let promptToActivate = selected;
      if (!promptToActivate || promptToActivate.status !== 'draft' || hasUnsavedChanges) {
        const res = await fetch('/api/admin/prompts', {
          method: 'POST',
          headers,
          body: JSON.stringify({ content, changeNote }),
        });
        const json = await handleResponse<{ prompt: AgentPrompt }>(res);
        promptToActivate = json.prompt;
      }

      const res = await fetch(
        `/api/admin/prompts/${promptToActivate.id}/activate`,
        { method: 'POST', headers },
      );
      const json = await handleResponse<{ prompt: AgentPrompt }>(res);
      setSelected(json.prompt);
      setContent(json.prompt.content);
      setChangeNote(json.prompt.change_note ?? '');
      setMessage(`已发布 v${json.prompt.version}`);
      await loadPrompts();
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败');
    } finally {
      setSaving(false);
    }
  }

  async function rollbackSelected() {
    if (!selected || selected.status === 'active') return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/prompts/${selected.id}/rollback`, {
        method: 'POST',
        headers,
      });
      const json = await handleResponse<{ prompt: AgentPrompt }>(res);
      setSelected(json.prompt);
      setContent(json.prompt.content);
      setChangeNote(json.prompt.change_note ?? '');
      setMessage(`已恢复为新线上版本 v${json.prompt.version}`);
      await loadPrompts();
    } catch (err) {
      setError(err instanceof Error ? err.message : '回滚失败');
    } finally {
      setSaving(false);
    }
  }

  async function previewPrompt() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/prompts/preview', {
        method: 'POST',
        headers,
        body: JSON.stringify({ content }),
      });
      const json = await handleResponse<{ prompt: string }>(res);
      setPreview(json.prompt);
      setMessage('已生成最终 prompt 预览');
    } catch (err) {
      setError(err instanceof Error ? err.message : '预览失败');
    } finally {
      setSaving(false);
    }
  }

  function saveToken() {
    const trimmed = tokenInput.trim();
    window.localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
    setToken(trimmed);
    setMessage('管理 token 已保存');
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="border-b bg-background px-4 py-3 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Agent Prompt 管理</h1>
            <p className="text-sm text-muted-foreground">
              编辑产品可调策略，核心价格规则仍由开发锁定。
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
            <button
              onClick={loadPrompts}
              className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted"
              disabled={loading}
              title="刷新版本列表"
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

      <div className="grid min-h-[calc(100dvh-73px)] grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)_minmax(320px,420px)]">
        <aside className="border-b bg-muted/20 p-3 md:border-b-0 md:border-r">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <History className="size-4" />
            版本
          </div>

          {loading && <p className="text-sm text-muted-foreground">加载中...</p>}

          {!loading && data && (
            <div className="space-y-4">
              <VersionSection
                title="线上"
                prompts={[data.active]}
                selectedId={selected?.id}
                onSelect={choosePrompt}
              />
              <VersionSection
                title="草稿"
                prompts={data.drafts}
                selectedId={selected?.id}
                onSelect={choosePrompt}
              />
              <VersionSection
                title="历史"
                prompts={data.history}
                selectedId={selected?.id}
                onSelect={choosePrompt}
              />
            </div>
          )}
        </aside>

        <section className="flex min-w-0 flex-col border-b md:border-b-0 md:border-r">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <h2 className="truncate text-sm font-medium">
                  {selected ? promptTitle(selected) : '新 prompt'}
                </h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {selected
                  ? `创建 ${formatTime(selected.created_at)} · 更新 ${formatTime(selected.updated_at)}`
                  : '编辑内容后可保存为草稿'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={saveDraft}
                className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
                disabled={saving || !content.trim()}
                title="保存为新草稿"
                type="button"
              >
                <Save className="size-4" />
                保存草稿
              </button>
              <button
                onClick={publishCurrent}
                className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                disabled={saving || !content.trim()}
                title="发布到线上"
                type="button"
              >
                <Rocket className="size-4" />
                发布
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <label className="text-sm font-medium" htmlFor="prompt-content">
              产品可调 Prompt
            </label>
            <textarea
              id="prompt-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-[420px] flex-1 resize-none rounded-md border bg-background p-3 font-mono text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
              spellCheck={false}
            />
            <label className="text-sm font-medium" htmlFor="change-note">
              修改说明
            </label>
            <input
              id="change-note"
              value={changeNote}
              onChange={(event) => setChangeNote(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="例如：强化降价航线推荐口径"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{hasUnsavedChanges ? '有未保存修改' : '内容已与所选版本一致'}</span>
              <span>{content.length.toLocaleString()} 字符</span>
            </div>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-medium">最终 Prompt 预览</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                包含开发锁定规则和动态数据上下文
              </p>
            </div>
            <button
              onClick={previewPrompt}
              className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
              disabled={saving || !content.trim()}
              title="生成最终 prompt"
              type="button"
            >
              <Eye className="size-4" />
              预览
            </button>
          </div>
          <div className="min-h-0 flex-1 p-4">
            <textarea
              value={preview}
              readOnly
              placeholder="点击预览后显示最终传给模型的 system prompt"
              className="h-[360px] w-full resize-none rounded-md border bg-muted/20 p-3 font-mono text-xs leading-5 outline-none md:h-full"
              spellCheck={false}
            />
          </div>
          <div className="border-t p-4">
            <button
              onClick={rollbackSelected}
              className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
              disabled={saving || !selected || selected.status === 'active'}
              title="把所选版本恢复为新的线上版本"
              type="button"
            >
              <RefreshCcw className="size-4" />
              恢复所选版本为线上
            </button>
            <p className="mt-2 text-xs text-muted-foreground">
              回滚会生成一个新的线上版本，历史记录不会被覆盖。
            </p>
          </div>
        </aside>
      </div>

      {!loading && data && allHistory.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">暂无 prompt 版本。</p>
      )}
    </main>
  );
}

function VersionSection({
  title,
  prompts,
  selectedId,
  onSelect,
}: {
  title: string;
  prompts: AgentPrompt[];
  selectedId?: string;
  onSelect: (prompt: AgentPrompt) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h3>
      {prompts.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无</p>
      ) : (
        <div className="space-y-1">
          {prompts.map((prompt) => (
            <button
              key={prompt.id}
              onClick={() => onSelect(prompt)}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                selectedId === prompt.id
                  ? 'border-primary bg-primary/10'
                  : 'bg-background hover:bg-muted'
              }`}
              type="button"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{promptTitle(prompt)}</span>
                <span className="text-xs text-muted-foreground">
                  {formatTime(prompt.activated_at ?? prompt.updated_at)}
                </span>
              </div>
              {prompt.change_note && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {prompt.change_note}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
