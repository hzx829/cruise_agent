import type { UIMessage } from 'ai';

export const EMPTY_ASSISTANT_FALLBACK_TEXT =
  '这次生成没有拿到有效回复，我先把请求停在这里。请重试一次，或把问题缩短一点再发，我会换一种更稳的方式回答。';

export const ABORTED_ASSISTANT_FALLBACK_TEXT =
  '这次生成已停止，没有产生可展示内容。';

export const ERROR_ASSISTANT_FALLBACK_TEXT =
  '这次生成中断了，我没有拿到有效回复。请稍后重试，或把问题缩短一点再发。';

type MessagePart = UIMessage['parts'][number];

const RENDERABLE_TOOL_PART_TYPES = new Set<string>([
  'tool-searchDeals',
  'tool-getBrandOverview',
  'tool-analyzePrices',
  'tool-getPriceHistory',
  'tool-getRegionalPrices',
  'tool-getStats',
  'tool-generateChart',
  'tool-compareCruises',
  'tool-generateCopywriting',
  'tool-getTopPriceDrops',
  'tool-getTrackingOverview',
  'tool-listDestinations',
  'tool-listCabinTypes',
  'tool-webSearch',
  'tool-cruiseEncyclopedia',
]);

function getPartState(part: MessagePart): string | undefined {
  if (!('state' in part)) return undefined;
  return typeof part.state === 'string' ? part.state : undefined;
}

function isRenderableToolPart(part: MessagePart): boolean {
  if (!RENDERABLE_TOOL_PART_TYPES.has(part.type)) return false;

  const state = getPartState(part);
  return state === 'output-available' || state === 'output-error';
}

export function hasAssistantTextContent(message: UIMessage): boolean {
  return message.parts.some(
    (part) => part.type === 'text' && part.text.trim().length > 0,
  );
}

export function hasRenderableContent(message: UIMessage): boolean {
  return message.parts.some((part) => {
    if (part.type === 'text') return part.text.trim().length > 0;
    return isRenderableToolPart(part);
  });
}

export function createFallbackAssistantMessage(
  id: string,
  text = EMPTY_ASSISTANT_FALLBACK_TEXT,
): UIMessage {
  return {
    id,
    role: 'assistant',
    parts: [{ type: 'text', text, state: 'done' }],
  };
}

export function ensureRenderableAssistantMessage(
  message: UIMessage,
  fallbackText = EMPTY_ASSISTANT_FALLBACK_TEXT,
): UIMessage {
  if (message.role !== 'assistant' || hasRenderableContent(message)) {
    return message;
  }

  return {
    ...message,
    parts: [{ type: 'text', text: fallbackText, state: 'done' }],
  };
}
