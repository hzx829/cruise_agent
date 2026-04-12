import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const listDestinations = tool({
  description:
    '列出数据库中所有可用的邮轮目的地及其航线数量。当用户用中文或模糊描述查询目的地时，务必先调用此工具获取规范化目的地 ID，再把 id 传入 searchDeals.destinationId。',
  inputSchema: z.object({}),
  execute: async () => {
    const destinations = queries.getDestinations('zh-CN');
    return {
      total: destinations.length,
      destinations: destinations.map((d) => ({
        id: d.id,
        name: d.name,
        canonicalName: d.canonical_name,
        dealCount: d.count,
        minPrice: d.min_price,
        avgPrice: d.avg_price,
      })),
    };
  },
});
