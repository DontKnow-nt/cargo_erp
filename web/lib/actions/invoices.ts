'use server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/auth';
import { InvoiceLineSchema, UpdateInvoiceLineSchema } from '@/lib/validations';
import { recordAuditLog, serverLog } from '@/lib/logger';

type PrismaInvoiceLineRecord = Awaited<ReturnType<typeof prisma.invoiceLine.findMany>>[number];

function calculateInvoiceTotals(lines: PrismaInvoiceLineRecord[]) {
  const subtotal = lines.reduce((sum: number, line: PrismaInvoiceLineRecord) => sum + line.amount, 0);
  const gstTotal = lines.reduce((sum: number, line: PrismaInvoiceLineRecord) => sum + line.taxAmount, 0);
  return { subtotal, gstTotal, grandTotal: subtotal + gstTotal };
}

export async function getInvoices() {
  await requireRole('ACCOUNTS_EXECUTIVE');
  return prisma.invoice.findMany({ include: { lines: true }, orderBy: { createdAt: 'desc' } });
}

export async function getInvoice(id: string) {
  await requireRole('ACCOUNTS_EXECUTIVE');
  return prisma.invoice.findUnique({ where: { id }, include: { lines: true, party: true } });
}

async function nextInvoiceNo() {
  const year = new Date().getFullYear();
  // Use timestamp + random suffix to avoid race conditions on concurrent invoice generation
  const ts = Date.now().toString().slice(-6);
  const rand = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  const candidate = `INV-${year}-${ts}${rand}`;
  // Verify uniqueness, retry if collision
  const existing = await prisma.invoice.findUnique({ where: { invoiceNo: candidate } });
  if (existing) {
    // Fallback: count-based with timestamp
    const count = await prisma.invoice.count();
    return `INV-${year}-${String(count + 1).padStart(4, '0')}-${rand}`;
  }
  return candidate;
}

export async function generateInvoiceFromAwb(awbId: string) {
  const session = await requireRole('ACCOUNTS_EXECUTIVE');
  const bk = await prisma.awbBooking.findUnique({ where: { id: awbId } });
  if (!bk) return { error: 'Booking not found' };
  if (bk.status === 'INVOICED') return { error: 'Already invoiced' };

  const party = await prisma.party.findUnique({ where: { id: bk.partyId } });
  const creditDays = party?.creditDays ?? 30;
  const invoiceDate = new Date().toISOString().split('T')[0];
  const due = new Date(invoiceDate); due.setDate(due.getDate() + creditDays);
  const dueDate = due.toISOString().split('T')[0];
  const invoiceNo = await nextInvoiceNo();

  const baseAmt = bk.weight * bk.baseRate;
  const markupAmt = bk.markupAmount;
  const subtotal = baseAmt + markupAmt;
  const gstTotal = subtotal * bk.gstRate / 100;
  const grandTotal = subtotal + gstTotal;

  const lines = [
    { description: `Airfreight ${bk.origin}→${bk.destination} · ${bk.weight} kg @ ₹${bk.baseRate}/kg`, qty: bk.weight, rate: bk.baseRate, amount: baseAmt, taxRate: bk.gstRate, taxAmount: baseAmt * bk.gstRate / 100, lineTotal: baseAmt * (1 + bk.gstRate / 100) },
    ...(markupAmt > 0 ? [{ description: 'Handling & markup charges', qty: 1, rate: markupAmt, amount: markupAmt, taxRate: bk.gstRate, taxAmount: markupAmt * bk.gstRate / 100, lineTotal: markupAmt * (1 + bk.gstRate / 100) }] : []),
  ];

  const [invoice] = await prisma.$transaction([
    prisma.invoice.create({ data: { invoiceNo, partyId: bk.partyId, partyName: bk.partyName, bookingType: 'AWB', bookingRef: bk.awbNo, invoiceDate, dueDate, subtotal, gstTotal, grandTotal, paidTotal: 0, outstandingTotal: grandTotal, status: 'DRAFT', createdBy: session.user.id, lines: { create: lines } } }),
    prisma.awbBooking.update({ where: { id: awbId }, data: { status: 'INVOICED' } }),
  ]);

  await prisma.outstandingEntry.create({ data: { partyId: bk.partyId, partyName: bk.partyName, invoiceId: invoice.id, invoiceNo, bookingRef: bk.awbNo, originalAmount: grandTotal, paidAmount: 0, outstandingAmount: grandTotal, invoiceDate, dueDate, agingBucket: 'CURRENT', creditLimit: party?.creditLimit ?? 0 } });

  serverLog('info', 'invoice.generated_from_awb', { userId: session.user.id, invoiceId: invoice.id, invoiceNo, awbId });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'INVOICE_GENERATED',
    resource: 'INVOICE',
    resourceId: invoice.id,
    details: `${invoiceNo} generated from AWB ${bk.awbNo}`,
  });
  revalidatePath('/dashboard/invoices');
  return { invoiceId: invoice.id, invoiceNo };
}

export async function generateInvoiceFromDocket(docketId: string) {
  const session = await requireRole('ACCOUNTS_EXECUTIVE');
  const bk = await prisma.docketBooking.findUnique({ where: { id: docketId } });
  if (!bk) return { error: 'Booking not found' };
  if (bk.status === 'INVOICED') return { error: 'Already invoiced' };

  const party = await prisma.party.findUnique({ where: { id: bk.partyId } });
  const creditDays = bk.dueDatePolicy || party?.creditDays || 30;
  const invoiceDate = new Date().toISOString().split('T')[0];
  const due = new Date(invoiceDate); due.setDate(due.getDate() + creditDays);
  const dueDate = due.toISOString().split('T')[0];
  const invoiceNo = await nextInvoiceNo();

  const baseAmt = bk.rateFittedAmount;
  const markupAmt = bk.markupAmount;
  const subtotal = baseAmt + markupAmt;
  const gstTotal = subtotal * bk.gstRate / 100;
  const grandTotal = subtotal + gstTotal;

  const lines = [
    { description: `Docket freight ${bk.origin || ''}→${bk.destination || ''} · ${bk.description || ''}`, qty: 1, rate: baseAmt, amount: baseAmt, taxRate: bk.gstRate, taxAmount: baseAmt * bk.gstRate / 100, lineTotal: baseAmt * (1 + bk.gstRate / 100) },
    ...(markupAmt > 0 ? [{ description: 'Handling markup', qty: 1, rate: markupAmt, amount: markupAmt, taxRate: bk.gstRate, taxAmount: markupAmt * bk.gstRate / 100, lineTotal: markupAmt * (1 + bk.gstRate / 100) }] : []),
  ];

  const [invoice] = await prisma.$transaction([
    prisma.invoice.create({ data: { invoiceNo, partyId: bk.partyId, partyName: bk.partyName, bookingType: 'DOCKET', bookingRef: bk.docketNo, invoiceDate, dueDate, subtotal, gstTotal, grandTotal, paidTotal: 0, outstandingTotal: grandTotal, status: 'DRAFT', createdBy: session.user.id, lines: { create: lines } } }),
    prisma.docketBooking.update({ where: { id: docketId }, data: { status: 'INVOICED' } }),
  ]);

  await prisma.outstandingEntry.create({ data: { partyId: bk.partyId, partyName: bk.partyName, invoiceId: invoice.id, invoiceNo, bookingRef: bk.docketNo, originalAmount: grandTotal, paidAmount: 0, outstandingAmount: grandTotal, invoiceDate, dueDate, agingBucket: 'CURRENT', creditLimit: party?.creditLimit ?? 0 } });

  serverLog('info', 'invoice.generated_from_docket', { userId: session.user.id, invoiceId: invoice.id, invoiceNo, docketId });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'INVOICE_GENERATED',
    resource: 'INVOICE',
    resourceId: invoice.id,
    details: `${invoiceNo} generated from docket ${bk.docketNo}`,
  });
  revalidatePath('/dashboard/invoices');
  return { invoiceId: invoice.id, invoiceNo };
}

export async function updateInvoiceLine(invoiceId: string, lineId: string, data: unknown) {
  const session = await requireRole('ACCOUNTS_EXECUTIVE');
  const parsed = UpdateInvoiceLineSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return { error: 'Invoice not found' };
  if (inv.status === 'FINALIZED' || inv.status === 'PAID') return { error: 'Cannot edit finalized/paid invoice' };
  const line = await prisma.invoiceLine.findFirst({ where: { id: lineId, invoiceId } });
  if (!line) return { error: 'Line not found' };
  const updated = { ...line, ...parsed.data };
  const amount = updated.qty * updated.rate;
  const taxAmount = amount * updated.taxRate / 100;
  await prisma.invoiceLine.update({ where: { id: lineId }, data: { description: updated.description, qty: updated.qty, rate: updated.rate, amount, taxRate: updated.taxRate, taxAmount, lineTotal: amount + taxAmount } });
  const lines = await prisma.invoiceLine.findMany({ where: { invoiceId } });
  const { subtotal, gstTotal, grandTotal } = calculateInvoiceTotals(lines);
  await prisma.invoice.update({ where: { id: invoiceId }, data: { subtotal, gstTotal, grandTotal, outstandingTotal: Math.max(0, grandTotal - inv.paidTotal) } });
  serverLog('info', 'invoice.line_updated', { userId: session.user.id, invoiceId, lineId });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'INVOICE_UPDATED',
    resource: 'INVOICE',
    resourceId: invoiceId,
    details: `Invoice line ${lineId} updated`,
  });
  revalidatePath('/dashboard/invoices');
  return { success: true };
}

export async function addInvoiceLine(invoiceId: string, data: unknown) {
  const session = await requireRole('ACCOUNTS_EXECUTIVE');
  const parsed = InvoiceLineSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return { error: 'Invoice not found' };
  if (inv.status === 'FINALIZED' || inv.status === 'PAID') return { error: 'Cannot edit finalized/paid invoice' };
  const { description, qty, rate, taxRate } = parsed.data;
  const amount = qty * rate;
  const taxAmount = amount * taxRate / 100;
  const newLine = await prisma.invoiceLine.create({ data: { invoiceId, description, qty, rate, amount, taxRate, taxAmount, lineTotal: amount + taxAmount } });
  const lines = await prisma.invoiceLine.findMany({ where: { invoiceId } });
  const { subtotal, gstTotal, grandTotal } = calculateInvoiceTotals(lines);
  await prisma.invoice.update({ where: { id: invoiceId }, data: { subtotal, gstTotal, grandTotal, outstandingTotal: Math.max(0, grandTotal - inv.paidTotal) } });
  serverLog('info', 'invoice.line_added', { userId: session.user.id, invoiceId, lineId: newLine.id });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'INVOICE_UPDATED',
    resource: 'INVOICE',
    resourceId: invoiceId,
    details: `Invoice line ${newLine.id} added`,
  });
  revalidatePath('/dashboard/invoices');
  return { lineId: newLine.id };
}

export async function finalizeInvoice(id: string) {
  const session = await requireRole('ACCOUNTS_EXECUTIVE');
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return { error: 'Invoice not found' };
  if (inv.status === 'CANCELLED') return { error: 'Cannot finalize cancelled invoice' };
  await prisma.invoice.update({ where: { id }, data: { status: 'FINALIZED' } });
  serverLog('info', 'invoice.finalized', { userId: session.user.id, invoiceId: id });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'INVOICE_FINALIZED',
    resource: 'INVOICE',
    resourceId: id,
    details: `${inv.invoiceNo} finalized`,
  });
  revalidatePath('/dashboard/invoices');
  return { success: true };
}

export async function cancelInvoice(id: string) {
  const session = await requireRole('ACCOUNTS_EXECUTIVE');
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return { error: 'Invoice not found' };
  if (inv.status === 'PAID') return { error: 'Cannot cancel paid invoice' };
  await prisma.invoice.update({ where: { id }, data: { status: 'CANCELLED' } });
  serverLog('info', 'invoice.cancelled', { userId: session.user.id, invoiceId: id });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'INVOICE_CANCELLED',
    resource: 'INVOICE',
    resourceId: id,
    details: `${inv.invoiceNo} cancelled`,
  });
  revalidatePath('/dashboard/invoices');
  return { success: true };
}

export async function deleteInvoices(ids: string[]) {
  const session = await requireRole('ACCOUNTS_EXECUTIVE');
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) return { error: 'Invalid IDs' };
  if (!ids.every(id => typeof id === 'string' && id.length > 0)) return { error: 'Invalid IDs' };
  await prisma.$transaction([
    prisma.outstandingEntry.deleteMany({ where: { invoiceId: { in: ids } } }),
    prisma.invoice.deleteMany({ where: { id: { in: ids }, status: { notIn: ['PAID', 'FINALIZED'] } } }),
  ]);
  serverLog('info', 'invoice.deleted', { userId: session.user.id, count: ids.length });
  revalidatePath('/dashboard/invoices');
  return { success: true };
}
