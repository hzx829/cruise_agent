import type { AuthUser } from '@/lib/auth/session';

export interface BrowserLocationContext {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  timezone: string | null;
}

export interface ChatRequestContext {
  defaultDepartureLocation: string | null;
  browserLocation: BrowserLocationContext | null;
}

const MAX_LOCATION_TEXT_LENGTH = 80;

function cleanText(value: unknown, maxLength = MAX_LOCATION_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, maxLength) : null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function parseBrowserLocation(value: unknown): BrowserLocationContext | null {
  const record = readRecord(value);
  if (!record) return null;

  const latitude = readNumber(record, 'latitude');
  const longitude = readNumber(record, 'longitude');
  if (
    latitude == null ||
    longitude == null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const accuracy = readNumber(record, 'accuracy');

  return {
    latitude,
    longitude,
    accuracy: accuracy == null ? null : Math.max(0, Math.round(accuracy)),
    city: cleanText(record.city),
    region: cleanText(record.region),
    country: cleanText(record.country),
    countryCode: cleanText(record.countryCode, 8),
    timezone: cleanText(record.timezone, 64),
  };
}

export function getChatRequestContext(input: {
  user: AuthUser;
  browserLocation?: unknown;
}): ChatRequestContext {
  return {
    defaultDepartureLocation: cleanText(input.user.defaultDepartureLocation),
    browserLocation: parseBrowserLocation(input.browserLocation),
  };
}

function formatBrowserLocation(location: BrowserLocationContext): string {
  const place = [location.city, location.region, location.country || location.countryCode]
    .filter(Boolean)
    .join(', ');
  const coordinate = `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  const details = [
    location.timezone ? `时区 ${location.timezone}` : null,
    location.accuracy != null ? `精度约 ${location.accuracy} 米` : null,
  ]
    .filter(Boolean)
    .join('；');
  const label = place || `坐标 ${coordinate}`;
  return details ? `${label}（${details}）` : label;
}

export function formatRequestContextForPrompt(
  context?: ChatRequestContext,
): string {
  if (!context?.defaultDepartureLocation && !context?.browserLocation) return '';

  const rows = [
    context.defaultDepartureLocation
      ? `- 用户设置的常用出发地: ${context.defaultDepartureLocation}`
      : null,
    context.browserLocation
      ? `- 浏览器授权当前位置: ${formatBrowserLocation(context.browserLocation)}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `## 用户位置背景
${rows}

使用方式:
- 用户在本轮或历史对话中明确给出城市、省份、港口、国家或地区时，优先级最高，覆盖这里的位置背景。
- 其次使用用户设置的常用出发地；如果存在，就把它作为邮轮行程规划和出发建议的默认地点。
- 再使用浏览器授权当前位置；它只代表用户主动授权的一次当前位置，可用于附近机场、港口、接驳和时区判断。
- 如果以上位置互相冲突，优先询问用户确认，不要强行合并。
- 不要使用 IP 或网络出口位置来判断用户真实所在地。`;
}
