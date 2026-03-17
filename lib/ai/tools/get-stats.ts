import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const getStats = tool({
  description:
    '获取邮轮数据的整体统计概览：总 deal 数、品牌数、均价、各品牌最低价排行、价格分布等。用于回答整体性问题，如"一共有多少航线"、"哪个品牌最便宜"、"价格大概什么范围"。',
  inputSchema: z.object({}),
  execute: async () => {
    return queries.getOverallStats();
  },
});
