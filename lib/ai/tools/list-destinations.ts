import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const listDestinations = tool({
  description:
    '列出数据库中所有可用的邮轮目的地及其航线数量。当用户用中文或模糊描述查询目的地时，务必先调用此工具获取准确的英文目的地名称，再传入 searchDeals 等工具进行搜索。',
  inputSchema: z.object({}),
  execute: async () => {
    const destinations = queries.getDestinations();
    return {
      total: destinations.length,
      destinations: destinations.map((d) => ({
        name: d.destination,
        dealCount: d.count,
        minPrice: d.min_price,
        avgPrice: d.avg_price,
      })),
    };
  },
});
