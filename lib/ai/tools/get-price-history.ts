import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';
import { dealIdSchema } from './schemas';

export const getPriceHistory = tool({
  description:
    '获取某个 deal 的价格变动历史和追踪统计信息，用于追踪价格趋势。包含历史最高/最低价、变动次数、趋势等。',
  inputSchema: z.object({
    dealId: dealIdSchema,
  }),
  execute: async ({ dealId }) => {
    const deal = queries.getDealById(dealId, 'zh-CN');
    const history = queries.getPriceHistory(dealId);

    return {
      deal: deal
        ? {
            id: deal.id,
            brand:
              deal.brand_short_name_display ||
              deal.brand_name_display ||
              deal.brand_name_cn ||
              deal.brand_name ||
              deal.brand_id,
            brandRaw: deal.brand_name || deal.brand_id,
            dealName: deal.deal_name,
            shipName: deal.ship_name_display || deal.ship_name,
            destination: deal.destination_display || deal.destination,
            destinationRaw: deal.destination,
            destinationId: deal.destination_id || deal.primary_destination_term_id,
            currentPrice: deal.price,
            currency: deal.price_currency,
            priceLowest: deal.price_lowest,
            priceHighest: deal.price_highest,
            priceChangeCount: deal.price_change_count,
            priceTrend: deal.price_trend,
            dealScore: deal.deal_score,
            firstSeenAt: deal.first_seen_at,
            trackingSince: deal.tracking_since,
          }
        : null,
      history: history.map((h) => ({
        price: h.price,
        currency: h.price_currency,
        recordedAt: h.recorded_at,
      })),
      hasHistory: history.length > 0,
      summary: history.length > 0
        ? {
            snapshots: history.length,
            priceMin: Math.min(...history.map((h) => h.price)),
            priceMax: Math.max(...history.map((h) => h.price)),
            priceAvg: Math.round(
              history.reduce((sum, h) => sum + h.price, 0) / history.length
            ),
            priceFirst: history[0].price,
            priceLast: history[history.length - 1].price,
            changePct:
              history.length >= 2
                ? Math.round(
                    ((history[history.length - 1].price - history[0].price) /
                      history[0].price) *
                      1000
                  ) / 10
                : 0,
          }
        : null,
    };
  },
});
