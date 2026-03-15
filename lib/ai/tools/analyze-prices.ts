import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const analyzePrices = tool({
  description:
    '分析价格数据。返回统计信息（最低价、最高价、均价）和价格区间分布。可按品牌或目的地筛选。',
  inputSchema: z.object({
    brand: z.string().optional().describe('按品牌筛选'),
    destination: z.string().optional().describe('按目的地筛选'),
  }),
  execute: async (params) => {
    const stats = queries.getPriceStats(params);
    const distribution = queries.getPriceDistribution(params);
    return { stats, distribution };
  },
});
