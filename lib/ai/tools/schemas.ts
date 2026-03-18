import { z } from 'zod';

/**
 * 品牌层级枚举
 */
export const tierEnum = z.enum(['budget', 'standard', 'premium', 'luxury']);
export type Tier = z.infer<typeof tierEnum>;

/**
 * 处理 AI 可能传递字符串化数组的 tier 参数
 * 支持单个值、数组、或字符串化的 JSON 数组
 */
export const tierSchema = z
  .preprocess((val) => {
    // 如果是字符串且看起来像 JSON 数组，尝试解析
    if (typeof val === 'string' && val.startsWith('[')) {
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return val;
  }, z.union([tierEnum, z.array(tierEnum)]))
  .optional()
  .describe(
    '品牌层级筛选，可传单个或数组: budget(大众) / standard(标准) / premium(高端) / luxury(奢华)。不填则返回所有层级'
  );

/**
 * 将 tier 参数统一转换为数组
 */
export function normalizeTier(tier: Tier | Tier[] | undefined): Tier[] | undefined {
  if (!tier) return undefined;
  return Array.isArray(tier) ? tier : [tier];
}
