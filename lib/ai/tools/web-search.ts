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
}

async function tavilySearch(params: {
  query: string;
  searchDepth?: 'basic' | 'advanced';
  maxResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
}): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { query: params.query, results: [] };
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: params.query,
      search_depth: params.searchDepth ?? 'basic',
      max_results: Math.min(params.maxResults ?? 5, 10),
      include_domains: params.includeDomains,
      exclude_domains: params.excludeDomains,
      include_answer: true,
    }),
  });

  if (!response.ok) {
    console.error(`[webSearch] Tavily API error: ${response.status} ${response.statusText}`);
    return { query: params.query, results: [] };
  }

  return response.json() as Promise<TavilyResponse>;
}

/**
 * 通用网络搜索工具
 * 用于回答非价格类的开放性邮轮问题
 *
 * ⚠️ 严禁用于查询价格 — 价格数据只能来自爬虫数据库
 */
export const webSearch = tool({
  description: `在互联网上搜索邮轮相关信息。
适用于回答以下类型的问题：
- 邮轮品牌评测、船只设施、餐饮风格、娱乐活动
- 目的地攻略、最佳旅游季节、港口周边玩法
- 两艘船/两个品牌的非价格维度对比
- 邮轮行业新闻、航线调整、政策变化
- 穿搭建议、登船须知、晕船应对
- 邮轮术语解释、新手入门知识

⚠️ 严禁用此工具查询价格、报价、特价、折扣等！
   价格信息必须使用 searchDeals、getTopPriceDrops 等数据库工具。`,
  inputSchema: z.object({
    query: z.string().describe('搜索关键词。建议使用英文或中英混合，以获取更丰富的结果。例如："Royal Caribbean vs MSC dining experience"'),
    searchDepth: z
      .enum(['basic', 'advanced'])
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
      .describe('搜索偏向。review=评测类, travel=旅行攻略, news=行业新闻, general=通用'),
  }),
  execute: async ({ query, searchDepth, maxResults, focusDomain }) => {
    // 根据 focusDomain 选择限定域名
    const domainMap: Record<string, string[]> = {
      review: ['cruisecritic.com', 'cruisemapper.com', 'cruisehive.com'],
      travel: ['lonelyplanet.com', 'tripadvisor.com', 'travel.com'],
      news: ['seatrade-cruise.com', 'travelweekly.com', 'cruiseindustrynews.com'],
      general: [],
    };
    const includeDomains = focusDomain && focusDomain !== 'general'
      ? domainMap[focusDomain]
      : undefined;

    const data = await tavilySearch({
      query,
      searchDepth: searchDepth ?? 'basic',
      maxResults: maxResults ?? 5,
      includeDomains,
    });

    if (!process.env.TAVILY_API_KEY) {
      return {
        available: false,
        message: '网络搜索功能未配置。请在 .env.local 中设置 TAVILY_API_KEY。',
        results: [],
      };
    }

    return {
      available: true,
      query: data.query,
      summary: data.answer ?? null,
      results: data.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.slice(0, 600) ?? '',
        publishedDate: r.published_date ?? null,
        relevanceScore: Math.round((r.score ?? 0) * 100) / 100,
      })),
      resultCount: data.results.length,
      dataSource: 'web_search',
      disclaimer: '以上信息来自互联网，仅供参考，请以官方信息为准',
    };
  },
});
