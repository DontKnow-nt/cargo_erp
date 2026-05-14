import { requirePagePermission } from '@/lib/pageGuard';
export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('notifications');
  return <>{children}</>;
}
