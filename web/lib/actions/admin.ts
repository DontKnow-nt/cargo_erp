'use server';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { CreateUserSchema, UpdateUserSchema } from '@/lib/validations';
import { serverLog } from '@/lib/logger';
import { z } from 'zod';

export async function getUsers() {
  await requireRole('SUPER_ADMIN');
  return prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createUser(data: unknown) {
  const session = await requireRole('SUPER_ADMIN');
  const parsed = CreateUserSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: 'Email already in use' };
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: { name: parsed.data.name, email: parsed.data.email, passwordHash, role: parsed.data.role, status: 'ACTIVE' },
  });
  serverLog('info', 'user.created', { adminId: session.user.id, newUserId: user.id, email: user.email, role: user.role });
  revalidatePath('/dashboard/admin');
  return { id: user.id };
}

export async function updateUser(id: string, data: unknown) {
  const session = await requireRole('SUPER_ADMIN');
  const parsed = UpdateUserSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return { error: 'User not found' };
  if (id === session.user.id && parsed.data.role && parsed.data.role !== 'SUPER_ADMIN') {
    return { error: 'Cannot change your own role' };
  }
  await prisma.user.update({
    where: { id },
    data: {
      ...(parsed.data.name && { name: parsed.data.name }),
      ...(parsed.data.role && { role: parsed.data.role }),
      ...(parsed.data.status && { status: parsed.data.status }),
    },
  });
  serverLog('info', 'user.updated', { adminId: session.user.id, targetUserId: id });
  revalidatePath('/dashboard/admin');
  return { success: true };
}

const ChangePasswordSchema = z.object({
  newPassword: z.string()
    .min(8, 'Min 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain number'),
});

export async function deleteUser(userId: string) {
  const session = await requireRole('SUPER_ADMIN');
  if (userId === session.user.id) return { error: 'Cannot delete your own account' };
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) return { error: 'User not found' };
  await prisma.user.update({ where: { id: userId }, data: { status: 'DELETED' } });
  serverLog('info', 'user.deleted', { adminId: session.user.id, targetUserId: userId });
  revalidatePath('/officecontrol/panel');
  return { success: true };
}

export async function changeUserPassword(userId: string, data: unknown) {
  const session = await requireRole('SUPER_ADMIN');
  const parsed = ChangePasswordSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) return { error: 'User not found' };
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  serverLog('info', 'user.password_changed', { adminId: session.user.id, targetUserId: userId });
  return { success: true };
}
