'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';

const emptySubscribe = () => () => {};
function useHasMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
import {
  ArrowUp,
  Square,
  Ship,
  Sun,
  Moon,
  ArrowDown,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Message } from './message';

const QUICK_ACTIONS = [
  { label: '🔥 最大降价', text: '帮我找降价幅度最大的邮轮航线，特别是高端和奢华品牌的' },
  { label: '💎 奢华特价', text: '搜索奢华和高端品牌(luxury/premium)中 deal_score 最高的航线' },
  { label: '📉 降价趋势', text: '查看当前价格追踪系统的整体概览，哪些航线在持续降价？' },
  { label: '🏝️ 加勒比海', text: '搜索去加勒比海的邮轮，按性价比排序' },
  { label: '✍️ 爆款文案', text: '找一个降价最多的航线，帮我生成小红书推广文案' },
  { label: '🇨🇳 皇家加勒比', text: '搜索皇家加勒比中国市场的航线，有哪些好价？' },
];

export function Chat() {
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHasMounted();

  const isLoading = status === 'streaming' || status === 'submitted';

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

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '44px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 164)}px`;
  }, [input]);

  const handleSubmit = (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;
    sendMessage({ text: msg });
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
    <div className="flex h-dvh min-w-0 flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b bg-background px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
              <Ship className="size-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">
                邮轮特价助手
              </h1>
              <p className="text-xs text-muted-foreground">
                价格追踪 · 降价发现 · 文案生成
              </p>
            </div>
          </div>
          {mounted && (
            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Toggle theme"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </button>
          )}
        </div>
      </header>

      {/* Messages area */}
      <div className="relative flex-1 bg-background">
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto touch-pan-y"
        >
          <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-1 px-2 py-4 md:px-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-16">
                <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Ship className="size-8 text-primary" />
                </div>
                <h2 className="mb-2 text-xl font-semibold text-foreground">
                  你好！我是邮轮特价助手 🚢
                </h2>
                <p className="mb-8 max-w-md text-center text-sm text-muted-foreground">
                  我能追踪全球邮轮价格变动，发现降价最多的航线，帮你生成有传播力的小红书内容。
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
                  <Message key={message.id} message={message} />
                ))}

                {status === 'submitted' && (
                  <div className="flex items-start gap-2 px-4 py-3 md:gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
                      <Ship className="size-4 text-primary" />
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <div className="flex gap-1">
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
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

      {/* Input area */}
      <div className="sticky bottom-0 z-10 mx-auto flex w-full max-w-3xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
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
          <div className="flex items-center justify-end p-1">
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
