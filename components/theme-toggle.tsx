'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { SidebarMenuButton } from '@/components/ui/sidebar';

const emptySubscribe = () => () => {};
function useHasMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHasMounted();

  if (!mounted) return null;

  return (
    <SidebarMenuButton
      tooltip={resolvedTheme === 'dark' ? '切换到亮色' : '切换到暗色'}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
      <span>{resolvedTheme === 'dark' ? '亮色模式' : '暗色模式'}</span>
    </SidebarMenuButton>
  );
}
