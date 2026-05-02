import { normalizeSearchText } from './search-utils';

const GENERIC_DESTINATION_WORDS = [
  '航线',
  '航程',
  '路线',
  '邮轮',
  '游轮',
  '目的地',
  '地区',
  '区域',
  'cruise',
  'cruises',
  'route',
  'routes',
  'sailing',
  'sailings',
  'itinerary',
  'itineraries',
];

const DESTINATION_QUERY_ALIASES: {
  aliases: string[];
  searchTerms: string[];
}[] = [
  {
    aliases: ['新加坡', '星加坡', '狮城', 'singapore', 'sin'],
    searchTerms: ['Singapore'],
  },
  {
    aliases: ['亚洲', '亚洲航线', '亚州', 'asia', 'asian', '远东', '东亚', '日韩', '日本韩国'],
    searchTerms: ['Asia'],
  },
  {
    aliases: ['东南亚', 'southeast asia', 'south east asia'],
    searchTerms: ['Asia', 'Southeast Asia'],
  },
  {
    aliases: ['北欧', '北欧航线', 'northern europe', 'baltics', 'british isles'],
    searchTerms: ['Northern Europe', 'Baltics & Northern Europe'],
  },
  {
    aliases: ['地中海', '地中海航线', 'mediterranean'],
    searchTerms: ['Mediterranean'],
  },
  {
    aliases: ['东地中海', 'eastern mediterranean'],
    searchTerms: ['Eastern Mediterranean'],
  },
  {
    aliases: ['西地中海', 'western mediterranean'],
    searchTerms: ['Western Mediterranean'],
  },
  {
    aliases: ['加勒比', '加勒比海', 'caribbean'],
    searchTerms: ['Caribbean'],
  },
  {
    aliases: ['阿拉斯加', 'alaska'],
    searchTerms: ['Alaska'],
  },
  {
    aliases: ['日本', 'japan'],
    searchTerms: ['Japan', 'Asia'],
  },
  {
    aliases: ['韩国', '南韩', 'korea'],
    searchTerms: ['Korea', 'Asia'],
  },
];

const DESTINATION_ZH_FALLBACKS: Record<string, string> = {
  singapore: '新加坡',
  asia: '亚洲',
  'asia & australia': '亚洲与澳洲',
  'northern europe': '北欧',
  'baltics & northern europe': '波罗的海与北欧',
  mediterranean: '地中海',
  'eastern mediterranean': '东地中海',
  'western mediterranean': '西地中海',
  caribbean: '加勒比海',
  alaska: '阿拉斯加',
  bahamas: '巴哈马',
  europe: '欧洲',
  hawaii: '夏威夷',
  australia: '澳洲',
  'south america': '南美',
};

export function isInvalidDestinationId(value?: string | null): boolean {
  if (!value) return false;
  return ['undefined', 'null', 'none', 'nan'].includes(value.trim().toLowerCase());
}

function stripGenericDestinationWords(value: string): string {
  let stripped = value;
  for (const word of GENERIC_DESTINATION_WORDS) {
    stripped = stripped.replaceAll(word, ' ');
  }
  return normalizeSearchText(stripped);
}

function normalizedAliasSet(values: string[]): Set<string> {
  return new Set(values.map((value) => stripGenericDestinationWords(value)).filter(Boolean));
}

export function expandDestinationSearchTerms(destination?: string | null): string[] {
  const normalizedDestination = stripGenericDestinationWords(destination ?? '');
  if (!normalizedDestination) return [];

  const matchedTerms = new Set<string>();
  for (const group of DESTINATION_QUERY_ALIASES) {
    const aliases = normalizedAliasSet(group.aliases);
    const matched = Array.from(aliases).some((alias) => (
      alias === normalizedDestination ||
      alias.includes(normalizedDestination) ||
      normalizedDestination.includes(alias)
    ));

    if (matched) {
      for (const term of group.searchTerms) {
        matchedTerms.add(term);
      }
    }
  }

  if (matchedTerms.size > 0) {
    return Array.from(matchedTerms);
  }

  return [destination?.trim() ?? ''].filter(Boolean);
}

export function getDestinationFallbackName(
  canonicalName?: string | null,
  locale?: string
): string | undefined {
  if (!canonicalName || !locale?.toLowerCase().startsWith('zh')) {
    return undefined;
  }

  return DESTINATION_ZH_FALLBACKS[normalizeSearchText(canonicalName)];
}
