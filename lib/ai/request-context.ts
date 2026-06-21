import { isIP } from 'net';

export interface ChatRequestContext {
  clientIp: string | null;
  clientIpSource: string | null;
  location: ChatLocationContext | null;
}

interface ChatLocationContext {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  timezone: string | null;
  source: string;
}

const DEFAULT_TRUSTED_PROXY_HOPS = 1;
const DEFAULT_IP_HEADERS = [
  'x-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
  'true-client-ip',
  'fastly-client-ip',
  'forwarded',
] as const;
const DEFAULT_GEO_LOOKUP_TIMEOUT_MS = 1_500;
const DEFAULT_GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_GEO_CACHE_TTL_MS = 10 * 60 * 1000;

const geoCache = new Map<
  string,
  { expiresAt: number; location: ChatLocationContext | null }
>();

function getTrustedProxyHops(): number {
  const rawValue = Number(process.env.CLIENT_IP_TRUSTED_PROXY_HOPS);
  if (!Number.isFinite(rawValue) || rawValue < 1) {
    return DEFAULT_TRUSTED_PROXY_HOPS;
  }
  return Math.min(Math.trunc(rawValue), 10);
}

function getConfiguredIpHeaders(): string[] {
  const rawValue = process.env.CLIENT_IP_HEADERS || process.env.CLIENT_IP_HEADER;
  if (!rawValue?.trim()) return [...DEFAULT_IP_HEADERS];

  return rawValue
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getGeoLookupTimeoutMs(): number {
  const rawValue = Number(process.env.IP_GEOLOCATION_TIMEOUT_MS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_GEO_LOOKUP_TIMEOUT_MS;
  }
  return Math.min(Math.trunc(rawValue), 5_000);
}

function getGeoCacheTtlMs(): number {
  const rawValue = Number(process.env.IP_GEOLOCATION_CACHE_TTL_MS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_GEO_CACHE_TTL_MS;
  }
  return Math.min(Math.trunc(rawValue), 7 * DEFAULT_GEO_CACHE_TTL_MS);
}

function trimQuotes(value: string): string {
  return value.replace(/^"|"$/g, '');
}

function normalizeIpCandidate(value: string): string | null {
  let candidate = trimQuotes(value.trim());
  if (!candidate || candidate.toLowerCase() === 'unknown') return null;
  if (candidate.startsWith('_')) return null;

  if (candidate.startsWith('[')) {
    const closingBracket = candidate.indexOf(']');
    if (closingBracket < 0) return null;
    candidate = candidate.slice(1, closingBracket);
  } else {
    const colonCount = (candidate.match(/:/g) ?? []).length;
    if (colonCount === 1 && candidate.includes('.')) {
      candidate = candidate.slice(0, candidate.lastIndexOf(':'));
    }
  }

  if (candidate.startsWith('::ffff:')) {
    const ipv4 = candidate.slice('::ffff:'.length);
    if (isIP(ipv4) === 4) return ipv4;
  }

  return isIP(candidate) ? candidate : null;
}

function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false;
    return true;
  }

  if (family === 6) {
    const normalized = ip.toLowerCase();
    if (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return false;
    }
    return true;
  }

  return false;
}

function parseCommaSeparatedIps(value: string): string[] {
  return value
    .split(',')
    .map(normalizeIpCandidate)
    .filter((ip): ip is string => Boolean(ip));
}

function parseForwardedIps(value: string): string[] {
  return value
    .split(',')
    .map((entry) => {
      const match = /(?:^|;)\s*for=("[^"]+"|[^;,]+)/i.exec(entry);
      return match ? normalizeIpCandidate(match[1]) : null;
    })
    .filter((ip): ip is string => Boolean(ip));
}

function selectFromProxyChain(ips: string[]): string | null {
  if (ips.length === 0) return null;
  const index = Math.max(0, ips.length - 1 - getTrustedProxyHops());
  return ips[index] ?? null;
}

function getIpsForHeader(headers: Headers, headerName: string): string[] {
  const value = headers.get(headerName);
  if (!value) return [];

  if (headerName === 'forwarded') return parseForwardedIps(value);
  if (headerName === 'x-forwarded-for') return parseCommaSeparatedIps(value);

  const ip = normalizeIpCandidate(value);
  return ip ? [ip] : [];
}

function firstHeader(headers: Headers, names: string[]): string | null {
  for (const name of names) {
    const value = headers.get(name);
    if (value?.trim()) return decodeHeaderValue(value.trim());
  }
  return null;
}

function decodeHeaderValue(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'));
  } catch {
    return value;
  }
}

function normalizeCountryCode(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length === 2 ? normalized : null;
}

function locationFromGeoHeaders(headers: Headers): ChatLocationContext | null {
  const city = firstHeader(headers, [
    'x-vercel-ip-city',
    'cf-ipcity',
    'x-client-geo-city',
  ]);
  const region = firstHeader(headers, [
    'x-vercel-ip-country-region',
    'cf-region',
    'x-client-geo-region',
  ]);
  const countryCode = normalizeCountryCode(
    firstHeader(headers, [
      'x-vercel-ip-country',
      'cf-ipcountry',
      'x-client-geo-country',
    ]),
  );
  const timezone = firstHeader(headers, [
    'x-vercel-ip-timezone',
    'cf-timezone',
    'x-client-geo-timezone',
  ]);

  if (!city && !region && !countryCode && !timezone) return null;

  return {
    city,
    region,
    country: null,
    countryCode,
    timezone,
    source: 'request-headers',
  };
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseIpInfoLocation(payload: unknown): ChatLocationContext | null {
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  if (record.error) return null;

  return {
    city: readString(record, 'city'),
    region: readString(record, 'region'),
    country: null,
    countryCode: normalizeCountryCode(readString(record, 'country')),
    timezone: readString(record, 'timezone'),
    source: 'ipinfo.io',
  };
}

function getIpInfoUrl(ip: string): string {
  const url = new URL(`https://ipinfo.io/${encodeURIComponent(ip)}/json`);
  const token = process.env.IPINFO_TOKEN?.trim();
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

async function fetchJson(
  endpoint: string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(endpoint, {
    signal,
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function fetchIpLocation(ip: string): Promise<ChatLocationContext | null> {
  if (!isPublicIp(ip)) return null;

  const cached = geoCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.location;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getGeoLookupTimeoutMs());

  try {
    const location = parseIpInfoLocation(
      await fetchJson(getIpInfoUrl(ip), controller.signal),
    );

    geoCache.set(ip, {
      location,
      expiresAt:
        Date.now() +
        (location ? getGeoCacheTtlMs() : NEGATIVE_GEO_CACHE_TTL_MS),
    });
    return location;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[request-context] failed to resolve IP location', error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveLocation(
  headers: Headers,
  clientIp: string | null,
): Promise<ChatLocationContext | null> {
  return locationFromGeoHeaders(headers) ?? (clientIp ? fetchIpLocation(clientIp) : null);
}

export async function getChatRequestContext(
  req: Request,
): Promise<ChatRequestContext> {
  for (const headerName of getConfiguredIpHeaders()) {
    const ips = getIpsForHeader(req.headers, headerName);
    const clientIp =
      headerName === 'x-forwarded-for' || headerName === 'forwarded'
        ? selectFromProxyChain(ips)
        : ips[0];

    if (clientIp) {
      return {
        clientIp,
        clientIpSource: headerName,
        location: await resolveLocation(req.headers, clientIp),
      };
    }
  }

  return {
    clientIp: null,
    clientIpSource: null,
    location: await resolveLocation(req.headers, null),
  };
}

function countryNameFromCode(countryCode: string | null): string | null {
  if (!countryCode) return null;
  try {
    return (
      new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(countryCode) ??
      countryCode
    );
  } catch {
    return countryCode;
  }
}

function formatLocation(location: ChatLocationContext): string {
  const country = location.country || countryNameFromCode(location.countryCode);
  const place = [location.city, location.region, country]
    .filter(Boolean)
    .join(', ');
  const details = location.timezone ? `时区 ${location.timezone}` : '';

  return details ? `${place || '未知城市'}（${details}）` : place || '未知城市';
}

export function formatRequestContextForPrompt(
  context?: ChatRequestContext,
): string {
  if (!context?.location) return '';

  return `## 用户背景
- 用户当前位置: ${formatLocation(context.location)}

使用方式:
- 如果用户没有纠正或指定其他地点，就默认用户在上述位置。
- 回答涉及附近出发港、机场、时区、语言、币种或本地可达性时，优先按上述位置本地化。
- 如果用户在问题或历史对话里明确给出城市、港口、国家或地区，以用户明确给出的地点为准。
- 这是网络位置推断，可能不准确；不要声称精确定位，也不要提及 IP 地址。`;
}
