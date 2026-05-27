export const CASES = [
  {
    id: 1,
    query: '天津港有船吗？',
    expectedIntent: 'market_supply',
    requiredTools: ['searchDeals', 'webSearch'],
    requiredInputTerms: { searchDeals: ['天津'], webSearch: ['天津'] },
    forbiddenResponseTerms: ['天津没有船'],
  },
  {
    id: 2,
    query: '天津港暑假最便宜的船',
    expectedIntent: 'price_quote',
    requiredTools: ['searchDeals'],
    requiredInputTerms: { searchDeals: ['天津'] },
    requireWebIfSearchDealsGap: true,
  },
  {
    id: 3,
    query: '不要上海，只看天津港',
    expectedIntent: 'market_supply',
    requiredInputTerms: { searchDeals: ['天津'] },
    forbiddenInputTerms: { webSearch: ['上海'] },
    forbiddenResponseTerms: ['上海出发', '上海母港', '上海港'],
  },
  {
    id: 4,
    query: '上海也可以，天津优先',
    expectedIntent: 'market_supply',
    requiredInputTerms: { searchDeals: ['天津'] },
  },
  {
    id: 5,
    query: '天津港皇家加勒比有吗',
    expectedIntent: 'market_supply',
    requiredTools: ['searchDeals'],
    requiredInputTerms: { searchDeals: ['天津', '皇家'] },
    requireWebIfSearchDealsGap: true,
  },
  {
    id: 6,
    query: 'MSC 中国母港有哪些',
    expectedIntent: 'market_supply',
    requiredTools: ['webSearch'],
    requiredInputTerms: { webSearch: ['MSC', '中国'] },
  },
  {
    id: 7,
    query: '雅典往返，不要开口',
    requiredTools: ['searchDeals'],
    requiredInputTerms: { searchDeals: ['雅典', 'true'] },
  },
  {
    id: 8,
    query: '经停圣托里尼',
    requiredTools: ['searchDeals'],
    requiredInputTerms: { searchDeals: ['圣托里尼'] },
  },
  {
    id: 9,
    query: '皇家和 MSC 餐饮哪个好',
    expectedIntent: 'comparison',
    requiredAnyTool: ['webSearch', 'cruiseEncyclopedia'],
    forbiddenTools: ['searchDeals'],
  },
  {
    id: 10,
    query: '这条 deal 值得买吗',
    requiredAnyTool: ['searchDeals', 'getPriceHistory', 'webSearch', 'cruiseEncyclopedia'],
  },
  {
    id: 11,
    query: '不要联网，只看你接入的价格源',
    forbiddenTools: ['webSearch', 'cruiseEncyclopedia'],
  },
  {
    id: 12,
    query: '帮我查网络上天津港最新邮轮信息',
    requiredTools: ['webSearch'],
    requiredInputTerms: { webSearch: ['天津'] },
  },
  {
    id: 13,
    query:
      '2026年8月12日将发生罕见的、持续近6分钟的日全食。全球的最佳观测点从北极圈穿过冰岛直达西班牙。帮我看看有什么邮轮可以实现在海上看到日全食的体验？',
    expectedIntent: 'market_supply',
    requiredTools: ['webSearch'],
    forbiddenResponseTerms: ['ActionCreators', 'StackNavigator'],
  },
];

export default CASES;
