import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  createIdGenerator,
  type UIMessage,
} from 'ai';
import { createZhipu } from 'zhipu-ai-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import { loadChat, saveMessages, updateChatTitle, createChat } from '@/lib/db/chat-store';
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
  getRegionalPrices,
  getStats,
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

/**
 * 从首条用户消息中提取纯文本用作 Chat 标题 (截取前 50 字符)
 */
function extractTitle(message: UIMessage): string {
  const textPart = message.parts.find((p) => p.type === 'text');
  const text = textPart && 'text' in textPart ? textPart.text : '';
  return text.slice(0, 50) || 'New Chat';
}

export async function POST(req: Request) {
  const { message, id }: { message: UIMessage; id: string } = await req.json();

  // 从 DB 加载历史消息；若 chat 不存在则首次创建
  let previousMessages: UIMessage[] = [];
  try {
    const result = loadChat(id);
    previousMessages = result.messages;
  } catch {
    // 首条消息 — 延迟创建 chat 记录
    createChat(id);
  }
  const allMessages = [...previousMessages, message];

  // 立即保存用户消息
  saveMessages(id, [message]);

  const generateMessageId = createIdGenerator({ prefix: 'msg', size: 16 });

  const result = streamText({
    model: getModel(),
    system: buildSystemPrompt(),
    messages: await convertToModelMessages(allMessages),
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
      getRegionalPrices,
      getStats,
    },
    stopWhen: stepCountIs(5),
  });

  // 确保即使客户端断开也能完整消费流
  result.consumeStream();

  return result.toUIMessageStreamResponse({
    originalMessages: allMessages,
    generateMessageId,
    onFinish: async ({ messages: finishedMessages }) => {
      // 找出 AI 回复的新消息并保存
      const existingIds = new Set(allMessages.map((m) => m.id));
      const newMessages = finishedMessages.filter((m) => !existingIds.has(m.id));
      if (newMessages.length > 0) {
        saveMessages(id, newMessages);
      }

      // 首条消息时设置标题
      if (previousMessages.length === 0) {
        const title = extractTitle(message);
        updateChatTitle(id, title);
      }
    },
  });
}
