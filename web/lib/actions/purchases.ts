'use server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import { serverLog } from '@/lib/logger';

const PurchaseSchema = z.object({
  vendorName:  z.string().min(1).max(200).trim(),
  vendorGstin: z.string().max(15).optional(),
  invoiceNo:   z.string().min(1).max(50).trim(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  subtotal:    z.number().min(0),
  gstAmount:   z.number().min(0),
  totalAmount: z.number().min(0),
  description: z.string().max(500).optional(),
  category:    z.string().max(100).optional(),
  rawText:     z.string().optional(),
});

export async function getPurchaseInvoices() {
  await requireAuth();
  return prisma.purchaseInvoice.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function createPurchaseInvoice(data: unknown) {
  const session = await requireAuth();
  const parsed = PurchaseSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const inv = await prisma.purchaseInvoice.create({
    data: { ...parsed.data, status: 'PENDING', createdBy: session.user.id },
  });
  serverLog('info', 'purchase.created', { userId: session.user.id, id: inv.id, invoiceNo: inv.invoiceNo });
  revalidatePath('/dashboard/purchases');
  return { id: inv.id };
}

export async function updatePurchaseInvoiceStatus(id: string, status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'PARTIALLY_PAID') {
  const session = await requireAuth();
  await prisma.purchaseInvoice.update({ where: { id }, data: { status } });
  serverLog('info', 'purchase.status_updated', { userId: session.user.id, id, status });
  revalidatePath('/dashboard/purchases');
  return { success: true };
}

export async function deletePurchaseInvoices(ids: string[]) {
  const session = await requireAuth();
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) return { error: 'Invalid IDs' };
  await prisma.purchaseInvoice.deleteMany({ where: { id: { in: ids } } });
  serverLog('info', 'purchase.deleted', { userId: session.user.id, count: ids.length });
  revalidatePath('/dashboard/purchases');
  return { success: true };
}
