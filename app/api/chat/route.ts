import {
  createAgentUIStreamResponse,
  createIdGenerator,
  type UIMessage,
} from 'ai';
import { createZhipu } from 'zhipu-ai-provider';
import { createOpenAI } from '@ai-sdk/openai';
import {
  applyHardConstraintsToSearchDealsInput,
  createCruiseAgent,
} from '@/lib/ai/agent';
import { detectCruiseIntent } from '@/lib/ai/intent';
import {
  ABORTED_ASSISTANT_FALLBACK_TEXT,
  ERROR_ASSISTANT_FALLBACK_TEXT,
  createFallbackAssistantMessage,
  ensureRenderableAssistantMessage,
  hasRenderableContent,
} from '@/lib/ai/message-content';
import { loadChat, saveMessages, updateChatTitle, createChat } from '@/lib/db/chat-store';
import { createAgentRun, saveAgentStep } from '@/lib/db/agent-trace-store';

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
function extractMessageText(message: UIMessage): string {
  const textPart = message.parts.find((p) => p.type === 'text');
  return textPart && 'text' in textPart ? textPart.text : '';
}

function extractTitle(message: UIMessage): string {
  return extractMessageText(message).slice(0, 50) || 'New Chat';
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
  const latestUserText = extractMessageText(message);
  const intentContext = latestUserText
    ? detectCruiseIntent(latestUserText)
    : undefined;
  const agent = createCruiseAgent(getModel(), { intentContext });
  const runId = createAgentRun({
    chatId: id,
    model: `${process.env.AI_PROVIDER || 'zhipu'}/${process.env.CHAT_MODEL || 'glm-4-flash'}`,
    userQuery: latestUserText,
    detectedIntent: intentContext?.intent,
  });
  const runStartedAt = Date.now();
  let toolStepCount = 0;
  let toolResultCount = 0;
  let savedErrorFallback = false;

  return createAgentUIStreamResponse({
    agent,
    uiMessages: allMessages,
    generateMessageId,
    timeout: { totalMs: 55_000, stepMs: 35_000, chunkMs: 20_000 },
    onStepFinish: async ({ stepNumber, toolResults }) => {
      try {
        if (toolResults?.length) {
          toolStepCount += 1;
          toolResultCount += toolResults.length;
        }
        for (const toolResult of toolResults ?? []) {
          const toolInput =
            toolResult.toolName === 'searchDeals'
              ? applyHardConstraintsToSearchDealsInput(
                  toolResult.input,
                  intentContext,
                )
              : toolResult.input;
          saveAgentStep({
            runId,
            stepNumber,
            toolName: toolResult.toolName,
            toolInput,
            toolOutput: toolResult.output,
          });
        }
      } catch (error) {
        console.error('[agent-trace] failed to persist step', error);
      }
    },
    onError: (error) => {
      console.error('[agent-stream] failed', {
        runId,
        chatId: id,
        durationMs: Date.now() - runStartedAt,
        error,
      });

      if (!savedErrorFallback) {
        try {
          saveMessages(id, [
            createFallbackAssistantMessage(
              generateMessageId(),
              ERROR_ASSISTANT_FALLBACK_TEXT,
            ),
          ]);
          savedErrorFallback = true;
        } catch (persistError) {
          console.error('[agent-stream] failed to persist fallback', persistError);
        }
      }

      return ERROR_ASSISTANT_FALLBACK_TEXT;
    },
    onFinish: async ({ messages: finishedMessages, isAborted, finishReason }) => {
      // 找出 AI 回复的新消息并保存
      const existingIds = new Set(allMessages.map((m) => m.id));
      const newMessages = finishedMessages.filter((m) => !existingIds.has(m.id));
      const fallbackText = isAborted
        ? ABORTED_ASSISTANT_FALLBACK_TEXT
        : undefined;
      const messagesToSave = newMessages.map((msg) =>
        ensureRenderableAssistantMessage(msg, fallbackText),
      );
      const emptyAssistantCount = newMessages.filter(
        (msg) => msg.role === 'assistant' && !hasRenderableContent(msg),
      ).length;

      if (newMessages.length > 0) {
        saveMessages(id, messagesToSave);
      }

      console.info('[agent-run] finished', {
        runId,
        chatId: id,
        durationMs: Date.now() - runStartedAt,
        finishReason,
        isAborted,
        newMessageCount: newMessages.length,
        emptyAssistantCount,
        toolStepCount,
        toolResultCount,
      });

      // 首条消息时设置标题
      if (previousMessages.length === 0) {
        const title = extractTitle(message);
        updateChatTitle(id, title);
      }
    },
  });
}
