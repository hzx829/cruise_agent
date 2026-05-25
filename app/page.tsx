import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuthenticatedCookieStoreUser } from '@/lib/auth/session';

export default async function Home() {
  const user = getAuthenticatedCookieStoreUser(await cookies());
  if (!user) {
    redirect('/login?next=/chat');
  }

  redirect('/chat');
}
