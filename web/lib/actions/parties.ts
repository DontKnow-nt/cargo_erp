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
  const party = await prisma.party.create({
    data: { partyName, gstin: gstin || null, contactPerson: contactPerson || null, phone: phone || null, email: email || null, billingAddress: billingAddress || null, creditLimit, creditDays, status },
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
