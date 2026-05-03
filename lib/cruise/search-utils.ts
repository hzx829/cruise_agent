import type { DealRow } from '@/lib/db/types';

export type RouteRegion =
  | 'aegean'
  | 'eastern_mediterranean'
  | 'western_mediterranean';

const LOCATION_ALIAS_GROUPS = [
  ['shanghai', 'sha', 'shanghai china', '上海', '上海中国', '吴淞口', '宝山', 'wusongkou', 'baoshan'],
  ['hong kong', 'hongkong', 'hkg', 'hong kong china', '香港', '香港中国', '启德', 'kai tak'],
  ['tianjin', 'xingang', 'tianjin china', '天津', '天津中国', '新港'],
  ['xiamen', 'xiamen china', 'amoy', '厦门', '厦门中国'],
  ['shenzhen', 'shenzhen china', '深圳', '深圳中国'],
  ['jeju', 'cju', 'jeju island', '济州', '济州岛'],
  ['busan', 'pusan', '釜山'],
  ['seoul', 'incheon', 'icn', '首尔', '仁川'],
  ['okinawa', 'naha', 'oka', '冲绳', '那霸'],
  ['fukuoka', 'fuk', '福冈'],
  ['nagasaki', 'ngs', '长崎'],
  ['kagoshima', 'koj', '鹿儿岛'],
  ['sakaiminato', '境港'],
  ['kyoto', 'maizuru', '京都', '舞鹤'],
  ['hakodate', '函馆'],
  ['sapporo', 'muroran', '札幌', '室兰'],
  ['tokyo', 'yokohama', 'tyo', 'nrt', 'hnd', '东京', '横滨'],
  ['osaka', 'kobe', 'kix', '大阪', '神户'],
  ['athens', 'piraeus', 'pir', 'ath', '雅典', '比雷埃夫斯'],
  ['santorini', 'jtr', '圣托里尼'],
  ['mykonos', 'jmk', '米科诺斯'],
  ['istanbul', 'ist', '伊斯坦布尔'],
  ['ravenna', 'rav', '拉文纳'],
  ['rome', 'civitavecchia', 'civ', 'rom', '罗马'],
  ['venice', 'trieste', 'chioggia', 'fusina', '威尼斯'],
  ['kusadasi', 'kus', 'adb', '库萨达斯'],
  ['rhodes', 'rho', '罗得岛'],
  ['crete', 'chania', 'heraklion', 'her', '克里特'],
  ['corfu', 'cfu', '科孚'],
  ['kotor', 'kot', '科托尔'],
  ['dubrovnik', 'dbv', '杜布罗夫尼克'],
  ['split', 'spu', '斯普利特'],
  ['zadar', 'zad', '扎达尔'],
  ['barcelona', 'bcn', '巴塞罗那'],
  ['naples', 'nap', '那不勒斯'],
  ['livorno', 'liv', '利沃诺'],
  ['mallorca', 'palma', 'pmi', '马略卡'],
  ['salerno', 'sal', '萨莱诺'],
  ['valletta', 'malta', '瓦莱塔'],
  ['katakolon', 'kak', '卡塔科隆'],
];

const AEGEAN_KEYWORDS = [
  'aegean',
  'greek isles',
  'athens',
  'piraeus',
  'pir',
  'ath',
  'santorini',
  'jtr',
  'mykonos',
  'jmk',
  'rhodes',
  'rho',
  'kusadasi',
  'kus',
  'adb',
  'patmos',
  'crete',
  'chania',
  'heraklion',
  'her',
  'katakolon',
  'kak',
  'syros',
  'hydra',
  'milos',
  'ios',
  'sifnos',
  'tinos',
  'symi',
  'monemvasia',
];

const EASTERN_MED_KEYWORDS = [
  ...AEGEAN_KEYWORDS,
  'eastern mediterranean',
  'adriatic',
  'istanbul',
  'ist',
  'dubrovnik',
  'dbv',
  'kotor',
  'kot',
  'corfu',
  'cfu',
  'split',
  'spu',
  'zadar',
  'zad',
  'ravenna',
  'rav',
  'venice',
  'trieste',
  'croatia',
  'montenegro',
  'slovenia',
  'albania',
  'turkey',
  'greece',
];

const WESTERN_MED_KEYWORDS = [
  'western mediterranean',
  'barcelona',
  'bcn',
  'rome',
  'rom',
  'civitavecchia',
  'civ',
  'naples',
  'nap',
  'livorno',
  'liv',
  'marseille',
  'genoa',
  'mallorca',
  'palma',
  'pmi',
  'ibiza',
  'corsica',
  'valletta',
  'malta',
  'sicily',
  'messina',
  'cartagena',
  'gibraltar',
  'lisbon',
  'florence',
  'pisa',
  'la spezia',
  'salerno',
  'sal',
  'valencia',
];

const CABIN_ALIASES: Record<string, string[]> = {
  interior: ['interior', 'inside', '内舱', '内仓', '内房'],
  oceanview: ['ocean view', 'oceanview', 'outside', 'window', '海景', '海景舱', '海景房', '外舱'],
  balcony: ['balcony', 'verandah', 'veranda', '阳台', '阳台舱', '阳台房'],
  'mini-suite': ['mini suite', 'mini-suite', '迷你套房'],
  suite: [
    'suite',
    'penthouse',
    'owners suite',
    'signature suite',
    'neptune suite',
    'yacht club',
    '套房',
    '游艇会',
  ],
  haven: ['haven'],
};

const CABIN_PRIORITY: Record<string, number> = {
  interior: 1,
  oceanview: 2,
  balcony: 3,
  'mini-suite': 4,
  suite: 5,
  haven: 6,
  unknown: 99,
};

export function normalizeSearchText(value?: string | null): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value?: string | null): Set<string> {
  return new Set(normalizeSearchText(value).split(' ').filter(Boolean));
}

function hasAlias(normalizedText: string, tokens: Set<string>, alias: string): boolean {
  return alias.length <= 3 ? tokens.has(alias) : normalizedText.includes(alias);
}

function expandAliases(term: string, groups: string[][]): string[] {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) return [];

  const termTokens = tokenize(term);

  for (const group of groups) {
    if (
      group.some(
        (alias) =>
          hasAlias(normalizedTerm, termTokens, alias) ||
          normalizedTerm.includes(alias) ||
          alias.includes(normalizedTerm)
      )
    ) {
      return Array.from(new Set([...group, normalizedTerm]));
    }
  }

  return [normalizedTerm];
}

export function matchesLocation(value: string | null | undefined, term: string): boolean {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue) return false;

  const aliases = expandAliases(term, LOCATION_ALIAS_GROUPS);
  const tokens = tokenize(value);
  return aliases.some((alias) => hasAlias(normalizedValue, tokens, alias));
}

export function getItineraryStops(itinerary?: string | null): string[] {
  if (!itinerary) return [];

  const trimmed = itinerary.trim();
  const roundtripMatch = /^roundtrip\s+(.+)$/i.exec(trimmed);
  if (roundtripMatch) {
    return [roundtripMatch[1].trim()];
  }

  if (trimmed.includes('→')) {
    return trimmed
      .split('→')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  if (trimmed.includes('->')) {
    return trimmed
      .split('->')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  if (/\s+to\s+/i.test(trimmed)) {
    return trimmed
      .split(/\s+to\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [trimmed];
}

export function getStructuredRouteStops(
  deal: Pick<DealRow, 'route_stops_display' | 'itinerary'>
): string[] {
  if (deal.route_stops_display) {
    try {
      const parsed = JSON.parse(deal.route_stops_display);
      if (Array.isArray(parsed)) {
        const stops = parsed
          .map((item) => String(item?.portName ?? '').trim())
          .filter(Boolean);
        if (stops.length > 0) return stops;
      }
    } catch {
      // Fall through to the raw itinerary parser.
    }
  }

  return getItineraryStops(deal.itinerary);
}

export function getRouteEndpoints(
  deal: Pick<DealRow, 'departure_port' | 'itinerary' | 'route_stops_display'>
): {
  startPort: string | null;
  endPort: string | null;
} {
  const stops = getStructuredRouteStops(deal);
  const startPort = deal.departure_port ?? stops[0] ?? null;

  if (stops.length === 0 && !deal.itinerary) {
    return { startPort, endPort: null };
  }

  if (deal.itinerary && /^roundtrip\b/i.test(deal.itinerary.trim())) {
    return { startPort, endPort: startPort };
  }

  const endPort = stops.length > 0 ? stops[stops.length - 1] : null;
  return { startPort, endPort };
}

export function isEquivalentLocation(a?: string | null, b?: string | null): boolean {
  const normalizedA = normalizeSearchText(a);
  const normalizedB = normalizeSearchText(b);

  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return true;
  }

  const aliasesA = expandAliases(normalizedA, LOCATION_ALIAS_GROUPS);
  const aliasesB = expandAliases(normalizedB, LOCATION_ALIAS_GROUPS);
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  return (
    aliasesA.some((alias) => hasAlias(normalizedB, tokensB, alias)) ||
    aliasesB.some((alias) => hasAlias(normalizedA, tokensA, alias))
  );
}

function countKeywordMatches(text: string, keywords: string[]): number {
  const tokens = tokenize(text);
  return new Set(keywords.filter((keyword) => hasAlias(text, tokens, keyword))).size;
}

export function matchesRouteRegion(
  deal: Pick<
    DealRow,
    'deal_name' | 'destination' | 'departure_port' | 'itinerary' | 'route_stops_display'
  >,
  region: RouteRegion
): boolean {
  const routeStopsText = getStructuredRouteStops(deal).join(' ');
  const searchableText = normalizeSearchText(
    [
      deal.deal_name,
      deal.destination,
      deal.departure_port,
      deal.itinerary,
      routeStopsText,
    ].join(' ')
  );
  if (!searchableText) return false;

  const { startPort, endPort } = getRouteEndpoints(deal);
  const endpointText = normalizeSearchText([startPort, endPort].join(' '));
  const aegeanCount = countKeywordMatches(searchableText, AEGEAN_KEYWORDS);
  const eastCount = countKeywordMatches(searchableText, EASTERN_MED_KEYWORDS);
  const westCount = countKeywordMatches(searchableText, WESTERN_MED_KEYWORDS);
  const endpointEastCount = countKeywordMatches(endpointText, EASTERN_MED_KEYWORDS);
  const endpointWestCount = countKeywordMatches(endpointText, WESTERN_MED_KEYWORDS);

  switch (region) {
    case 'aegean': {
      const pureAegean =
        aegeanCount >= 3 &&
        westCount <= 2 &&
        endpointWestCount === 0;

      return (
        (searchableText.includes('aegean') && endpointWestCount === 0) ||
        (searchableText.includes('greek isles') && pureAegean) ||
        (pureAegean && aegeanCount > westCount)
      );
    }
    case 'eastern_mediterranean':
      return (
        searchableText.includes('eastern mediterranean') ||
        matchesRouteRegion(deal, 'aegean') ||
        (
          eastCount >= 4 &&
          eastCount > westCount &&
          endpointEastCount >= endpointWestCount
        )
      );
    case 'western_mediterranean':
      return (
        searchableText.includes('western mediterranean') ||
        (
          westCount >= 3 &&
          westCount > eastCount &&
          endpointWestCount >= endpointEastCount
        )
      );
    default:
      return false;
  }
}

export function canonicalizeCabinType(value?: string | null): string {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue) return 'unknown';

  if (normalizedValue.includes('haven')) return 'haven';
  if (
    normalizedValue.includes('mini suite') ||
    normalizedValue.includes('迷你套房')
  ) {
    return 'mini-suite';
  }
  if (
    normalizedValue.includes('ocean view') ||
    normalizedValue.includes('oceanview') ||
    normalizedValue.includes('outside') ||
    normalizedValue.includes('window') ||
    normalizedValue.includes('海景') ||
    normalizedValue.includes('外舱')
  ) {
    return 'oceanview';
  }
  if (
    normalizedValue.includes('balcony') ||
    normalizedValue.includes('veranda') ||
    normalizedValue.includes('阳台')
  ) {
    return 'balcony';
  }
  if (
    normalizedValue.includes('interior') ||
    normalizedValue.includes('inside') ||
    normalizedValue.includes('内舱') ||
    normalizedValue.includes('内仓') ||
    normalizedValue.includes('内房')
  ) {
    return 'interior';
  }
  if (
    normalizedValue.includes('suite') ||
    normalizedValue.includes('yacht club') ||
    normalizedValue.includes('套房') ||
    normalizedValue.includes('游艇会')
  ) {
    return 'suite';
  }

  return 'unknown';
}

export function matchesCabinType(value: string | null | undefined, requestedType: string): boolean {
  const requested = normalizeSearchText(requestedType);
  if (!requested) return true;

  const requestedCanonical = canonicalizeCabinType(requested);
  const actualCanonical = canonicalizeCabinType(value);

  if (requestedCanonical !== 'unknown') {
    return actualCanonical === requestedCanonical;
  }

  const aliases = Object.entries(CABIN_ALIASES).find(([, aliasList]) =>
    aliasList.some((alias) => requested.includes(alias))
  );

  if (aliases) {
    return actualCanonical === aliases[0];
  }

  return normalizeSearchText(value).includes(requested);
}

export function compareCabinPriority(a?: string | null, b?: string | null): number {
  return (
    (CABIN_PRIORITY[canonicalizeCabinType(a)] ?? CABIN_PRIORITY.unknown) -
    (CABIN_PRIORITY[canonicalizeCabinType(b)] ?? CABIN_PRIORITY.unknown)
  );
}

export function buildRouteLabel(
  deal: Pick<DealRow, 'departure_port' | 'itinerary' | 'route_stops_display'>
): { routeLabel: string | null; routeType: 'roundtrip' | 'open_jaw' | null } {
  const stops = getStructuredRouteStops(deal);
  const { startPort, endPort } = getRouteEndpoints(deal);

  if (!startPort) {
    return { routeLabel: null, routeType: null };
  }

  if (stops.length > 2) {
    return {
      routeLabel: stops.join(' → '),
      routeType: isEquivalentLocation(stops[0], stops[stops.length - 1])
        ? 'roundtrip'
        : 'open_jaw',
    };
  }

  if (isEquivalentLocation(startPort, endPort)) {
    return {
      routeLabel: `${startPort} 往返`,
      routeType: 'roundtrip',
    };
  }

  if (endPort) {
    return {
      routeLabel: `${startPort} → ${endPort}`,
      routeType: 'open_jaw',
    };
  }

  return {
    routeLabel: startPort,
    routeType: null,
  };
}
