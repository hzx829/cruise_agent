import { ToolLoopAgent, stepCountIs, type LanguageModel } from 'ai';
import { buildSystemPrompt } from './prompts';
import {
  formatIntentContextForPrompt,
  type CruiseIntentContext,
} from './intent';
import {
  // 🔒 价格类工具 (DB)
  searchDeals,
  getTopPriceDrops,
  getPriceHistory,
  getRegionalPrices,
  compareCruises,
  getStats,
  getBrandOverview,
  analyzePrices,
  getTrackingOverview,
  listDestinations,
  listCabinTypes,
  // 🌐 知识类工具 (Web)
  webSearch,
  cruiseEncyclopedia,
  // ✍️ 创作类工具
  generateCopywriting,
  generateChart,
} from './tools';

const cruiseTools = {
  // 🔒 价格类 — 数据来自爬虫，准确可靠
  searchDeals,
  getTopPriceDrops,
  getPriceHistory,
  getRegionalPrices,
  compareCruises,
  getStats,
  getBrandOverview,
  analyzePrices,
  getTrackingOverview,
  listDestinations,
  listCabinTypes,
  // 🌐 知识类 — 数据来自互联网
  webSearch,
  cruiseEncyclopedia,
  // ✍️ 创作类
  generateCopywriting,
  generateChart,
};

type CruiseToolName = keyof typeof cruiseTools;

const PRICE_QUOTE_TOOLS: CruiseToolName[] = [
  'searchDeals',
  'getTopPriceDrops',
  'getPriceHistory',
  'getRegionalPrices',
  'compareCruises',
  'listDestinations',
  'listCabinTypes',
];

const MARKET_SUPPLY_TOOLS: CruiseToolName[] = [
  'searchDeals',
  'webSearch',
  'listDestinations',
  'listCabinTypes',
];

const REVIEW_TOOLS: CruiseToolName[] = ['webSearch', 'cruiseEncyclopedia'];

const COPYWRITING_TOOLS: CruiseToolName[] = [
  'searchDeals',
  'getTopPriceDrops',
  'getPriceHistory',
  'webSearch',
  'generateCopywriting',
];

const ANALYTICS_TOOLS: CruiseToolName[] = [
  'getStats',
  'getBrandOverview',
  'analyzePrices',
  'getTrackingOverview',
  'generateChart',
  'searchDeals',
  'getTopPriceDrops',
];

const WEB_TOOLS = new Set<CruiseToolName>(['webSearch', 'cruiseEncyclopedia']);

interface CreateCruiseAgentOptions {
  intentContext?: CruiseIntentContext;
}

function withoutWebTools(tools: CruiseToolName[]): CruiseToolName[] {
  return tools.filter((toolName) => !WEB_TOOLS.has(toolName));
}

function hasSearchDealsCoverageGap(
  steps: Array<{
    toolResults: Array<{ toolName: string; output: unknown }>;
  }>,
): boolean {
  return steps.some((step) =>
    step.toolResults.some((toolResult) => {
      if (toolResult.toolName !== 'searchDeals') return false;
      if (!toolResult.output || typeof toolResult.output !== 'object') return false;

      const output = toolResult.output as {
        count?: unknown;
        coverageStatus?: unknown;
      };

      return (
        output.count === 0 ||
        output.coverageStatus === 'no_exact_match' ||
        output.coverageStatus === 'source_gap_possible'
      );
    }),
  );
}

function chooseActiveTools(
  intentContext: CruiseIntentContext | undefined,
  steps: Array<{
    toolResults: Array<{ toolName: string; output: unknown }>;
  }>,
): CruiseToolName[] | undefined {
  if (!intentContext) return undefined;

  let activeTools: CruiseToolName[] | undefined;

  switch (intentContext.intent) {
    case 'price_quote':
      activeTools = hasSearchDealsCoverageGap(steps) && !intentContext.disableWeb
        ? [...PRICE_QUOTE_TOOLS, 'webSearch']
        : PRICE_QUOTE_TOOLS;
      break;
    case 'market_supply':
      activeTools = MARKET_SUPPLY_TOOLS;
      break;
    case 'review':
    case 'comparison':
      activeTools = REVIEW_TOOLS;
      break;
    case 'copywriting':
      activeTools = COPYWRITING_TOOLS;
      break;
    case 'analytics':
      activeTools = ANALYTICS_TOOLS;
      break;
    case 'general':
      activeTools = intentContext.needsWeb
        ? ['webSearch', 'cruiseEncyclopedia', 'searchDeals']
        : undefined;
      break;
  }

  return intentContext.disableWeb && activeTools
    ? withoutWebTools(activeTools)
    : activeTools;
}

function buildInstructions(intentContext?: CruiseIntentContext): string {
  const basePrompt = buildSystemPrompt();
  return intentContext
    ? `${basePrompt}\n\n${formatIntentContextForPrompt(intentContext)}`
    : basePrompt;
}

/**
 * 创建游速达智能邮轮顾问 Agent
 *
 * 架构：ToolLoopAgent（AI SDK v6）
 * - 模型自动决定调用哪个工具
 * - 支持多步工具链（先查价格，再搜背景，再综合回答）
 * - 最多 8 步，防止无限循环
 */
export function createCruiseAgent(
  model: LanguageModel,
  options: CreateCruiseAgentOptions = {},
) {
  return new ToolLoopAgent({
    model,
    instructions: buildInstructions(options.intentContext),
    tools: cruiseTools,
    prepareStep: ({ steps }) => ({
      activeTools: chooseActiveTools(options.intentContext, steps),
    }),
    // 允许最多 8 步：典型场景是 DB查询(1-2步) + 搜索(1步) + 综合回答(1步)
    stopWhen: stepCountIs(8),
    onStepFinish: async ({ stepNumber, toolCalls, usage }) => {
      if (process.env.NODE_ENV === 'development' && toolCalls?.length) {
        const toolNames = toolCalls.map((tc) => tc.toolName).join(', ');
        console.log(
          `[Agent Step ${stepNumber}] intent: ${options.intentContext?.intent ?? 'unknown'} | tools: ${toolNames} | tokens: ${usage?.totalTokens ?? '?'}`
        );
      }
    },
  });
}
