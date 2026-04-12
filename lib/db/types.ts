export interface DealRow {
  id: string;
  brand_id: string;
  deal_name: string;
  deal_url: string | null;
  ship_name: string | null;
  ship_id: string | null;
  departure_port: string | null;
  departure_port_id: string | null;
  destination: string | null;
  primary_destination_term_id: string | null;
  itinerary: string | null;
  duration_days: number | null;
  duration_nights: number | null;
  price: number;
  price_currency: string;
  price_unit: string | null;
  price_original: number | null;
  discount_pct: number | null;
  cabin_type: string | null;
  guests_count: number | null;
  sail_date: string | null;
  sail_date_end: string | null;
  booking_deadline: string | null;
  perks: string | null;
  source_page: string | null;
  raw_data: string | null;
  crawled_at: string;
  created_at: string | null;
  updated_at: string | null;
  price_per_night: number | null;
  price_baseline: number | null;
  deal_score: number | null;
  // price tracking fields
  price_lowest: number | null;
  price_highest: number | null;
  price_change_count: number | null;
  price_trend: string | null; // 'up' | 'down' | 'stable' | 'new'
  first_seen_at: string | null;
  tracking_since: string | null;
  // joined
  brand_name?: string;
  brand_name_cn?: string;
  brand_tier?: string;
  brand_name_display?: string | null;
  brand_short_name_display?: string | null;
  ship_name_display?: string | null;
  departure_port_display?: string | null;
  destination_display?: string | null;
  destination_id?: string | null;
  perks_display?: string | null;
  perks_raw?: string | null;
}

export interface BrandRow {
  id: string;
  name: string;
  name_cn: string | null;
  brand_group: string;
  website: string;
  deals_url: string | null;
  crawler_type: string;
  is_active: number;
  tier: string;
}

export interface PriceHistoryRow {
  id: number;
  deal_id: string;
  price: number;
  price_currency: string;
  recorded_at: string;
}

export interface BrandSummary {
  id: string;
  name: string;
  name_cn: string | null;
  brand_group: string;
  deal_count: number;
  min_price: number | null;
  avg_price: number | null;
  max_price: number | null;
  currency: string | null;
  tier: string | null;
}

export interface ActiveBrandInfo {
  id: string;
  name: string;
  name_cn: string | null;
  tier: string;
  currency: string;
  deal_count: number;
  scored_count: number;
  cabin_types: string;
}

export interface DestinationSummary {
  id: string | null;
  name: string;
  canonical_name: string | null;
  destination: string;
  count: number;
  min_price: number;
  avg_price: number;
}

export interface SearchFilters {
  brand?: string;
  locale?: 'zh-CN' | 'en' | string;
  destinationId?: string;
  destination?: string;
  departurePort?: string;
  arrivalPort?: string;
  itineraryIncludes?: string[];
  itineraryExcludes?: string[];
  priceMin?: number;
  priceMax?: number;
  sailDateFrom?: string;
  sailDateTo?: string;
  durationMin?: number;
  durationMax?: number;
  cabinType?: string;
  roundtrip?: boolean;
  routeRegion?: 'aegean' | 'eastern_mediterranean' | 'western_mediterranean';
  priceTrend?: string; // 'up' | 'down' | 'stable' | 'new'
  tier?: string | string[]; // 'budget' | 'standard' | 'premium' | 'luxury' (或数组)
  minScore?: number;
  sortBy?: 'price' | 'sail_date' | 'duration_days' | 'deal_score' | 'price_change_count';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export interface SearchDealsResult {
  totalMatches: number;
  deals: DealRow[];
}

export interface TrackingStats {
  tracked_deals: number;
  total_snapshots: number;
  changed_deals: number;
  trends: Record<string, number>;
  top_drops: TopDrop[];
}

export interface TopDrop {
  id: string;
  brand_id: string;
  deal_name: string;
  ship_name: string | null;
  ship_id?: string | null;
  destination: string | null;
  primary_destination_term_id?: string | null;
  price: number;
  price_currency: string;
  price_highest: number;
  price_lowest: number;
  drop_pct: number;
  deal_score: number | null;
  cabin_type: string | null;
  duration_days: number | null;
  sail_date: string | null;
  price_trend: string | null;
  deal_url: string | null;
  perks: string | null;
  brand_name?: string;
  brand_name_cn?: string;
  brand_tier?: string;
  brand_name_display?: string | null;
  brand_short_name_display?: string | null;
  ship_name_display?: string | null;
  departure_port_display?: string | null;
  destination_display?: string | null;
  destination_id?: string | null;
  perks_display?: string | null;
  perks_raw?: string | null;
}
