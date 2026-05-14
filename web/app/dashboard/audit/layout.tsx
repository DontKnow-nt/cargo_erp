import { requirePagePermission } from '@/lib/pageGuard';
export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('audit');
  return <>{children}</>;
}
