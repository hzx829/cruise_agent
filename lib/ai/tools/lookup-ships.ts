import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';
import { coerceOptionalNumber } from './schemas';

export const lookupShips = tool({
  description:
    '从本地邮轮船名索引查询船只的英文名、中文正式名、所属船公司、品牌 ID 和已接入航次覆盖。适用于船名归属、中英文名、同名/近似船名区分等问题。',
  inputSchema: z.object({
    query: z
      .string()
      .describe('船名、中文别名或整句问题，例如“神女和欧罗巴”“MSC Euribia”“地中海欧罗巴号”'),
    brand: z
      .string()
      .optional()
      .describe('可选品牌 ID 或品牌名，例如 msc、msc_cn、costa。用户明确品牌时传入。'),
    limit: coerceOptionalNumber().describe('返回数量，默认 8，最大 20'),
  }),
  execute: async ({ query, brand, limit }) => ({
    query,
    brand: brand ?? null,
    ships: queries.lookupShips({
      query,
      brand,
      limit,
      locale: 'zh-CN',
    }),
  }),
});
