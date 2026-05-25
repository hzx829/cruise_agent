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

const INCOMPLETE_TOOL_STATES = new Set<string>([
  'input-streaming',
  'input-available',
]);

const STREAMING_PART_STATES = new Set<string>(['streaming']);

interface EnsureRenderableAssistantMessageOptions {
  appendFallbackText?: boolean;
  dropIncompleteToolParts?: boolean;
}

function getPartState(part: MessagePart): string | undefined {
  if (!('state' in part)) return undefined;
  return typeof part.state === 'string' ? part.state : undefined;
}

function setPartState(part: MessagePart, state: string): MessagePart {
  return { ...part, state } as MessagePart;
}

function isRenderableToolPart(part: MessagePart): boolean {
  if (!RENDERABLE_TOOL_PART_TYPES.has(part.type)) return false;

  const state = getPartState(part);
  return state === 'output-available' || state === 'output-error';
}

function isIncompleteToolPart(part: MessagePart): boolean {
  if (!RENDERABLE_TOOL_PART_TYPES.has(part.type)) return false;
  const state = getPartState(part);
  return Boolean(state && INCOMPLETE_TOOL_STATES.has(state));
}

function normalizeFinishedPart(
  part: MessagePart,
  options: EnsureRenderableAssistantMessageOptions,
): MessagePart | null {
  if (isIncompleteToolPart(part) && options.dropIncompleteToolParts) {
    return null;
  }

  const state = getPartState(part);
  if (state && STREAMING_PART_STATES.has(state)) {
    return setPartState(part, 'done');
  }

  return part;
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
  options: EnsureRenderableAssistantMessageOptions = {},
): UIMessage {
  if (message.role !== 'assistant') {
    return message;
  }

  const normalizedParts = message.parts
    .map((part) => normalizeFinishedPart(part, options))
    .filter((part): part is MessagePart => Boolean(part));

  const normalizedMessage: UIMessage = {
    ...message,
    parts: normalizedParts,
  };

  if (hasRenderableContent(normalizedMessage)) {
    if (
      !options.appendFallbackText ||
      hasAssistantTextContent(normalizedMessage) &&
        normalizedMessage.parts.some(
          (part) => part.type === 'text' && part.text.includes(fallbackText),
        )
    ) {
      return normalizedMessage;
    }

    return {
      ...normalizedMessage,
      parts: [
        ...normalizedMessage.parts,
        { type: 'text', text: fallbackText, state: 'done' } as MessagePart,
      ],
    };
  }

  return {
    ...message,
    parts: [{ type: 'text', text: fallbackText, state: 'done' }],
  };
}
