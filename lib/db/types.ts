export interface DealRow {
  id: string;
  brand_id: string;
  deal_name: string;
  deal_url: string | null;
  ship_name: string | null;
  departure_port: string | null;
  destination: string | null;
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
  deal_score: number | null;
  // joined
  brand_name?: string;
  brand_name_cn?: string;
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
}

export interface DestinationSummary {
  destination: string;
  count: number;
  min_price: number;
  avg_price: number;
}

export interface SearchFilters {
  brand?: string;
  destination?: string;
  priceMin?: number;
  priceMax?: number;
  sailDateFrom?: string;
  sailDateTo?: string;
  durationMin?: number;
  durationMax?: number;
  cabinType?: string;
  sortBy?: 'price' | 'sail_date' | 'duration_days' | 'deal_score';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}
