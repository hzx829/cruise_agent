import { cookies } from 'next/headers';
import { Chat } from '@/components/chat';
import { loadChat } from '@/lib/db/chat-store';
import { getAuthenticatedCookieStoreUser } from '@/lib/auth/session';

export default async function ChatIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const user = getAuthenticatedCookieStoreUser(cookieStore);

  let messages;
  try {
    const result = loadChat(id, user?.id);
    messages = result.messages;
  } catch {
    // chat 可能还在创建中（replaceState 与 DB 写入的时序差）
    // 渲染空 Chat，首条消息发送时会自动建记录
  }

  return <Chat id={id} initialMessages={messages} />;
}
