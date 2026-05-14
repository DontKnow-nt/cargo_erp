import { requirePagePermission } from '@/lib/pageGuard';
export default async function PartiesLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('parties');
  return <>{children}</>;
}
