import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';
import { buildRouteLabel, getRouteEndpoints } from '@/lib/cruise/search-utils';
import { tierSchema } from './schemas';

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

export const searchDeals = tool({
  description:
    '搜索已接入直连价格源中的邮轮报价/航次。支持按品牌、目的地、出发港、到达港、经停港、是否往返、航区、价格范围、出发日期、航行天数、舱位类型、价格趋势、品牌层级等筛选。用户明确提出的港口、品牌、日期、往返、经停等条件默认都是硬约束，不要自行放宽。默认按同一航次聚合，只返回该航次最低起价；若指定 cabinType，则返回该房型在每个航次的价格。返回 0 条只代表已接入直连价格源没有精确匹配或可能覆盖不足，不代表市场没有船；遇到港口/母港/航线供给问题应再用 webSearch 查公开网络/官方入口。',
  inputSchema: z.object({
    brand: z
      .string()
      .optional()
      .describe(
        '品牌 ID: carnival, ncl, msc, msc_cn, royal_caribbean_cn。MSC 国际站用 msc，MSC 中国站人民币航线用 msc_cn'
      ),
    destination: z
      .string()
      .optional()
      .describe('目的地名称，可传中文、英文或官网原文；能确定 destinationId 时优先传 destinationId'),
    destinationId: z
      .string()
      .optional()
      .describe('规范化目的地 ID，来自 listDestinations 返回的 id；比 destination 文本更准确'),
    departurePort: z
      .string()
      .optional()
      .describe('出发港/母港，如 Athens, Piraeus, Ravenna, Istanbul'),
    arrivalPort: z
      .string()
      .optional()
      .describe('抵达港。用户指定 A 到 B 的开口航线时使用'),
    itineraryIncludes: z
      .array(z.string())
      .optional()
      .describe('必须经停/停靠/包含的港口列表，如 Singapore, Santorini, Mykonos。用户说“停靠/经停/途经/包含某港”时传这里；departurePort 只用于从某港出发/登船/母港语义'),
    itineraryExcludes: z
      .array(z.string())
      .optional()
      .describe('不能经停的港口列表'),
    priceMin: z.number().optional().describe('最低价格'),
    priceMax: z.number().optional().describe('最高价格'),
    sailDateFrom: z
      .string()
      .optional()
      .describe('最早出发日期 YYYY-MM-DD。用户给出具体日期或日期范围时必须传入'),
    sailDateTo: z
      .string()
      .optional()
      .describe('最晚出发日期 YYYY-MM-DD。用户给出“X 到 Y 之间”时必须传入'),
    durationMin: z.number().optional().describe('最短天数'),
    durationMax: z.number().optional().describe('最长天数'),
    cabinType: z
      .string()
      .optional()
      .describe('舱位类型: interior, oceanview, balcony, suite'),
    roundtrip: z
      .boolean()
      .optional()
      .describe('是否必须回到出发港。用户说“往返”时必须设为 true，不要用开口航线代替'),
    routeRegion: z
      .enum(['aegean', 'eastern_mediterranean', 'western_mediterranean'])
      .optional()
      .describe('航区筛选：爱琴海 / 东地中海 / 西地中海'),
    priceTrend: z
      .enum(['up', 'down', 'stable', 'new'])
      .optional()
      .describe('价格趋势筛选: up(涨价) / down(降价) / stable(稳定) / new(新上架)'),
    tier: tierSchema,
    sortBy: z
      .enum(['price', 'sail_date', 'duration_days', 'price_change_count'])
      .optional()
      .describe('排序字段，默认按价格'),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    limit: z.number().optional().describe('返回数量，默认 20，最多 50'),
  }),
  execute: async (params) => {
    const result = queries.searchDeals({
      ...params,
      locale: 'zh-CN',
      limit: Math.min(params.limit || 20, 50),
    });

    return {
      count: result.totalMatches,
      groupedBySailing: true,
      requestedCabinType: params.cabinType ?? null,
      appliedFilters: result.coverage.appliedFilters,
      exactMatch: result.coverage.exactMatch,
      coverageStatus: result.coverage.coverageStatus,
      noResultReason: result.coverage.noResultReason ?? null,
      relaxedMatchCounts: result.coverage.relaxedMatchCounts,
      coverageNotes: result.coverage.notes,
      deals: result.deals.map((d) => {
        const { startPort, endPort } = getRouteEndpoints(d);
        const { routeLabel, routeType } = buildRouteLabel(d);
        const routeStops = parseRouteStops(d.route_stops_display);

        return {
          id: d.id,
          brandRaw: d.brand_name || d.brand_id,
          brand: d.brand_short_name_display || d.brand_name_display || d.brand_name_cn || d.brand_name || d.brand_id,
          brandId: d.brand_id,
          brandTier: d.brand_tier,
          dealName: d.deal_name,
          shipName: d.ship_name_display || d.ship_name,
          shipNameRaw: d.ship_name,
          departurePort: d.departure_port_display || d.departure_port,
          departurePortRaw: d.departure_port,
          departurePortId: d.departure_port_id,
          arrivalPort: endPort,
          routeStartPort: startPort,
          routeEndPort: endPort,
          routeLabel,
          routeType,
          routeStops,
          routeSource: d.route_source,
          routeSourceUrl: d.route_source_url,
          routeConfidence: d.route_confidence,
          routeCompleteness: d.route_completeness,
          destination: d.destination_display || d.destination,
          destinationRaw: d.destination,
          destinationId: d.destination_id || d.primary_destination_term_id,
          itinerary: d.itinerary,
          durationDays: d.duration_days,
          price: d.price,
          priceOriginal: d.price_original,
          priceHighest: d.price_highest,
          priceLowest: d.price_lowest,
          discountPct: d.discount_pct,
          currency: d.price_currency,
          cabinType: d.cabin_type,
          sailDate: d.sail_date,
          perks: parseStringList(d.perks_display || d.perks),
          perksRaw: parseStringList(d.perks_raw || d.perks),
          dealUrl: d.deal_url,
          priceTrend: d.price_trend,
          priceChangeCount: d.price_change_count,
        };
      }),
    };
  },
});
