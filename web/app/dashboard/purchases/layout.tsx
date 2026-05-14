import { requirePagePermission } from '@/lib/pageGuard';
export default async function PurchasesLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('invoices'); // reuse invoices permission
  return <>{children}</>;
}
