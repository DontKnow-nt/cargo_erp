import { requirePagePermission } from '@/lib/pageGuard';
export default async function OutstandingLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('outstanding');
  return <>{children}</>;
}
