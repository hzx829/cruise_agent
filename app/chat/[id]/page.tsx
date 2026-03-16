import { Chat } from '@/components/chat';
import { loadChat } from '@/lib/db/chat-store';

export default async function ChatIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let messages;
  try {
    const result = loadChat(id);
    messages = result.messages;
  } catch {
    // chat 可能还在创建中（replaceState 与 DB 写入的时序差）
    // 渲染空 Chat，首条消息发送时会自动建记录
  }

  return <Chat id={id} initialMessages={messages} />;
}
