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
  await requireAuth();
  return prisma.invoice.findMany({ include: { lines: true }, orderBy: { createdAt: 'desc' } });
}

export async function getInvoice(id: string) {
  await requireAuth();
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
  const session = await requireAuth();
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
  const session = await requireAuth();
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

  const weight    = bk.weight ?? 0;
  const pieces    = bk.pieces ?? 1;
  // Compute per-kg rate: if weight > 0 use rateFittedAmount / weight, else treat as flat
  const perKgRate = weight > 0 ? parseFloat((baseAmt / weight).toFixed(4)) : 0;

  // Embed all fields as JSON metadata so the invoice editor can parse them without a DB lookup
  const meta = JSON.stringify({
    docketNo:    bk.docketNo,
    origin:      bk.origin      ?? '',
    destination: bk.destination ?? '',
    weight:      weight,
    pieces:      pieces,
    rate:        perKgRate,
    freight:     baseAmt,
    bookingDate: bk.bookingDate,
    description: bk.description ?? '',
    consignee:   bk.consignee   ?? '',
    wayBillNo:   bk.wayBillNo   ?? '',
    methodOfPacking: bk.methodOfPacking ?? '',
  });

  const freightDesc = weight > 0
    ? `Docket freight ${bk.origin || ''}→${bk.destination || ''} · ${bk.description || ''} · ${pieces} pcs · ${weight} kg @ ₹${perKgRate}/kg ||META||${meta}`
    : `Docket freight ${bk.origin || ''}→${bk.destination || ''} · ${bk.description || ''}${pieces > 1 ? ` · ${pieces} pcs` : ''} ||META||${meta}`;

  const lines = [
    {
      description: freightDesc,
      qty:    weight > 0 ? weight : 1,
      rate:   weight > 0 ? perKgRate : baseAmt,
      amount: baseAmt,
      taxRate: bk.gstRate,
      taxAmount: baseAmt * bk.gstRate / 100,
      lineTotal: baseAmt * (1 + bk.gstRate / 100),
    },
    ...(markupAmt > 0 ? [{
      description: `Handling markup · Docket ${bk.docketNo}`,
      qty: 1, rate: markupAmt, amount: markupAmt,
      taxRate: bk.gstRate, taxAmount: markupAmt * bk.gstRate / 100, lineTotal: markupAmt * (1 + bk.gstRate / 100),
    }] : []),
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
  const session = await requireAuth();
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
  const session = await requireAuth();
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
  const session = await requireAuth();
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
  const session = await requireAuth();
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

export async function generateCombinedInvoice(
  awbIds: string[],
  docketIds: string[],
) {
  const session = await requireAuth();
  if (awbIds.length + docketIds.length < 2) return { error: 'Select at least 2 bookings to combine' };

  // Fetch all bookings
  const [awbs, dockets] = await Promise.all([
    awbIds.length ? prisma.awbBooking.findMany({ where: { id: { in: awbIds } } }) : Promise.resolve([]),
    docketIds.length ? prisma.docketBooking.findMany({ where: { id: { in: docketIds } } }) : Promise.resolve([]),
  ]);

  const alreadyInvoiced = [...awbs.filter(b => b.status === 'INVOICED').map(b => b.awbNo), ...dockets.filter(b => b.status === 'INVOICED').map(b => b.docketNo)];
  if (alreadyInvoiced.length) return { error: `Already invoiced: ${alreadyInvoiced.join(', ')}` };

  // All must belong to same party — check by name (case-insensitive) to handle duplicate party records
  const partyNames = new Set([...awbs.map(b => b.partyName.trim().toLowerCase()), ...dockets.map(b => b.partyName.trim().toLowerCase())]);
  if (partyNames.size > 1) return { error: `All bookings must belong to the same party. Found: ${[...partyNames].join(', ')}` };

  // Use the first partyId found (prefer one that has matching party record)
  const partyId = awbs[0]?.partyId || dockets[0]?.partyId;
  const party = await prisma.party.findUnique({ where: { id: partyId } });
  const creditDays = party?.creditDays ?? 30;
  const invoiceDate = new Date().toISOString().split('T')[0];
  const due = new Date(invoiceDate); due.setDate(due.getDate() + creditDays);
  const dueDate = due.toISOString().split('T')[0];
  const invoiceNo = await nextInvoiceNo();
  const partyName = awbs[0]?.partyName || dockets[0]?.partyName || '';

  // Build lines — one per booking
  const lines: { description: string; qty: number; rate: number; amount: number; taxRate: number; taxAmount: number; lineTotal: number }[] = [];

  for (const bk of awbs) {
    const baseAmt = bk.weight * bk.baseRate;
    const markup = bk.markupAmount;
    lines.push({ description: `AWB ${bk.awbNo} · ${bk.origin}→${bk.destination} · ${bk.weight}kg @ ₹${bk.baseRate}/kg`, qty: bk.weight, rate: bk.baseRate, amount: baseAmt, taxRate: bk.gstRate, taxAmount: baseAmt * bk.gstRate / 100, lineTotal: baseAmt * (1 + bk.gstRate / 100) });
    if (markup > 0) lines.push({ description: `AWB ${bk.awbNo} · Handling charges`, qty: 1, rate: markup, amount: markup, taxRate: bk.gstRate, taxAmount: markup * bk.gstRate / 100, lineTotal: markup * (1 + bk.gstRate / 100) });
  }
  for (const bk of dockets) {
    const base = bk.rateFittedAmount;
    const markup = bk.markupAmount;
    lines.push({ description: `Docket ${bk.docketNo} · ${bk.origin||''}→${bk.destination||''} · ${bk.description||'Freight'}`, qty: 1, rate: base, amount: base, taxRate: bk.gstRate, taxAmount: base * bk.gstRate / 100, lineTotal: base * (1 + bk.gstRate / 100) });
    if (markup > 0) lines.push({ description: `Docket ${bk.docketNo} · Handling charges`, qty: 1, rate: markup, amount: markup, taxRate: bk.gstRate, taxAmount: markup * bk.gstRate / 100, lineTotal: markup * (1 + bk.gstRate / 100) });
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const gstTotal = lines.reduce((s, l) => s + l.taxAmount, 0);
  const grandTotal = subtotal + gstTotal;
  const bookingRef = [...awbs.map(b => b.awbNo), ...dockets.map(b => b.docketNo)].join(', ');

  const invoice = await prisma.invoice.create({
    data: { invoiceNo, partyId, partyName, bookingType: 'COMBINED', bookingRef, invoiceDate, dueDate, subtotal, gstTotal, grandTotal, paidTotal: 0, outstandingTotal: grandTotal, status: 'DRAFT', createdBy: session.user.id, lines: { create: lines } },
  });

  // Mark all as INVOICED
  await Promise.all([
    awbIds.length ? prisma.awbBooking.updateMany({ where: { id: { in: awbIds } }, data: { status: 'INVOICED' } }) : Promise.resolve(),
    docketIds.length ? prisma.docketBooking.updateMany({ where: { id: { in: docketIds } }, data: { status: 'INVOICED' } }) : Promise.resolve(),
  ]);

  await prisma.outstandingEntry.create({ data: { partyId, partyName, invoiceId: invoice.id, invoiceNo, bookingRef, originalAmount: grandTotal, paidAmount: 0, outstandingAmount: grandTotal, invoiceDate, dueDate, agingBucket: 'CURRENT', creditLimit: party?.creditLimit ?? 0 } });

  serverLog('info', 'invoice.combined', { userId: session.user.id, invoiceId: invoice.id, invoiceNo, awbIds, docketIds });
  revalidatePath('/dashboard/invoices');
  return { invoiceId: invoice.id, invoiceNo };
}

export async function updateCreditNoteAmount(id: string, amount: number, description: string) {
  await requireAuth();
  if (!id || amount < 0) return { error: 'Invalid params' };
  await prisma.invoice.update({
    where: { id },
    data: { subtotal: amount, grandTotal: amount, outstandingTotal: amount,
      lines: { deleteMany: {}, create: [{ description: description || 'Credit Note', qty: 1, rate: amount, amount, taxRate: 0, taxAmount: 0, lineTotal: amount }] }
    },
  });
  revalidatePath('/dashboard/credit-note');
  return { success: true };
}

export async function createCreditNote(data: { partyId: string; partyName: string; creditNoteNo: string; description: string; amount: number; gstRate?: number; gstAmount?: number; taxableAmount?: number }) {
  const session = await requireAuth();
  const invoiceNo = data.creditNoteNo || await nextInvoiceNo();
  const invoiceDate = new Date().toISOString().split('T')[0];
  const due = new Date(invoiceDate); due.setDate(due.getDate() + 30);
  const dueDate = due.toISOString().split('T')[0];
  const taxable = data.taxableAmount || data.amount || 0;
  const gstAmt = data.gstAmount ?? 0;
  const grandTotal = data.amount || taxable + gstAmt;

  let partyId = data.partyId;
  if (!partyId || partyId === '') {
    const existing = await prisma.party.findFirst({ where: { partyName: { equals: data.partyName.trim(), mode: 'insensitive' } } });
    partyId = existing?.id ?? (await prisma.party.create({ data: { partyName: data.partyName || 'Unknown', status: 'ACTIVE' } })).id;
  }

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNo, partyId, partyName: data.partyName || 'Unknown',
      bookingType: 'CREDIT_NOTE', bookingRef: data.creditNoteNo || invoiceNo,
      invoiceDate, dueDate, subtotal: taxable, gstTotal: gstAmt, grandTotal,
      paidTotal: 0, outstandingTotal: grandTotal, status: 'DRAFT', createdBy: session.user.id,
      lines: { create: [{ description: data.description || 'Credit Note', qty: 1, rate: taxable, amount: taxable, taxRate: data.gstRate ?? 0, taxAmount: gstAmt, lineTotal: grandTotal }] },
    },
  });
  serverLog('info', 'credit_note.created', { userId: session.user.id, id: invoice.id, invoiceNo });
  revalidatePath('/dashboard/credit-note');
  return { id: invoice.id, invoiceNo };
}

export async function deleteOutstandingEntries(ids: string[]) {
  const session = await requireAuth();
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) return { error: 'Invalid IDs' };
  await prisma.outstandingEntry.deleteMany({ where: { id: { in: ids } } });
  serverLog('info', 'outstanding.deleted', { userId: session.user.id, count: ids.length });
  revalidatePath('/dashboard/outstanding');
  return { success: true };
}

/**
 * Manually add an Outstanding entry against an EXISTING party (chosen from the party list,
 * never free-typed) with an amount, invoice number, and date entered directly by the user.
 * Creates a minimal backing Invoice (status IMPORTED, so it doesn't show up as a live invoice
 * needing Finalize/Review/Cancel) since OutstandingEntry.invoiceId is a required foreign key.
 */
export async function createManualOutstandingEntry(input: {
  partyId: string;
  invoiceNo: string;
  amount: number;
  date: string; // YYYY-MM-DD
}) {
  const session = await requireAuth();
  const partyId = String(input.partyId || '').trim();
  const invoiceNo = String(input.invoiceNo || '').trim();
  const amount = Number(input.amount);
  const date = String(input.date || '').trim();

  if (!partyId) return { error: 'Select a party' };
  if (!invoiceNo) return { error: 'Enter an invoice number' };
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Enter a valid amount greater than 0' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Enter a valid date' };

  const party = await prisma.party.findUnique({ where: { id: partyId }, select: { id: true, partyName: true, creditLimit: true } });
  if (!party) return { error: 'Party not found' };

  const dupe = await prisma.invoice.findFirst({ where: { invoiceNo }, select: { id: true } });
  if (dupe) return { error: `Invoice number "${invoiceNo}" already exists` };

  const due = new Date(date); due.setDate(due.getDate() + 30);
  const dueDate = due.toISOString().split('T')[0];

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNo, partyId: party.id, partyName: party.partyName,
      bookingType: 'MANUAL', bookingRef: invoiceNo,
      invoiceDate: date, dueDate,
      subtotal: amount, gstTotal: 0, grandTotal: amount,
      paidTotal: 0, outstandingTotal: amount,
      status: 'IMPORTED', createdBy: session.user.id,
      lines: { create: [{ description: `Manually added outstanding entry`, qty: 1, rate: amount, amount, taxRate: 0, taxAmount: 0, lineTotal: amount }] },
    },
  });

  await prisma.outstandingEntry.create({
    data: {
      partyId: party.id, partyName: party.partyName,
      invoiceId: invoice.id, invoiceNo,
      bookingRef: invoiceNo,
      originalAmount: amount, paidAmount: 0, outstandingAmount: amount,
      invoiceDate: date, dueDate,
      agingBucket: 'CURRENT', creditLimit: party.creditLimit ?? 0,
    },
  });

  serverLog('info', 'outstanding.manual_added', { userId: session.user.id, partyId: party.id, invoiceNo, amount });
  revalidatePath('/dashboard/outstanding');
  return { success: true };
}

export async function deleteInvoices(ids: string[]) {
  const session = await requireAuth();
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) return { error: 'Invalid IDs' };
  if (!ids.every(id => typeof id === 'string' && id.length > 0)) return { error: 'Invalid IDs' };

  // Fetch invoice metadata BEFORE deletion so we can unlink bookings
  const invoicesToDelete = await prisma.invoice.findMany({
    where: { id: { in: ids } },
    select: { id: true, invoiceNo: true, bookingRef: true, bookingType: true, status: true },
  });

  // Collect deletable IDs
  const deletableIds = invoicesToDelete.map(i => i.id);
  if (deletableIds.length === 0) return { error: 'No deletable invoices selected' };

  // Collect AWB refs and Docket refs to reset to BOOKED
  const awbRefsToReset: string[] = [];
  const docketRefsToReset: string[] = [];

  for (const inv of invoicesToDelete) {
    // bookingRef for COMBINED is a comma-separated list of refs mixed AWB + docket
    const refs = inv.bookingRef.split(',').map((r: string) => r.trim()).filter(Boolean);
    if (inv.bookingType === 'AWB') {
      awbRefsToReset.push(...refs);
    } else if (inv.bookingType === 'DOCKET') {
      docketRefsToReset.push(...refs);
    } else if (inv.bookingType === 'COMBINED') {
      // For combined, push all refs to both arrays — DB will only update matches
      awbRefsToReset.push(...refs);
      docketRefsToReset.push(...refs);
    }
  }

  await prisma.$transaction(async (tx) => {
    // Delete payment receipts first (due to foreign key constraint)
    await tx.paymentReceipt.deleteMany({ where: { invoiceId: { in: deletableIds } } });

    // Delete outstanding entries and invoices
    await tx.outstandingEntry.deleteMany({ where: { invoiceId: { in: deletableIds } } });
    await tx.invoice.deleteMany({ where: { id: { in: deletableIds } } });

    // Reset AWB bookings: INVOICED → BOOKED
    if (awbRefsToReset.length > 0) {
      await tx.awbBooking.updateMany({
        where: { awbNo: { in: awbRefsToReset }, status: 'INVOICED' },
        data: { status: 'BOOKED' },
      });
    }

    // Reset Docket bookings: INVOICED → BOOKED
    if (docketRefsToReset.length > 0) {
      await tx.docketBooking.updateMany({
        where: { docketNo: { in: docketRefsToReset }, status: 'INVOICED' },
        data: { status: 'BOOKED' },
      });
    }
  });

  serverLog('info', 'invoice.deleted', { userId: session.user.id, ids: deletableIds, awbReset: awbRefsToReset, docketReset: docketRefsToReset });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'INVOICE_DELETED',
    resource: 'INVOICE',
    resourceId: deletableIds.join(','),
    details: `${deletableIds.length} invoice(s) deleted; AWB reset: [${awbRefsToReset.join(', ')}]; Docket reset: [${docketRefsToReset.join(', ')}]`,
  });

  // Revalidate all affected pages so the generate-invoice dropdown refreshes
  revalidatePath('/dashboard/invoices');
  revalidatePath('/dashboard/bookings/awb');
  revalidatePath('/dashboard/bookings/dockets');
  revalidatePath('/dashboard/outstanding');

  return { success: true, deleted: deletableIds.length, awbReset: awbRefsToReset.length, docketReset: docketRefsToReset.length };
}

export async function uninvoiceAwb(awbId: string) {
  const session = await requireAuth();
  // Find the invoice linked to this AWB booking ref
  const awb = await prisma.awbBooking.findUnique({ where: { id: awbId } });
  if (!awb) return { error: 'AWB not found' };
  if (awb.status !== 'INVOICED') return { error: 'AWB is not invoiced' };

  const invoice = await prisma.invoice.findFirst({ where: { bookingRef: awb.awbNo, bookingType: 'AWB' } });

  await prisma.$transaction(async tx => {
    if (invoice) {
      await tx.outstandingEntry.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoice.delete({ where: { id: invoice.id } });
    }
    await tx.awbBooking.update({ where: { id: awbId }, data: { status: 'BOOKED' } });
  });

  serverLog('info', 'awb.uninvoiced', { userId: session.user.id, awbId, invoiceId: invoice?.id });
  revalidatePath('/dashboard/bookings/awb');
  revalidatePath('/dashboard/invoices');
  revalidatePath('/dashboard/outstanding');
  return { success: true };
}
