import { getDb } from './index';
import type {
  ActiveBrandInfo,
  BrandRow,
  BrandSummary,
  DealRow,
  DestinationSummary,
  PriceHistoryRow,
  SearchFilters,
  TopDrop,
} from './types';

// ─── Deal 查询 ──────────────────────────────────────────

export function searchDeals(filters: SearchFilters): DealRow[] {
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
  if (filters.cabinType) {
    conditions.push('LOWER(d.cabin_type) LIKE ?');
    params.push(`%${filters.cabinType.toLowerCase()}%`);
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
  const sortCol = filters.sortBy || 'price';
  const sortDir = filters.sortOrder || 'ASC';
  const limit = Math.min(filters.limit || 20, 50);

  const sql = `
    SELECT d.*, b.name AS brand_name, b.name_cn AS brand_name_cn, b.tier AS brand_tier
    FROM deals d
    LEFT JOIN brands b ON d.brand_id = b.id
    ${where}
    ORDER BY d.${sortCol} ${sortDir}
    LIMIT ?
  `;
  params.push(limit);

  return db.prepare(sql).all(...params) as DealRow[];
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
