'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useRef, useEffect } from 'react';
import { Send, Ship } from 'lucide-react';
import { Message } from './message';

const QUICK_ACTIONS = [
  { label: '🔍 最低价航线', text: '帮我搜索目前最便宜的邮轮航线' },
  { label: '📊 品牌概览', text: '给我看一下各邮轮品牌的整体情况' },
  { label: '🏝️ 加勒比海', text: '搜索去加勒比海的邮轮' },
  { label: '💰 价格分析', text: '分析一下目前邮轮的价格分布情况，生成图表' },
  { label: '⭐ 高性价比', text: '推荐几个性价比最高的航线' },
  { label: '🇨🇳 皇家加勒比', text: '搜索皇家加勒比中国市场的航线' },
];

export function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;
    sendMessage({ text: msg });
    setInput('');
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <Ship className="w-6 h-6 text-blue-600" />
          <h1 className="text-lg font-bold text-gray-800">
            邮轮特价助手
          </h1>
          <span className="text-xs text-gray-400 ml-1">
            Cruise Deal Agent
          </span>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-4">
          {messages.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Ship className="w-12 h-12 text-blue-200 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                你好！我是邮轮特价助手 🚢
              </h2>
              <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto">
                我可以帮你搜索全球邮轮低价航线、分析价格趋势、对比不同航线，
                还能生成小红书推广文案。试试下面的快捷操作吧！
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => handleSubmit(action.text)}
                    className="px-3 py-2 text-sm bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 rounded-lg border border-gray-200 hover:border-blue-200 transition-colors"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <Message key={message.id} message={message} />
            ))
          )}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="flex gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="问我任何关于邮轮的问题..."
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
