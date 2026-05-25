import {
  ToolLoopAgent,
  stepCountIs,
  type LanguageModel,
  type ToolLoopAgentOnFinishCallback,
  type ToolLoopAgentOnStepStartCallback,
  type ToolLoopAgentOnToolCallFinishCallback,
} from 'ai';
import { buildSystemPrompt } from './prompts';
import {
  formatIntentContextForPrompt,
  type CruiseIntentContext,
} from './intent';
import {
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
  lookupShips,
  webSearch,
  cruiseEncyclopedia,
  generateCopywriting,
  generateChart,
} from './tools';

const cruiseTools = {
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
  lookupShips,
  webSearch,
  cruiseEncyclopedia,
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
  'lookupShips',
];

const MARKET_SUPPLY_TOOLS: CruiseToolName[] = [
  'searchDeals',
  'lookupShips',
  'webSearch',
  'listDestinations',
  'listCabinTypes',
];

const REVIEW_TOOLS: CruiseToolName[] = ['lookupShips', 'webSearch', 'cruiseEncyclopedia'];

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
const WRAP_UP_AFTER_STEP_WITH_TOOLS = 5;
const HARD_FINAL_STEP = 7;

const FINAL_ANSWER_INSTRUCTIONS = `## 最终回答收束要求

你已经完成了必要的信息查询。现在必须停止继续调用工具，直接基于已有信息回答用户。

- 如果信息足够，先给明确结论或 1-3 个推荐，再补充关键理由。
- 如果信息不足，直接说明缺口和可执行的下一步，不要继续搜索。
- 不要输出空白内容，也不要只描述工具过程。`;

interface CreateCruiseAgentOptions {
  intentContext?: CruiseIntentContext;
  promptTemplate?: string;
  onFinish?: ToolLoopAgentOnFinishCallback<typeof cruiseTools>;
  onStepStart?: ToolLoopAgentOnStepStartCallback<typeof cruiseTools>;
  onToolCallFinish?: ToolLoopAgentOnToolCallFinishCallback<typeof cruiseTools>;
}

function withoutWebTools(tools: CruiseToolName[]): CruiseToolName[] {
  return tools.filter((toolName) => !WEB_TOOLS.has(toolName));
}

function hasAnyToolResult(
  steps: ReadonlyArray<{
    toolResults: Array<unknown>;
  }>,
): boolean {
  return steps.some((step) => step.toolResults.length > 0);
}

function shouldForceFinalAnswer(
  stepNumber: number,
  steps: ReadonlyArray<{
    toolResults: Array<unknown>;
  }>,
): boolean {
  if (stepNumber >= HARD_FINAL_STEP) return true;
  return stepNumber >= WRAP_UP_AFTER_STEP_WITH_TOOLS && hasAnyToolResult(steps);
}

function hasSearchDealsCoverageGap(
  steps: ReadonlyArray<{
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
  steps: ReadonlyArray<{
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
        ? ['lookupShips', 'webSearch', 'cruiseEncyclopedia', 'searchDeals']
        : undefined;
      break;
  }

  return intentContext.disableWeb && activeTools
    ? withoutWebTools(activeTools)
    : activeTools;
}

function buildInstructions(
  intentContext?: CruiseIntentContext,
  promptTemplate?: string,
): string {
  const basePrompt = buildSystemPrompt(promptTemplate);
  return intentContext
    ? `${basePrompt}\n\n${formatIntentContextForPrompt(intentContext)}`
    : basePrompt;
}

type SearchDealsInput = Record<string, unknown> & {
  brand?: string;
  departurePort?: string;
  itineraryIncludes?: string[];
  sailDateFrom?: string;
  sailDateTo?: string;
  roundtrip?: boolean;
  tier?: string | string[];
};

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  );
}

function usesColloquialLuxury(query: string): boolean {
  return (
    /奢华|豪华/i.test(query) &&
    !/只看|仅看|限定|严格|只要|奢华品牌|高奢|超奢|六星|luxury\s*tier|tier\s*luxury|silversea|regent|explora|seabourn|crystal|ritz/i.test(query)
  );
}

function normalizeColloquialLuxuryTier(
  tier: SearchDealsInput['tier'],
): SearchDealsInput['tier'] {
  if (!tier) return ['premium', 'luxury'];
  if (tier === 'luxury') return ['premium', 'luxury'];
  if (Array.isArray(tier) && tier.length === 1 && tier[0] === 'luxury') {
    return ['premium', 'luxury'];
  }
  return tier;
}

export function applyHardConstraintsToSearchDealsInput(
  rawInput: unknown,
  intentContext?: CruiseIntentContext,
): SearchDealsInput {
  const input =
    rawInput && typeof rawInput === 'object'
      ? ({ ...(rawInput as SearchDealsInput) } as SearchDealsInput)
      : {};
  const constraints = intentContext?.hardConstraints;

  if (!constraints) return input;

  if (constraints.brand && !input.brand) {
    input.brand = constraints.brand;
  }
  if (constraints.departurePort && !input.departurePort) {
    input.departurePort = constraints.departurePort;
  }
  if (constraints.sailDateFrom) {
    input.sailDateFrom = constraints.sailDateFrom;
  }
  if (constraints.sailDateTo) {
    input.sailDateTo = constraints.sailDateTo;
  }
  if (constraints.roundtrip && input.roundtrip == null) {
    input.roundtrip = true;
  }
  if (constraints.itineraryIncludes?.length) {
    input.itineraryIncludes = uniqueStrings([
      ...(Array.isArray(input.itineraryIncludes) ? input.itineraryIncludes : []),
      ...constraints.itineraryIncludes,
    ]);
  }
  if (intentContext && usesColloquialLuxury(intentContext.originalQuery)) {
    input.tier = normalizeColloquialLuxuryTier(input.tier);
  }

  return input;
}

function createTools(intentContext?: CruiseIntentContext): typeof cruiseTools {
  if (!intentContext) return cruiseTools;

  const searchDealsWithHardConstraints = {
    ...searchDeals,
    execute: async (input: unknown) => {
      const effectiveInput = applyHardConstraintsToSearchDealsInput(
        input,
        intentContext,
      );
      if (!searchDeals.execute) {
        throw new Error('searchDeals execute handler is unavailable');
      }
      return searchDeals.execute(effectiveInput as never, undefined as never);
    },
  } as typeof searchDeals;

  return {
    ...cruiseTools,
    searchDeals: searchDealsWithHardConstraints,
  };
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
  const instructions = buildInstructions(
    options.intentContext,
    options.promptTemplate,
  );

  return new ToolLoopAgent({
    model,
    instructions,
    tools: createTools(options.intentContext),
    prepareStep: ({ steps, stepNumber }) => {
      if (shouldForceFinalAnswer(stepNumber, steps)) {
        return {
          activeTools: [],
          toolChoice: 'none' as const,
          system: `${instructions}\n\n${FINAL_ANSWER_INSTRUCTIONS}`,
        };
      }

      return {
        activeTools: chooseActiveTools(options.intentContext, steps),
      };
    },
    experimental_onStepStart: options.onStepStart,
    experimental_onToolCallFinish: options.onToolCallFinish,
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
    onFinish: options.onFinish,
  });
}
