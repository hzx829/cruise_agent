import type { Metadata } from 'next';
import { AdminUsers } from '@/components/admin-users';

export const metadata: Metadata = {
  title: 'Users | 邮轮特价助手',
};

export default function AdminUsersPage() {
  return <AdminUsers />;
}
