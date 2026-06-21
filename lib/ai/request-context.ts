import { isIP } from 'net';

export interface ChatRequestContext {
  clientIp: string | null;
  clientIpSource: string | null;
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
  const index = Math.max(0, ips.length - getTrustedProxyHops());
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

export function getChatRequestContext(req: Request): ChatRequestContext {
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
      };
    }
  }

  return {
    clientIp: null,
    clientIpSource: null,
  };
}

export function formatRequestContextForPrompt(
  context?: ChatRequestContext,
): string {
  if (!context?.clientIp) return '';

  return `## 用户背景
- 用户当前网络位置线索: IP 地址 ${context.clientIp}

使用方式:
- 回答涉及附近出发港、机场、时区、语言、币种或本地可达性时，可以把它作为用户当前位置的弱默认值。
- 如果用户在问题或历史对话里明确给出城市、港口、国家或地区，以用户明确给出的地点为准。
- 不要主动暴露或复述 IP 地址；如需说明依据，用“根据你当前网络位置粗略判断”即可。
- 不要把该位置线索当作精确定位、身份、权限或必须满足的硬条件。`;
}
