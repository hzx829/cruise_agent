'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, generateId, type UIMessage } from 'ai';
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from 'react';
import {
  ArrowUp,
  Square,
  Ship,
  ArrowDown,
} from 'lucide-react';
import { useSWRConfig } from 'swr';
import { unstable_serialize } from 'swr/infinite';
import { Message } from './message';
import { ChatHeader } from './chat-header';
import { getChatHistoryPaginationKey } from './sidebar-history';

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

export function Chat({ id, initialMessages }: ChatProps) {
  const [chatId] = useState(() => id ?? generateId());
  const hasReplacedUrl = useRef(false);
  const { mutate } = useSWRConfig();

  const { messages, sendMessage, status, stop } = useChat({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest({ messages }) {
        return {
          body: {
            message: messages[messages.length - 1],
            id: chatId,
          },
        };
      },
    }),
    onFinish: () => {
      // 消息完成后刷新侧边栏历史列表
      mutate(unstable_serialize(getChatHistoryPaginationKey));
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

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
      {/* Header — Sidebar toggle + 新建对话 */}
      <ChatHeader />

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
                {messages.map((message, idx) => (
                  <Message
                    key={message.id}
                    message={message}
                    isLoading={isLoading && idx === messages.length - 1}
                  />
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
