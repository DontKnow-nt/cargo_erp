import { requirePagePermission } from '@/lib/pageGuard';
export default async function InvoicesLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('invoices');
  return <>{children}</>;
}
