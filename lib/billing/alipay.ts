import { AlipaySdk } from 'alipay-sdk';
import type { AlipaySdkCommonResult } from 'alipay-sdk';
import type { BillingOrder } from '@/lib/db/billing-store';

export interface AlipayNotifyPayload {
  [key: string]: string;
}

export interface AlipayTradeQueryResult extends AlipaySdkCommonResult {
  trade_status?: string;
  tradeStatus?: string;
  trade_no?: string;
  tradeNo?: string;
  out_trade_no?: string;
  outTradeNo?: string;
  total_amount?: string;
  totalAmount?: string;
  send_pay_date?: string;
  sendPayDate?: string;
}

interface AlipayConfig {
  appId: string;
  privateKey: string;
  alipayPublicKey: string;
  gateway: string;
  notifyUrl: string;
  returnUrl: string;
  sellerId: string | null;
  keyType: 'PKCS1' | 'PKCS8';
}

let sdkSingleton: AlipaySdk | null = null;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function normalizePem(value: string): string {
  return value.replace(/\\n/g, '\n');
}

function getConfig(): AlipayConfig {
  const appId = readEnv('ALIPAY_APP_ID');
  const privateKey = readEnv('ALIPAY_PRIVATE_KEY');
  const alipayPublicKey =
    readEnv('ALIPAY_ALIPAY_PUBLIC_KEY') || readEnv('ALIPAY_PUBLIC_KEY');
  const notifyUrl = readEnv('ALIPAY_NOTIFY_URL');
  const returnUrl = readEnv('ALIPAY_RETURN_URL');

  if (!appId || !privateKey || !alipayPublicKey || !notifyUrl || !returnUrl) {
    throw new Error('Alipay is not fully configured.');
  }

  const rawKeyType = readEnv('ALIPAY_KEY_TYPE')?.toUpperCase();
  return {
    appId,
    privateKey: normalizePem(privateKey),
    alipayPublicKey: normalizePem(alipayPublicKey),
    gateway: readEnv('ALIPAY_GATEWAY') || 'https://openapi.alipay.com/gateway.do',
    notifyUrl,
    returnUrl,
    sellerId: readEnv('ALIPAY_SELLER_ID') ?? null,
    keyType: rawKeyType === 'PKCS8' ? 'PKCS8' : 'PKCS1',
  };
}

export function isAlipayConfigured(): boolean {
  return Boolean(
    readEnv('ALIPAY_APP_ID') &&
      readEnv('ALIPAY_PRIVATE_KEY') &&
      (readEnv('ALIPAY_ALIPAY_PUBLIC_KEY') || readEnv('ALIPAY_PUBLIC_KEY')) &&
      readEnv('ALIPAY_NOTIFY_URL') &&
      readEnv('ALIPAY_RETURN_URL'),
  );
}

export function getAlipayAppId(): string | null {
  return readEnv('ALIPAY_APP_ID') ?? null;
}

export function getAlipaySellerId(): string | null {
  return readEnv('ALIPAY_SELLER_ID') ?? null;
}

function getSdk(): AlipaySdk {
  if (sdkSingleton) return sdkSingleton;
  const config = getConfig();
  sdkSingleton = new AlipaySdk({
    appId: config.appId,
    privateKey: config.privateKey,
    alipayPublicKey: config.alipayPublicKey,
    gateway: config.gateway,
    keyType: config.keyType,
    signType: 'RSA2',
    timeout: 8000,
  });
  return sdkSingleton;
}

export function formatCnyAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

export function parseCnyAmountToCents(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [yuan, rawFen = ''] = normalized.split('.');
  const fen = rawFen.padEnd(2, '0').slice(0, 2);
  return Number(yuan) * 100 + Number(fen || 0);
}

export function alipayDateToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(' ', 'T');
  const date = new Date(`${normalized}+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function createAlipayPagePayHtml(order: BillingOrder): string {
  const config = getConfig();
  const returnUrl = new URL(config.returnUrl);
  returnUrl.searchParams.set('orderId', order.id);
  return getSdk().pageExecute('alipay.trade.page.pay', 'POST', {
    notifyUrl: config.notifyUrl,
    returnUrl: returnUrl.toString(),
    bizContent: {
      out_trade_no: order.outTradeNo,
      product_code: 'FAST_INSTANT_TRADE_PAY',
      total_amount: formatCnyAmount(order.amountCents),
      subject: order.subject,
      body: `${order.quotaMessages} 次 AI 邮轮助手额度`,
    },
  });
}

export function verifyAlipayNotify(payload: AlipayNotifyPayload): boolean {
  return getSdk().checkNotifySignV2(payload);
}

export async function queryAlipayTrade(
  outTradeNo: string,
): Promise<AlipayTradeQueryResult> {
  return (await getSdk().exec('alipay.trade.query', {
    bizContent: {
      out_trade_no: outTradeNo,
    },
  })) as AlipayTradeQueryResult;
}

export function getTradeStatus(result: AlipayTradeQueryResult): string | null {
  return result.trade_status || result.tradeStatus || null;
}

export function getTradeNo(result: AlipayTradeQueryResult): string | null {
  return result.trade_no || result.tradeNo || null;
}

export function getOutTradeNo(result: AlipayTradeQueryResult): string | null {
  return result.out_trade_no || result.outTradeNo || null;
}

export function getTotalAmount(result: AlipayTradeQueryResult): string | null {
  return result.total_amount || result.totalAmount || null;
}

export function getPaidAt(result: AlipayTradeQueryResult): string | null {
  return alipayDateToIso(result.send_pay_date || result.sendPayDate);
}
