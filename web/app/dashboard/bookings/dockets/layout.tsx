import { requirePagePermission } from '@/lib/pageGuard';
export default async function DocketsLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('bookings/dockets');
  return <>{children}</>;
}
