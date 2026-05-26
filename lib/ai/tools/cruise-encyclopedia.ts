import { tool } from 'ai';
import { z } from 'zod';

/**
 * 权威邮轮评测网站列表
 * 限定在这些专业域名内搜索，保证信息的专业性和可靠性
 */
const CRUISE_EXPERT_DOMAINS = [
  'cruisecritic.com',       // 全球最大邮轮评测平台
  'cruisemapper.com',       // 船只技术参数数据库
  'cruisehive.com',         // 邮轮攻略和评测
  'royalcaribbeanblog.com', // 皇家加勒比专题博客
  'the-suitcase.com',       // 奢华邮轮评测
  'seatrade-cruise.com',    // 邮轮行业媒体
];

const TOPIC_QUERY_HINTS: Record<string, string> = {
  ship_specs: 'ship specifications deck plan tonnage capacity',
  brand_review: 'review dining service cabins pros cons',
  onboard_life: 'onboard dining entertainment activities service review',
  destination: 'port destination cruise itinerary guide',
  industry: 'cruise industry news deployment market',
  general: '',
};

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  answer?: string;
  results: TavilyResult[];
  usage?: {
    credits?: number;
  };
  response_time?: string | number;
}

type TavilySearchDepth = 'basic' | 'advanced' | 'fast' | 'ultra-fast';

const DEFAULT_TAVILY_TIMEOUT_MS = 8_000;
const TAVILY_CACHE_TTL_MS = 10 * 60 * 1000;
const TAVILY_CACHE_MAX_ENTRIES = 100;
const tavilyCache = new Map<
  string,
  { expiresAt: number; data: TavilyResponse }
>();

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

function chooseEncyclopediaDepth(): TavilySearchDepth {
  if (process.env.ALLOW_ADVANCED_WEB_SEARCH === 'true') {
    return 'advanced';
  }
  const defaultDepth = getDefaultSearchDepth();
  return defaultDepth === 'advanced' ? 'fast' : defaultDepth;
}

async function tavilySearchDomain(params: {
  query: string;
  domains: string[];
}): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { results: [] };
  }

  const body = {
    query: params.query,
    search_depth: chooseEncyclopediaDepth(),
    max_results: 4,
    include_domains: params.domains,
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
      console.error(`[cruiseEncyclopedia] Tavily API error: ${response.status}`);
      return { results: [] };
    }

    const data = (await response.json()) as TavilyResponse;
    rememberTavilyResponse(cacheKey, data);
    return data;
  } catch (error) {
    console.error('[cruiseEncyclopedia] Tavily request failed', error);
    return { results: [] };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 邮轮专业百科搜索工具
 *
 * 相比 webSearch，限定在权威邮轮网站内搜索，信息更专业可靠。
 * 适合需要精准行业知识的场景。
 */
export const cruiseEncyclopedia = tool({
  description: `从专业邮轮网站（CruiseCritic、CruiseMapper 等）搜索权威百科信息。

比 webSearch 更精准，因为只在权威邮轮专业网站中搜索。适用于：
- 船只规格：下水年份、总吨位、载客量、船长
- 品牌深度评测：服务风格、餐饮档次、适合人群、优缺点
- 设施详情：泳池数量、餐厅种类、儿童设施、无障碍设施
- 船只翻新历史、重大改造信息
- 品牌标志性服务（如 Haven 套房、O'Life 选项、TUI Cruises 全包模式）

⚠️ 同样严禁用于查询价格！`,
  inputSchema: z.object({
    query: z.string().describe('搜索关键词，建议英文，如 "MSC Grandiosa ship specs" 或 "Norwegian Haven suite review"'),
    topic: z
      .enum([
        'ship_specs',      // 船只技术规格
        'brand_review',    // 品牌/船只评测
        'onboard_life',    // 船上生活体验
        'destination',     // 目的地/港口信息
        'industry',        // 行业动态
        'general',         // 通用
      ])
      .optional()
      .describe('搜索主题，帮助优化搜索结果'),
    shipOrBrand: z
      .string()
      .optional()
      .describe('指定的船只名或品牌名，会自动加入搜索关键词，如 "MSC Seashore" 或 "Celebrity Cruises"'),
  }),
  execute: async ({ query, topic, shipOrBrand }) => {
    if (!process.env.TAVILY_API_KEY) {
      return {
        available: false,
        message: '邮轮百科功能未配置。请在 .env.local 中设置 TAVILY_API_KEY。',
        results: [],
      };
    }

    // 自动拼接船名/品牌名
    const topicHint = topic ? TOPIC_QUERY_HINTS[topic] : '';
    const fullQuery = [shipOrBrand ?? 'cruise', query, topicHint]
      .filter(Boolean)
      .join(' ');

    const data = await tavilySearchDomain({
      query: fullQuery,
      domains: CRUISE_EXPERT_DOMAINS,
    });

    return {
      available: true,
      query: fullQuery,
      topic: topic ?? 'general',
      summary: data.answer ?? null,
      usage: data.usage ?? null,
      responseTime: data.response_time ?? null,
      results: data.results.map((r) => ({
        title: r.title,
        url: r.url,
        source: (() => {
          try {
            return new URL(r.url).hostname.replace('www.', '');
          } catch {
            return r.url;
          }
        })(),
        snippet: r.content?.slice(0, 320) ?? '',
        relevanceScore: Math.round((r.score ?? 0) * 100) / 100,
      })),
      resultCount: data.results.length,
      expertSources: CRUISE_EXPERT_DOMAINS,
      dataSource: 'cruise_encyclopedia',
      disclaimer: '信息来自专业邮轮评测网站，仅供参考，具体以官方公布为准',
    };
  },
});
