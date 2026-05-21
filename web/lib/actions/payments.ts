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

  const inv = await prisma.invoice.findUnique({ where: { id: parsed.data.invoiceId } });
  if (!inv) return { error: 'Invoice not found' };
  if (inv.status === 'CANCELLED') return { error: 'Cannot pay cancelled invoice' };

  const count = await prisma.paymentReceipt.count();
  const receiptNo = `RCP-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
  const newPaid = inv.paidTotal + parsed.data.paymentAmount;
  const newOut = Math.max(0, inv.grandTotal - newPaid);
  const newStatus = newOut === 0 ? 'PAID' : 'PARTIALLY_PAID';

  const [receipt] = await prisma.$transaction([
    prisma.paymentReceipt.create({
      data: {
        receiptNo, partyId: parsed.data.partyId, partyName: parsed.data.partyName,
        invoiceId: parsed.data.invoiceId, invoiceNo: parsed.data.invoiceNo,
        paymentDate: parsed.data.paymentDate, paymentAmount: parsed.data.paymentAmount,
        freightComponent: parsed.data.freightComponent, gstComponent: parsed.data.gstComponent,
        paymentMode: parsed.data.paymentMode ?? null, referenceNo: parsed.data.referenceNo ?? null,
        bankName: parsed.data.bankName ?? null,
        remarks: parsed.data.notes ?? null,
        status: 'CONFIRMED', createdBy: session.user.id,
      },
    }),
    prisma.invoice.update({ where: { id: parsed.data.invoiceId }, data: { paidTotal: newPaid, outstandingTotal: newOut, status: newStatus } }),
    prisma.outstandingEntry.updateMany({ where: { invoiceId: parsed.data.invoiceId }, data: { paidAmount: newPaid, outstandingAmount: newOut } }),
  ]);

  serverLog('info', 'payment.created', { userId: session.user.id, receiptId: receipt.id, receiptNo, invoiceId: parsed.data.invoiceId, amount: parsed.data.paymentAmount });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'PAYMENT_RECEIVED',
    resource: 'PAYMENT_RECEIPT',
    resourceId: receipt.id,
    details: `${receiptNo} received against ${parsed.data.invoiceNo} for ${parsed.data.partyName}`,
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
