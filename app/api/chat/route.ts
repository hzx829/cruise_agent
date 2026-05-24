import {
  createAgentUIStreamResponse,
  createIdGenerator,
  type LanguageModelUsage,
  type UIMessage,
} from 'ai';
import { createHash } from 'crypto';
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
import { getActivePromptTemplate } from '@/lib/ai/prompt-store';
import { loadChat, saveMessages, updateChatTitle, createChat } from '@/lib/db/chat-store';
import {
  createAgentRun,
  saveAgentToolCall,
  updateAgentRun,
} from '@/lib/db/agent-trace-store';

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

function extractAllText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

function sumAssistantTextLength(messages: UIMessage[]): number {
  return messages
    .filter((msg) => msg.role === 'assistant')
    .reduce((sum, msg) => sum + extractAllText(msg).trim().length, 0);
}

function hashPrompt(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function getUsageTokens(usage: LanguageModelUsage | undefined): {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
} {
  if (!usage) {
    return { promptTokens: null, completionTokens: null, totalTokens: null };
  }

  return {
    promptTokens: usage.inputTokens ?? null,
    completionTokens: usage.outputTokens ?? null,
    totalTokens: usage.totalTokens ?? null,
  };
}

function toIsoTime(value: number): string {
  return new Date(value).toISOString();
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
  const activePrompt = getActivePromptTemplate();
  const runStartedAt = Date.now();
  const runId = createAgentRun({
    chatId: id,
    model: `${process.env.AI_PROVIDER || 'zhipu'}/${process.env.CHAT_MODEL || 'glm-4-flash'}`,
    userQuery: latestUserText,
    detectedIntent: intentContext?.intent,
    promptId: activePrompt.id,
    promptVersion: activePrompt.version,
    promptHash: hashPrompt(activePrompt.content),
    startedAt: toIsoTime(runStartedAt),
  });
  let toolStepCount = 0;
  let toolResultCount = 0;
  let savedErrorFallback = false;
  let totalUsage: LanguageModelUsage | undefined;
  const agent = createCruiseAgent(getModel(), {
    intentContext,
    promptTemplate: activePrompt.content,
    onToolCallFinish: async (event) => {
      const endedAtMs = Date.now();
      const durationMs = Math.max(0, Math.round(event.durationMs));
      const rawToolInput = event.toolCall.input;
      const effectiveToolInput =
        event.toolCall.toolName === 'searchDeals'
          ? applyHardConstraintsToSearchDealsInput(rawToolInput, intentContext)
          : rawToolInput;

      try {
        saveAgentToolCall({
          runId,
          stepNumber: event.stepNumber,
          toolCallId: event.toolCall.toolCallId,
          toolName: event.toolCall.toolName,
          rawToolInput,
          effectiveToolInput,
          toolOutput: event.success ? event.output : undefined,
          durationMs,
          success: event.success,
          error: event.success
            ? undefined
            : (event as { error?: unknown }).error,
          startedAt: toIsoTime(endedAtMs - durationMs),
          endedAt: toIsoTime(endedAtMs),
        });
      } catch (error) {
        console.error('[agent-trace] failed to persist tool call', error);
      }
    },
    onFinish: (event) => {
      totalUsage = event.totalUsage;
    },
  });

  const response = await createAgentUIStreamResponse({
    agent,
    uiMessages: allMessages,
    generateMessageId,
    timeout: { totalMs: 55_000, stepMs: 35_000, chunkMs: 20_000 },
    onStepFinish: async ({ toolResults }) => {
      if (toolResults?.length) {
        toolStepCount += 1;
        toolResultCount += toolResults.length;
      }
    },
    onError: (error) => {
      console.error('[agent-stream] failed', {
        runId,
        chatId: id,
        durationMs: Date.now() - runStartedAt,
        error,
      });

      try {
        updateAgentRun({
          runId,
          status: 'error',
          endedAt: toIsoTime(Date.now()),
          durationMs: Date.now() - runStartedAt,
          toolStepCount,
          toolResultCount,
          error,
        });
      } catch (persistError) {
        console.error('[agent-trace] failed to persist run error', persistError);
      }

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

      try {
        const usageTokens = getUsageTokens(totalUsage);
        updateAgentRun({
          runId,
          status: isAborted ? 'aborted' : 'completed',
          endedAt: toIsoTime(Date.now()),
          durationMs: Date.now() - runStartedAt,
          finishReason: finishReason ?? null,
          isAborted,
          assistantTextLen: sumAssistantTextLength(messagesToSave),
          emptyAssistantCount,
          toolStepCount,
          toolResultCount,
          ...usageTokens,
        });
      } catch (persistError) {
        console.error('[agent-trace] failed to persist run finish', persistError);
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
  return response;
}
