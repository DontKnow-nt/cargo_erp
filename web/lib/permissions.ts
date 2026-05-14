import prisma from '@/lib/prisma';

export const DEFAULT_PAGES = ['dashboard', 'analytics'] as const;

export const GRANTABLE_PAGES = [
  'bookings/awb', 'bookings/dockets', 'invoices', 'payments', 'outstanding',
  'parties', 'rates', 'import', 'reports', 'analytics', 'audit', 'notifications', 'settings',
] as const;

export type GrantablePage = typeof GRANTABLE_PAGES[number];

export async function getUserPermittedPages(userId: string): Promise<string[]> {
  const granted = await prisma.userPermission.findMany({ where: { userId }, select: { page: true } });
  return [...DEFAULT_PAGES, ...granted.map((p: { page: string }) => p.page)];
}

export function verifyOfficeControlToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(process.env.NEXTAUTH_SECRET ?? '').toString('base64').slice(0, 32);
  return token === expected;
}
