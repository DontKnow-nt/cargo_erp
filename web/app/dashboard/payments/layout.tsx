import { requirePagePermission } from '@/lib/pageGuard';
export default async function PaymentsLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('payments');
  return <>{children}</>;
}
