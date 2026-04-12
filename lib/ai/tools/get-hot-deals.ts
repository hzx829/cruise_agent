import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';
import { tierSchema, normalizeTier } from './schemas';

function parseStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export const getHotDeals = tool({
  description:
    '获取 deal_score 最高的航线（折扣深度排序）。deal_score 衡量的是相对于基准价的折扣深度，越高表示折扣越深。可按品牌层级筛选。注意：这不是按绝对价格排序，而是按折扣深度排序。',
  inputSchema: z.object({
    tier: tierSchema,
    limit: z.number().optional().describe('返回数量，默认 20'),
  }),
  execute: async (params) => {
    const tierArr = normalizeTier(params.tier);
    const deals = queries.getHotDealsByTier({
      tier: tierArr,
      limit: params.limit,
      locale: 'zh-CN',
    });

    return {
      count: deals.length,
      deals: deals.map((d) => ({
        id: d.id,
        brand: d.brand_short_name_display || d.brand_name_display || d.brand_name_cn || d.brand_name || d.brand_id,
        brandRaw: d.brand_name || d.brand_id,
        brandId: d.brand_id,
        brandTier: d.brand_tier,
        dealName: d.deal_name,
        shipName: d.ship_name_display || d.ship_name,
        shipNameRaw: d.ship_name,
        destination: d.destination_display || d.destination,
        destinationRaw: d.destination,
        destinationId: d.destination_id || d.primary_destination_term_id,
        durationDays: d.duration_days,
        price: d.price,
        priceOriginal: d.price_original,
        priceHighest: d.price_highest,
        priceLowest: d.price_lowest,
        discountPct: d.discount_pct,
        currency: d.price_currency,
        cabinType: d.cabin_type,
        sailDate: d.sail_date,
        dealScore: d.deal_score,
        priceTrend: d.price_trend,
        priceChangeCount: d.price_change_count,
        dealUrl: d.deal_url,
        perks: parseStringList(d.perks_display || d.perks),
        perksRaw: parseStringList(d.perks_raw || d.perks),
      })),
    };
  },
});
