import { AlipaySdk } from 'alipay-sdk';
import type { AlipaySdkCommonResult, AlipaySdkConfig } from 'alipay-sdk';
import type { BillingOrder } from '@/lib/db/billing-store';
import { getBillingOrderTimeoutMinutes } from '@/lib/billing/config';

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

interface AlipayBaseConfig {
  appId: string;
  privateKey: string;
  gateway: string;
  notifyUrl: string;
  returnUrl: string;
  sellerId: string | null;
  keyType: 'PKCS1' | 'PKCS8';
}

interface AlipayPublicKeyConfig extends AlipayBaseConfig {
  mode: 'public-key';
  alipayPublicKey: string;
}

interface AlipayCertConfig extends AlipayBaseConfig {
  mode: 'cert';
  appCertPath?: string;
  appCertContent?: string;
  alipayPublicCertPath?: string;
  alipayPublicCertContent?: string;
  alipayRootCertPath?: string;
  alipayRootCertContent?: string;
}

type AlipayConfig = AlipayPublicKeyConfig | AlipayCertConfig;

let sdkSingleton: AlipaySdk | null = null;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function normalizePem(value: string): string {
  return value.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return undefined;
}

function readFirstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }
  return undefined;
}

function readCertSource(contentNames: string[], pathNames: string[]) {
  const content = readFirstEnv(...contentNames);
  const path = readFirstEnv(...pathNames);
  return {
    content: content ? normalizePem(content) : undefined,
    path,
    configured: Boolean(content || path),
  };
}

function getConfig(): AlipayConfig {
  const appId = readEnv('ALIPAY_APP_ID');
  const privateKey = readEnv('ALIPAY_PRIVATE_KEY');
  const alipayPublicKey =
    readEnv('ALIPAY_ALIPAY_PUBLIC_KEY') || readEnv('ALIPAY_PUBLIC_KEY');
  const notifyUrl = readEnv('ALIPAY_NOTIFY_URL');
  const returnUrl = readEnv('ALIPAY_RETURN_URL');

  if (!appId || !privateKey || !notifyUrl || !returnUrl) {
    throw new Error('Alipay is not fully configured.');
  }

  const rawKeyType = readEnv('ALIPAY_KEY_TYPE')?.toUpperCase();
  const baseConfig: AlipayBaseConfig = {
    appId,
    privateKey: normalizePem(privateKey),
    gateway: readEnv('ALIPAY_GATEWAY') || 'https://openapi.alipay.com/gateway.do',
    notifyUrl,
    returnUrl,
    sellerId: readEnv('ALIPAY_SELLER_ID') ?? null,
    keyType: rawKeyType === 'PKCS8' ? 'PKCS8' : 'PKCS1',
  };

  const appCert = readCertSource(
    ['ALIPAY_APP_CERT_CONTENT'],
    ['ALIPAY_APP_CERT_PATH'],
  );
  const alipayPublicCert = readCertSource(
    ['ALIPAY_ALIPAY_PUBLIC_CERT_CONTENT', 'ALIPAY_PUBLIC_CERT_CONTENT'],
    ['ALIPAY_ALIPAY_PUBLIC_CERT_PATH', 'ALIPAY_PUBLIC_CERT_PATH'],
  );
  const alipayRootCert = readCertSource(
    ['ALIPAY_ALIPAY_ROOT_CERT_CONTENT', 'ALIPAY_ROOT_CERT_CONTENT'],
    ['ALIPAY_ALIPAY_ROOT_CERT_PATH', 'ALIPAY_ROOT_CERT_PATH'],
  );
  const hasAnyCertConfig =
    appCert.configured ||
    alipayPublicCert.configured ||
    alipayRootCert.configured;
  const useCertMode =
    parseBoolean(readEnv('ALIPAY_CERT_MODE')) ?? hasAnyCertConfig;

  if (useCertMode) {
    if (
      !appCert.configured ||
      !alipayPublicCert.configured ||
      !alipayRootCert.configured
    ) {
      throw new Error('Alipay cert mode is not fully configured.');
    }

    return {
      ...baseConfig,
      mode: 'cert',
      appCertPath: appCert.path,
      appCertContent: appCert.content,
      alipayPublicCertPath: alipayPublicCert.path,
      alipayPublicCertContent: alipayPublicCert.content,
      alipayRootCertPath: alipayRootCert.path,
      alipayRootCertContent: alipayRootCert.content,
    };
  }

  if (!alipayPublicKey) {
    throw new Error('Alipay public key is not configured.');
  }

  return {
    ...baseConfig,
    mode: 'public-key',
    alipayPublicKey: normalizePem(alipayPublicKey),
  };
}

export function isAlipayConfigured(): boolean {
  try {
    getConfig();
    return true;
  } catch {
    return false;
  }
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
  const sdkConfig: AlipaySdkConfig = {
    appId: config.appId,
    privateKey: config.privateKey,
    gateway: config.gateway,
    keyType: config.keyType,
    signType: 'RSA2',
    timeout: 8000,
  };

  if (config.mode === 'cert') {
    Object.assign(sdkConfig, {
      appCertPath: config.appCertPath,
      appCertContent: config.appCertContent,
      alipayPublicCertPath: config.alipayPublicCertPath,
      alipayPublicCertContent: config.alipayPublicCertContent,
      alipayRootCertPath: config.alipayRootCertPath,
      alipayRootCertContent: config.alipayRootCertContent,
    });
  } else {
    sdkConfig.alipayPublicKey = config.alipayPublicKey;
  }

  sdkSingleton = new AlipaySdk(sdkConfig);
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
      body: `${order.quotaMessages} 点 AI 邮轮助手额度`,
      timeout_express: `${getBillingOrderTimeoutMinutes()}m`,
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
