import { requirePagePermission } from '@/lib/pageGuard';
export default async function ImportLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('import');
  return <>{children}</>;
}
