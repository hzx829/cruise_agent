'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import {
  isToday,
  isYesterday,
  subWeeks,
  subMonths,
} from 'date-fns';
import { Loader2, Trash2 } from 'lucide-react';

import type { ChatRow } from '@/lib/db/chat-store';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';

// ── 常量 ──────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ── Fetcher ───────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type HistoryPage = {
  chats: ChatRow[];
  hasMore: boolean;
};

/**
 * SWR Infinite pagination key 函数
 * 导出以便其他组件可以使用 mutate 刷新历史列表
 */
export function getChatHistoryPaginationKey(
  pageIndex: number,
  previousPageData: HistoryPage | null,
) {
  if (pageIndex === 0) return `/api/history?limit=${PAGE_SIZE}`;
  if (!previousPageData?.hasMore) return null;
  const lastChat = previousPageData.chats.at(-1);
  if (!lastChat) return null;
  return `/api/history?ending_before=${lastChat.id}&limit=${PAGE_SIZE}`;
}

// ── 日期分组 ──────────────────────────────────────────────

type GroupLabel = '今天' | '昨天' | '最近 7 天' | '最近 30 天' | '更早';

function groupChatsByDate(
  chats: ChatRow[],
): Record<GroupLabel, ChatRow[]> {
  const groups: Record<GroupLabel, ChatRow[]> = {
    今天: [],
    昨天: [],
    '最近 7 天': [],
    '最近 30 天': [],
    更早: [],
  };

  const oneWeekAgo = subWeeks(new Date(), 1);
  const oneMonthAgo = subMonths(new Date(), 1);

  for (const chat of chats) {
    const date = new Date(chat.updated_at);
    if (isToday(date)) {
      groups['今天'].push(chat);
    } else if (isYesterday(date)) {
      groups['昨天'].push(chat);
    } else if (date > oneWeekAgo) {
      groups['最近 7 天'].push(chat);
    } else if (date > oneMonthAgo) {
      groups['最近 30 天'].push(chat);
    } else {
      groups['更早'].push(chat);
    }
  }

  return groups;
}

// ── 骨架屏 ────────────────────────────────────────────────

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-2 p-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full rounded-md" />
      ))}
    </div>
  );
}

// ── SidebarHistory ────────────────────────────────────────

export function SidebarHistory() {
  const { data, size, setSize, isLoading, isValidating, mutate } =
    useSWRInfinite<HistoryPage>(getChatHistoryPaginationKey, fetcher, {
      dedupingInterval: 5000,
    });

  const router = useRouter();
  const params = useParams();
  const currentChatId = params?.id as string | undefined;
  const { setOpenMobile } = useSidebar();

  if (isLoading) return <HistorySkeleton />;

  const chats = data?.flatMap((page) => page.chats) ?? [];
  const hasMore = data?.at(-1)?.hasMore ?? false;

  if (chats.length === 0) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              还没有聊天记录
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              点击「新建对话」开始
            </p>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const grouped = groupChatsByDate(chats);

  const handleDelete = async (chatId: string) => {
    await fetch(`/api/chat/${chatId}`, { method: 'DELETE' });
    mutate();
    if (chatId === currentChatId) {
      router.push('/chat');
    }
  };

  return (
    <>
      {(Object.entries(grouped) as [GroupLabel, ChatRow[]][])
        .filter(([, items]) => items.length > 0)
        .map(([label, items]) => (
          <SidebarGroup key={label}>
            <SidebarGroupLabel>{label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((chat) => (
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={chat.id === currentChatId}
                    >
                      <Link
                        href={`/chat/${chat.id}`}
                        onClick={() => setOpenMobile(false)}
                      >
                        <span>{chat.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      showOnHover
                      onClick={() => handleDelete(chat.id)}
                    >
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">删除</span>
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

      {/* 加载更多 */}
      {hasMore && (
        <div className="flex justify-center p-2">
          <button
            onClick={() => setSize(size + 1)}
            disabled={isValidating}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {isValidating ? (
              <Loader2 className="size-3 animate-spin" />
            ) : null}
            加载更多
          </button>
        </div>
      )}
    </>
  );
}
