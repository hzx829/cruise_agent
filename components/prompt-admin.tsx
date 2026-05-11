'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Braces,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  History,
  KeyRound,
  Layers3,
  ListChecks,
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

interface PromptSection {
  id: string;
  title: string;
  category: string;
  description: string;
  start: number;
  end: number;
  text: string;
}

type EditorMode = 'sections' | 'full';

const TOKEN_STORAGE_KEY = 'cruise_agent_admin_token';

const SECTION_GUIDES: Array<{
  pattern: RegExp;
  category: string;
  description: string;
}> = [
  {
    pattern: /^产品口径$/,
    category: '产品',
    description: '面向产品和运营维护：用户角色、回答口径、表达风格和放宽条件策略。',
  },
  {
    pattern: /^工具与上下文$/,
    category: '工具',
    description: '面向工程和高级配置：运行时上下文、工具选择和 searchDeals 参数路由。',
  },
  {
    pattern: /^结果处理$/,
    category: '判断',
    description: '定义查到、查不到、覆盖不足、来源标注和价格展示方式。',
  },
  {
    pattern: /^示例$/,
    category: '示例',
    description: '维护少量高价值 golden examples。',
  },
];

const PROMPT_PROFILE_MARKER = 'prompt_profile: cruise-agent-routing-v3-grouped';

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

function sectionGuide(title: string): {
  category: string;
  description: string;
} {
  return (
    SECTION_GUIDES.find((guide) => guide.pattern.test(title)) ?? {
      category: '自定义',
      description: '自定义段落，保持职责单一、表达具体。',
    }
  );
}

function parsePromptSections(content: string): PromptSection[] {
  const matches = Array.from(content.matchAll(/^##\s+(.+)$/gm));
  const sections: PromptSection[] = [];

  if (matches.length === 0) {
    return [
      {
        id: 'full',
        title: '完整模板',
        category: '全文',
        description: '当前内容没有二级标题，暂按全文编辑。',
        start: 0,
        end: content.length,
        text: content,
      },
    ];
  }

  const firstHeading = matches[0].index ?? 0;
  if (firstHeading > 0) {
    sections.push({
      id: 'preamble',
      title: '模板头部',
      category: '元信息',
      description: '包含角色开场、profile 标记和当前日期说明。',
      start: 0,
      end: firstHeading,
      text: content.slice(0, firstHeading),
    });
  }

  matches.forEach((match, index) => {
    const title = match[1].trim();
    const start = match.index ?? 0;
    const end =
      index + 1 < matches.length
        ? matches[index + 1].index ?? content.length
        : content.length;
    const guide = sectionGuide(title);
    sections.push({
      id: `${start}-${title}`,
      title,
      category: guide.category,
      description: guide.description,
      start,
      end,
      text: content.slice(start, end),
    });
  });

  return sections;
}

function replacePromptSection(
  content: string,
  section: PromptSection,
  nextText: string,
): string {
  return `${content.slice(0, section.start)}${nextText}${content.slice(section.end)}`;
}

function countOccurrences(content: string, term: string): number {
  return content.split(term).length - 1;
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
  const [editorMode, setEditorMode] = useState<EditorMode>('sections');
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [versionsCollapsed, setVersionsCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);

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
  const sections = useMemo(() => parsePromptSections(content), [content]);
  const selectedSection =
    sections.find((section) => section.id === selectedSectionId) ?? sections[0];
  const promptChecks = useMemo(
    () => [
      {
        label: 'Profile',
        ok: content.includes(PROMPT_PROFILE_MARKER),
        detail: PROMPT_PROFILE_MARKER,
      },
      {
        label: '当前日期',
        ok: content.includes('{{currentDate}}'),
        detail: '{{currentDate}}',
      },
      {
        label: '品牌覆盖',
        ok: content.includes('{{brandCoverageContext}}'),
        detail: '{{brandCoverageContext}}',
      },
      {
        label: '正向密度',
        ok:
          countOccurrences(content, '必须') +
            countOccurrences(content, '不能') +
            countOccurrences(content, '绝不能') <=
          2,
        detail: `必须 ${countOccurrences(content, '必须')} · 不能 ${countOccurrences(content, '不能')}`,
      },
    ],
    [content],
  );

  useEffect(() => {
    if (!selectedSectionId && sections[0]) {
      setSelectedSectionId(sections[0].id);
      return;
    }
    if (
      selectedSectionId &&
      sections.length > 0 &&
      !sections.some((section) => section.id === selectedSectionId)
    ) {
      setSelectedSectionId(sections[0].id);
    }
  }, [sections, selectedSectionId]);

  function choosePrompt(prompt: AgentPrompt) {
    setSelected(prompt);
    setContent(prompt.content);
    setChangeNote(prompt.change_note ?? '');
    setSelectedSectionId(null);
    setPreview('');
    setMessage(null);
    setError(null);
  }

  function updateSelectedSection(nextText: string) {
    if (!selectedSection) {
      setContent(nextText);
      return;
    }
    const previousId = selectedSection.id;
    const nextContent = replacePromptSection(content, selectedSection, nextText);
    setContent(nextContent);
    setSelectedSectionId(previousId);
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
              编辑完整 system prompt 模板，发布后下一次对话生效。
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

      <div
        className={`grid min-h-[calc(100dvh-73px)] grid-cols-1 ${
          versionsCollapsed && previewCollapsed
            ? 'md:grid-cols-[48px_minmax(0,1fr)_48px]'
            : versionsCollapsed
              ? 'md:grid-cols-[48px_minmax(0,1fr)_minmax(320px,420px)]'
              : previewCollapsed
                ? 'md:grid-cols-[260px_minmax(0,1fr)_48px]'
                : 'md:grid-cols-[260px_minmax(0,1fr)_minmax(320px,420px)]'
        }`}
      >
        <aside className="border-b bg-muted/20 md:border-b-0 md:border-r">
          {versionsCollapsed ? (
            <CollapsedRail
              icon={<History className="size-4" />}
              label="版本"
              title="展开版本管理"
              onClick={() => setVersionsCollapsed(false)}
            />
          ) : (
            <div className="p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <History className="size-4" />
                  版本
                </div>
                <button
                  onClick={() => setVersionsCollapsed(true)}
                  className="inline-flex size-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
                  title="收起版本管理"
                  type="button"
                >
                  <ChevronLeft className="size-4" />
                </button>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="text-sm font-medium" htmlFor="prompt-content">
                  System Prompt 模板
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  按章节维护职责、路由、参数和示例；需要整体调整时切到完整模板。
                </p>
              </div>
              <div className="inline-grid grid-cols-2 rounded-md border bg-muted/30 p-1 text-sm">
                <button
                  onClick={() => setEditorMode('sections')}
                  className={`inline-flex h-8 items-center justify-center gap-1 rounded-sm px-3 ${
                    editorMode === 'sections'
                      ? 'bg-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  type="button"
                >
                  <Layers3 className="size-4" />
                  分段
                </button>
                <button
                  onClick={() => setEditorMode('full')}
                  className={`inline-flex h-8 items-center justify-center gap-1 rounded-sm px-3 ${
                    editorMode === 'full'
                      ? 'bg-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  type="button"
                >
                  <FileText className="size-4" />
                  全文
                </button>
              </div>
            </div>

            {editorMode === 'sections' ? (
              <div className="grid min-h-[420px] flex-1 grid-cols-1 overflow-hidden rounded-md border md:grid-cols-[210px_minmax(0,1fr)]">
                <div className="border-b bg-muted/20 p-2 md:border-b-0 md:border-r">
                  <div className="mb-2 flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                    <ListChecks className="size-3.5" />
                    结构分段
                  </div>
                  <div className="space-y-1">
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => setSelectedSectionId(section.id)}
                        className={`w-full rounded-md px-2 py-2 text-left transition-colors ${
                          selectedSection?.id === section.id
                            ? 'bg-primary/10 text-foreground'
                            : 'hover:bg-muted'
                        }`}
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {section.title}
                          </span>
                          <span className="shrink-0 rounded-sm bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {section.category}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {section.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex min-w-0 flex-col">
                  <div className="border-b px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">
                          {selectedSection?.title ?? '分段'}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedSection?.description}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(selectedSection?.text.length ?? 0).toLocaleString()} 字符
                      </div>
                    </div>
                  </div>
                  <textarea
                    id="prompt-content"
                    value={selectedSection?.text ?? ''}
                    onChange={(event) => updateSelectedSection(event.target.value)}
                    className="min-h-[330px] flex-1 resize-none border-0 bg-background p-3 font-mono text-sm leading-6 outline-none focus:ring-0"
                    spellCheck={false}
                  />
                </div>
              </div>
            ) : (
              <textarea
                id="prompt-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className="min-h-[420px] flex-1 resize-none rounded-md border bg-background p-3 font-mono text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
                spellCheck={false}
              />
            )}

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
          {previewCollapsed ? (
            <CollapsedRail
              icon={<Eye className="size-4" />}
              label="预览"
              title="展开 Prompt 预览"
              onClick={() => setPreviewCollapsed(false)}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div>
                  <h2 className="text-sm font-medium">最终 Prompt 预览</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    会替换当前日期和品牌覆盖数据占位符
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPreviewCollapsed(true)}
                    className="inline-flex size-9 items-center justify-center rounded-md border hover:bg-muted"
                    title="收起 Prompt 预览"
                    type="button"
                  >
                    <ChevronRight className="size-4" />
                  </button>
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
              </div>
              <div className="border-b px-4 py-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Braces className="size-4 text-primary" />
                    结构检查
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {sections.length} 段 · {content.length.toLocaleString()} 字符
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {promptChecks.map((check) => (
                    <div
                      key={check.label}
                      className="flex items-start gap-2 rounded-md border bg-background px-3 py-2"
                    >
                      {check.ok ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{check.label}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {check.detail}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
            </>
          )}
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

function CollapsedRail({
  icon,
  label,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-full min-h-16 w-full items-center justify-center gap-2 border-b px-2 py-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground md:min-h-0 md:flex-col md:border-b-0"
      title={title}
      type="button"
    >
      {icon}
      <span className="md:[writing-mode:vertical-rl]">{label}</span>
    </button>
  );
}
