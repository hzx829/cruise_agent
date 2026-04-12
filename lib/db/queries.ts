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

const DEFAULT_LOCALE = 'zh-CN';

function normalizeLocale(locale?: string): 'zh-CN' | 'en' {
  if (!locale) return DEFAULT_LOCALE;
  return locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function localizedDealJoins(locale?: string): string {
  const localeSql = quoteSqlLiteral(normalizeLocale(locale));

  return `
    LEFT JOIN brands b ON d.brand_id = b.id
    LEFT JOIN brand_translations bt_locale
      ON bt_locale.brand_id = b.id AND bt_locale.locale = ${localeSql}
    LEFT JOIN ships s ON d.ship_id = s.id
    LEFT JOIN ship_translations st_locale
      ON st_locale.ship_id = s.id AND st_locale.locale = ${localeSql}
    LEFT JOIN ship_translations st_en
      ON st_en.ship_id = s.id AND st_en.locale = 'en'
    LEFT JOIN ports p ON d.departure_port_id = p.id
    LEFT JOIN port_translations pt_locale
      ON pt_locale.port_id = p.id AND pt_locale.locale = ${localeSql}
    LEFT JOIN port_translations pt_en
      ON pt_en.port_id = p.id AND pt_en.locale = 'en'
    LEFT JOIN terms t ON d.primary_destination_term_id = t.id
    LEFT JOIN term_translations tt_locale
      ON tt_locale.term_id = t.id AND tt_locale.locale = ${localeSql}
    LEFT JOIN term_translations tt_en
      ON tt_en.term_id = t.id AND tt_en.locale = 'en'
  `;
}

function localizedDealSelect(): string {
  return `
    d.*,
    b.name AS brand_name,
    b.name_cn AS brand_name_cn,
    b.tier AS brand_tier,
    COALESCE(bt_locale.name, b.name_cn, b.name) AS brand_name_display,
    COALESCE(bt_locale.short_name, bt_locale.name, b.name_cn, b.name) AS brand_short_name_display,
    COALESCE(st_locale.name, st_en.name, s.canonical_name, d.ship_name) AS ship_name_display,
    COALESCE(pt_locale.name, pt_en.name, p.canonical_name, d.departure_port) AS departure_port_display,
    COALESCE(tt_locale.name, tt_en.name, t.canonical_name, d.destination) AS destination_display,
    d.primary_destination_term_id AS destination_id
  `;
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function attachPerksDisplay<T extends DealRow | TopDrop>(
  deals: T[],
  locale?: string
): T[] {
  if (deals.length === 0) return deals;

  const db = getDb();
  const dealIds = deals.map((deal) => deal.id);
  const placeholders = dealIds.map(() => '?').join(',');
  const localeSql = quoteSqlLiteral(normalizeLocale(locale));

  const rows = db
    .prepare(
      `SELECT dt.deal_id,
              COALESCE(tt_locale.name, tt_en.name, t.canonical_name) AS display_name,
              t.canonical_name AS raw_name
       FROM deal_tags dt
       JOIN terms t ON dt.term_id = t.id
       LEFT JOIN term_translations tt_locale
         ON tt_locale.term_id = t.id AND tt_locale.locale = ${localeSql}
       LEFT JOIN term_translations tt_en
         ON tt_en.term_id = t.id AND tt_en.locale = 'en'
       WHERE dt.deal_id IN (${placeholders})
       ORDER BY dt.id`
    )
    .all(...dealIds) as {
    deal_id: string;
    display_name: string | null;
    raw_name: string | null;
  }[];

  const byDeal = new Map<string, { display: string[]; raw: string[] }>();
  for (const row of rows) {
    const entry = byDeal.get(row.deal_id) ?? { display: [], raw: [] };
    if (row.display_name) entry.display.push(row.display_name);
    if (row.raw_name) entry.raw.push(row.raw_name);
    byDeal.set(row.deal_id, entry);
  }

  for (const deal of deals) {
    const rawPerks = parseStringArray(deal.perks);
    const linked = byDeal.get(deal.id);
    const displayPerks = linked?.display.length ? linked.display : rawPerks;
    const canonicalPerks = linked?.raw.length ? linked.raw : rawPerks;
    deal.perks_display = JSON.stringify(displayPerks);
    deal.perks_raw = JSON.stringify(canonicalPerks);
  }

  return deals;
}

function addDestinationFilter(
  conditions: string[],
  params: (string | number)[],
  filters?: { destination?: string; destinationId?: string },
  tableAlias?: string
) {
  const prefix = tableAlias ? `${tableAlias}.` : '';

  if (filters?.destinationId) {
    conditions.push(`${prefix}primary_destination_term_id = ?`);
    params.push(filters.destinationId);
    return;
  }

  if (!filters?.destination) return;

  conditions.push(`(
    ${prefix}destination LIKE ?
    OR EXISTS (
      SELECT 1 FROM terms destination_term
      WHERE destination_term.id = ${prefix}primary_destination_term_id
        AND destination_term.canonical_name LIKE ?
    )
    OR EXISTS (
      SELECT 1 FROM term_translations destination_translation
      WHERE destination_translation.term_id = ${prefix}primary_destination_term_id
        AND destination_translation.name LIKE ?
    )
  )`);
  params.push(`%${filters.destination}%`);
  params.push(`%${filters.destination}%`);
  params.push(`%${filters.destination}%`);
}

// ─── Deal 查询 ──────────────────────────────────────────

function buildSailingKey(deal: DealRow): string {
  return [
    deal.brand_id,
    deal.deal_name ?? '',
    deal.ship_id ?? deal.ship_name ?? '',
    deal.departure_port_id ?? deal.departure_port ?? '',
    deal.primary_destination_term_id ?? deal.destination ?? '',
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

function buildSearchSql(
  where: string,
  groupedBySailing: boolean,
  locale?: string
): string {
  const joins = localizedDealJoins(locale);
  const selectColumns = localizedDealSelect();

  if (!groupedBySailing) {
    return `
      SELECT ${selectColumns}
      FROM deals d
      ${joins}
      ${where}
    `;
  }

  return `
    WITH ranked AS (
      SELECT ${selectColumns},
             ROW_NUMBER() OVER (
               PARTITION BY d.brand_id, COALESCE(d.deal_name, ''),
                            COALESCE(d.ship_id, d.ship_name, ''),
                            COALESCE(d.departure_port_id, d.departure_port, ''),
                            COALESCE(d.primary_destination_term_id, d.destination, ''),
                            COALESCE(d.itinerary, ''), COALESCE(d.duration_days, -1),
                            COALESCE(d.sail_date, ''), COALESCE(d.sail_date_end, '')
               ORDER BY d.price ASC, COALESCE(d.cabin_type, '')
             ) AS sailing_rank
      FROM deals d
      ${joins}
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
  addDestinationFilter(conditions, params, filters, 'd');
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
  const sql = buildSearchSql(where, groupedBySailing, filters.locale);

  const baseDeals = db.prepare(sql).all(...params) as DealRow[];
  const advancedFiltered = baseDeals.filter((deal) =>
    matchesAdvancedFilters(deal, filters)
  );
  const dedupedDeals = groupedBySailing
    ? advancedFiltered
    : pickCheapestBySailing(advancedFiltered);
  const sortedDeals = sortDeals(dedupedDeals, filters);
  const pageDeals = attachPerksDisplay(
    sortedDeals.slice(0, limit),
    filters.locale
  );

  return {
    totalMatches: sortedDeals.length,
    deals: pageDeals,
  };
}

export function getDealById(dealId: string, locale?: string): DealRow | undefined {
  const db = getDb();
  const deal = db
    .prepare(
      `SELECT ${localizedDealSelect()}
       FROM deals d
       ${localizedDealJoins(locale)}
       WHERE d.id = ?`
    )
    .get(dealId) as DealRow | undefined;

  return deal ? attachPerksDisplay([deal], locale)[0] : undefined;
}

// ─── Brand 查询 ─────────────────────────────────────────

export function getBrands(): BrandRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM brands WHERE is_active = 1 ORDER BY brand_group, id')
    .all() as BrandRow[];
}

export function getBrandSummary(locale?: string): BrandSummary[] {
  const db = getDb();
  const localeSql = quoteSqlLiteral(normalizeLocale(locale));
  return db
    .prepare(
      `SELECT b.id, b.name, COALESCE(bt.name, b.name_cn) AS name_cn, b.brand_group,
              COUNT(d.id) AS deal_count,
              MIN(d.price) AS min_price,
              ROUND(AVG(d.price), 0) AS avg_price,
              MAX(d.price) AS max_price,
              d.price_currency AS currency
       FROM brands b
       LEFT JOIN brand_translations bt
         ON bt.brand_id = b.id AND bt.locale = ${localeSql}
       LEFT JOIN deals d ON b.id = d.brand_id AND d.price > 0
       GROUP BY b.id
       HAVING deal_count > 0
       ORDER BY deal_count DESC`
    )
    .all() as BrandSummary[];
}

/** 查询有实际 deal 数据的品牌及其统计信息（用于动态组装 prompt） */
export function getActiveBrandsStats(locale?: string): ActiveBrandInfo[] {
  const db = getDb();
  const localeSql = quoteSqlLiteral(normalizeLocale(locale));
  return db
    .prepare(
      `SELECT b.id, b.name, COALESCE(bt.name, b.name_cn) AS name_cn, b.tier,
              d.price_currency AS currency,
              COUNT(d.id) AS deal_count,
              SUM(CASE WHEN d.deal_score > 0 THEN 1 ELSE 0 END) AS scored_count,
              GROUP_CONCAT(DISTINCT d.cabin_type) AS cabin_types
       FROM brands b
       LEFT JOIN brand_translations bt
         ON bt.brand_id = b.id AND bt.locale = ${localeSql}
       JOIN deals d ON b.id = d.brand_id AND d.price > 0
       GROUP BY b.id
       ORDER BY b.tier, deal_count DESC`
    )
    .all() as ActiveBrandInfo[];
}

// ─── 目的地 ─────────────────────────────────────────────

export function getDestinations(locale?: string): DestinationSummary[] {
  const db = getDb();
  const localeSql = quoteSqlLiteral(normalizeLocale(locale));
  return db
    .prepare(
      `SELECT t.id,
              COALESCE(tt_locale.name, tt_en.name, t.canonical_name) AS name,
              t.canonical_name,
              COALESCE(tt_locale.name, tt_en.name, t.canonical_name) AS destination,
              COUNT(*) AS count,
              MIN(d.price) AS min_price,
              ROUND(AVG(d.price), 0) AS avg_price
       FROM deals d
       JOIN terms t
         ON d.primary_destination_term_id = t.id
        AND t.term_type = 'destination'
       LEFT JOIN term_translations tt_locale
         ON tt_locale.term_id = t.id AND tt_locale.locale = ${localeSql}
       LEFT JOIN term_translations tt_en
         ON tt_en.term_id = t.id AND tt_en.locale = 'en'
       WHERE d.price > 0
       GROUP BY t.id
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

export function getPriceStats(filters?: {
  brand?: string;
  destination?: string;
  destinationId?: string;
}) {
  const db = getDb();
  const conditions: string[] = ['price > 0'];
  const params: (string | number)[] = [];

  if (filters?.brand) {
    conditions.push('brand_id = ?');
    params.push(filters.brand);
  }
  addDestinationFilter(conditions, params, filters);

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
  destinationId?: string;
}) {
  const db = getDb();
  const conditions: string[] = ['price > 0'];
  const params: (string | number)[] = [];

  if (filters?.brand) {
    conditions.push('brand_id = ?');
    params.push(filters.brand);
  }
  addDestinationFilter(conditions, params, filters);

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
  destinationId?: string;
}) {
  const db = getDb();
  const conditions: string[] = [
    'price > 0',
    'duration_days IS NOT NULL',
  ];
  const params: (string | number)[] = [];

  if (filters?.brand) {
    conditions.push('brand_id = ?');
    params.push(filters.brand);
  }
  addDestinationFilter(conditions, params, filters);

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
  locale?: string;
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

  const drops = db
    .prepare(
      `SELECT ${localizedDealSelect()},
              ROUND((d.price_highest - d.price) * 100.0 / d.price_highest, 1) AS drop_pct
       FROM deals d
       ${localizedDealJoins(filters?.locale)}
       ${where}
       ORDER BY drop_pct DESC
       LIMIT ?`
    )
    .all(...params, limit) as TopDrop[];

  return attachPerksDisplay(drops, filters?.locale);
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
  const topDrops = getTopPriceDrops({ limit: 10, locale: DEFAULT_LOCALE });

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
  locale?: string;
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

  const deals = db
    .prepare(
      `SELECT ${localizedDealSelect()}
       FROM deals d
       ${localizedDealJoins(filters?.locale)}
       ${where}
       ORDER BY d.deal_score DESC
       LIMIT ?`
    )
    .all(...params, limit) as DealRow[];

  return attachPerksDisplay(deals, filters?.locale);
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
export function getOverallStats(locale?: string) {
  const db = getDb();
  const localeSql = quoteSqlLiteral(normalizeLocale(locale));

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
      `SELECT d.brand_id, COALESCE(bt.name, b.name_cn) AS name_cn, b.name, b.tier,
              MIN(d.price) AS min_price, d.price_currency AS currency
       FROM deals d
       LEFT JOIN brands b ON d.brand_id = b.id
       LEFT JOIN brand_translations bt
         ON bt.brand_id = b.id AND bt.locale = ${localeSql}
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
