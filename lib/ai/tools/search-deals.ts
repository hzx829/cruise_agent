import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const searchDeals = tool({
  description:
    '搜索邮轮特价航线。支持按品牌、目的地、价格范围、出发日期、航行天数、舱位类型、价格趋势、品牌层级等筛选。返回匹配的航线列表。',
  inputSchema: z.object({
    brand: z
      .string()
      .optional()
      .describe('品牌 ID: carnival, ncl, royal_caribbean_cn'),
    destination: z
      .string()
      .optional()
      .describe('目的地名称，如 Caribbean, Alaska, Hawaii'),
    priceMin: z.number().optional().describe('最低价格'),
    priceMax: z.number().optional().describe('最高价格'),
    sailDateFrom: z
      .string()
      .optional()
      .describe('最早出发日期 YYYY-MM-DD'),
    sailDateTo: z
      .string()
      .optional()
      .describe('最晚出发日期 YYYY-MM-DD'),
    durationMin: z.number().optional().describe('最短天数'),
    durationMax: z.number().optional().describe('最长天数'),
    cabinType: z
      .string()
      .optional()
      .describe('舱位类型: interior, oceanview, balcony, suite'),
    priceTrend: z
      .enum(['up', 'down', 'stable', 'new'])
      .optional()
      .describe('价格趋势筛选: up(涨价) / down(降价) / stable(稳定) / new(新上架)'),
    tier: z
      .union([
        z.enum(['budget', 'standard', 'premium', 'luxury']),
        z.array(z.enum(['budget', 'standard', 'premium', 'luxury'])),
      ])
      .optional()
      .describe('品牌层级，可传单个或数组: budget(大众) / standard(标准) / premium(高端) / luxury(奢华)'),
    minScore: z.number().optional().describe('最低 deal_score 筛选'),
    sortBy: z
      .enum(['price', 'sail_date', 'duration_days', 'deal_score', 'price_change_count'])
      .optional()
      .describe('排序字段，默认按价格'),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    limit: z.number().optional().describe('返回数量，默认 20，最多 50'),
  }),
  execute: async (params) => {
    const deals = queries.searchDeals({
      ...params,
      limit: Math.min(params.limit || 20, 50),
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
        itinerary: d.itinerary,
        durationDays: d.duration_days,
        price: d.price,
        priceOriginal: d.price_original,
        priceHighest: d.price_highest,
        priceLowest: d.price_lowest,
        discountPct: d.discount_pct,
        currency: d.price_currency,
        cabinType: d.cabin_type,
        sailDate: d.sail_date,
        perks: d.perks ? JSON.parse(d.perks) : [],
        dealUrl: d.deal_url,
        dealScore: d.deal_score,
        priceTrend: d.price_trend,
        priceChangeCount: d.price_change_count,
      })),
    };
  },
});
