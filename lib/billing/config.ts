function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return undefined;
}

export function isChatBillingEnabled(): boolean {
  return (
    parseBoolean(process.env.CHAT_BILLING_ENABLED) ??
    parseBoolean(process.env.BILLING_ENABLED) ??
    false
  );
}
