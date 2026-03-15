import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const generateCopywriting = tool({
  description:
    '根据指定航线生成小红书种草文案。工具会获取航线详情，AI 会根据数据生成吸引人的中文推广文案。',
  inputSchema: z.object({
    dealId: z.number().describe('要生成文案的航线 deal ID'),
    style: z
      .enum(['种草', '攻略', '测评'])
      .default('种草')
      .describe('文案风格'),
    highlights: z
      .array(z.string())
      .optional()
      .describe('需要强调的卖点，如 "亲子"、"蜜月"、"性价比"'),
  }),
  execute: async ({ dealId, style, highlights }) => {
    const deal = queries.getDealById(String(dealId));
    if (!deal) {
      return { error: '未找到该航线，请检查 ID 是否正确。' };
    }

    const perks = deal.perks ? JSON.parse(deal.perks) : [];

    // 获取该品牌同目的地均价，用于对比
    const stats = queries.getPriceStats({
      brand: deal.brand_name ?? undefined,
      destination: deal.destination ?? undefined,
    });
    const overallStats = stats.overall[0] as
      | { avg_price: number; min_price: number }
      | undefined;

    return {
      deal: {
        brand: deal.brand_name_cn || deal.brand_name,
        dealName: deal.deal_name,
        shipName: deal.ship_name,
        destination: deal.destination,
        departurePort: deal.departure_port,
        duration: `${deal.duration_nights}晚${deal.duration_days}天`,
        sailDate: deal.sail_date,
        price: deal.price,
        currency: deal.price_currency,
        pricePerNight: deal.price_per_night,
        originalPrice: deal.price_original,
        discount: deal.discount_pct,
        cabinType: deal.cabin_type,
        dealScore: deal.deal_score,
        perks,
        url: deal.deal_url,
      },
      context: {
        avgPrice: overallStats?.avg_price ?? null,
        minPrice: overallStats?.min_price ?? null,
        savingsVsAvg: overallStats?.avg_price
          ? Math.round(overallStats.avg_price - deal.price)
          : null,
      },
      style,
      highlights: highlights || [],
      instruction:
        '请根据以上航线数据，生成一篇小红书风格的中文推广文案。' +
        '包含：1) 吸引眼球的标题（带 emoji）；' +
        '2) 正文（突出价格优势、行程亮点、适合人群）；' +
        '3) 5~8 个相关标签。' +
        `文案风格：${style}。` +
        (highlights && highlights.length > 0
          ? `重点强调：${highlights.join('、')}。`
          : ''),
    };
  },
});
