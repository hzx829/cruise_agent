'use client';

import type { UIMessage } from 'ai';
import ReactMarkdown from 'react-markdown';
import { DealList } from './deal-card';
import { PriceChart } from './price-chart';
import { CompareTable } from './compare-table';
import { CopywritingCard } from './copywriting-card';
import { Bot, User, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Message({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-blue-600" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[85%] space-y-3',
          isUser ? 'order-first' : ''
        )}
      >
        {message.parts.map((part, idx) => {
          switch (part.type) {
            case 'text':
              if (!part.text) return null;
              return (
                <div
                  key={idx}
                  className={cn(
                    'rounded-xl px-4 py-2.5 text-sm leading-relaxed',
                    isUser
                      ? 'bg-blue-600 text-white ml-auto'
                      : 'bg-gray-100 text-gray-800'
                  )}
                >
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      ul: ({ children }) => (
                        <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold">{children}</strong>
                      ),
                      code: ({ children }) => (
                        <code className="bg-black/10 rounded px-1 py-0.5 text-xs">
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {part.text}
                  </ReactMarkdown>
                </div>
              );

            // 所有工具 part 统一处理
            case 'tool-searchDeals':
            case 'tool-getBrandOverview':
            case 'tool-analyzePrices':
            case 'tool-getPriceHistory':
            case 'tool-generateChart':
            case 'tool-compareCruises':
            case 'tool-generateCopywriting': {
              const toolName = part.type.replace('tool-', '');

              if (part.state === 'input-streaming' || part.state === 'input-available') {
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs text-gray-400 px-2"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{getToolLabel(toolName)}...</span>
                  </div>
                );
              }

              if (part.state === 'output-available') {
                return (
                  <div key={idx}>
                    <ToolResult toolName={toolName} result={part.output} />
                  </div>
                );
              }

              if (part.state === 'output-error') {
                return (
                  <div key={idx} className="text-xs text-red-500 px-2">
                    ⚠️ {getToolLabel(toolName)} 出错: {part.errorText}
                  </div>
                );
              }

              return null;
            }

            case 'step-start':
              return null;

            default:
              return null;
          }
        })}
      </div>

      {isUser && (
        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-gray-600" />
        </div>
      )}
    </div>
  );
}

function getToolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    searchDeals: '🔍 搜索航线',
    getBrandOverview: '📊 获取品牌概览',
    analyzePrices: '📈 分析价格',
    getPriceHistory: '📉 查询价格历史',
    generateChart: '📊 生成图表',
    compareCruises: '⚖️ 对比航线',
    generateCopywriting: '✍️ 生成文案素材',
  };
  return labels[toolName] || toolName;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function ToolResult({
  toolName,
  result,
}: {
  toolName: string;
  result: any;
}) {
  if (result?.error) {
    return (
      <div className="text-xs text-red-500 px-2">⚠️ {result.error}</div>
    );
  }

  switch (toolName) {
    case 'searchDeals':
      return result?.deals ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 px-1">
            找到 {result.count} 条航线
          </p>
          <DealList deals={result.deals} />
        </div>
      ) : null;

    case 'generateChart':
      return <PriceChart chart={result} />;

    case 'compareCruises':
      return <CompareTable data={result} />;

    case 'generateCopywriting':
      return <CopywritingCard data={result} />;

    // getBrandOverview, analyzePrices, getPriceHistory 等工具
    // 数据由 LLM 读取后以文本形式呈现，无需特殊渲染
    default:
      return null;
  }
}
