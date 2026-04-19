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
 * deal 主键是 cruise_crawler 生成的 16 位十六进制字符串
 * 调工具时必须原样复用上一个工具返回的 id，不能拿排名、价格或序号代替
 */
export const dealIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[0-9a-f]{16}$/, 'dealId 必须是 16 位十六进制字符串')
  .describe(
    '航线 deal ID（16 位十六进制字符串），必须直接使用上一工具返回的 id 原值，不能用排名、价格或序号代替'
  );

export const dealIdsSchema = z
  .array(dealIdSchema)
  .min(2)
  .max(5)
  .describe(
    '要对比的 deal ID 列表（2~5 个）。每个 ID 都必须原样复用上一工具返回的字符串 id'
  );

/**
 * 将 tier 参数统一转换为数组
 */
export function normalizeTier(tier: Tier | Tier[] | undefined): Tier[] | undefined {
  if (!tier) return undefined;
  return Array.isArray(tier) ? tier : [tier];
}
