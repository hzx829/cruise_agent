export type CruiseIntent =
  | 'price_quote'
  | 'market_supply'
  | 'review'
  | 'comparison'
  | 'copywriting'
  | 'analytics'
  | 'general';

export interface CruiseHardConstraints {
  departurePort?: string;
  brand?: string;
  dateRange?: string;
  roundtrip?: boolean;
  itineraryIncludes?: string[];
  excludedTerms?: string[];
}

export interface CruiseIntentContext {
  intent: CruiseIntent;
  hardConstraints: CruiseHardConstraints;
  allowRelaxation: boolean;
  needsWeb: boolean;
  disableWeb: boolean;
  explicitNetworkRequest: boolean;
  originalQuery: string;
}

const PORT_PATTERNS: Array<[RegExp, string]> = [
  [/天津港|天津/i, '天津港'],
  [/上海港|上海/i, '上海'],
  [/香港|启德/i, '香港'],
  [/厦门/i, '厦门'],
  [/深圳/i, '深圳'],
  [/广州|南沙/i, '广州南沙'],
  [/新加坡/i, '新加坡'],
  [/东京|横滨/i, '东京/横滨'],
  [/雅典|比雷埃夫斯|piraeus|athens/i, '雅典/比雷埃夫斯'],
  [/罗马|奇维塔韦基亚|civitavecchia|rome/i, '罗马/奇维塔韦基亚'],
  [/巴塞罗那|barcelona/i, '巴塞罗那'],
  [/迈阿密|miami/i, '迈阿密'],
];

const BRAND_PATTERNS: Array<[RegExp, string]> = [
  [/皇家加勒比|皇家|royal caribbean|rccl/i, '皇家加勒比'],
  [/msc|地中海邮轮/i, 'MSC'],
  [/诺唯真|挪威邮轮|ncl|norwegian/i, '诺唯真'],
  [/公主邮轮|公主|princess/i, '公主邮轮'],
  [/精致邮轮|精致|celebrity/i, '精致邮轮'],
  [/嘉年华|carnival/i, '嘉年华'],
  [/迪士尼|disney/i, '迪士尼邮轮'],
  [/荷美|holland america/i, '荷美邮轮'],
  [/歌诗达|costa/i, '歌诗达'],
  [/银海|silversea/i, '银海'],
  [/庞洛|ponant/i, '庞洛'],
  [/维京|viking/i, '维京'],
];

const ITINERARY_PATTERNS: Array<[RegExp, string]> = [
  [/圣托里尼|santorini/i, '圣托里尼'],
  [/米科诺斯|mykonos/i, '米科诺斯'],
  [/济州|jeju/i, '济州'],
  [/冲绳|okinawa/i, '冲绳'],
  [/福冈|fukuoka/i, '福冈'],
  [/那霸|naha/i, '那霸'],
];

const EXCLUSION_PATTERNS: Array<[RegExp, string]> = [
  [/不要上海|不看上海|排除上海/i, '上海'],
  [/不要开口|不看开口|排除开口/i, '开口航线'],
  [/不要联网|不用联网|别联网|只看.*(价格源|直连|接入)/i, '网络搜索'],
];

function findFirstMatch(
  query: string,
  patterns: Array<[RegExp, string]>,
): string | undefined {
  return patterns.find(([pattern]) => pattern.test(query))?.[1];
}

function findAllMatches(
  query: string,
  patterns: Array<[RegExp, string]>,
): string[] {
  return patterns
    .filter(([pattern]) => pattern.test(query))
    .map(([, value]) => value);
}

function detectDateRange(query: string): string | undefined {
  const yearMatch = query.match(/20\d{2}/);

  if (/暑假|暑期|夏天|summer/i.test(query)) {
    return yearMatch ? `${yearMatch[0]} 暑假` : '暑假';
  }
  if (/寒假|春节|过年|winter/i.test(query)) {
    return yearMatch ? `${yearMatch[0]} 寒假/春节` : '寒假/春节';
  }
  if (/五一|劳动节/i.test(query)) return yearMatch ? `${yearMatch[0]} 五一` : '五一';
  if (/国庆|十一/i.test(query)) return yearMatch ? `${yearMatch[0]} 国庆` : '国庆';
  if (/今年/i.test(query)) return '今年';
  if (/明年/i.test(query)) return '明年';
  if (yearMatch) return yearMatch[0];

  const monthMatch = query.match(/(1[0-2]|0?[1-9])\s*月/);
  return monthMatch?.[0].replace(/\s+/g, '');
}

function detectIntent(query: string): CruiseIntent {
  const asksCopywriting = /文案|小红书|朋友圈|海报|推广|种草|标题|卖点/i.test(query);
  if (asksCopywriting) return 'copywriting';

  const asksAnalytics = /统计|分布|趋势|图表|报表|分析|概览|top|排行/i.test(query);
  if (asksAnalytics) return 'analytics';

  const asksPrice = /价格|报价|多少钱|便宜|最便宜|特价|优惠|折扣|降价|涨价|比价|deal/i.test(query);
  const asksSupply = /有没有|有船|有哪些|班期|航线|母港|出发|靠港|邮轮信息|供给/i.test(query);
  const asksReview = /评测|口碑|餐饮|设施|娱乐|服务|体验|攻略|怎么玩|怎么样|好不好|值不值得|值得买/i.test(query);
  const asksComparison = /对比|比较|哪个|哪家|vs|和.*比/i.test(query);

  if (asksSupply && !asksPrice) return 'market_supply';
  if (asksPrice) return 'price_quote';
  if (asksComparison) return 'comparison';
  if (asksReview) return 'review';

  return 'general';
}

export function detectCruiseIntent(query: string): CruiseIntentContext {
  const normalizedQuery = query.trim();
  const intent = detectIntent(normalizedQuery);
  const excludedTerms = findAllMatches(normalizedQuery, EXCLUSION_PATTERNS);
  const disableWeb = excludedTerms.includes('网络搜索');
  const explicitNetworkRequest = /联网|网络|网上|最新|公开信息|官网|官方入口/i.test(
    normalizedQuery,
  );

  return {
    intent,
    hardConstraints: {
      departurePort: findFirstMatch(normalizedQuery, PORT_PATTERNS),
      brand: findFirstMatch(normalizedQuery, BRAND_PATTERNS),
      dateRange: detectDateRange(normalizedQuery),
      roundtrip: /往返|闭环|回到出发港/i.test(normalizedQuery),
      itineraryIncludes: findAllMatches(normalizedQuery, ITINERARY_PATTERNS),
      excludedTerms: excludedTerms.length ? excludedTerms : undefined,
    },
    allowRelaxation:
      /也可以|都可以|附近也行|替代|备选|放宽|不限|随便|推荐其他/i.test(
        normalizedQuery,
      ),
    needsWeb:
      !disableWeb &&
      (explicitNetworkRequest ||
        intent === 'market_supply' ||
        intent === 'review' ||
        intent === 'comparison'),
    disableWeb,
    explicitNetworkRequest,
    originalQuery: normalizedQuery,
  };
}

export function formatIntentContextForPrompt(
  context: CruiseIntentContext,
): string {
  const constraints = Object.entries(context.hardConstraints)
    .filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value != null && value !== false;
    })
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join('; ');

  return `## 本轮意图与硬约束提示

- detectedIntent: ${context.intent}
- hardConstraints: ${constraints || '未检测到明确硬约束'}
- allowRelaxation: ${context.allowRelaxation ? 'true' : 'false'}
- needsWeb: ${context.needsWeb ? 'true' : 'false'}
- disableWeb: ${context.disableWeb ? 'true' : 'false'}
- 执行要求：优先保持 hardConstraints；allowRelaxation=false 时不要主动给放宽条件备选；disableWeb=true 时不要调用 webSearch/cruiseEncyclopedia。`;
}
