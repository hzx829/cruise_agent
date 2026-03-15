import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const getPriceHistory = tool({
  description:
    '获取某个 deal 的价格变动历史，用于追踪价格趋势。',
  inputSchema: z.object({
    dealId: z.string().describe('Deal ID'),
  }),
  execute: async ({ dealId }) => {
    const deal = queries.getDealById(dealId);
    const history = queries.getPriceHistory(dealId);
    return {
      deal: deal
        ? {
            id: deal.id,
            brand: deal.brand_name_cn || deal.brand_name || deal.brand_id,
            dealName: deal.deal_name,
            currentPrice: deal.price,
            currency: deal.price_currency,
          }
        : null,
      history: history.map((h) => ({
        price: h.price,
        currency: h.price_currency,
        recordedAt: h.recorded_at,
      })),
      hasHistory: history.length > 0,
    };
  },
});
