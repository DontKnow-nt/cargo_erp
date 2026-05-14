'use server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';

export type BankDetail = {
  id: string; account_name: string; bank_name: string; branch: string;
  account_number: string; ifsc: string; is_default: number;
};

const BankSchema = z.object({
  accountName: z.string().min(2).max(200).trim(),
  bankName: z.string().min(2).max(100).trim(),
  branch: z.string().min(2).max(200).trim(),
  accountNumber: z.string().min(5).max(30).trim().regex(/^\d+$/, 'Account number must be digits only'),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code'),
});

export async function getBanks() {
  await requireAuth();
  const banks = await prisma.bankDetail.findMany({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  // Map to snake_case for UI compatibility
  return banks.map(b => ({ id: b.id, account_name: b.accountName, bank_name: b.bankName, branch: b.branch, account_number: b.accountNumber, ifsc: b.ifsc, is_default: b.isDefault ? 1 : 0 }));
}

export async function addBank(data: unknown) {
  await requireAuth();
  const parsed = BankSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const bank = await prisma.bankDetail.create({ data: { accountName: parsed.data.accountName, bankName: parsed.data.bankName, branch: parsed.data.branch, accountNumber: parsed.data.accountNumber, ifsc: parsed.data.ifsc.toUpperCase(), isDefault: false } });
  revalidatePath('/dashboard/invoices');
  return { id: bank.id };
}

export async function setDefaultBank(id: string) {
  await requireAuth();
  await prisma.$transaction([
    prisma.bankDetail.updateMany({ data: { isDefault: false } }),
    prisma.bankDetail.update({ where: { id }, data: { isDefault: true } }),
  ]);
  revalidatePath('/dashboard/invoices');
  return { success: true };
}

export async function deleteBank(id: string) {
  await requireAuth();
  await prisma.bankDetail.delete({ where: { id } });
  revalidatePath('/dashboard/invoices');
  return { success: true };
}
