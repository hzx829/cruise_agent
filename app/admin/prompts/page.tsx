import type { Metadata } from 'next';
import { PromptAdmin } from '@/components/prompt-admin';

export const metadata: Metadata = {
  title: 'Prompt 管理 | 邮轮特价助手',
};

export default function AdminPromptsPage() {
  return <PromptAdmin />;
}
