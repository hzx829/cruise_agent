import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';
import { dealIdSchema } from './schemas';

// 粗略即时汇率 (→ USD), 与 cruise_crawler API 保持一致
const FX_TO_USD: Record<string, number> = {
  USD: 1.0,
  GBP: 1.27,
  EUR: 1.08,
  AUD: 0.65,
  CAD: 0.74,
  CNY: 0.14,
  SGD: 0.74,
};

export const getRegionalPrices = tool({
  description:
    '获取某个 deal 在不同区域（US/GB/AU/EU/CA/SG）的价格。可用于跨区域比价，发现哪个区域购买最便宜。返回各区域价格、USD 等价、相对 US 的节省百分比。',
  inputSchema: z.object({
    dealId: dealIdSchema,
  }),
  execute: async ({ dealId }) => {
    const rows = queries.getRegionalPrices(dealId);

    if (rows.length === 0) {
      return { dealId, regionalPrices: [], message: '该航线暂无多区域价格数据。' };
    }

    let usUsd: number | null = null;
    const prices = rows.map((r) => {
      const rate = FX_TO_USD[r.currency] || 1.0;
      const priceUsd = Math.round(r.price * rate * 100) / 100;
      if (r.region === 'US') usUsd = priceUsd;
      return {
        region: r.region,
        currency: r.currency,
        price: r.price,
        priceUsd,
        savingsPct: null as number | null,
      };
    });

    // 计算相对 US 的节省百分比
    if (usUsd && usUsd > 0) {
      for (const p of prices) {
        if (p.region !== 'US') {
          p.savingsPct =
            Math.round((1 - p.priceUsd / usUsd) * 1000) / 10;
        }
      }
    }

    return { dealId, regionalPrices: prices };
  },
});
