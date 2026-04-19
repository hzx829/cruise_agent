'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Bell, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import * as Popover from '@radix-ui/react-popover';
import type { NotificationRow } from '@/lib/db/notification-store';
import { SidebarMenuButton } from '@/components/ui/sidebar';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const WELCOME_NOTICE_STORAGE_KEY = 'cruiseswift_welcome_notice_seen_v1';
const WELCOME_NOTICE = `⚓️ 欢迎来到游速达 CruiseSwift！
嘿！我是你的 24h 邮轮营销外挂。在这里，我们联手拒绝 AI 的“价格幻觉”，只抓实打实的官网降价干货！

🚀 快速上手指南
 💰 价格巡航：我们的核心必杀技！这里的逻辑很简单：谁降价多谁排前面 能专门为您锁定真实的：① 最优单船票价格；② 适合开团的超值促销航次。
 💬 全能百科：涉及非价格类咨询（比船型、查攻略、问政策），直接在对话框提问，为您全网智搜。
 ✍️ 爆款文案：一键生成小红书/朋友圈种草内容。日更带货卖什么？以后我包了！

💡 贴心提示：找营销灵感请认准【价格巡航】（价格优先）；获取综合百科请直接对话。

🛠 意见反馈 |  BUG反馈、谈个合作或是交个朋友？别客气，直接戳微信：15921722426 
最后祝您：眼里有大海，兜里有大单，天天早下班！☀️`;

interface NotificationData {
  notifications: NotificationRow[];
  unreadCount: number;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data, mutate } = useSWR<NotificationData>(
    '/api/notifications?unread=true',
    fetcher,
    { refreshInterval: 30_000 }, // 30 秒轮询
  );

  const router = useRouter();
  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    let shouldOpenWelcome = false;

    try {
      if (!localStorage.getItem(WELCOME_NOTICE_STORAGE_KEY)) {
        localStorage.setItem(WELCOME_NOTICE_STORAGE_KEY, 'true');
        shouldOpenWelcome = true;
      }
    } catch {
      // localStorage may be unavailable in privacy-restricted browsers.
    }

    if (!shouldOpenWelcome) return;

    const timeoutId = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const handleClickNotification = async (notification: NotificationRow) => {
    // 标记已读
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notification.id }),
    });
    mutate();

    // 根据通知类型跳转
    if (notification.type === 'price_drop') {
      router.push(`/chat?prompt=${encodeURIComponent('查看最新降价航线')}`);
    }
  };

  const handleMarkAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    mutate();
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <SidebarMenuButton tooltip="通知">
          <div className="relative">
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <span>通知</span>
          {unreadCount > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {unreadCount}
            </span>
          )}
        </SidebarMenuButton>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="right"
          align="end"
          sideOffset={8}
          className="z-50 flex max-h-[min(34rem,calc(100vh-2rem))] w-96 max-w-[calc(100vw-2rem)] flex-col rounded-lg border bg-popover p-0 text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-sm font-semibold">通知</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Check className="size-3" />
                全部已读
              </button>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto">
            <section className="border-b px-4 py-3">
              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                {WELCOME_NOTICE}
              </p>
            </section>

            {/* Notification list */}
            {data?.notifications?.length ? (
              data.notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  className="flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted"
                >
                  <span className="text-sm font-medium">{n.title}</span>
                  {n.body && (
                    <span className="text-xs text-muted-foreground line-clamp-2">
                      {n.body}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), {
                      locale: zhCN,
                      addSuffix: true,
                    })}
                  </span>
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center px-4 py-8">
                <p className="text-sm text-muted-foreground">暂无新通知 ✨</p>
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
