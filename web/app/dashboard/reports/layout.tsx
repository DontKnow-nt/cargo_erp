import { requirePagePermission } from '@/lib/pageGuard';
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('reports');
  return <>{children}</>;
}
