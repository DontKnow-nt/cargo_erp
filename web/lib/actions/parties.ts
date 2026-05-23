'use server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { PartySchema, UpdatePartySchema } from '@/lib/validations';
import { serverLog } from '@/lib/logger';

export async function getParties() {
  await requireAuth();
  return prisma.party.findMany({ orderBy: { partyName: 'asc' } });
}

export async function createParty(data: unknown) {
  const session = await requireAuth();
  const parsed = PartySchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const { partyName, gstin, contactPerson, phone, email, billingAddress, creditLimit, creditDays, status } = parsed.data;
  // Prevent duplicate party names
  const existing = await prisma.party.findFirst({ where: { partyName: { equals: partyName.trim(), mode: 'insensitive' } } });
  if (existing) return { error: `Party "${partyName}" already exists` };
  const party = await prisma.party.create({
    data: { partyName, gstin: gstin || null, contactPerson: contactPerson || null, phone: phone || null, email: email || null, billingAddress: billingAddress || null, creditLimit, creditDays, status, createdBy: session.user.id },
  });
  serverLog('info', 'party.created', { userId: session.user.id, partyId: party.id, partyName });
  revalidatePath('/dashboard/parties');
  return { id: party.id };
}

export async function updateParty(id: string, data: unknown) {
  const session = await requireAuth();
  const parsed = UpdatePartySchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const existing = await prisma.party.findUnique({ where: { id } });
  if (!existing) return { error: 'Party not found' };
  const { partyName, gstin, contactPerson, phone, email, billingAddress, creditLimit, creditDays, status } = parsed.data;
  await prisma.party.update({
    where: { id },
    data: {
      ...(partyName !== undefined && { partyName }),
      ...(gstin !== undefined && { gstin: gstin || null }),
      ...(contactPerson !== undefined && { contactPerson: contactPerson || null }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(email !== undefined && { email: email || null }),
      ...(billingAddress !== undefined && { billingAddress: billingAddress || null }),
      ...(creditLimit !== undefined && { creditLimit }),
      ...(creditDays !== undefined && { creditDays }),
      ...(status !== undefined && { status }),
    },
  });
  serverLog('info', 'party.updated', { userId: session.user.id, partyId: id });
  revalidatePath('/dashboard/parties');
  return { success: true };
}


export async function deleteParties(ids: string[]) {
  const session = await requireAuth();
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) return { error: 'Invalid IDs' };
  if (!ids.every(id => typeof id === 'string' && id.length > 0)) return { error: 'Invalid IDs' };

  // Check for any linked records that would block deletion
  const [awbCount, docketCount, invoiceCount, outstandingCount] = await Promise.all([
    prisma.awbBooking.count({ where: { partyId: { in: ids } } }),
    prisma.docketBooking.count({ where: { partyId: { in: ids } } }),
    prisma.invoice.count({ where: { partyId: { in: ids } } }),
    prisma.outstandingEntry.count({ where: { partyId: { in: ids } } }),
  ]);

  const total = awbCount + docketCount + invoiceCount + outstandingCount;
  if (total > 0) {
    const parts = [
      awbCount > 0 && `${awbCount} AWB booking${awbCount > 1 ? 's' : ''}`,
      docketCount > 0 && `${docketCount} docket booking${docketCount > 1 ? 's' : ''}`,
      invoiceCount > 0 && `${invoiceCount} invoice${invoiceCount > 1 ? 's' : ''}`,
      outstandingCount > 0 && `${outstandingCount} outstanding entr${outstandingCount > 1 ? 'ies' : 'y'}`,
    ].filter(Boolean).join(', ');
    return { error: `Cannot delete: ${parts} linked to this party. Delete those records first.` };
  }

  // Also delete payment receipts (no bookings, safe to cascade)
  await prisma.$transaction([
    prisma.paymentReceipt.deleteMany({ where: { partyId: { in: ids } } }),
    prisma.party.deleteMany({ where: { id: { in: ids } } }),
  ]);
  serverLog('info', 'party.deleted', { userId: session.user.id, count: ids.length });
  revalidatePath('/dashboard/parties');
  return { success: true };
}
