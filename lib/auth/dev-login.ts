function isLocalHost(host: string | null): boolean {
  if (!host) return false;

  const normalizedHost = host.toLowerCase();
  return (
    normalizedHost === 'localhost' ||
    normalizedHost.startsWith('localhost:') ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost.startsWith('127.0.0.1:') ||
    normalizedHost === '[::1]' ||
    normalizedHost.startsWith('[::1]:')
  );
}

export function isDevWeChatLoginAllowed(headers: Headers): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.AUTH_DEV_WECHAT_LOGIN === 'true' &&
    isLocalHost(headers.get('host'))
  );
}
