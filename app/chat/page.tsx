import { generateId } from 'ai';
import { Chat } from '@/components/chat';

export default function ChatPage() {
  // 每次 Server Component 渲染时生成新的 key
  // 配合 router.refresh() 强制 Chat 组件重新挂载
  return <Chat key={generateId()} />;
}
