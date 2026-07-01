'use client';

import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { DefaultChatTransport, generateId, type UIMessage } from 'ai';
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import {
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  Square,
  Ship,
  ArrowDown,
  Zap,
  AlertCircle,
  X,
} from 'lucide-react';
import { useSWRConfig } from 'swr';
import { unstable_serialize } from 'swr/infinite';
import { Message } from './message';
import { ChatHeader } from './chat-header';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { fetchWithAuthRedirect } from '@/lib/auth/client';

type ChatMode = 'fast' | 'thinking';

const CHAT_MODE_STORAGE_KEY = 'cruise-agent-response-mode';
const CHAT_MODE_STORAGE_EVENT = 'cruise-agent-response-mode-change';
const CHAT_MODES: Array<{
  value: ChatMode;
  label: string;
  description: string;
}> = [
  {
    value: 'fast',
    label: '快速',
    description: '适用于大部分邮轮问答',
  },
  {
    value: 'thinking',
    label: '思考',
    description: '复杂比较、规划和多条件问题',
  },
];

let chatModeFallback: ChatMode = 'fast';

function normalizeChatMode(value: string | null): ChatMode {
  if (value === 'thinking' || value === 'true') return 'thinking';
  return 'fast';
}

function getChatModeSnapshot(): ChatMode {
  if (typeof window === 'undefined') return 'fast';

  try {
    chatModeFallback = normalizeChatMode(
      window.localStorage.getItem(CHAT_MODE_STORAGE_KEY) ??
        window.localStorage.getItem('cruise-agent-thinking-enabled'),
    );
  } catch {
    // Ignore storage failures and keep the in-memory fallback.
  }

  return chatModeFallback;
}

function getChatModeServerSnapshot(): ChatMode {
  return 'fast';
}

function subscribeToChatMode(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === CHAT_MODE_STORAGE_KEY ||
      event.key === 'cruise-agent-thinking-enabled'
    ) {
      onStoreChange();
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(CHAT_MODE_STORAGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(CHAT_MODE_STORAGE_EVENT, onStoreChange);
  };
}

function setStoredChatMode(value: ChatMode): void {
  chatModeFallback = value;

  try {
    window.localStorage.setItem(CHAT_MODE_STORAGE_KEY, value);
  } catch {
    // Ignore storage failures; the in-memory setting still applies.
  }

  window.dispatchEvent(new Event(CHAT_MODE_STORAGE_EVENT));
}

function getChatModeConfig(mode: ChatMode) {
  return CHAT_MODES.find((item) => item.value === mode) ?? CHAT_MODES[0];
}

function ChatModeIcon({
  mode,
  className,
}: {
  mode: ChatMode;
  className?: string;
}) {
  if (mode === 'thinking') return <Brain className={className} />;
  return <Zap className={className} />;
}

const QUICK_ACTIONS = [
  {
    label: '⚓ 价格巡航',
    text: '帮我找降价幅度最大的邮轮航线，特别关注高端和奢华品牌',
  },
  {
    label: '📊 品牌测评',
    text: '帮我对比一下皇家加勒比和诺唯真邮轮的优缺点，包括设施、餐饮、适合人群',
  },
  {
    label: '📖 行业百科',
    text: '邮轮行业有哪些新手需要了解的常用术语？比如阳台房、套房礼遇、离港税、服务费这些',
  },
  {
    label: '✍️ 爆款文案',
    text: '找一个降价幅度最大的航线，帮我生成小红书推广文案',
  },
];

interface ChatProps {
  id?: string;
  initialMessages?: UIMessage[];
}

type MessagePart = UIMessage['parts'][number];

interface BrowserLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  timezone: string | null;
}

const BROWSER_LOCATION_STORAGE_KEY = 'cruise-agent-browser-location';
const BROWSER_LOCATION_REQUESTED_KEY = 'cruise-agent-browser-location-requested';

function getStoredBrowserLocation(): BrowserLocation | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.sessionStorage.getItem(BROWSER_LOCATION_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as BrowserLocation) : null;
  } catch {
    return null;
  }
}

function getPartState(part: MessagePart | undefined): string | undefined {
  if (!part || !('state' in part)) return undefined;
  return typeof part.state === 'string' ? part.state : undefined;
}

function isCompletedToolPart(part: MessagePart | undefined): boolean {
  if (!part?.type.startsWith('tool-')) return false;

  const state = getPartState(part);
  return (
    state === 'output-available' ||
    state === 'output-error' ||
    state === 'output-denied'
  );
}

export function Chat({ id, initialMessages }: ChatProps) {
  const [chatId] = useState(() => id ?? generateId());
  const chatMode = useSyncExternalStore(
    subscribeToChatMode,
    getChatModeSnapshot,
    getChatModeServerSnapshot,
  );
  const thinkingEnabled = chatMode === 'thinking';
  const hasReplacedUrl = useRef(false);
  const { mutate } = useSWRConfig();
  const [billingNotice, setBillingNotice] = useState<string | null>(null);

  const billingAwareFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetchWithAuthRedirect(input, init);
      if (response.status === 402) {
        const json = await response
          .clone()
          .json()
          .catch(() => ({ error: '额度不足' }));
        const message =
          typeof json.error === 'string' ? json.error : '额度不足';
        setBillingNotice(
          message.includes('额度') ? `${message}，请购买额度后继续使用。` : message,
        );
        void mutate('/api/billing/me');
      }
      return response;
    },
    [mutate],
  );

  const { messages, sendMessage, status, stop } = useChat({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      fetch: billingAwareFetch,
      prepareSendMessagesRequest({ messages, body }) {
        return {
          body: {
            ...(body ?? {}),
            message: messages[messages.length - 1],
            id: chatId,
          },
        };
      },
    }),
    onFinish: () => {
      setBillingNotice(null);
      // 消息完成后刷新侧边栏历史列表
      mutate(unstable_serialize(getChatHistoryPaginationKey));
      mutate('/api/billing/me');
    },
  });

  // 首次发消息后更新 URL（streaming 时 DB 中已存在记录）
  useEffect(() => {
    if (!id && !hasReplacedUrl.current && messages.length > 0 && status === 'streaming') {
      window.history.replaceState({}, '', `/chat/${chatId}`);
      hasReplacedUrl.current = true;
    }
  }, [id, messages.length, status, chatId]);

  const [input, setInput] = useState('');
  const [browserLocation, setBrowserLocation] = useState<BrowserLocation | null>(
    () => getStoredBrowserLocation(),
  );
  const locationRequestStarted = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const isLoading = status === 'streaming' || status === 'submitted';
  const activeAssistantMessage = useMemo(() => {
    if (!isLoading) return null;

    for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
      if (messages[idx].role === 'assistant') {
        return messages[idx];
      }
    }

    return null;
  }, [isLoading, messages]);
  const activeAssistantMessageId = activeAssistantMessage?.id ?? null;
  const showPendingFollowUp =
    isLoading &&
    isCompletedToolPart(
      activeAssistantMessage?.parts[activeAssistantMessage.parts.length - 1],
    );

  // Auto-scroll when new messages arrive (only if at bottom)
  useEffect(() => {
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAtBottom]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 40);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const selectChatMode = useCallback((value: ChatMode) => {
    setStoredChatMode(value);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '44px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 164)}px`;
  }, [input]);

  const requestBrowserLocation = useCallback(() => {
    if (locationRequestStarted.current || typeof navigator === 'undefined') return;
    if (!navigator.geolocation) return;

    locationRequestStarted.current = true;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const timezone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || null;
        const baseLocation: BrowserLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy)
            ? Math.round(position.coords.accuracy)
            : null,
          city: null,
          region: null,
          country: null,
          countryCode: null,
          timezone,
        };

        let nextLocation = baseLocation;
        try {
          const response = await fetchWithAuthRedirect('/api/location/reverse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: baseLocation.latitude,
              longitude: baseLocation.longitude,
            }),
          });
          if (response.ok) {
            const data = await response.json();
            nextLocation = {
              ...baseLocation,
              ...(data.location ?? {}),
              timezone,
            };
          }
        } catch {
          // Coordinates and timezone are still useful when reverse geocoding fails.
        }

        setBrowserLocation(nextLocation);
        try {
          window.sessionStorage.setItem(
            BROWSER_LOCATION_STORAGE_KEY,
            JSON.stringify(nextLocation),
          );
        } catch {
          // Ignore storage failures.
        }
      },
      () => {},
      {
        enableHighAccuracy: false,
        maximumAge: 10 * 60 * 1000,
        timeout: 8_000,
      },
    );
  }, []);

  useEffect(() => {
    if (browserLocation) return;

    try {
      if (window.sessionStorage.getItem(BROWSER_LOCATION_REQUESTED_KEY)) return;
      window.sessionStorage.setItem(BROWSER_LOCATION_REQUESTED_KEY, '1');
    } catch {
      // If storage is unavailable, still make one best-effort request.
    }

    requestBrowserLocation();
  }, [browserLocation, requestBrowserLocation]);

  const handleSubmit = (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;
    setBillingNotice(null);
    sendMessage(
      { text: msg },
      { body: { responseMode: chatMode, thinkingEnabled, browserLocation } },
    );
    setInput('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-dvh min-w-0 overflow-hidden flex-col bg-background">
      {/* Header — Sidebar toggle + 新建对话 */}
      <ChatHeader />

      {/* Messages area */}
      <div className="relative min-h-0 flex-1 bg-background">
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto touch-pan-y"
        >
          <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-1 px-1.5 py-3 sm:px-3 sm:py-4 md:px-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-3 py-10 sm:px-4 sm:py-16">
                <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Ship className="size-8 text-primary" />
                </div>
                <h2 className="mb-2 text-center text-xl font-semibold text-foreground">
                  你好！我是游速达邮轮顾问 🚢
                </h2>
                <p className="mb-8 max-w-md text-center text-sm text-muted-foreground">
                  我能追踪官网实时价格、搜索品牌评测、解答行业知识，还能帮你生成小红书爆款文案。
                </p>
                <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => handleSubmit(action.text)}
                      className="rounded-xl border bg-card px-3 py-2.5 text-left text-sm text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <Message
                    key={message.id}
                    message={message}
                    isLoading={message.id === activeAssistantMessageId}
                  />
                ))}

                {showPendingFollowUp && <AssistantPendingIndicator />}

                {isLoading && !activeAssistantMessageId && (
                  <AssistantPendingIndicator />
                )}
              </>
            )}
            <div ref={messagesEndRef} className="min-h-[24px] shrink-0" />
          </div>
        </div>

        {/* Scroll to bottom button */}
        <button
          aria-label="Scroll to bottom"
          className={`absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background p-2 shadow-lg transition-all hover:bg-muted ${
            isAtBottom
              ? 'pointer-events-none scale-0 opacity-0'
              : 'pointer-events-auto scale-100 opacity-100'
          }`}
          onClick={scrollToBottom}
          type="button"
        >
          <ArrowDown className="size-4" />
        </button>
      </div>

      {billingNotice && (
        <BillingNoticeToast
          message={billingNotice}
          onClose={() => setBillingNotice(null)}
        />
      )}

      {/* Input area */}
      <div className="sticky bottom-0 z-10 mx-auto flex w-full max-w-3xl gap-2 border-t-0 bg-background px-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-3 md:px-4 md:pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="w-full overflow-hidden rounded-xl border bg-background shadow-xs">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="问我任何关于邮轮的问题... 按 Enter 发送"
            className="w-full resize-none border-none bg-transparent p-3 text-sm shadow-none outline-none ring-0 placeholder:text-muted-foreground focus-visible:ring-0"
            style={{ minHeight: '44px', maxHeight: '164px', fieldSizing: 'content' as never }}
            disabled={isLoading}
            rows={1}
          />
          <div className="flex items-center justify-between p-1">
            <ChatModeSelector
              disabled={isLoading}
              mode={chatMode}
              onChange={selectChatMode}
            />
            {isLoading ? (
              <button
                onClick={() => stop()}
                className="flex size-8 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
                aria-label="Stop generating"
              >
                <Square className="size-3.5" />
              </button>
            ) : (
              <button
                onClick={() => handleSubmit()}
                disabled={!input.trim()}
                className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatModeSelector({
  disabled,
  mode,
  onChange,
}: {
  disabled: boolean;
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
}) {
  const current = getChatModeConfig(mode);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="选择回答模式"
          className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChatModeIcon mode={mode} className="size-3.5 shrink-0" />
          <span className="font-medium leading-none">{current.label}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          side="top"
          sideOffset={8}
          className="z-50 w-[min(16rem,calc(100vw-1rem))] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {CHAT_MODES.map((item) => (
            <DropdownMenu.Item
              key={item.value}
              onSelect={() => onChange(item.value)}
              className="flex cursor-default select-none items-start gap-3 rounded-md px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-foreground">
                <ChatModeIcon mode={item.value} className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-5">
                  {item.label}
                </span>
                <span className="block text-xs leading-5 text-muted-foreground">
                  {item.description}
                </span>
              </span>
              {mode === item.value && (
                <Check className="mt-1 size-4 shrink-0 text-foreground" />
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function BillingNoticeToast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div
      role="alert"
      className="fixed bottom-24 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 rounded-lg border border-amber-200 bg-background p-3 text-sm shadow-lg dark:border-amber-900/60"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">额度不足</p>
          <p className="mt-1 text-muted-foreground">{message}</p>
          <Link
            href="/billing"
            className="mt-3 inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            购买额度
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭提示"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

function AssistantPendingIndicator() {
  return (
    <div className="flex items-start gap-2 px-2 py-3 sm:px-3 md:gap-3 md:px-4">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border sm:size-8">
        <Ship className="size-4 text-primary" />
      </div>
      <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
        <span>正在整理答案</span>
        <div className="flex gap-1" aria-hidden="true">
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
