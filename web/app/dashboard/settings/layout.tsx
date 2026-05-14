import { requirePagePermission } from '@/lib/pageGuard';
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('settings');
  return <>{children}</>;
}
