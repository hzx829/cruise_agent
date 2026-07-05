function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return undefined;
}

function parsePositiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return Math.trunc(number);
}

export function isChatBillingEnabled(): boolean {
  return (
    parseBoolean(process.env.CHAT_BILLING_ENABLED) ??
    parseBoolean(process.env.BILLING_ENABLED) ??
    false
  );
}

export function getBillingOrderTimeoutMinutes(): number {
  return Math.min(
    parsePositiveInteger(process.env.BILLING_ORDER_TIMEOUT_MINUTES) ?? 120,
    15 * 24 * 60,
  );
}
