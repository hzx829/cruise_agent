import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';
import { coerceOptionalNumber, tierSchema, normalizeTier } from './schemas';

type RouteStopOutput = {
  seq: number;
  portName: string;
  portId: string | null;
  source: string;
  sourceUrl: string | null;
  confidence: number | null;
};

const DEFAULT_TOP_DROP_LIMIT = 8;
const MAX_TOP_DROP_LIMIT = 10;
const MAX_ROUTE_STOPS_FOR_AGENT = 8;

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
          .slice(0, MAX_ROUTE_STOPS_FOR_AGENT)
      : [];
  } catch {
    return [];
  }
}

export const getTopPriceDrops = tool({
  description:
    '获取降价幅度最大的航线，按降价百分比排序。适合寻找近期大幅降价的航线。注意：这个工具只返回有降价记录的航线，不等于"最便宜的航线"。',
  inputSchema: z.object({
    tier: tierSchema,
    brand: z.string().optional().describe('品牌 ID 筛选'),
    limit: coerceOptionalNumber().describe('返回数量，默认 15'),
  }),
  execute: async (params) => {
    const tierArr = normalizeTier(params.tier);
    const drops = queries.getTopPriceDrops({
      brand: params.brand,
      tier: tierArr,
      limit: Math.min(params.limit || DEFAULT_TOP_DROP_LIMIT, MAX_TOP_DROP_LIMIT),
      locale: 'zh-CN',
    });

    return {
      count: drops.length,
      deals: drops.map((d) => ({
        id: d.id,
        brand: d.brand_short_name_display || d.brand_name_display || d.brand_name_cn || d.brand_name || d.brand_id,
        brandRaw: d.brand_name || d.brand_id,
        brandId: d.brand_id,
        brandTier: d.brand_tier,
        dealName: d.deal_name,
        shipName: d.ship_name_display || d.ship_name,
        shipNameRaw: d.ship_name,
        destination: d.destination_display || d.destination,
        destinationRaw: d.destination,
        destinationId: d.destination_id || d.primary_destination_term_id,
        price: d.price,
        currency: d.price_currency,
        priceHighest: d.price_highest,
        priceLowest: d.price_lowest,
        dropPct: d.drop_pct,
        cabinType: d.cabin_type,
        durationDays: d.duration_days,
        sailDate: d.sail_date,
        priceTrend: d.price_trend,
        dealUrl: d.deal_url,
        routeStops: parseRouteStops(d.route_stops_display),
        routeSource: d.route_source,
        routeSourceUrl: d.route_source_url,
        routeConfidence: d.route_confidence,
        routeCompleteness: d.route_completeness,
        perks: parseStringList(d.perks_display || d.perks),
        perksRaw: parseStringList(d.perks_raw || d.perks),
      })),
    };
  },
});
