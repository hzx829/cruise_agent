'use client';

import useSWR from 'swr';
import { Bell, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import * as Popover from '@radix-ui/react-popover';
import type { NotificationRow } from '@/lib/db/notification-store';
import { SidebarMenuButton } from '@/components/ui/sidebar';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface NotificationData {
  notifications: NotificationRow[];
  unreadCount: number;
}

export function NotificationBell() {
  const { data, mutate } = useSWR<NotificationData>(
    '/api/notifications?unread=true',
    fetcher,
    { refreshInterval: 30_000 }, // 30 秒轮询
  );

  const router = useRouter();
  const unreadCount = data?.unreadCount ?? 0;

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
    <Popover.Root>
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
          className="z-50 w-80 rounded-lg border bg-popover p-0 text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
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

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
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
