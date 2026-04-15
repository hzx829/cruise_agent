import {
  createAgentUIStreamResponse,
  createIdGenerator,
  type UIMessage,
} from 'ai';
import { createZhipu } from 'zhipu-ai-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createCruiseAgent } from '@/lib/ai/agent';
import { loadChat, saveMessages, updateChatTitle, createChat } from '@/lib/db/chat-store';

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
  // 过滤掉 parts 为空的无效历史消息，避免 createAgentUIStreamResponse 报错
  const validPreviousMessages = previousMessages.filter(
    (m) => Array.isArray(m.parts) && m.parts.length > 0,
  );
  const allMessages = [...validPreviousMessages, message];

  // 立即保存用户消息
  saveMessages(id, [message]);

  const generateMessageId = createIdGenerator({ prefix: 'msg', size: 16 });

  // 使用 ToolLoopAgent 替代手动 streamText
  // Agent 自动管理工具循环、上下文和停止条件
  const agent = createCruiseAgent(getModel());

  return createAgentUIStreamResponse({
    agent,
    uiMessages: allMessages,
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
