'use client';

import { ExternalLink, Star, Tag, Calendar, Ship, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DealData {
  id: number;
  brand: string;
  brandId?: string;
  dealName: string;
  shipName?: string;
  destination?: string;
  itinerary?: string;
  durationDays?: number;
  price: number;
  priceOriginal?: number;
  discountPct?: number;
  currency?: string;
  cabinType?: string;
  sailDate?: string;
  perks?: string[];
  dealUrl?: string;
  dealScore?: number;
}

export function DealCard({ deal }: { deal: DealData }) {
  const currencySymbol = deal.currency === 'CNY' ? '¥' : '$';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate text-sm">
            {deal.dealName}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{deal.brand}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-blue-600">
            {currencySymbol}
            {deal.price.toLocaleString()}
          </div>
          {deal.priceOriginal && deal.priceOriginal > deal.price && (
            <div className="text-xs text-gray-400 line-through">
              {currencySymbol}
              {deal.priceOriginal.toLocaleString()}
            </div>
          )}
          {deal.discountPct && (
            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">
              -{deal.discountPct}%
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
        {deal.shipName && (
          <div className="flex items-center gap-1">
            <Ship className="w-3 h-3" />
            <span className="truncate">{deal.shipName}</span>
          </div>
        )}
        {deal.destination && (
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{deal.destination}</span>
          </div>
        )}
        {deal.sailDate && (
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
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

      {deal.dealScore != null && deal.dealScore > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
          <span className="text-gray-600">性价比 {deal.dealScore.toFixed(1)}</span>
        </div>
      )}

      {deal.perks && deal.perks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {deal.perks.slice(0, 3).map((perk, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded"
            >
              <Tag className="w-2.5 h-2.5" />
              {perk}
            </span>
          ))}
          {deal.perks.length > 3 && (
            <span className="text-xs text-gray-400">
              +{deal.perks.length - 3}
            </span>
          )}
        </div>
      )}

      {deal.dealUrl && (
        <a
          href={deal.dealUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
        >
          查看详情 <ExternalLink className="w-3 h-3" />
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
        deals.length === 1
          ? 'grid-cols-1'
          : 'grid-cols-1 md:grid-cols-2'
      )}
    >
      {deals.map((deal) => (
        <DealCard key={deal.id} deal={deal} />
      ))}
    </div>
  );
}
