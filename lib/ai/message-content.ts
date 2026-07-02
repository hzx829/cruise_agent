import type { UIMessage } from 'ai';

export const EMPTY_ASSISTANT_FALLBACK_TEXT =
  '这次生成没有拿到有效回复，我先把请求停在这里。请重试一次，或把问题缩短一点再发，我会换一种更稳的方式回答。';

export const ABORTED_ASSISTANT_FALLBACK_TEXT =
  '这次生成已停止，没有产生可展示内容。';

export const ERROR_ASSISTANT_FALLBACK_TEXT =
  '这次生成中断了，我没有拿到有效回复。请稍后重试，或把问题缩短一点再发。';

export const MALFORMED_TOOL_ASSISTANT_FALLBACK_TEXT =
  '这次回答在继续检索前提前结束了，我先把这条结果标记为未完成。请重试一次，我会换一种更稳的方式直接给完整结论。';

type MessagePart = UIMessage['parts'][number];

const RENDERABLE_TOOL_PART_TYPES = new Set<string>([
  'tool-searchDeals',
  'tool-getDealDetails',
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
const MALFORMED_TOOL_ARTIFACT_PATTERN =
  /\b(?:ActionCreators|StackNavigator)\b|(?:^|\s)(?:webSearch|searchDeals|getDealDetails|cruiseEncyclopedia|lookupShips)\s*\(/i;
const TOOL_ARTIFACT_TAIL_PATTERN =
  /\s*(?:ActionCreators|StackNavigator)[\s\S]*$/i;
const TRAILING_SEARCH_PROMISE_PATTERN =
  /(?:让我|我会|下面|接下来)?(?:继续|再|进一步)?(?:搜索|检索|查找|核实)[^。！？\n]*[：:，,]?\s*$/;

interface EnsureRenderableAssistantMessageOptions {
  appendFallbackText?: boolean;
  dropIncompleteToolParts?: boolean;
}

function isToolPart(part: MessagePart): boolean {
  return typeof part.type === 'string' && part.type.startsWith('tool-');
}

function isKnownToolPart(part: MessagePart): boolean {
  return RENDERABLE_TOOL_PART_TYPES.has(part.type);
}

function isUnknownToolPart(part: MessagePart): boolean {
  return isToolPart(part) && !isKnownToolPart(part);
}

function getPartState(part: MessagePart): string | undefined {
  if (!('state' in part)) return undefined;
  return typeof part.state === 'string' ? part.state : undefined;
}

function setPartState(part: MessagePart, state: string): MessagePart {
  return { ...part, state } as MessagePart;
}

function isRenderableToolPart(part: MessagePart): boolean {
  if (!isKnownToolPart(part)) return false;

  const state = getPartState(part);
  return state === 'output-available' || state === 'output-error';
}

function isIncompleteToolPart(part: MessagePart): boolean {
  if (!isKnownToolPart(part)) return false;
  const state = getPartState(part);
  return Boolean(state && INCOMPLETE_TOOL_STATES.has(state));
}

function normalizeFinishedPart(
  part: MessagePart,
  options: EnsureRenderableAssistantMessageOptions,
): MessagePart | null {
  if (isUnknownToolPart(part)) {
    return null;
  }

  if (isIncompleteToolPart(part) && options.dropIncompleteToolParts) {
    return null;
  }

  const state = getPartState(part);
  if (state && STREAMING_PART_STATES.has(state)) {
    return setPartState(part, 'done');
  }

  return part;
}

function cleanMalformedToolText(text: string): string {
  return text
    .replace(TOOL_ARTIFACT_TAIL_PATTERN, '')
    .replace(TRAILING_SEARCH_PROMISE_PATTERN, '')
    .trimEnd();
}

function hasTextArtifact(text: string): boolean {
  return MALFORMED_TOOL_ARTIFACT_PATTERN.test(text);
}

function normalizeMalformedToolArtifacts(parts: MessagePart[]): {
  parts: MessagePart[];
  hadArtifact: boolean;
} {
  let hadArtifact = false;

  const normalizedParts = parts
    .map((part) => {
      if (isUnknownToolPart(part)) {
        hadArtifact = true;
        return null;
      }

      if (part.type !== 'text' || !hasTextArtifact(part.text)) return part;

      hadArtifact = true;
      const cleanedText = cleanMalformedToolText(part.text);
      if (!cleanedText.trim()) return null;
      return { ...part, text: cleanedText, state: 'done' } as MessagePart;
    })
    .filter((part): part is MessagePart => Boolean(part));

  return { parts: normalizedParts, hadArtifact };
}

export function hasAssistantTextContent(message: UIMessage): boolean {
  return message.parts.some(
    (part) => part.type === 'text' && part.text.trim().length > 0,
  );
}

export function hasMalformedToolArtifact(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      isUnknownToolPart(part) ||
      (part.type === 'text' && hasTextArtifact(part.text)),
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

  const artifactNormalized = normalizeMalformedToolArtifacts(normalizedParts);

  const normalizedMessage: UIMessage = {
    ...message,
    parts: artifactNormalized.parts,
  };

  if (artifactNormalized.hadArtifact) {
    return {
      ...normalizedMessage,
      parts: [
        ...normalizedMessage.parts,
        {
          type: 'text',
          text: MALFORMED_TOOL_ASSISTANT_FALLBACK_TEXT,
          state: 'done',
        } as MessagePart,
      ],
    };
  }

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

export function sanitizeMessageForAgent(message: UIMessage): UIMessage | null {
  if (!Array.isArray(message.parts)) {
    return null;
  }

  if (message.role === 'assistant') {
    const normalized = ensureRenderableAssistantMessage(message, undefined, {
      dropIncompleteToolParts: true,
    });
    return normalized.parts.length > 0 ? normalized : null;
  }

  const normalizedParts = normalizeMalformedToolArtifacts(
    message.parts
      .map((part) =>
        normalizeFinishedPart(part, { dropIncompleteToolParts: true }),
      )
      .filter((part): part is MessagePart => Boolean(part)),
  ).parts;

  if (normalizedParts.length === 0) return null;
  return { ...message, parts: normalizedParts };
}

export function sanitizeMessagesForAgent(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((message) => sanitizeMessageForAgent(message))
    .filter((message): message is UIMessage => Boolean(message));
}
