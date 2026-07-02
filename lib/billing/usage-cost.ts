const DEFAULT_USD_CNY_RATE = 6.8;
const GLM5_INPUT_USD_PER_1M_TOKENS = 1;
const GLM5_OUTPUT_USD_PER_1M_TOKENS = 3.2;
const TAVILY_USD_PER_CREDIT = 0.008;
const INTERNAL_COST_CNY_PER_POINT = 0.016;
const COST_SAFETY_MULTIPLIER = 1.25;
const MIN_CHAT_POINTS = 8;
const MAX_CHAT_POINTS = 60;

function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function envNumber(name: string, fallback: number): number {
  return positiveNumber(process.env[name]) ?? fallback;
}

export function getMinimumChatCreditCost(): number {
  return MIN_CHAT_POINTS;
}

export function estimateChatCreditCost(input: {
  promptTokens?: number | null;
  completionTokens?: number | null;
  webSearchCredits?: number | null;
}): number {
  const usdCnyRate = envNumber('BILLING_USD_CNY_RATE', DEFAULT_USD_CNY_RATE);
  const promptTokens = positiveNumber(input.promptTokens) ?? 0;
  const completionTokens = positiveNumber(input.completionTokens) ?? 0;
  const webSearchCredits = positiveNumber(input.webSearchCredits) ?? 0;

  const modelCostCny =
    ((promptTokens * GLM5_INPUT_USD_PER_1M_TOKENS) / 1_000_000 +
      (completionTokens * GLM5_OUTPUT_USD_PER_1M_TOKENS) / 1_000_000) *
    usdCnyRate;
  const webCostCny = webSearchCredits * TAVILY_USD_PER_CREDIT * usdCnyRate;
  const rawPoints =
    ((modelCostCny + webCostCny) * COST_SAFETY_MULTIPLIER) /
    INTERNAL_COST_CNY_PER_POINT;

  return Math.min(
    Math.max(Math.ceil(rawPoints), MIN_CHAT_POINTS),
    MAX_CHAT_POINTS,
  );
}
