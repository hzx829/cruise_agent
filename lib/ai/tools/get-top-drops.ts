import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const getTopPriceDrops = tool({
  description:
    '获取降价幅度最大的航线。这是发现最具话题性 deal 的关键工具 — 尤其是高端/奢华品牌的大幅降价最适合小红书推广。返回按降价百分比排序的 deal 列表。',
  inputSchema: z.object({
    tier: z
      .union([
        z.enum(['budget', 'standard', 'premium', 'luxury']),
        z.array(z.enum(['budget', 'standard', 'premium', 'luxury'])),
      ])
      .optional()
      .describe(
        '品牌层级筛选，可传单个或数组: budget(大众) / standard(标准) / premium(高端) / luxury(奢华)。不填则返回所有层级'
      ),
    brand: z.string().optional().describe('品牌 ID 筛选'),
    limit: z.number().optional().describe('返回数量，默认 15'),
  }),
  execute: async (params) => {
    const tierArr = params.tier
      ? Array.isArray(params.tier) ? params.tier : [params.tier]
      : undefined;
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
