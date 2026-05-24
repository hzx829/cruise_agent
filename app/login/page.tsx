import Link from 'next/link';
import { ArrowLeft, MessageCircle, Ship } from 'lucide-react';
import { sanitizeNextPath } from '@/lib/auth/session';
import { isWeChatConfigured } from '@/lib/auth/wechat';

const ERROR_MESSAGES: Record<string, string> = {
  wechat_not_configured: '微信开放平台参数还没有配置。',
  invalid_state: '登录状态已过期，请重新扫码。',
  missing_code: '微信没有返回授权码，请重新扫码。',
  wechat_callback_failed: '微信登录回调失败，请稍后再试。',
};

function getParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(getParam(params.next));
  const error = getParam(params.error);
  const wechatConfigured = isWeChatConfigured();
  const devLoginEnabled = process.env.AUTH_DEV_WECHAT_LOGIN === 'true';

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <Link
          href={nextPath}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          返回
        </Link>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary/10">
              <Ship className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">登录 CruiseSwift</h1>
              <p className="text-sm text-muted-foreground">保存聊天与付费权益</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {ERROR_MESSAGES[error] ?? '登录失败，请重新尝试。'}
            </div>
          )}

          {wechatConfigured ? (
            <Link
              href={`/api/auth/wechat/start?next=${encodeURIComponent(nextPath)}`}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <MessageCircle className="size-4" />
              微信扫码登录
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-muted px-3 text-sm font-medium text-muted-foreground"
            >
              <MessageCircle className="size-4" />
              等待微信开放平台参数
            </button>
          )}

          {devLoginEnabled && (
            <Link
              href={`/api/auth/dev/wechat?next=${encodeURIComponent(nextPath)}`}
              className="mt-3 flex h-10 w-full items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              本地模拟微信登录
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
