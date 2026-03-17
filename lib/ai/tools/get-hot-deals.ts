import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const getHotDeals = tool({
  description:
    '获取 deal_score 最高的航线（折扣深度排序）。deal_score 衡量的是相对于基准价的折扣深度，越高表示折扣越深。可按品牌层级筛选。注意：这不是按绝对价格排序，而是按折扣深度排序。',
  inputSchema: z.object({
    tier: z
      .union([
        z.enum(['budget', 'standard', 'premium', 'luxury']),
        z.array(z.enum(['budget', 'standard', 'premium', 'luxury'])),
      ])
      .optional()
      .describe(
        '品牌层级，可传单个或数组: budget(大众) / standard(标准) / premium(高端) / luxury(奢华)'
      ),
    limit: z.number().optional().describe('返回数量，默认 20'),
  }),
  execute: async (params) => {
    const tierArr = params.tier
      ? Array.isArray(params.tier) ? params.tier : [params.tier]
      : undefined;
    const deals = queries.getHotDealsByTier({
      tier: tierArr,
      limit: params.limit,
    });

    return {
      count: deals.length,
      deals: deals.map((d) => ({
        id: d.id,
        brand: d.brand_name_cn || d.brand_name || d.brand_id,
        brandId: d.brand_id,
        brandTier: d.brand_tier,
        dealName: d.deal_name,
        shipName: d.ship_name,
        destination: d.destination,
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
        perks: d.perks ? JSON.parse(d.perks) : [],
      })),
    };
  },
});
