import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUserPermittedPages } from '@/lib/permissions';

export async function requirePagePermission(pageKey: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  const userId = (session.user as { id: string }).id;
  const permitted = await getUserPermittedPages(userId);
  if (!permitted.includes(pageKey)) redirect('/unauthorized');
  return session;
}
