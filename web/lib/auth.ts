import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

export type UserRole = 'SUPER_ADMIN' | 'OPERATIONS_MANAGER' | 'ACCOUNTS_EXECUTIVE' | 'VIEWER';

const ROLE_HIERARCHY: Record<string, number> = {
  SUPER_ADMIN: 4,
  OPERATIONS_MANAGER: 3,
  ACCOUNTS_EXECUTIVE: 2,
  VIEWER: 1,
};

export async function getSession() {
  return getServerSession(authOptions);
}

/** Require auth - redirects to /login if not authenticated */
export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  return session;
}

/** Require a minimum role - redirects to /unauthorized if insufficient */
export async function requireRole(minRole: UserRole) {
  const session = await requireAuth();
  const userRole = (session.user as { role?: string }).role ?? 'VIEWER';
  const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
  if (userLevel < requiredLevel) redirect('/unauthorized');
  return session;
}

export function hasRole(userRole: string, minRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0);
}
