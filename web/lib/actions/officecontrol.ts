'use server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { serverLog } from '@/lib/logger';
import { GRANTABLE_PAGES, type GrantablePage } from '@/lib/permissions';

type PrismaPermissionRecord = { page: string };
type PrismaUserWithPermissions = Awaited<ReturnType<typeof prisma.user.findMany>>[number] & {
  permissions: PrismaPermissionRecord[];
};

export type UserWithPermissions = {
  id: string; name: string; email: string; role: string; status: string; permissions: string[];
};

export async function getUsersWithPermissions(): Promise<UserWithPermissions[]> {
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    include: { permissions: { select: { page: true } } },
  });
  return users.map((u: PrismaUserWithPermissions) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, permissions: u.permissions.map((p: PrismaPermissionRecord) => p.page) }));
}

export async function grantPermission(userId: string, page: string, grantedBy: string) {
  if (!GRANTABLE_PAGES.includes(page as GrantablePage)) return { error: 'Invalid page' };
  if (!userId || typeof userId !== 'string') return { error: 'Invalid user' };
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: 'User not found' };
  await prisma.userPermission.upsert({
    where: { userId_page: { userId, page } },
    update: {},
    create: { userId, page, grantedBy },
  });
  serverLog('info', 'officecontrol.grant', { grantedBy, userId, page });
  revalidatePath('/officecontrol/panel');
  return { success: true };
}

export async function revokePermission(userId: string, page: string, revokedBy: string) {
  if (!GRANTABLE_PAGES.includes(page as GrantablePage)) return { error: 'Invalid page' };
  await prisma.userPermission.deleteMany({ where: { userId, page } });
  serverLog('info', 'officecontrol.revoke', { revokedBy, userId, page });
  revalidatePath('/officecontrol/panel');
  return { success: true };
}
