'use server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { PaymentReceiptSchema } from '@/lib/validations';
import { recordAuditLog, serverLog } from '@/lib/logger';

export async function getPayments() {
  await requireAuth();
  return prisma.paymentReceipt.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function addPaymentReceipt(data: unknown) {
  const session = await requireAuth();
  const parsed = PaymentReceiptSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const inv = parsed.data.invoiceId ? await prisma.invoice.findUnique({ where: { id: parsed.data.invoiceId } }) : null;
  if (parsed.data.invoiceId && !inv) return { error: 'Invoice not found' };
  if (inv?.status === 'CANCELLED') return { error: 'Cannot pay cancelled invoice' };

  const count = await prisma.paymentReceipt.count();
  const ts = Date.now().toString().slice(-6);
  const receiptNo = `RCP-${new Date().getFullYear()}-${ts}`;
  // Check uniqueness
  const existing = await prisma.paymentReceipt.findFirst({ where: { receiptNo } });
  const finalReceiptNo = existing ? `RCP-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}-${ts.slice(-2)}` : receiptNo;
  const newPaid = (inv?.paidTotal ?? 0) + parsed.data.paymentAmount;
  const newOut = Math.max(0, (inv?.grandTotal ?? 0) - newPaid);
  const newStatus = newOut === 0 ? 'PAID' : 'PARTIALLY_PAID';

  const receipt = await prisma.paymentReceipt.create({
    data: {
      receiptNo: finalReceiptNo, partyId: parsed.data.partyId, partyName: parsed.data.partyName,
      invoiceId: parsed.data.invoiceId || '', invoiceNo: parsed.data.invoiceNo || 'MANUAL',
      paymentDate: parsed.data.paymentDate, paymentAmount: parsed.data.paymentAmount,
      freightComponent: parsed.data.freightComponent, gstComponent: parsed.data.gstComponent,
      paymentMode: parsed.data.paymentMode ?? null, referenceNo: parsed.data.referenceNo ?? null,
      bankName: parsed.data.bankName ?? null, remarks: parsed.data.notes ?? null,
      status: 'CONFIRMED', createdBy: session.user.id,
    },
  });

  if (inv) {
    await prisma.$transaction([
      prisma.invoice.update({ where: { id: inv.id }, data: { paidTotal: newPaid, outstandingTotal: newOut, status: newStatus } }),
      prisma.outstandingEntry.updateMany({ where: { invoiceId: inv.id }, data: { paidAmount: newPaid, outstandingAmount: newOut, agingBucket: newOut === 0 ? 'CURRENT' : undefined } }),
    ]);
  }

  serverLog('info', 'payment.created', { userId: session.user.id, receiptId: receipt.id, receiptNo: finalReceiptNo, invoiceId: parsed.data.invoiceId, amount: parsed.data.paymentAmount });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'PAYMENT_RECEIVED',
    resource: 'PAYMENT_RECEIPT',
    resourceId: receipt.id,
    details: `${finalReceiptNo} received against ${parsed.data.invoiceNo} for ${parsed.data.partyName}`,
  });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'INVOICE_PAYMENT_UPDATED',
    resource: 'INVOICE',
    resourceId: parsed.data.invoiceId,
    details: `${parsed.data.invoiceNo} payment updated by ${parsed.data.paymentAmount}`,
  });
  revalidatePath('/dashboard/payments');
  revalidatePath('/dashboard/invoices');
  revalidatePath('/dashboard/outstanding');
  revalidatePath('/dashboard/reports');
  revalidatePath('/dashboard/notifications');
  revalidatePath('/dashboard');
  return { receiptId: receipt.id, receiptNo };
}

export async function updatePaymentReceipt(id: string, data: { paymentDate: string; paymentAmount: number; paymentMode: string; referenceNo?: string; bankName?: string; remarks?: string }) {
  const session = await requireAuth();
  const receipt = await prisma.paymentReceipt.findUnique({ where: { id } });
  if (!receipt) return { error: 'Receipt not found' };

  const diff = data.paymentAmount - receipt.paymentAmount;
  await prisma.paymentReceipt.update({
    where: { id },
    data: { paymentDate: data.paymentDate, paymentAmount: data.paymentAmount, freightComponent: data.paymentAmount, paymentMode: data.paymentMode, referenceNo: data.referenceNo ?? null, bankName: data.bankName ?? null, remarks: data.remarks ?? null },
  });

  if (receipt.invoiceId && diff !== 0) {
    const inv = await prisma.invoice.findUnique({ where: { id: receipt.invoiceId } });
    if (inv) {
      const newPaid = Math.max(0, inv.paidTotal + diff);
      const newOut  = Math.max(0, inv.grandTotal - newPaid);
      await prisma.invoice.update({ where: { id: inv.id }, data: { paidTotal: newPaid, outstandingTotal: newOut, status: newOut === 0 ? 'PAID' : 'PARTIALLY_PAID' } });
      await prisma.outstandingEntry.updateMany({ where: { invoiceId: inv.id }, data: { paidAmount: newPaid, outstandingAmount: newOut } });
    }
  }

  serverLog('info', 'payment.updated', { userId: session.user.id, receiptId: id });
  revalidatePath('/dashboard/payments');
  revalidatePath('/dashboard/invoices');
  revalidatePath('/dashboard/outstanding');
  return { success: true };
}
