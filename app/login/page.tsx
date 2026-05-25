import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  getAuthenticatedCookieStoreUser,
  sanitizeNextPath,
} from '@/lib/auth/session';
import { isWeChatConfigured } from '@/lib/auth/wechat';
import { WeChatQrLogin } from '@/components/wechat-qr-login';

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
  const user = getAuthenticatedCookieStoreUser(await cookies());
  if (user) {
    redirect(nextPath);
  }

  const error = getParam(params.error);
  const wechatConfigured = isWeChatConfigured();
  const devLoginEnabled = process.env.AUTH_DEV_WECHAT_LOGIN === 'true';
  const wechatStartUrl = `/api/auth/wechat/start?next=${encodeURIComponent(nextPath)}`;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#d8eaff] px-4 py-10 text-[#273142]">
      <section className="relative flex min-h-[580px] w-full max-w-[490px] flex-col rounded-lg bg-white px-14 py-11 shadow-[0_24px_70px_rgba(52,108,180,0.18)] max-sm:min-h-[540px] max-sm:px-8">
        <div className="pointer-events-none absolute right-6 top-6 size-10 text-[#2f67dd]">
          <span className="absolute right-0 top-0 block size-9 border-r-[5px] border-t-[5px] border-current" />
          <span className="absolute right-2 top-2 block size-6 border-r-[5px] border-t-[5px] border-current" />
          <span className="absolute right-0 top-8 block h-2 w-2 border-r-[5px] border-current" />
        </div>

        <div>
          <div className="flex size-12 items-center justify-center rounded-md bg-[#172a8a] text-lg font-semibold text-white shadow-[0_8px_18px_rgba(23,42,138,0.18)]">
            邮
          </div>
          <h1 className="mt-4 text-[26px] font-semibold leading-tight text-[#273142]">
            AI 邮轮运营平台
          </h1>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center pt-10">
          {error && (
            <div className="mb-6 w-full rounded-md border border-[#ffd1d1] bg-[#fff4f4] px-3 py-2 text-sm text-[#c03232]">
              {ERROR_MESSAGES[error] ?? '登录失败，请重新尝试。'}
            </div>
          )}

          <WeChatQrLogin
            nextPath={nextPath}
            enabled={wechatConfigured}
            startUrl={wechatStartUrl}
          />
        </div>

        <div className="min-h-10">
          {devLoginEnabled && (
            <Link
              href={`/api/auth/dev/wechat?next=${encodeURIComponent(nextPath)}`}
              className="mx-auto flex h-9 w-fit items-center justify-center rounded-md border border-[#d7e0ef] px-4 text-sm font-medium text-[#2d64db] hover:bg-[#f3f7ff]"
            >
              本地模拟微信登录
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
