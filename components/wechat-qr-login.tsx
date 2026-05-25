'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Loader2, MessageCircle, RefreshCw } from 'lucide-react';

declare global {
  interface Window {
    WxLogin?: new (options: {
      self_redirect?: boolean;
      id: string;
      appid: string;
      scope: string;
      redirect_uri: string;
      state: string;
      style?: string;
      href?: string;
    }) => unknown;
  }
}

interface WeChatQrConfig {
  appId: string;
  scope: string;
  redirectUri: string;
  state: string;
}

interface WeChatQrLoginProps {
  nextPath: string;
  enabled: boolean;
  startUrl: string;
}

const WECHAT_SCRIPT_URL =
  'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js';

function loadWeChatScript(): Promise<void> {
  if (window.WxLogin) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${WECHAT_SCRIPT_URL}"]`,
    );

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = WECHAT_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load WeChat QR script'));
    document.head.appendChild(script);
  });
}

async function loadQrConfig(nextPath: string): Promise<WeChatQrConfig> {
  const response = await fetch(
    `/api/auth/wechat/qr-config?next=${encodeURIComponent(nextPath)}`,
    { cache: 'no-store' },
  );

  if (!response.ok) {
    throw new Error('WeChat QR config is unavailable');
  }

  return response.json() as Promise<WeChatQrConfig>;
}

export function WeChatQrLogin({
  nextPath,
  enabled,
  startUrl,
}: WeChatQrLoginProps) {
  const reactId = useId();
  const containerId = `wechat-qr-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    enabled ? 'loading' : 'idle',
  );
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    Promise.all([loadWeChatScript(), loadQrConfig(nextPath)])
      .then(([, config]) => {
        if (cancelled || !window.WxLogin) return;
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';

        new window.WxLogin({
          self_redirect: false,
          id: containerId,
          appid: config.appId,
          scope: config.scope,
          redirect_uri: encodeURIComponent(config.redirectUri),
          state: config.state,
          style: 'black',
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [containerId, enabled, nextPath, retryKey]);

  if (!enabled) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-[#cbd9ef] bg-[#f8fbff] px-6 text-center">
        <MessageCircle className="size-8 text-[#2d64db]" />
        <div>
          <p className="text-sm font-medium text-[#273142]">等待微信开放平台参数</p>
          <p className="mt-1 text-xs text-[#7c8798]">
            配置完成后这里会显示微信扫码登录二维码
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex size-48 items-center justify-center overflow-hidden bg-white">
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white text-[#7c8798]">
            <Loader2 className="size-6 animate-spin text-[#2d64db]" />
            <span className="text-xs">正在生成二维码</span>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white text-center">
            <p className="text-sm font-medium text-[#273142]">二维码加载失败</p>
            <button
              type="button"
              onClick={() => {
                setStatus('loading');
                setRetryKey((value) => value + 1);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#d7e0ef] px-3 text-xs font-medium text-[#2d64db] hover:bg-[#f3f7ff]"
            >
              <RefreshCw className="size-3.5" />
              重试
            </button>
          </div>
        )}
        <div
          id={containerId}
          className="wechat-qr-frame flex size-full items-center justify-center"
        />
      </div>
      <p className="mt-3 text-sm text-[#4f5b6d]">使用微信扫码登录</p>
      <Link
        href={startUrl}
        className="mt-2 text-xs text-[#8a95a6] underline-offset-4 hover:text-[#2d64db] hover:underline"
      >
        二维码异常时打开微信登录页
      </Link>
    </div>
  );
}
