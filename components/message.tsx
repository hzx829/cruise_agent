'use client';

import type { UIMessage } from 'ai';
import ReactMarkdown from 'react-markdown';
import { DealList } from './deal-card';
import { PriceChart } from './price-chart';
import { CompareTable } from './compare-table';
import { CopywritingCard } from './copywriting-card';
import { Ship, Loader2, TrendingDown, Flame, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Message({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'group/message animate-fade-in flex w-full items-start gap-2 px-4 py-3 md:gap-3',
        isUser ? 'justify-end' : 'justify-start'
      )}
      data-role={message.role}
    >
      {!isUser && (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
          <Ship className="size-4 text-primary" />
        </div>
      )}

      <div
        className={cn(
          'flex flex-col',
          isUser
            ? 'max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]'
            : 'w-full gap-2 md:gap-3'
        )}
      >
        {message.parts.map((part, idx) => {
          const key = `msg-${message.id}-part-${idx}`;

          switch (part.type) {
            case 'text':
              if (!part.text) return null;
              return (
                <div
                  key={key}
                  className={cn(
                    'rounded-2xl text-sm leading-relaxed',
                    isUser
                      ? 'bg-primary px-3 py-2 text-primary-foreground'
                      : 'bg-transparent px-0 py-0 text-foreground'
                  )}
                >
                  {isUser ? (
                    part.text
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => (
                            <p className="mb-2 last:mb-0">{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul className="mb-2 list-disc space-y-0.5 pl-4">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="mb-2 list-decimal space-y-0.5 pl-4">
                              {children}
                            </ol>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold">{children}</strong>
                          ),
                          code: ({ children }) => (
                            <code className="rounded bg-muted px-1 py-0.5 text-xs">
                              {children}
                            </code>
                          ),
                          table: ({ children }) => (
                            <div className="my-2 overflow-x-auto rounded-lg border">
                              <table className="w-full text-xs">
                                {children}
                              </table>
                            </div>
                          ),
                          th: ({ children }) => (
                            <th className="border-b bg-muted/50 px-3 py-1.5 text-left font-medium">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="border-b px-3 py-1.5">
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

            // Tool parts
            case 'tool-searchDeals':
            case 'tool-getBrandOverview':
            case 'tool-analyzePrices':
            case 'tool-getPriceHistory':
            case 'tool-generateChart':
            case 'tool-compareCruises':
            case 'tool-generateCopywriting':
            case 'tool-getTopPriceDrops':
            case 'tool-getHotDeals':
            case 'tool-getTrackingOverview': {
              const toolName = part.type.replace('tool-', '');

              if (
                part.state === 'input-streaming' ||
                part.state === 'input-available'
              ) {
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
                  >
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>{getToolLabel(toolName)}</span>
                  </div>
                );
              }

              if (part.state === 'output-available') {
                return (
                  <div key={key}>
                    <ToolResult toolName={toolName} result={part.output} />
                  </div>
                );
              }

              if (part.state === 'output-error') {
                return (
                  <div
                    key={key}
                    className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
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
      </div>
    </div>
  );
}

function getToolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    searchDeals: '🔍 搜索航线中...',
    getBrandOverview: '📊 获取品牌概览...',
    analyzePrices: '📈 分析价格...',
    getPriceHistory: '📉 查询价格历史...',
    generateChart: '📊 生成图表...',
    compareCruises: '⚖️ 对比航线...',
    generateCopywriting: '✍️ 生成文案素材...',
    getTopPriceDrops: '🔥 搜索降价排行...',
    getHotDeals: '💎 搜索热门特价...',
    getTrackingOverview: '📡 获取追踪概览...',
  };
  return labels[toolName] || `${toolName}...`;
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
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            找到 {result.count} 条航线
          </p>
          <DealList deals={result.deals} />
        </div>
      ) : null;

    case 'getTopPriceDrops':
      return result?.drops ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <TrendingDown className="size-3.5" />
            <span>降价排行 · 共 {result.drops.length} 条</span>
          </div>
          <DealList
            deals={result.drops.map((d: any) => ({
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
              dealScore: d.dealScore,
              dealUrl: d.dealUrl,
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

    case 'getHotDeals':
      return result?.deals ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400">
            <Flame className="size-3.5" />
            <span>
              热门特价{result.tier ? ` · ${getTierLabel(result.tier)}` : ''} · 共{' '}
              {result.deals.length} 条
            </span>
          </div>
          <DealList
            deals={result.deals.map((d: any) => ({
              id: d.id,
              brand: d.brand,
              dealName: d.dealName,
              shipName: d.shipName,
              destination: d.destination,
              durationDays: d.durationDays,
              price: d.price,
              priceOriginal: d.priceOriginal,
              discountPct: d.discountPct,
              currency: d.currency,
              cabinType: d.cabinType,
              sailDate: d.sailDate,
              dealScore: d.dealScore,
              dealUrl: d.dealUrl,
              perks: d.perks,
              priceTrend: d.priceTrend,
              brandTier: d.brandTier,
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

function getTierLabel(tier: string): string {
  const labels: Record<string, string> = {
    budget: '大众',
    standard: '标准',
    premium: '高端',
    luxury: '奢华',
  };
  return labels[tier] || tier;
}

function TrackingOverviewCard({ data }: { data: any }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="size-4 text-primary" />
        <span className="text-sm font-semibold text-card-foreground">
          价格追踪概览
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
      className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', colorMap[color])}
    >
      {label} {count}
    </span>
  );
}
