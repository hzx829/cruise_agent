import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';
import { dealIdsSchema } from './schemas';

export const compareCruises = tool({
  description:
    '对比多个邮轮航线，生成并排对比数据，方便用户直观比较价格、行程、设施等信息。',
  inputSchema: z.object({
    dealIds: dealIdsSchema,
  }),
  execute: async ({ dealIds }) => {
    const deals = dealIds
      .map((id) => queries.getDealById(id))
      .filter(Boolean);

    if (deals.length < 2) {
      return { error: '未找到足够的航线进行对比，请确认使用的是上一工具返回的字符串 dealId。' };
    }

    return {
      deals: deals.map((deal) => ({
        id: deal!.id,
        brand: deal!.brand_name_cn || deal!.brand_name,
        dealName: deal!.deal_name,
        shipName: deal!.ship_name,
        destination: deal!.destination,
        departurePort: deal!.departure_port,
        duration: `${deal!.duration_nights}晚${deal!.duration_days}天`,
        sailDate: deal!.sail_date,
        price: deal!.price,
        currency: deal!.price_currency,
        pricePerNight: deal!.price_per_night,
        originalPrice: deal!.price_original,
        discount: deal!.discount_pct
          ? `${deal!.discount_pct}%`
          : null,
        cabinType: deal!.cabin_type,
        dealScore: deal!.deal_score,
        perks: deal!.perks ? JSON.parse(deal!.perks) : [],
        url: deal!.deal_url,
      })),
    };
  },
});
