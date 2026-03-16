'use client';

import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function SidebarToggle() {
  const { toggleSidebar } = useSidebar();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarTrigger onClick={toggleSidebar} />
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        切换侧边栏 ⌘B
      </TooltipContent>
    </Tooltip>
  );
}
