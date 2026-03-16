import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const getTrackingOverview = tool({
  description:
    '获取价格追踪系统的整体概览，包括已追踪 deal 数、价格快照总数、有变动的 deal 数、各趋势分布、以及降价幅度最大的 Top 10。',
  inputSchema: z.object({}),
  execute: async () => {
    return queries.getTrackingOverview();
  },
});
