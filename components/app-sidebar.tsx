'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ComponentType } from 'react';
import useSWR from 'swr';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Bell,
  MessageSquareText,
  MoreHorizontal,
  Ship,
  Plus,
  Settings2,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react';

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
import { AccountMenu } from './account-menu';
import { BillingStatus } from './billing-status';

interface AuthMe {
  authenticated: boolean;
  user: {
    role: string;
  } | null;
}

const ADMIN_TOKEN_STORAGE_KEY = 'cruise_agent_admin_token';
const fetcher = (url: string) => fetch(url).then((r) => r.json());

function useAdminMenuAccess(): {
  showAdminMenu: boolean;
  showUserManagement: boolean;
} {
  const { data } = useSWR<AuthMe>('/api/auth/me', fetcher, {
    revalidateOnFocus: false,
  });
  const [hasStoredAdminToken] = useState(
    () =>
      typeof window !== 'undefined' &&
      Boolean(window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)),
  );

  const role = data?.user?.role;
  const isAdminRole = role === 'admin' || role === 'root';

  return {
    showAdminMenu: isAdminRole || hasStoredAdminToken,
    showUserManagement: role === 'root',
  };
}

export function AppSidebar() {
  const router = useRouter();
  const { showAdminMenu, showUserManagement } = useAdminMenuAccess();

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
            <AccountMenu />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <BillingStatus />
          </SidebarMenuItem>
          {showAdminMenu && (
            <SidebarMenuItem>
              <AdminMenu showUserManagement={showUserManagement} />
            </SidebarMenuItem>
          )}
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

function AdminMenu({
  showUserManagement,
}: {
  showUserManagement: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <SidebarMenuButton tooltip="管理">
          <ShieldCheck />
          <span>管理</span>
          <MoreHorizontal className="ml-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="end"
          sideOffset={8}
          className="z-50 w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {showUserManagement && (
            <AdminMenuItem href="/admin/users" icon={UsersRound} label="Users" />
          )}
          <AdminMenuItem href="/admin/prompts" icon={Settings2} label="Prompt" />
          <AdminMenuItem href="/admin/billing" icon={WalletCards} label="计费" />
          <AdminMenuItem
            href="/admin/sessions"
            icon={MessageSquareText}
            label="Sessions"
          />
          <AdminMenuItem href="/admin/agent-traces" icon={Bell} label="Trace" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function AdminMenuItem({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <DropdownMenu.Item asChild>
      <Link
        href={href}
        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
      >
        <Icon className="size-4" />
        <span>{label}</span>
      </Link>
    </DropdownMenu.Item>
  );
}
