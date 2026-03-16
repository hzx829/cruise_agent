import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';

export const listCabinTypes = tool({
  description:
    '列出数据库中所有可用的舱位/房型及其航线数量。当用户查询特定舱位类型时，先调用此工具获取准确的舱位名称，再传入 searchDeals 等工具。',
  inputSchema: z.object({}),
  execute: async () => {
    const cabinTypes = queries.getCabinTypes();
    return {
      total: cabinTypes.length,
      cabinTypes: cabinTypes.map((c) => ({
        name: c.cabin_type,
        dealCount: c.count,
      })),
    };
  },
});
