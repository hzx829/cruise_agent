'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ship, Plus } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { SidebarHistory } from './sidebar-history';
import { ThemeToggle } from './theme-toggle';
import { NotificationBell } from './notification-bell';

export function AppSidebar() {
  const router = useRouter();

  return (
    <Sidebar>
      {/* ── Header: 品牌 + 新建对话 ── */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/chat">
                <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
                  <Ship className="size-4 text-primary" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">邮轮助手</span>
                  <span className="text-xs text-muted-foreground">
                    价格追踪 · 降价发现
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* 新建对话按钮 */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="新建对话"
              onClick={() => {
                router.push('/chat');
                router.refresh();
              }}
            >
              <Plus />
              <span>新建对话</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ── Content: 聊天历史列表 ── */}
      <SidebarContent>
        <SidebarHistory />
      </SidebarContent>

      {/* ── Footer: 主题切换 ── */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <NotificationBell />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
