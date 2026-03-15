import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const getBrandOverview = tool({
  description:
    '获取品牌概览信息。返回各品牌的 deal 数量、最低价、均价、最高价等统计。',
  inputSchema: z.object({}),
  execute: async () => {
    const brands = queries.getBrandSummary();
    const destinations = queries.getDestinations().slice(0, 15);
    return { brands, topDestinations: destinations };
  },
});
