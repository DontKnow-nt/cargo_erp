import { requirePagePermission } from '@/lib/pageGuard';
export default async function RatesLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('rates');
  return <>{children}</>;
}
