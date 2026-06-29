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
  formatRequestContextForPrompt,
  type ChatRequestContext,
} from './request-context';
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
const WRAP_UP_AFTER_STEP_WITH_TOOLS = 3;
const HARD_FINAL_STEP = 5;
const MAX_TOOL_RESULT_STEPS = 2;
const DEFAULT_MAX_OUTPUT_TOKENS = 1400;
const WEB_TOOL_BUDGET_BY_INTENT: Record<CruiseIntentContext['intent'], number> = {
  price_quote: 1,
  market_supply: 2,
  review: 2,
  comparison: 2,
  copywriting: 1,
  analytics: 0,
  general: 1,
};
const FAST_FINAL_ANSWER_INSTRUCTIONS = `## Fast response rules
Stop using tools now and answer in Chinese from the information already gathered.
- Start with the conclusion or 1-3 recommendations.
- Keep the answer concise by default, around 600-900 Chinese characters.
- If information is insufficient, state the gap and the practical next step instead of searching again.
- Do not output an empty answer or only describe tool activity.
- Never output internal tool-call text or pseudo-code such as ActionCreators, StackNavigator, JSON tool-call arrays, or "call webSearch(...)".
- If you want another search but tools are unavailable, answer from the current evidence and clearly state the evidence gap.`;

const FINAL_ANSWER_INSTRUCTIONS = `## 最终回答收束要求

你已经完成了必要的信息查询。现在必须停止继续调用工具，直接基于已有信息回答用户。

- 如果信息足够，先给明确结论或 1-3 个推荐，再补充关键理由。
- 如果信息不足，直接说明缺口和可执行的下一步，不要继续搜索。
- 不要输出空白内容，也不要只描述工具过程。`;

interface CreateCruiseAgentOptions {
  intentContext?: CruiseIntentContext;
  requestContext?: ChatRequestContext;
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

function countToolResultSteps(
  steps: ReadonlyArray<{
    toolResults: Array<unknown>;
  }>,
): number {
  return steps.filter((step) => step.toolResults.length > 0).length;
}

function countWebToolResults(
  steps: ReadonlyArray<{
    toolResults: Array<{ toolName: string }>;
  }>,
): number {
  return steps.reduce(
    (sum, step) =>
      sum +
      step.toolResults.filter((toolResult) =>
        WEB_TOOLS.has(toolResult.toolName as CruiseToolName),
      ).length,
    0,
  );
}

function shouldForceFinalAnswer(
  stepNumber: number,
  intentContext: CruiseIntentContext | undefined,
  steps: ReadonlyArray<{
    toolResults: Array<{ toolName: string }>;
  }>,
): boolean {
  if (stepNumber >= HARD_FINAL_STEP) return true;
  const webBudget = getWebToolBudget(intentContext);
  if (webBudget > 0 && countWebToolResults(steps) >= webBudget) return true;
  if (countToolResultSteps(steps) >= MAX_TOOL_RESULT_STEPS) return true;
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

  if (!activeTools) return activeTools;

  if (intentContext.disableWeb) {
    return withoutWebTools(activeTools);
  }

  const webBudget = getWebToolBudget(intentContext);
  return countWebToolResults(steps) >= webBudget
    ? withoutWebTools(activeTools)
    : activeTools;
}

function buildInstructions(
  intentContext?: CruiseIntentContext,
  requestContext?: ChatRequestContext,
  promptTemplate?: string,
): string {
  const basePrompt = buildSystemPrompt(promptTemplate);
  return [
    basePrompt,
    formatRequestContextForPrompt(requestContext),
    intentContext ? formatIntentContextForPrompt(intentContext) : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

type SearchDealsInput = Record<string, unknown> & {
  brand?: string;
  departurePort?: string;
  arrivalPort?: string;
  itineraryIncludes?: string[] | string;
  destination?: string;
  destinationId?: string;
  sailDateFrom?: string;
  sailDateTo?: string;
  roundtrip?: boolean;
  tier?: string | string[];
};

const SINGAPORE_PATTERN = /singapore|新加坡|星加坡/i;
const CARIBBEAN_PATTERN = /caribbean|加勒比/i;

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  );
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean);
      }
    } catch {
      return [trimmed];
    }
  }
  return [trimmed];
}

function inputTextForRouteScope(input: SearchDealsInput): string {
  return [
    input.destination,
    input.destinationId,
    input.departurePort,
    input.arrivalPort,
    ...normalizeStringList(input.itineraryIncludes),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');
}

function constraintTextForRouteScope(
  constraints: CruiseIntentContext['hardConstraints'],
): string {
  return [
    constraints.departurePort,
    ...(constraints.itineraryIncludes ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');
}

function hasKnownRouteConflict(input: SearchDealsInput, constraintText: string): boolean {
  const inputText = inputTextForRouteScope(input);
  return (
    (SINGAPORE_PATTERN.test(constraintText) && CARIBBEAN_PATTERN.test(inputText)) ||
    (CARIBBEAN_PATTERN.test(constraintText) && SINGAPORE_PATTERN.test(inputText))
  );
}

function shouldApplyRouteHardConstraints(
  input: SearchDealsInput,
  intentContext: CruiseIntentContext,
): boolean {
  const constraints = intentContext.hardConstraints;
  const constraintText = constraintTextForRouteScope(constraints);
  if (!constraintText) return false;
  if (hasKnownRouteConflict(input, constraintText)) return false;

  const hasExplicitDestination = Boolean(input.destination || input.destinationId);
  if (intentContext.intent === 'comparison' && hasExplicitDestination) {
    const inputText = inputTextForRouteScope(input);
    return constraintText
      .split(/\s+/)
      .filter(Boolean)
      .some((term) => inputText.toLowerCase().includes(term.toLowerCase()));
  }

  return true;
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
  const applyRouteConstraints = shouldApplyRouteHardConstraints(input, intentContext);

  if (constraints.brand && !input.brand) {
    input.brand = constraints.brand;
  }
  if (applyRouteConstraints && constraints.departurePort && !input.departurePort) {
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
  if (applyRouteConstraints && constraints.itineraryIncludes?.length) {
    input.itineraryIncludes = uniqueStrings([
      ...normalizeStringList(input.itineraryIncludes),
      ...constraints.itineraryIncludes,
    ]);
  }
  if (intentContext && usesColloquialLuxury(intentContext.originalQuery)) {
    input.tier = normalizeColloquialLuxuryTier(input.tier);
  }

  return input;
}

function createTools(intentContext?: CruiseIntentContext): typeof cruiseTools {
  const tools = { ...cruiseTools };

  if (intentContext) {
    tools.searchDeals = {
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
  }

  const webBudgetState = {
    budget: getWebToolBudget(intentContext),
    used: 0,
  };

  tools.webSearch = createBudgetedWebTool(
    webSearch,
    'webSearch',
    webBudgetState,
  );
  tools.cruiseEncyclopedia = createBudgetedWebTool(
    cruiseEncyclopedia,
    'cruiseEncyclopedia',
    webBudgetState,
  );

  return tools;
}

function getWebToolBudget(intentContext?: CruiseIntentContext): number {
  if (intentContext?.disableWeb) return 0;
  if (!intentContext) return 1;
  const baseBudget = WEB_TOOL_BUDGET_BY_INTENT[intentContext.intent] ?? 1;
  return intentContext.explicitNetworkRequest
    ? Math.max(baseBudget, 3)
    : baseBudget;
}

function createBudgetedWebTool<T extends typeof webSearch | typeof cruiseEncyclopedia>(
  toolImpl: T,
  toolName: CruiseToolName,
  state: { budget: number; used: number },
): T {
  return {
    ...toolImpl,
    execute: async (input: unknown, options: unknown) => {
      if (state.used >= state.budget) {
        return {
          available: false,
          skipped: true,
          skipReason: 'web_tool_budget_exceeded',
          message:
            '本轮网络搜索次数已达到上限，请基于已有搜索结果和直连数据作答。',
          requestedTool: toolName,
          results: [],
          sources: [],
          resultCount: 0,
          dataSource: toolName,
        };
      }

      state.used += 1;
      if (!toolImpl.execute) {
        throw new Error(`${toolName} execute handler is unavailable`);
      }
      return toolImpl.execute(input as never, options as never);
    },
  } as T;
}

function getMaxOutputTokens(): number {
  const rawValue = Number(process.env.CHAT_MAX_OUTPUT_TOKENS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }
  return Math.min(Math.max(Math.trunc(rawValue), 400), 2400);
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
    options.requestContext,
    options.promptTemplate,
  );

  return new ToolLoopAgent({
    model,
    instructions,
    tools: createTools(options.intentContext),
    maxOutputTokens: getMaxOutputTokens(),
    prepareStep: ({ steps, stepNumber }) => {
      if (shouldForceFinalAnswer(stepNumber, options.intentContext, steps)) {
        return {
          activeTools: [],
          toolChoice: 'none' as const,
          system: `${instructions}\n\n${FINAL_ANSWER_INSTRUCTIONS}\n\n${FAST_FINAL_ANSWER_INSTRUCTIONS}`,
        };
      }

      return {
        activeTools: chooseActiveTools(options.intentContext, steps),
      };
    },
    experimental_onStepStart: options.onStepStart,
    experimental_onToolCallFinish: options.onToolCallFinish,
    // Keep the loop short: DB lookup, optional web fallback, final answer.
    stopWhen: stepCountIs(6),
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
