'use client';

import { Ship, ArrowRightLeft } from 'lucide-react';

interface CompareData {
  deals: Array<{
    id: string;
    brand: string;
    brandRaw?: string;
    dealName: string;
    shipName?: string;
    shipNameRaw?: string;
    destination?: string;
    destinationRaw?: string;
    destinationId?: string | null;
    departurePort?: string;
    departurePortRaw?: string;
    departurePortId?: string | null;
    duration?: string;
    sailDate?: string;
    price: number;
    currency?: string;
    pricePerNight?: number;
    originalPrice?: number;
    discount?: string | null;
    cabinType?: string;
    perks?: string[];
    perksRaw?: string[];
    url?: string;
  }>;
}

export function CompareTable({ data }: { data: CompareData }) {
  if (!data?.deals || data.deals.length < 2) return null;

  const rows: { label: string; key: string }[] = [
    { label: '品牌', key: 'brand' },
    { label: '邮轮', key: 'shipName' },
    { label: '目的地', key: 'destination' },
    { label: '出发港', key: 'departurePort' },
    { label: '行程', key: 'duration' },
    { label: '出发日期', key: 'sailDate' },
    { label: '舱位', key: 'cabinType' },
    { label: '价格', key: 'price' },
    { label: '每晚均价', key: 'pricePerNight' },
    { label: '折扣', key: 'discount' },
  ];

  const formatValue = (deal: CompareData['deals'][0], key: string) => {
    const sym = deal.currency === 'CNY' ? '¥' : '$';
    switch (key) {
      case 'price':
        return `${sym}${deal.price.toLocaleString()}`;
      case 'pricePerNight':
        return deal.pricePerNight ? `${sym}${deal.pricePerNight.toFixed(0)}/晚` : '-';
      default:
        return (deal as Record<string, unknown>)[key]?.toString() || '-';
    }
  };

  // 标记最低价
  const minPrice = Math.min(...data.deals.map((d) => d.price));

  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <div className="flex items-center gap-2 p-3 border-b">
        <ArrowRightLeft className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-card-foreground">航线对比</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left p-2 text-muted-foreground font-medium w-24">
              项目
            </th>
            {data.deals.map((deal) => (
              <th
                key={deal.id}
                className="text-left p-2 text-card-foreground font-medium"
              >
                <div className="flex items-center gap-1">
                  <Ship className="w-3.5 h-3.5 text-primary" />
                  <span className="truncate max-w-[120px]">
                    {deal.dealName}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t">
              <td className="p-2 text-muted-foreground font-medium">{row.label}</td>
              {data.deals.map((deal) => (
                <td
                  key={deal.id}
                  className={
                    row.key === 'price' && deal.price === minPrice
                      ? 'p-2 text-green-600 dark:text-green-400 font-bold'
                      : 'p-2 text-card-foreground'
                  }
                >
                  {formatValue(deal, row.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
