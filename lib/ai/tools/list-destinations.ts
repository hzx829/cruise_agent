import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';
import type { DestinationSummary } from '@/lib/db/types';
import { normalizeSearchText } from '@/lib/cruise/search-utils';
import { coerceOptionalNumber } from './schemas';

const MAX_DESTINATION_LIMIT = 30;

function matchesDestinationQuery(
  destination: DestinationSummary,
  query: string,
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  return [
    destination.id,
    destination.name,
    destination.canonical_name,
    destination.destination,
  ].some((value) => {
    const normalizedValue = normalizeSearchText(value);
    return (
      normalizedValue.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedValue)
    );
  });
}

export const listDestinations = tool({
  description:
    '查找已接入价格源中的邮轮目的地及规范化 destinationId。用户用中文或模糊目的地查询时，先用 query 查找，再把匹配 id 传入 searchDeals.destinationId。',
  inputSchema: z.object({
    query: z.string().optional().describe('目的地关键词；留空时返回全部目的地'),
    limit: coerceOptionalNumber().describe('可选返回数量上限；不传则不截断，最多 30'),
  }),
  execute: async ({ query, limit }) => {
    const allDestinations = queries.getDestinations('zh-CN');
    const hasExplicitLimit = typeof limit === 'number' && Number.isFinite(limit);
    const filteredDestinations = query
      ? allDestinations.filter((destination) =>
          matchesDestinationQuery(destination, query),
        )
      : allDestinations;
    const destinations = hasExplicitLimit
      ? filteredDestinations.slice(
          0,
          Math.min(Math.max(Math.trunc(limit), 1), MAX_DESTINATION_LIMIT),
        )
      : filteredDestinations;

    return {
      query: query ?? null,
      total: allDestinations.length,
      returned: destinations.length,
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
