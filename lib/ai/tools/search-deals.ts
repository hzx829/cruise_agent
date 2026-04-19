import { tool } from 'ai';
import { z } from 'zod';
import * as queries from '@/lib/db/queries';
import { buildRouteLabel, getRouteEndpoints } from '@/lib/cruise/search-utils';
import { tierSchema } from './schemas';

function parseStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export const searchDeals = tool({
  description:
    '搜索邮轮特价航线。支持按品牌、目的地、出发港、到达港、经停港、是否往返、航区、价格范围、出发日期、航行天数、舱位类型、价格趋势、品牌层级等筛选。默认按同一航次聚合，只返回该航次最低起价；若指定 cabinType，则返回该房型在每个航次的价格。',
  inputSchema: z.object({
    brand: z
      .string()
      .optional()
      .describe('品牌 ID: carnival, ncl, royal_caribbean_cn'),
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
      .describe('必须经停的港口列表，如 Santorini, Mykonos'),
    itineraryExcludes: z
      .array(z.string())
      .optional()
      .describe('不能经停的港口列表'),
    priceMin: z.number().optional().describe('最低价格'),
    priceMax: z.number().optional().describe('最高价格'),
    sailDateFrom: z
      .string()
      .optional()
      .describe('最早出发日期 YYYY-MM-DD'),
    sailDateTo: z
      .string()
      .optional()
      .describe('最晚出发日期 YYYY-MM-DD'),
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
      deals: result.deals.map((d) => {
        const { startPort, endPort } = getRouteEndpoints(d);
        const { routeLabel, routeType } = buildRouteLabel(d);

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
