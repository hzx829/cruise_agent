'use client';

import type { UIMessage } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DealList } from './deal-card';
import { PriceChart } from './price-chart';
import { CompareTable } from './compare-table';
import { CopywritingCard } from './copywriting-card';
import {
  AlertCircle,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Ship,
  TrendingDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ABORTED_ASSISTANT_FALLBACK_TEXT,
  EMPTY_ASSISTANT_FALLBACK_TEXT,
  hasRenderableContent,
} from '@/lib/ai/message-content';

type MessagePart = UIMessage['parts'][number];

function getPartState(part: MessagePart): string | undefined {
  if (!('state' in part)) return undefined;
  return typeof part.state === 'string' ? part.state : undefined;
}

function shouldShowLoadingDots(message: UIMessage, isLoading?: boolean): boolean {
  if (message.role === 'user' || !isLoading) return false;

  const lastPart = message.parts[message.parts.length - 1];
  if (!lastPart) return true;

  if (lastPart.type === 'text') {
    return lastPart.text.trim().length === 0;
  }

  if (lastPart.type === 'step-start' || lastPart.type === 'reasoning') {
    return true;
  }

  const state = getPartState(lastPart);

  if (!state) {
    return true;
  }

  return false;
}

export function Message({
  message,
  isLoading,
}: {
  message: UIMessage;
  isLoading?: boolean;
}) {
  const isUser = message.role === 'user';
  const hasVisibleContent = isUser || hasRenderableContent(message);
  const reasoningText = isUser
    ? ''
    : message.parts
        .filter((part) => part.type === 'reasoning')
        .map((part) => part.text)
        .join('\n\n')
        .trim();
  const lastPart = message.parts[message.parts.length - 1];
  const isReasoningStreaming =
    !isUser && isLoading && lastPart?.type === 'reasoning';

  const showLoadingDots =
    shouldShowLoadingDots(message, isLoading) && !isReasoningStreaming;
  const showEmptyFallback = !isUser && !isLoading && !hasVisibleContent;

  return (
    <div
      className={cn(
        'group/message animate-fade-in flex w-full min-w-0 items-start gap-2 px-2 py-3 sm:px-3 md:gap-3 md:px-4',
        isUser ? 'justify-end' : 'justify-start'
      )}
      data-role={message.role}
    >
      {!isUser && (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border sm:size-8">
          <Ship className="size-4 text-primary" />
        </div>
      )}

      <div
        className={cn(
          'flex min-w-0 flex-col',
          isUser
            ? 'max-w-[88%] sm:max-w-[min(fit-content,80%)]'
            : 'flex-1 gap-2 md:gap-3'
        )}
      >
        {reasoningText && (
          <ReasoningBlock
            isStreaming={Boolean(isReasoningStreaming)}
            text={reasoningText}
          />
        )}

        {message.parts.map((part, idx) => {
          const key = `msg-${message.id}-part-${idx}`;

          switch (part.type) {
            case 'text':
              if (!part.text) return null;
              return (
                <div
                  key={key}
                  className={cn(
                    'max-w-full break-words rounded-2xl text-sm leading-relaxed',
                    isUser
                      ? 'whitespace-pre-wrap bg-primary px-3 py-2 text-primary-foreground'
                      : 'bg-transparent px-0 py-0 text-foreground'
                  )}
                >
                  {isUser ? (
                    part.text
                  ) : (
                    <div className="prose prose-sm max-w-none break-words dark:prose-invert prose-headings:my-2 prose-li:my-0.5 prose-ol:my-1 prose-p:my-1 prose-pre:my-2 prose-ul:my-1">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => (
                            <p className="mb-2 break-words last:mb-0">{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul className="mb-2 list-disc space-y-1 pl-5">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="mb-2 list-decimal space-y-1 pl-5">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => (
                            <li className="break-words pl-0.5">{children}</li>
                          ),
                          a: ({ children, href }) => (
                            <a
                              className="break-all text-primary hover:underline"
                              href={href}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              {children}
                            </a>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold">{children}</strong>
                          ),
                          code: ({ children }) => (
                            <code className="break-words rounded bg-muted px-1 py-0.5 text-xs">
                              {children}
                            </code>
                          ),
                          pre: ({ children }) => (
                            <pre className="my-2 max-w-full overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
                              {children}
                            </pre>
                          ),
                          table: ({ children }) => (
                            <div className="my-2 max-w-full overflow-x-auto rounded-lg border">
                              <table className="min-w-max w-full text-xs">
                                {children}
                              </table>
                            </div>
                          ),
                          th: ({ children }) => (
                            <th className="whitespace-nowrap border-b bg-muted/50 px-2 py-1.5 text-left font-medium sm:px-3">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="whitespace-nowrap border-b px-2 py-1.5 sm:px-3">
                              {children}
                            </td>
                          ),
                        }}
                      >
                        {part.text}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              );

            case 'reasoning':
              return null;

            // Tool parts
            case 'tool-searchDeals':
            case 'tool-getDealDetails':
            case 'tool-getBrandOverview':
            case 'tool-analyzePrices':
            case 'tool-getPriceHistory':
            case 'tool-getRegionalPrices':
            case 'tool-getStats':
            case 'tool-generateChart':
            case 'tool-compareCruises':
            case 'tool-generateCopywriting':
            case 'tool-getTopPriceDrops':
            case 'tool-getTrackingOverview':
            case 'tool-listDestinations':
            case 'tool-listCabinTypes':
            case 'tool-webSearch':
            case 'tool-cruiseEncyclopedia': {
              const toolName = part.type.replace('tool-', '');

              if (
                part.state === 'input-streaming' ||
                part.state === 'input-available'
              ) {
                if (!isLoading) {
                  return (
                  <div
                    key={key}
                    className="flex max-w-full items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        {getToolLabel(toolName)}
                        {ABORTED_ASSISTANT_FALLBACK_TEXT}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={key}
                    className="flex max-w-full items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
                  >
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>{getToolLabel(toolName)}</span>
                  </div>
                );
              }

              if (part.state === 'output-available') {
                const toolResult = <ToolResult toolName={toolName} result={part.output} />;
                return (
                  <div key={key} className="max-w-full space-y-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="size-3 text-emerald-500" />
                      <span>{getToolCompletedLabel(toolName)}</span>
                    </div>
                    {toolResult}
                  </div>
                );
              }

              if (part.state === 'output-error') {
                return (
                  <div
                    key={key}
                    className="max-w-full break-words rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                  >
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

        {showEmptyFallback && (
          <div className="flex max-w-full items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{EMPTY_ASSISTANT_FALLBACK_TEXT}</span>
          </div>
        )}

        {showLoadingDots && (
          <div className="flex items-center gap-1 py-1">
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  );
}

function ReasoningBlock({
  isStreaming,
  text,
}: {
  isStreaming: boolean;
  text: string;
}) {
  return (
    <details
      open={isStreaming}
      className="group max-w-full overflow-hidden rounded-lg border bg-muted/30 text-xs text-muted-foreground"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 outline-none transition-colors hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <Brain
          className={cn(
            'size-3.5 shrink-0 text-foreground',
            isStreaming && 'animate-pulse',
          )}
        />
        <span className="flex-1 font-medium text-foreground">
          {isStreaming ? '正在思考' : '已完成思考'}
        </span>
        <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t px-3 pb-3 pt-2 leading-relaxed">
        <pre className="max-w-full whitespace-pre-wrap break-words font-sans">{text}</pre>
      </div>
    </details>
  );
}

function getToolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    searchDeals: '🔍 搜索航线中...',
    getDealDetails: '📋 获取航线详情...',
    getBrandOverview: '📊 获取品牌概览...',
    analyzePrices: '📈 分析价格...',
    getPriceHistory: '📉 查询价格历史...',
    generateChart: '📊 生成图表...',
    compareCruises: '⚖️ 对比航线...',
    generateCopywriting: '✍️ 生成文案素材...',
    getTopPriceDrops: '🔥 搜索降价排行...',
    getTrackingOverview: '📡 获取追踪概览...',
    listDestinations: '🗺️ 获取目的地列表...',
    listCabinTypes: '🚢 获取舱型列表...',
    getRegionalPrices: '🌍 获取多区域价格...',
    getStats: '📊 获取统计数据...',
    webSearch: '🌐 搜索网络信息...',
    cruiseEncyclopedia: '📚 查询邮轮资料...',
  };
  return labels[toolName] || `${toolName}...`;
}

function getToolCompletedLabel(toolName: string): string {
  const labels: Record<string, string> = {
    searchDeals: '已搜索航线',
    getDealDetails: '已获取航线详情',
    getBrandOverview: '已获取品牌概览',
    analyzePrices: '已分析价格',
    getPriceHistory: '已查询价格历史',
    generateChart: '已生成图表',
    compareCruises: '已对比航线',
    generateCopywriting: '已生成文案素材',
    getTopPriceDrops: '已获取降价排行',
    getTrackingOverview: '已获取追踪概览',
    listDestinations: '已获取目的地列表',
    listCabinTypes: '已获取舱型列表',
    getRegionalPrices: '已获取多区域价格',
    getStats: '已获取统计数据',
    webSearch: '已搜索网络信息',
    cruiseEncyclopedia: '已查询邮轮资料',
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
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        ⚠️ {result.error}
      </div>
    );
  }

  switch (toolName) {
    case 'searchDeals':
      return result?.deals ? (
        <div className="min-w-0 space-y-2">
          <p className="text-xs text-muted-foreground">
            {result.count > 0
              ? `找到 ${result.count} 个匹配航次`
              : '未找到符合条件的航次'}
          </p>
          {result.count > 0 && (
            <p className="text-xs text-muted-foreground">
              {result.requestedCabinType
                ? `已按航次去重，显示指定房型 ${result.requestedCabinType} 的价格`
                : '已按航次去重，仅显示每个航次的最低起价'}
            </p>
          )}
          {result.count > 0 && <DealList deals={result.deals} />}
        </div>
      ) : null;

    case 'getTopPriceDrops':
      return (result?.deals || result?.drops) ? (
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <TrendingDown className="size-3.5" />
            <span>降价排行 · 共 {(result.deals || result.drops).length} 条</span>
          </div>
          <DealList
            deals={(result.deals || result.drops).map((d: any) => ({
              id: d.id,
              brand: d.brand,
              dealName: d.dealName,
              shipName: d.shipName,
              destination: d.destination,
              durationDays: d.durationDays,
              price: d.price,
              priceOriginal: d.priceHighest,
              currency: d.currency,
              cabinType: d.cabinType,
              sailDate: d.sailDate,
              dealUrl: d.dealUrl,
              routeStops: d.routeStops,
              routeSource: d.routeSource,
              routeSourceUrl: d.routeSourceUrl,
              routeConfidence: d.routeConfidence,
              routeCompleteness: d.routeCompleteness,
              perks: d.perks,
              priceTrend: d.priceTrend,
              brandTier: d.brandTier,
              dropPct: d.dropPct,
              priceHighest: d.priceHighest,
              priceLowest: d.priceLowest,
            }))}
          />
        </div>
      ) : null;

    case 'getTrackingOverview':
      return result ? <TrackingOverviewCard data={result} /> : null;

    case 'generateChart':
      return <PriceChart chart={result} />;

    case 'compareCruises':
      return <CompareTable data={result} />;

    case 'generateCopywriting':
      return <CopywritingCard data={result} />;

    // getBrandOverview, analyzePrices, getPriceHistory
    // Data consumed by LLM and rendered as text
    default:
      return null;
  }
}

function TrackingOverviewCard({ data }: { data: any }) {
  return (
    <div className="max-w-full overflow-hidden rounded-xl border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="size-4 text-primary" />
        <span className="text-sm font-semibold text-card-foreground">
          价格追踪概览
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <StatItem label="追踪航线" value={data.trackedDeals} />
        <StatItem label="价格快照" value={data.totalSnapshots} />
        <StatItem label="有变动" value={data.changedDeals} />
        <StatItem
          label="降价中"
          value={data.trends?.down ?? 0}
          highlight
        />
      </div>
      {data.trends && (
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          <TrendBadge label="📉 降价" count={data.trends.down} color="red" />
          <TrendBadge label="📈 涨价" count={data.trends.up} color="amber" />
          <TrendBadge label="➡️ 稳定" count={data.trends.stable} color="blue" />
          <TrendBadge label="🆕 新增" count={data.trends.new} color="green" />
        </div>
      )}
    </div>
  );
}

function StatItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-2.5 text-center">
      <div
        className={cn(
          'text-lg font-bold',
          highlight ? 'text-destructive' : 'text-card-foreground'
        )}
      >
        {value?.toLocaleString() ?? '—'}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function TrendBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: 'red' | 'amber' | 'blue' | 'green';
}) {
  const colorMap = {
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    amber:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    green:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };
  return (
    <span
      className={cn('inline-flex max-w-full rounded-full px-2.5 py-0.5 text-xs font-medium', colorMap[color])}
    >
      {label} {count}
    </span>
  );
}
