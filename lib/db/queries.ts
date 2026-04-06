import { getDb } from './index';
import type {
  ActiveBrandInfo,
  BrandRow,
  BrandSummary,
  DealRow,
  DestinationSummary,
  PriceHistoryRow,
  SearchFilters,
  SearchDealsResult,
  TopDrop,
} from './types';
import {
  compareCabinPriority,
  getRouteEndpoints,
  isEquivalentLocation,
  matchesCabinType,
  matchesLocation,
  matchesRouteRegion,
} from '@/lib/cruise/search-utils';

// ─── Deal 查询 ──────────────────────────────────────────

function buildSailingKey(deal: DealRow): string {
  return [
    deal.brand_id,
    deal.deal_name ?? '',
    deal.ship_name ?? '',
    deal.departure_port ?? '',
    deal.destination ?? '',
    deal.itinerary ?? '',
    deal.duration_days ?? '',
    deal.sail_date ?? '',
    deal.sail_date_end ?? '',
  ].join('||');
}

function pickCheapestBySailing(deals: DealRow[]): DealRow[] {
  const grouped = new Map<string, DealRow>();

  for (const deal of deals) {
    const key = buildSailingKey(deal);
    const existing = grouped.get(key);

    if (
      !existing ||
      deal.price < existing.price ||
      (deal.price === existing.price &&
        compareCabinPriority(deal.cabin_type, existing.cabin_type) < 0)
    ) {
      grouped.set(key, deal);
    }
  }

  return Array.from(grouped.values());
}

function compareValues(a: number | string | null | undefined, b: number | string | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function sortDeals(deals: DealRow[], filters: SearchFilters): DealRow[] {
  const sortCol = filters.sortBy || 'price';
  const sortDir = filters.sortOrder === 'desc' ? -1 : 1;

  return [...deals].sort((left, right) => {
    const primary = compareValues(
      left[sortCol as keyof DealRow] as number | string | null | undefined,
      right[sortCol as keyof DealRow] as number | string | null | undefined
    );
    if (primary !== 0) return primary * sortDir;

    const byDate = compareValues(left.sail_date, right.sail_date);
    if (byDate !== 0) return byDate;

    return left.price - right.price;
  });
}

function matchesAdvancedFilters(deal: DealRow, filters: SearchFilters): boolean {
  if (filters.cabinType && !matchesCabinType(deal.cabin_type, filters.cabinType)) {
    return false;
  }

  const { startPort, endPort } = getRouteEndpoints(deal);

  if (filters.departurePort && !matchesLocation(startPort, filters.departurePort)) {
    return false;
  }

  if (filters.arrivalPort && !matchesLocation(endPort, filters.arrivalPort)) {
    return false;
  }

  if (filters.roundtrip && !isEquivalentLocation(startPort, endPort)) {
    return false;
  }

  if (filters.itineraryIncludes?.length) {
    const searchableText = [deal.itinerary, deal.destination].join(' ');
    const allIncluded = filters.itineraryIncludes.every((term) =>
      matchesLocation(searchableText, term)
    );
    if (!allIncluded) {
      return false;
    }
  }

  if (filters.itineraryExcludes?.length) {
    const searchableText = [deal.itinerary, deal.destination].join(' ');
    const hasExcluded = filters.itineraryExcludes.some((term) =>
      matchesLocation(searchableText, term)
    );
    if (hasExcluded) {
      return false;
    }
  }

  if (filters.routeRegion && !matchesRouteRegion(deal, filters.routeRegion)) {
    return false;
  }

  return true;
}

function buildSearchSql(where: string, groupedBySailing: boolean): string {
  if (!groupedBySailing) {
    return `
      SELECT d.*, b.name AS brand_name, b.name_cn AS brand_name_cn, b.tier AS brand_tier
      FROM deals d
      LEFT JOIN brands b ON d.brand_id = b.id
      ${where}
    `;
  }

  return `
    WITH ranked AS (
      SELECT d.*, b.name AS brand_name, b.name_cn AS brand_name_cn, b.tier AS brand_tier,
             ROW_NUMBER() OVER (
               PARTITION BY d.brand_id, COALESCE(d.deal_name, ''), COALESCE(d.ship_name, ''),
                            COALESCE(d.departure_port, ''), COALESCE(d.destination, ''),
                            COALESCE(d.itinerary, ''), COALESCE(d.duration_days, -1),
                            COALESCE(d.sail_date, ''), COALESCE(d.sail_date_end, '')
               ORDER BY d.price ASC, COALESCE(d.cabin_type, '')
             ) AS sailing_rank
      FROM deals d
      LEFT JOIN brands b ON d.brand_id = b.id
      ${where}
    )
    SELECT * FROM ranked
    WHERE sailing_rank = 1
  `;
}

export function searchDeals(filters: SearchFilters): SearchDealsResult {
  const db = getDb();
  const conditions: string[] = ['d.price > 0'];
  const params: (string | number)[] = [];

  if (filters.brand) {
    conditions.push('d.brand_id = ?');
    params.push(filters.brand);
  }
  if (filters.destination) {
    conditions.push('d.destination LIKE ?');
    params.push(`%${filters.destination}%`);
  }
  if (filters.priceMin != null) {
    conditions.push('d.price >= ?');
    params.push(filters.priceMin);
  }
  if (filters.priceMax != null) {
    conditions.push('d.price <= ?');
    params.push(filters.priceMax);
  }
  if (filters.sailDateFrom) {
    conditions.push('d.sail_date >= ?');
    params.push(filters.sailDateFrom);
  }
  if (filters.sailDateTo) {
    conditions.push('d.sail_date <= ?');
    params.push(filters.sailDateTo);
  }
  if (filters.durationMin != null) {
    conditions.push('d.duration_days >= ?');
    params.push(filters.durationMin);
  }
  if (filters.durationMax != null) {
    conditions.push('d.duration_days <= ?');
    params.push(filters.durationMax);
  }
  if (filters.priceTrend) {
    conditions.push('d.price_trend = ?');
    params.push(filters.priceTrend);
  }
  if (filters.tier) {
    const tiers = Array.isArray(filters.tier) ? filters.tier : [filters.tier];
    conditions.push(`b.tier IN (${tiers.map(() => '?').join(',')})`);
    params.push(...tiers);
  }
  if (filters.minScore != null) {
    conditions.push('d.deal_score >= ?');
    params.push(filters.minScore);
  }

  const where = 'WHERE ' + conditions.join(' AND ');
  const limit = Math.min(filters.limit || 20, 50);
  const groupedBySailing = !filters.cabinType;
  const sql = buildSearchSql(where, groupedBySailing);

  const baseDeals = db.prepare(sql).all(...params) as DealRow[];
  const advancedFiltered = baseDeals.filter((deal) =>
    matchesAdvancedFilters(deal, filters)
  );
  const dedupedDeals = groupedBySailing
    ? advancedFiltered
    : pickCheapestBySailing(advancedFiltered);
  const sortedDeals = sortDeals(dedupedDeals, filters);

  return {
    totalMatches: sortedDeals.length,
    deals: sortedDeals.slice(0, limit),
  };
}

export function getDealById(dealId: string): DealRow | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT d.*, b.name AS brand_name, b.name_cn AS brand_name_cn, b.tier AS brand_tier
       FROM deals d LEFT JOIN brands b ON d.brand_id = b.id
       WHERE d.id = ?`
    )
    .get(dealId) as DealRow | undefined;
}

// ─── Brand 查询 ─────────────────────────────────────────

export function getBrands(): BrandRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM brands WHERE is_active = 1 ORDER BY brand_group, id')
    .all() as BrandRow[];
}

export function getBrandSummary(): BrandSummary[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT b.id, b.name, b.name_cn, b.brand_group,
              COUNT(d.id) AS deal_count,
              MIN(d.price) AS min_price,
              ROUND(AVG(d.price), 0) AS avg_price,
              MAX(d.price) AS max_price,
              d.price_currency AS currency
       FROM brands b
       LEFT JOIN deals d ON b.id = d.brand_id AND d.price > 0
       GROUP BY b.id
       HAVING deal_count > 0
       ORDER BY deal_count DESC`
    )
    .all() as BrandSummary[];
}

/** 查询有实际 deal 数据的品牌及其统计信息（用于动态组装 prompt） */
export function getActiveBrandsStats(): ActiveBrandInfo[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT b.id, b.name, b.name_cn, b.tier,
              d.price_currency AS currency,
              COUNT(d.id) AS deal_count,
              SUM(CASE WHEN d.deal_score > 0 THEN 1 ELSE 0 END) AS scored_count,
              GROUP_CONCAT(DISTINCT d.cabin_type) AS cabin_types
       FROM brands b
       JOIN deals d ON b.id = d.brand_id AND d.price > 0
       GROUP BY b.id
       ORDER BY b.tier, deal_count DESC`
    )
    .all() as ActiveBrandInfo[];
}

// ─── 目的地 ─────────────────────────────────────────────

export function getDestinations(): DestinationSummary[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT destination, COUNT(*) AS count,
              MIN(price) AS min_price, ROUND(AVG(price), 0) AS avg_price
       FROM deals
       WHERE destination IS NOT NULL AND destination != '' AND price > 0
       GROUP BY destination
       ORDER BY count DESC`
    )
    .all() as DestinationSummary[];
}

/** 获取所有舱位/房型及数量 */
export function getCabinTypes(): { cabin_type: string; count: number }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT cabin_type, COUNT(*) AS count
       FROM deals
       WHERE price > 0 AND cabin_type IS NOT NULL AND cabin_type != ''
       GROUP BY cabin_type
       ORDER BY count DESC`
    )
    .all() as { cabin_type: string; count: number }[];
}

// ─── 价格分析 ───────────────────────────────────────────

export function getPriceStats(filters?: { brand?: string; destination?: string }) {
  const db = getDb();
  const conditions: string[] = ['price > 0'];
  const params: string[] = [];

  if (filters?.brand) {
    conditions.push('brand_id = ?');
    params.push(filters.brand);
  }
  if (filters?.destination) {
    conditions.push('destination LIKE ?');
    params.push(`%${filters.destination}%`);
  }

  const where = 'WHERE ' + conditions.join(' AND ');

  const overall = db
    .prepare(
      `SELECT COUNT(*) AS total,
              MIN(price) AS min_price,
              MAX(price) AS max_price,
              ROUND(AVG(price), 0) AS avg_price,
              price_currency AS currency
       FROM deals ${where}
       GROUP BY price_currency`
    )
    .all(...params);

  return { overall };
}

export function getPriceDistribution(filters?: {
  brand?: string;
  destination?: string;
}) {
  const db = getDb();
  const conditions: string[] = ['price > 0'];
  const params: string[] = [];

  if (filters?.brand) {
    conditions.push('brand_id = ?');
    params.push(filters.brand);
  }
  if (filters?.destination) {
    conditions.push('destination LIKE ?');
    params.push(`%${filters.destination}%`);
  }

  const where = 'WHERE ' + conditions.join(' AND ');

  // 按价格区间分布
  return db
    .prepare(
      `SELECT
         CASE
           WHEN price < 200 THEN '0-200'
           WHEN price < 500 THEN '200-500'
           WHEN price < 1000 THEN '500-1000'
           WHEN price < 2000 THEN '1000-2000'
           WHEN price < 3000 THEN '2000-3000'
           WHEN price < 5000 THEN '3000-5000'
           ELSE '5000+'
         END AS price_range,
         COUNT(*) AS count,
         price_currency AS currency
       FROM deals ${where}
       GROUP BY price_range, price_currency
       ORDER BY MIN(price)`
    )
    .all(...params);
}

// ─── 价格历史 ───────────────────────────────────────────

export function getPriceHistory(dealId: string): PriceHistoryRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM price_history
       WHERE deal_id = ?
       ORDER BY recorded_at ASC`
    )
    .all(dealId) as PriceHistoryRow[];
}

// ─── 天数-价格 ──────────────────────────────────────────

export function getDurationPriceData(filters?: {
  brand?: string;
  destination?: string;
}) {
  const db = getDb();
  const conditions: string[] = [
    'price > 0',
    'duration_days IS NOT NULL',
  ];
  const params: string[] = [];

  if (filters?.brand) {
    conditions.push('brand_id = ?');
    params.push(filters.brand);
  }
  if (filters?.destination) {
    conditions.push('destination LIKE ?');
    params.push(`%${filters.destination}%`);
  }

  const where = 'WHERE ' + conditions.join(' AND ');

  return db
    .prepare(
      `SELECT duration_days, price, price_currency, brand_id, ship_name
       FROM deals ${where}
       ORDER BY duration_days`
    )
    .all(...params);
}

// ─── 品牌对比 ───────────────────────────────────────────

export function getBrandPriceComparison() {
  const db = getDb();
  return db
    .prepare(
      `SELECT brand_id,
              COUNT(*) AS deal_count,
              MIN(price) AS min_price,
              ROUND(AVG(price), 0) AS avg_price,
              MAX(price) AS max_price,
              price_currency AS currency
       FROM deals
       WHERE price > 0
       GROUP BY brand_id, price_currency
       ORDER BY avg_price ASC`
    )
    .all();
}

// ─── 价格追踪 ───────────────────────────────────────────

/** 降价幅度最大的 deal（按 (price_highest - price) / price_highest 排序） */
export function getTopPriceDrops(filters?: {
  brand?: string;
  tier?: string | string[];
  limit?: number;
}): TopDrop[] {
  const db = getDb();
  const conditions: string[] = [
    'd.price > 0',
    'd.price_highest IS NOT NULL',
    'd.price_highest > d.price',
  ];
  const params: (string | number)[] = [];

  if (filters?.brand) {
    conditions.push('d.brand_id = ?');
    params.push(filters.brand);
  }
  if (filters?.tier) {
    const tiers = Array.isArray(filters.tier) ? filters.tier : [filters.tier];
    conditions.push(`b.tier IN (${tiers.map(() => '?').join(',')})`);
    params.push(...tiers);
  }

  const where = 'WHERE ' + conditions.join(' AND ');
  const limit = Math.min(filters?.limit || 15, 50);

  return db
    .prepare(
      `SELECT d.id, d.brand_id, d.deal_name, d.ship_name, d.destination,
              d.price, d.price_currency, d.price_highest, d.price_lowest,
              d.deal_score, d.cabin_type, d.duration_days, d.sail_date,
              d.price_trend, d.deal_url, d.perks,
              ROUND((d.price_highest - d.price) * 100.0 / d.price_highest, 1) AS drop_pct,
              b.name AS brand_name, b.name_cn AS brand_name_cn, b.tier AS brand_tier
       FROM deals d
       LEFT JOIN brands b ON d.brand_id = b.id
       ${where}
       ORDER BY drop_pct DESC
       LIMIT ?`
    )
    .all(...params, limit) as TopDrop[];
}

/** 按趋势统计 deal 数量 */
export function getTrendStats() {
  const db = getDb();
  return db
    .prepare(
      `SELECT price_trend, COUNT(*) AS count
       FROM deals
       WHERE price > 0 AND price_trend IS NOT NULL
       GROUP BY price_trend`
    )
    .all() as { price_trend: string; count: number }[];
}

/** 价格追踪整体概览 */
export function getTrackingOverview() {
  const db = getDb();

  const totalSnapshots = db
    .prepare('SELECT COUNT(*) AS cnt FROM price_history')
    .get() as { cnt: number };

  const trackedDeals = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM deals WHERE price_trend IS NOT NULL AND price > 0`
    )
    .get() as { cnt: number };

  const changedDeals = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM deals WHERE price_change_count > 0 AND price > 0`
    )
    .get() as { cnt: number };

  const trends = getTrendStats();
  const topDrops = getTopPriceDrops({ limit: 10 });

  return {
    tracked_deals: trackedDeals.cnt,
    total_snapshots: totalSnapshots.cnt,
    changed_deals: changedDeals.cnt,
    trends: Object.fromEntries(trends.map((t) => [t.price_trend, t.count])),
    top_drops: topDrops,
  };
}

/** 高 deal_score 航线（适合小红书推广），按品牌层级分组 */
export function getHotDealsByTier(filters?: {
  tier?: string | string[];
  limit?: number;
}) {
  const db = getDb();
  const conditions: string[] = ['d.price > 0', 'd.deal_score > 0'];
  const params: (string | number)[] = [];

  if (filters?.tier) {
    const tiers = Array.isArray(filters.tier) ? filters.tier : [filters.tier];
    conditions.push(`b.tier IN (${tiers.map(() => '?').join(',')})`);
    params.push(...tiers);
  }

  const where = 'WHERE ' + conditions.join(' AND ');
  const limit = Math.min(filters?.limit || 20, 50);

  return db
    .prepare(
      `SELECT d.*, b.name AS brand_name, b.name_cn AS brand_name_cn, b.tier AS brand_tier
       FROM deals d
       LEFT JOIN brands b ON d.brand_id = b.id
       ${where}
       ORDER BY d.deal_score DESC
       LIMIT ?`
    )
    .all(...params, limit) as DealRow[];
}

/** 获取指定 deal 在各区域的价格 */
export function getRegionalPrices(dealId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT rp.*, d.price AS us_price, d.price_currency AS us_currency
       FROM regional_prices rp
       JOIN deals d ON rp.deal_id = d.id
       WHERE rp.deal_id = ?
       ORDER BY rp.region`
    )
    .all(dealId) as {
    deal_id: string;
    region: string;
    currency: string;
    price: number;
    us_price: number;
    us_currency: string;
  }[];
}

/** 获取整体统计数据 */
export function getOverallStats() {
  const db = getDb();

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total_deals,
              COUNT(DISTINCT brand_id) AS total_brands,
              ROUND(AVG(price), 2) AS avg_price,
              MIN(price) AS min_price,
              MAX(price) AS max_price
       FROM deals WHERE price > 0`
    )
    .get() as {
    total_deals: number;
    total_brands: number;
    avg_price: number;
    min_price: number;
    max_price: number;
  };

  const brandMins = db
    .prepare(
      `SELECT d.brand_id, b.name_cn, b.name, b.tier,
              MIN(d.price) AS min_price, d.price_currency AS currency
       FROM deals d
       LEFT JOIN brands b ON d.brand_id = b.id
       WHERE d.price > 0
       GROUP BY d.brand_id
       ORDER BY min_price ASC`
    )
    .all() as {
    brand_id: string;
    name_cn: string | null;
    name: string;
    tier: string;
    min_price: number;
    currency: string;
  }[];

  const distribution = db
    .prepare(
      `SELECT
         CASE
           WHEN price < 200 THEN '<200'
           WHEN price < 500 THEN '200-500'
           WHEN price < 1000 THEN '500-1000'
           WHEN price < 2000 THEN '1000-2000'
           WHEN price < 5000 THEN '2000-5000'
           ELSE '5000+'
         END AS price_range,
         COUNT(*) AS count
       FROM deals WHERE price > 0
       GROUP BY price_range
       ORDER BY MIN(price)`
    )
    .all() as { price_range: string; count: number }[];

  return { ...totals, brandMins, distribution };
}

/** 获取最近的价格变动 (有实际变动的快照) */
export function getRecentPriceChanges(limit: number = 20) {
  const db = getDb();
  return db
    .prepare(
      `SELECT ph.*, d.deal_name, d.ship_name, d.destination, d.brand_id,
              b.name_cn AS brand_name_cn, b.tier AS brand_tier
       FROM price_history ph
       JOIN deals d ON ph.deal_id = d.id
       LEFT JOIN brands b ON d.brand_id = b.id
       WHERE d.price_change_count > 0
       ORDER BY ph.recorded_at DESC
       LIMIT ?`
    )
    .all(limit);
}
