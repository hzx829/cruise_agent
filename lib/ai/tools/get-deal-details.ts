import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';
import { dealIdSchema } from './schemas';

type RouteStopOutput = {
  seq: number;
  portName: string;
  portId: string | null;
  source: string;
  sourceUrl: string | null;
  confidence: number | null;
};

function parseStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseRouteStops(value: string | null | undefined): RouteStopOutput[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
          .map((item) => ({
            seq: Number(item?.seq ?? 0),
            portName: String(item?.portName ?? '').trim(),
            portId: item?.portId ? String(item.portId) : null,
            source: String(item?.source ?? 'official'),
            sourceUrl: item?.sourceUrl ? String(item.sourceUrl) : null,
            confidence:
              typeof item?.confidence === 'number' ? item.confidence : null,
          }))
          .filter((item) => item.portName)
      : [];
  } catch {
    return [];
  }
}

export const getDealDetails = tool({
  description:
    '按 dealId 获取单个航线的详情层数据。用于 searchDeals/getTopPriceDrops 返回候选后，拉取更完整的原始字段、航线、权益、来源和 raw_data。',
  inputSchema: z.object({
    dealId: dealIdSchema,
    detailLevel: z
      .enum(['standard', 'full'])
      .default('standard')
      .describe('standard 返回完整结构化字段但不含 raw_data；full 额外返回 raw_data'),
  }),
  execute: async ({ dealId, detailLevel }) => {
    const deal = queries.getDealById(dealId, 'zh-CN');
    if (!deal) {
      return {
        error:
          '未找到该航线，请确认传入的是上一工具返回的字符串 dealId。',
      };
    }

    const dealRecord: Record<string, unknown> = { ...deal };
    if (detailLevel !== 'full') {
      delete dealRecord.raw_data;
    }

    return {
      detailLevel,
      deal: dealRecord,
      parsed: {
        brand:
          deal.brand_short_name_display ||
          deal.brand_name_display ||
          deal.brand_name_cn ||
          deal.brand_name ||
          deal.brand_id,
        shipName: deal.ship_name_display || deal.ship_name,
        departurePort: deal.departure_port_display || deal.departure_port,
        destination: deal.destination_display || deal.destination,
        destinationId: deal.destination_id || deal.primary_destination_term_id,
        routeStops: parseRouteStops(deal.route_stops_display),
        perks: parseStringList(deal.perks_display || deal.perks),
        perksRaw: parseStringList(deal.perks_raw || deal.perks),
      },
      dataSource: 'direct_db',
    };
  },
});
