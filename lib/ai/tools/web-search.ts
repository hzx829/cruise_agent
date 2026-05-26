import { tool } from 'ai';
import { z } from 'zod';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  answer?: string;
  results: TavilyResult[];
  query: string;
  usage?: {
    credits?: number;
  };
  response_time?: string | number;
}

type TavilySearchDepth = 'basic' | 'advanced' | 'fast' | 'ultra-fast';

type SearchPurpose =
  | 'official_schedule'
  | 'market_supply'
  | 'review'
  | 'travel'
  | 'news'
  | 'general';

type SourcePreference =
  | 'official_first'
  | 'professional_first'
  | 'general';

type WebSourceType =
  | 'official_cruise_line'
  | 'official_port'
  | 'ota'
  | 'industry_media'
  | 'review_site'
  | 'general_web';

const DEFAULT_TAVILY_TIMEOUT_MS = 8_000;
const TAVILY_CACHE_TTL_MS = 10 * 60 * 1000;
const TAVILY_CACHE_MAX_ENTRIES = 100;
const tavilyCache = new Map<
  string,
  { expiresAt: number; data: TavilyResponse }
>();

const OFFICIAL_CRUISE_DOMAINS = [
  'royalcaribbean.com',
  'msccruises.com',
  'msccruises.com.cn',
  'ncl.com',
  'princess.com',
  'carnival.com',
  'celebritycruises.com',
  'hollandamerica.com',
  'costacruises.com',
  'silversea.com',
  'disneycruise.disney.go.com',
  'vikingcruises.com',
  'ponant.com',
  'rssc.com',
  'oceaniacruises.com',
  'azamara.com',
  'virginvoyages.com',
];

const OFFICIAL_PORT_DOMAINS = [
  'portshanghai.com.cn',
  'hkcruise.com',
  'kaitakcruiseterminal.com.hk',
  'marina-bay.sg',
  'singaporecruise.com.sg',
  'porteverglades.net',
  'portmiami.biz',
  'portcanaveral.com',
  'portseattle.org',
];

const OTA_DOMAINS = [
  'vacationstogo.com',
  'cruise.com',
  'cruises.com',
  'icruise.com',
  'cruisedirect.com',
  'expedia.com',
  'ctrip.com',
  'trip.com',
  'travelocity.com',
];

const INDUSTRY_MEDIA_DOMAINS = [
  'seatrade-cruise.com',
  'cruiseindustrynews.com',
  'travelweekly.com',
  'cruisehive.com',
];

const REVIEW_SITE_DOMAINS = [
  'cruisecritic.com',
  'cruisemapper.com',
  'tripadvisor.com',
  'reddit.com',
];

function normalizeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function domainMatches(domain: string, candidates: string[]): boolean {
  return candidates.some(
    (candidate) => domain === candidate || domain.endsWith(`.${candidate}`)
  );
}

function classifySourceType(url: string): WebSourceType {
  const domain = normalizeDomain(url);

  if (domainMatches(domain, OFFICIAL_CRUISE_DOMAINS)) {
    return 'official_cruise_line';
  }

  if (domainMatches(domain, OFFICIAL_PORT_DOMAINS)) {
    return 'official_port';
  }

  if (domainMatches(domain, OTA_DOMAINS)) {
    return 'ota';
  }

  if (domainMatches(domain, INDUSTRY_MEDIA_DOMAINS)) {
    return 'industry_media';
  }

  if (domainMatches(domain, REVIEW_SITE_DOMAINS)) {
    return 'review_site';
  }

  return 'general_web';
}

function quoteSearchTerm(term: string): string {
  const trimmed = term.trim();
  if (!trimmed) return '';
  return /\s/.test(trimmed) ? `"${trimmed.replace(/"/g, '')}"` : trimmed;
}

function buildFocusedQuery(params: {
  query: string;
  purpose: SearchPurpose;
  sourcePreference: SourcePreference;
  mustIncludeTerms?: string[];
}): string {
  const additions: string[] = [];

  if (params.purpose === 'official_schedule') {
    additions.push('official cruise schedule departures port');
  } else if (params.purpose === 'market_supply') {
    additions.push('cruise departures homeport sailings official');
  } else if (params.purpose === 'review') {
    additions.push('review ship experience cruise critic');
  } else if (params.purpose === 'news') {
    additions.push('latest cruise industry news');
  }

  if (params.sourcePreference === 'official_first') {
    additions.push('official site cruise line port authority');
  } else if (params.sourcePreference === 'professional_first') {
    additions.push('cruise industry analysis professional source');
  }

  const requiredTerms = params.mustIncludeTerms
    ?.map(quoteSearchTerm)
    .filter(Boolean);

  const focusedQuery = [
    params.query.trim(),
    ...additions,
    ...(requiredTerms ?? []),
  ].join(' ');

  return focusedQuery.slice(0, 400);
}

function getTavilyTimeoutMs(): number {
  const rawValue = Number(process.env.TAVILY_TIMEOUT_MS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_TAVILY_TIMEOUT_MS;
  }
  return Math.min(Math.max(Math.trunc(rawValue), 2_000), 20_000);
}

function getCachedTavilyResponse(key: string): TavilyResponse | null {
  const cached = tavilyCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    tavilyCache.delete(key);
    return null;
  }
  return cached.data;
}

function rememberTavilyResponse(key: string, data: TavilyResponse): void {
  if (tavilyCache.size >= TAVILY_CACHE_MAX_ENTRIES) {
    const oldestKey = tavilyCache.keys().next().value;
    if (oldestKey) tavilyCache.delete(oldestKey);
  }
  tavilyCache.set(key, {
    data,
    expiresAt: Date.now() + TAVILY_CACHE_TTL_MS,
  });
}

function allowAdvancedWebSearch(): boolean {
  return process.env.ALLOW_ADVANCED_WEB_SEARCH === 'true';
}

function normalizeSearchDepth(value: unknown): TavilySearchDepth | undefined {
  return value === 'basic' ||
    value === 'advanced' ||
    value === 'fast' ||
    value === 'ultra-fast'
    ? value
    : undefined;
}

function getDefaultSearchDepth(): TavilySearchDepth {
  return normalizeSearchDepth(process.env.TAVILY_SEARCH_DEPTH) ?? 'fast';
}

function chooseSearchDepth(
  requestedDepth: TavilySearchDepth | undefined,
): TavilySearchDepth {
  const requested = normalizeSearchDepth(requestedDepth);
  if (requested === 'advanced' && !allowAdvancedWebSearch()) {
    const fallbackDepth = getDefaultSearchDepth();
    return fallbackDepth === 'advanced' ? 'fast' : fallbackDepth;
  }
  return requested ?? getDefaultSearchDepth();
}

async function tavilySearch(params: {
  query: string;
  searchDepth?: TavilySearchDepth;
  maxResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  topic?: 'general' | 'news';
  timeRange?: 'day' | 'week' | 'month' | 'year';
}): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { query: params.query, results: [] };
  }

  const body = {
    query: params.query,
    search_depth: chooseSearchDepth(params.searchDepth),
    max_results: Math.min(params.maxResults ?? 4, 5),
    include_domains: params.includeDomains,
    exclude_domains: params.excludeDomains,
    topic: params.topic,
    time_range: params.timeRange,
    include_answer: true,
    include_usage: true,
  };
  const cacheKey = JSON.stringify(body);
  const cached = getCachedTavilyResponse(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTavilyTimeoutMs());

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[webSearch] Tavily API error: ${response.status} ${response.statusText}`);
      return { query: params.query, results: [] };
    }

    const data = (await response.json()) as TavilyResponse;
    rememberTavilyResponse(cacheKey, data);
    return data;
  } catch (error) {
    console.error('[webSearch] Tavily request failed', error);
    return { query: params.query, results: [] };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 通用网络搜索工具
 * 用于回答开放性邮轮问题，也可在直连价格源没有收录时补充航线供给信息
 *
 * ⚠️ 不作为优先价格源。只有直连价格源无结果/覆盖不足时，才可补充网络参考信息。
 */
export const webSearch = tool({
  description: `在互联网上搜索邮轮相关信息。
适用于回答以下类型的问题：
- 直连价格源没有收录或覆盖不足时，按用户原始港口/品牌/日期约束补充查询邮轮供给、官方班期、母港出发、船司入口或港口公开信息
- 邮轮品牌评测、船只设施、餐饮风格、娱乐活动
- 目的地攻略、最佳旅游季节、港口周边玩法
- 两艘船/两个品牌的非价格维度对比
- 邮轮行业新闻、航线调整、政策变化
- 穿搭建议、登船须知、晕船应对
- 邮轮术语解释、新手入门知识

⚠️ 价格/报价/特价/折扣等问题必须先使用 searchDeals、getTopPriceDrops 等直连价格工具。
   当直连价格源返回 0 条或明显没有覆盖用户指定港口时，可以用此工具做兜底搜索；
   兜底搜索必须保留用户原始约束，结果标注为网络公开信息参考，不要声称是直连实时价格。`,
  inputSchema: z.object({
    query: z.string().describe('搜索关键词。建议使用英文或中英混合，以获取更丰富的结果。例如："Royal Caribbean vs MSC dining experience"'),
    searchDepth: z
      .enum(['basic', 'advanced', 'fast', 'ultra-fast'])
      .optional()
      .describe('搜索深度。basic 速度快，advanced 信息更全面。复杂问题建议 advanced'),
    maxResults: z
      .number()
      .min(1)
      .max(8)
      .optional()
      .describe('返回结果数量，默认 5，最多 8'),
    focusDomain: z
      .enum(['general', 'review', 'travel', 'news'])
      .optional()
      .describe('兼容旧参数：搜索偏向。review=评测类, travel=旅行攻略, news=行业新闻, general=通用'),
    purpose: z
      .enum([
        'official_schedule',
        'market_supply',
        'review',
        'travel',
        'news',
        'general',
      ])
      .optional()
      .describe('搜索目的。official_schedule=官方班期/港口入口，market_supply=市场供给/母港航线，review=评测，travel=攻略，news=新闻，general=通用'),
    preferredDomains: z
      .array(z.string())
      .max(10)
      .optional()
      .describe('优先限定搜索的域名列表，例如 ["msccruises.com.cn", "royalcaribbean.com"]。只有明确需要限定来源时使用'),
    mustIncludeTerms: z
      .array(z.string())
      .max(8)
      .optional()
      .describe('搜索中必须保留的用户硬约束词，如 ["天津港", "MSC", "2026"]。用于避免把原港口/品牌查偏'),
    recency: z
      .enum(['any', 'month', 'year'])
      .optional()
      .describe('时间范围偏好。查最新班期/新闻时可用 month 或 year；默认 any'),
    sourcePreference: z
      .enum(['official_first', 'professional_first', 'general'])
      .optional()
      .describe('来源偏好。official_first 优先官网/港口/船司入口；professional_first 优先行业媒体/专业站；general 不额外偏置'),
  }),
  execute: async ({
    query,
    searchDepth,
    maxResults,
    focusDomain,
    purpose,
    preferredDomains,
    mustIncludeTerms,
    recency,
    sourcePreference,
  }) => {
    const focusPurposeMap: Record<string, SearchPurpose> = {
      general: 'general',
      review: 'review',
      travel: 'travel',
      news: 'news',
    };
    const effectivePurpose =
      purpose ?? focusPurposeMap[focusDomain ?? 'general'] ?? 'general';
    const effectiveSourcePreference =
      sourcePreference ??
      (effectivePurpose === 'official_schedule' ||
      effectivePurpose === 'market_supply'
        ? 'official_first'
        : 'general');
    const focusedQuery = buildFocusedQuery({
      query,
      purpose: effectivePurpose,
      sourcePreference: effectiveSourcePreference,
      mustIncludeTerms,
    });

    // 根据 focusDomain 选择限定域名
    const domainMap: Partial<Record<SearchPurpose, string[]>> = {
      review: ['cruisecritic.com', 'cruisemapper.com', 'cruisehive.com'],
      travel: ['lonelyplanet.com', 'tripadvisor.com', 'travel.com'],
      news: ['seatrade-cruise.com', 'travelweekly.com', 'cruiseindustrynews.com'],
    };
    const includeDomains = preferredDomains?.length
      ? preferredDomains
      : domainMap[effectivePurpose];

    const data = await tavilySearch({
      query: focusedQuery,
      searchDepth,
      maxResults: maxResults ?? 4,
      includeDomains,
      topic: effectivePurpose === 'news' ? 'news' : 'general',
      timeRange: recency === 'any' ? undefined : recency,
    });

    if (!process.env.TAVILY_API_KEY) {
      return {
        available: false,
        message: '网络搜索功能未配置。请在 .env.local 中设置 TAVILY_API_KEY。',
        results: [],
      };
    }

    const sources = data.results.map((r) => {
      const domain = normalizeDomain(r.url);
      return {
        title: r.title,
        url: r.url,
        domain,
        sourceType: classifySourceType(r.url),
        snippet: r.content?.slice(0, 320) ?? '',
        publishedDate: r.published_date ?? null,
        relevanceScore: Math.round((r.score ?? 0) * 100) / 100,
      };
    });

    return {
      available: true,
      query: data.query,
      requestedQuery: query,
      purpose: effectivePurpose,
      sourcePreference: effectiveSourcePreference,
      mustIncludeTerms: mustIncludeTerms ?? [],
      summary: data.answer ?? null,
      usage: data.usage ?? null,
      responseTime: data.response_time ?? null,
      sources,
      results: sources,
      resultCount: data.results.length,
      dataSource: 'web_search',
      disclaimer: '以上信息来自互联网公开页面，仅供参考；价格和班期请以船司、港口或 OTA 最终页面为准',
    };
  },
});
