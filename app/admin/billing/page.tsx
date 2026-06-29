import type { Metadata } from 'next';
import { AdminBilling } from '@/components/admin-billing';

export const metadata: Metadata = {
  title: 'Billing | 邮轮特价助手',
};

export default function AdminBillingPage() {
  return <AdminBilling />;
}
