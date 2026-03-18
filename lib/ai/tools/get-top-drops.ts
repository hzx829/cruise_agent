import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';
import { tierSchema, normalizeTier } from './schemas';

export const getTopPriceDrops = tool({
  description:
    '获取降价幅度最大的航线，按降价百分比排序。适合寻找近期大幅降价的航线。注意：这个工具只返回有降价记录的航线，不等于"最便宜的航线"。',
  inputSchema: z.object({
    tier: tierSchema,
    brand: z.string().optional().describe('品牌 ID 筛选'),
    limit: z.number().optional().describe('返回数量，默认 15'),
  }),
  execute: async (params) => {
    const tierArr = normalizeTier(params.tier);
    const drops = queries.getTopPriceDrops({
      brand: params.brand,
      tier: tierArr,
      limit: params.limit,
    });

    if (drops.length === 0) {
      // 没有降价数据时，回退到 deal_score 排序
      const fallback = queries.getHotDealsByTier({
        tier: tierArr,
        limit: params.limit || 15,
      });

      return {
        count: fallback.length,
        dataSource: 'deal_score',
        message: '暂无价格变动数据（需多轮爬取积累），已按 deal_score（折扣深度）排序推荐替代。',
        deals: fallback.map((d) => ({
          id: d.id,
          brand: d.brand_name_cn || d.brand_name || d.brand_id,
          brandId: d.brand_id,
          brandTier: d.brand_tier,
          dealName: d.deal_name,
          shipName: d.ship_name,
          destination: d.destination,
          price: d.price,
          currency: d.price_currency,
          priceOriginal: d.price_original,
          discountPct: d.discount_pct,
          dealScore: d.deal_score,
          cabinType: d.cabin_type,
          durationDays: d.duration_days,
          sailDate: d.sail_date,
          priceTrend: d.price_trend,
          dealUrl: d.deal_url,
          perks: d.perks ? JSON.parse(d.perks) : [],
        })),
      };
    }

    return {
      count: drops.length,
      deals: drops.map((d) => ({
        id: d.id,
        brand: d.brand_name_cn || d.brand_name || d.brand_id,
        brandId: d.brand_id,
        brandTier: d.brand_tier,
        dealName: d.deal_name,
        shipName: d.ship_name,
        destination: d.destination,
        price: d.price,
        currency: d.price_currency,
        priceHighest: d.price_highest,
        priceLowest: d.price_lowest,
        dropPct: d.drop_pct,
        dealScore: d.deal_score,
        cabinType: d.cabin_type,
        durationDays: d.duration_days,
        sailDate: d.sail_date,
        priceTrend: d.price_trend,
        dealUrl: d.deal_url,
        perks: d.perks ? JSON.parse(d.perks) : [],
      })),
    };
  },
});
