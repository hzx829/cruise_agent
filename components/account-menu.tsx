'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import * as Popover from '@radix-ui/react-popover';
import { LogIn, LogOut, UserCircle } from 'lucide-react';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { fetchWithAuthRedirect, getLoginUrl } from '@/lib/auth/client';

interface AuthMe {
  authenticated: boolean;
  user: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    role: string;
    isAnonymous: boolean;
  } | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function getLoginHref(pathname: string | null): string {
  const nextPath = pathname && pathname.startsWith('/') ? pathname : '/chat';
  return getLoginUrl(nextPath);
}

export function AccountMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const { data, mutate, isLoading } = useSWR<AuthMe>('/api/auth/me', fetcher, {
    revalidateOnFocus: false,
  });

  const handleLogout = async () => {
    await fetchWithAuthRedirect('/api/auth/logout', { method: 'POST' });
    await mutate();
    router.push(getLoginUrl('/chat'));
    router.refresh();
  };

  if (isLoading || !data) {
    return (
      <SidebarMenuButton disabled tooltip="账号">
        <UserCircle />
        <span>账号</span>
      </SidebarMenuButton>
    );
  }

  if (!data.authenticated) {
    return (
      <SidebarMenuButton tooltip="微信登录" asChild>
        <Link href={getLoginHref(pathname)}>
          <LogIn />
          <span>微信登录</span>
        </Link>
      </SidebarMenuButton>
    );
  }

  const displayName = data.user?.displayName || '微信用户';

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <SidebarMenuButton tooltip={displayName}>
          {data.user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.user.avatarUrl}
              alt=""
              className="size-4 rounded-full object-cover"
            />
          ) : (
            <UserCircle />
          )}
          <span className="truncate">{displayName}</span>
        </SidebarMenuButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="end"
          sideOffset={8}
          className="z-50 w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center gap-2 border-b px-2 py-2">
            {data.user?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.user.avatarUrl}
                alt=""
                className="size-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                <UserCircle className="size-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">已通过微信登录</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="size-4" />
            <span>退出登录</span>
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
