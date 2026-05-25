import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { getAuthenticatedCookieStoreUser } from '@/lib/auth/session';

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const user = getAuthenticatedCookieStoreUser(cookieStore);
  if (!user) {
    redirect('/login?next=/chat');
  }

  const sidebarState = cookieStore.get('sidebar_state')?.value;
  const defaultOpen = sidebarState !== 'false';

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
