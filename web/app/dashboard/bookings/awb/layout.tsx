import { requirePagePermission } from '@/lib/pageGuard';

export default async function AwbLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('bookings/awb');
  return <>{children}</>;
}
