import type { Metadata } from 'next';
import { AdminSessions } from '@/components/admin-sessions';

export const metadata: Metadata = {
  title: 'User Sessions | 邮轮特价助手',
};

export default function AdminSessionsPage() {
  return <AdminSessions />;
}
