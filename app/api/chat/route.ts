import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';
import { createZhipu } from 'zhipu-ai-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import {
  searchDeals,
  getBrandOverview,
  analyzePrices,
  getPriceHistory,
  generateChart,
  compareCruises,
  generateCopywriting,
  getTopPriceDrops,
  getHotDeals,
  getTrackingOverview,
  listDestinations,
  listCabinTypes,
} from '@/lib/ai/tools';

export const maxDuration = 60;

function getModel() {
  const provider = process.env.AI_PROVIDER || 'zhipu';
  const model = process.env.CHAT_MODEL || 'glm-4-flash';

  switch (provider) {
    case 'zhipu': {
      const zhipu = createZhipu({
        apiKey: process.env.ZHIPU_API_KEY,
      });
      return zhipu(model);
    }
    case 'openai': {
      const openai = createOpenAI({
        baseURL: process.env.OPENAI_BASE_URL,
        apiKey: process.env.OPENAI_API_KEY,
      });
      return openai(model);
    }
    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: getModel(),
    system: buildSystemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: {
      searchDeals,
      getBrandOverview,
      analyzePrices,
      getPriceHistory,
      generateChart,
      compareCruises,
      generateCopywriting,
      getTopPriceDrops,
      getHotDeals,
      getTrackingOverview,
      listDestinations,
      listCabinTypes,
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
