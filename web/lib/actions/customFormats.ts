'use server';
import '@/lib/polyfill';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export type CustomFormatCol = { header: string; isNumeric: boolean; isTotal: boolean };

export async function listCustomFormats() {
  return prisma.invoiceCustomFormat.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function saveCustomFormat(id: string | null, name: string, columns: CustomFormatCol[]) {
  const session = await getServerSession(authOptions);
  const data = { name, columns: JSON.stringify(columns), createdBy: session?.user?.email ?? null };
  if (id) {
    return prisma.invoiceCustomFormat.update({ where: { id }, data });
  }
  return prisma.invoiceCustomFormat.create({ data });
}

export async function deleteCustomFormat(id: string) {
  return prisma.invoiceCustomFormat.delete({ where: { id } });
}
