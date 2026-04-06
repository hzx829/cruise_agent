'use client';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { SidebarToggle } from './sidebar-toggle';
import { useSidebar } from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function ChatHeader() {
  const router = useRouter();
  const { open } = useSidebar();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
      <SidebarToggle />

      {/* Sidebar 收起时显示新建对话按钮 */}
      {!open && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                router.push('/chat');
                router.refresh();
              }}
              className="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent"
            >
              <Plus className="size-4" />
              <span className="sr-only">新建对话</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">新建对话</TooltipContent>
        </Tooltip>
      )}
    </header>
  );
}
