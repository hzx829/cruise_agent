'use client';

import {
  ExternalLink,
  Tag,
  Calendar,
  Ship,
  MapPin,
  Route,
  TrendingDown,
  TrendingUp,
  Minus,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DealData {
  id: string;
  brand: string;
  brandRaw?: string;
  brandId?: string;
  dealName: string;
  shipName?: string;
  shipNameRaw?: string;
  departurePort?: string;
  departurePortRaw?: string;
  departurePortId?: string | null;
  arrivalPort?: string;
  routeStartPort?: string;
  routeEndPort?: string;
  routeLabel?: string | null;
  routeType?: 'roundtrip' | 'open_jaw' | null;
  destination?: string;
  destinationRaw?: string;
  destinationId?: string | null;
  itinerary?: string;
  durationDays?: number;
  price: number;
  priceOriginal?: number;
  discountPct?: number;
  currency?: string;
  cabinType?: string;
  sailDate?: string;
  perks?: string[];
  perksRaw?: string[];
  dealUrl?: string;
  // Price tracking fields
  priceTrend?: string;
  brandTier?: string;
  dropPct?: number;
  priceHighest?: number;
  priceLowest?: number;
  priceChangeCount?: number;
}

const TREND_CONFIG: Record<
  string,
  { icon: typeof TrendingDown; label: string; className: string }
> = {
  down: {
    icon: TrendingDown,
    label: '降价中',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  up: {
    icon: TrendingUp,
    label: '涨价中',
    className:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  stable: {
    icon: Minus,
    label: '价格稳定',
    className:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  new: {
    icon: Sparkles,
    label: '新上架',
    className:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
};

const TIER_LABELS: Record<string, { label: string; className: string }> = {
  luxury: {
    label: '奢华',
    className:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  premium: {
    label: '高端',
    className:
      'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  },
  standard: {
    label: '标准',
    className:
      'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  },
  budget: {
    label: '大众',
    className:
      'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
  },
};

export function DealCard({ deal }: { deal: DealData }) {
  const currencySymbol =
    deal.currency === 'CNY' ? '¥' : deal.currency === 'EUR' ? '€' : '$';
  const trend = deal.priceTrend ? TREND_CONFIG[deal.priceTrend] : null;
  const tier = deal.brandTier ? TIER_LABELS[deal.brandTier] : null;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Header: name + price */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-card-foreground">
            {deal.dealName}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{deal.brand}</span>
            {tier && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                  tier.className
                )}
              >
                {tier.label}
              </span>
            )}
            {trend && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                  trend.className
                )}
              >
                <trend.icon className="size-2.5" />
                {trend.label}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold text-primary">
            {currencySymbol}
            {deal.price.toLocaleString()}
          </div>
          {deal.priceOriginal && deal.priceOriginal > deal.price && (
            <div className="text-xs text-muted-foreground line-through">
              {currencySymbol}
              {deal.priceOriginal.toLocaleString()}
            </div>
          )}
          {deal.dropPct != null && deal.dropPct > 0 ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">
              <TrendingDown className="size-3" />-{deal.dropPct}%
            </span>
          ) : (
            deal.discountPct != null &&
            deal.discountPct > 0 && (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                -{deal.discountPct}%
              </span>
            )
          )}
        </div>
      </div>

      {/* Historical price range */}
      {deal.priceHighest != null && deal.priceLowest != null && (
        <div className="mt-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
          历史价格 {currencySymbol}
          {deal.priceLowest.toLocaleString()} ~ {currencySymbol}
          {deal.priceHighest.toLocaleString()}
        </div>
      )}

      {/* Info grid */}
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
        {deal.shipName && (
          <div className="flex items-center gap-1">
            <Ship className="size-3 shrink-0" />
            <span className="truncate">{deal.shipName}</span>
          </div>
        )}
        {deal.destination && (
          <div className="flex items-center gap-1">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{deal.destination}</span>
          </div>
        )}
        {deal.sailDate && (
          <div className="flex items-center gap-1">
            <Calendar className="size-3 shrink-0" />
            <span>{deal.sailDate}</span>
          </div>
        )}
        {deal.durationDays && (
          <div className="flex items-center gap-1">
            <span>⏱️</span>
            <span>{deal.durationDays}天</span>
          </div>
        )}
      </div>

      {deal.routeLabel && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted/35 px-2.5 py-1.5 text-xs text-muted-foreground">
          <Route className="mt-0.5 size-3 shrink-0" />
          <div className="min-w-0">
            <span className="truncate">{deal.routeLabel}</span>
            {deal.routeType && (
              <span className="ml-1 text-[11px]">
                {deal.routeType === 'roundtrip' ? '往返' : '开口'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Perks */}
      {deal.perks && deal.perks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {deal.perks.slice(0, 3).map((perk, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-400"
            >
              <Tag className="size-2.5" />
              {perk}
            </span>
          ))}
          {deal.perks.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{deal.perks.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Link */}
      {deal.dealUrl && (
        <a
          href={deal.dealUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          查看详情 <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}

export function DealList({ deals }: { deals: DealData[] }) {
  if (!deals || deals.length === 0) return null;
  return (
    <div
      className={cn(
        'grid gap-3',
        deals.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
      )}
    >
      {deals.map((deal) => (
        <DealCard key={deal.id} deal={deal} />
      ))}
    </div>
  );
}
