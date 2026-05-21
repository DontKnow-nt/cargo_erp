'use server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/auth';
import { AwbBookingSchema, DocketBookingSchema, UpdateAwbBookingSchema, UpdateDocketBookingSchema } from '@/lib/validations';
import { recordAuditLog, serverLog } from '@/lib/logger';

async function resolvePartyId(partyId: string, partyName: string) {
  if (partyId && partyId !== 'p-imported') {
    return partyId;
  }

  const normalized = partyName.trim();
  const existing = await prisma.party.findFirst({
    where: {
      partyName: {
        equals: normalized,
        mode: 'insensitive',
      },
    },
  });

  if (existing) {
    return existing.id;
  }

  const created = await prisma.party.create({
    data: {
      partyName: normalized || 'Imported Party',
      status: 'ACTIVE',
    },
  });
  return created.id;
}

// ── AWB ───────────────────────────────────────────────────────────────────────
export async function getAwbBookings() {
  await requireAuth();
  return prisma.awbBooking.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function createAwbBooking(data: unknown) {
  const session = await requireAuth();
  const parsed = AwbBookingSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  const partyId = await resolvePartyId(d.partyId, d.partyName);
  const booking = await prisma.awbBooking.create({
    data: { awbNo: d.awbNo, partyId, partyName: d.partyName, origin: d.origin, destination: d.destination, airlineName: d.airlineName, bookingDate: d.bookingDate, shipmentDate: d.shipmentDate ?? null, weight: d.weight, pieces: d.pieces, baseRate: d.baseRate, markupAmount: d.markupAmount, gstRate: d.gstRate, gstAmount: d.gstAmount, totalAmount: d.totalAmount, status: d.status, notes: d.notes ?? null, weightCharge: d.weightCharge ?? 0, valuationCharge: d.valuationCharge ?? 0, otherChargesDueAgent: d.otherChargesDueAgent ?? 0, otherChargesDueCarrier: d.otherChargesDueCarrier ?? 0, totalPrepaid: d.totalPrepaid ?? 0, createdBy: session.user.id },
  });
  serverLog('info', 'awb.created', { userId: session.user.id, bookingId: booking.id, awbNo: d.awbNo });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'AWB_CREATED',
    resource: 'AWB_BOOKING',
    resourceId: booking.id,
    details: `${d.awbNo} created for ${d.partyName} on ${d.bookingDate}`,
  });
  revalidatePath('/dashboard/bookings/awb');
  return { id: booking.id };
}

export async function updateAwbBooking(id: string, data: unknown) {
  const session = await requireAuth();
  const parsed = UpdateAwbBookingSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const existing = await prisma.awbBooking.findUnique({ where: { id } });
  if (!existing) return { error: 'Booking not found' };
  await prisma.awbBooking.update({ where: { id }, data: parsed.data as Parameters<typeof prisma.awbBooking.update>[0]['data'] });
  serverLog('info', 'awb.updated', { userId: session.user.id, bookingId: id });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'AWB_UPDATED',
    resource: 'AWB_BOOKING',
    resourceId: id,
    details: `${existing.awbNo} updated`,
  });
  revalidatePath('/dashboard/bookings/awb');
  return { success: true };
}

export async function deleteAwbBookings(ids: string[]) {
  const session = await requireAuth();
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) return { error: 'Invalid IDs' };
  if (!ids.every(id => typeof id === 'string' && id.length > 0)) return { error: 'Invalid IDs' };
  await prisma.awbBooking.deleteMany({ where: { id: { in: ids }, status: 'BOOKED' } });
  serverLog('info', 'awb.deleted', { userId: session.user.id, count: ids.length });
  await Promise.all(ids.map(id => recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'AWB_DELETED',
    resource: 'AWB_BOOKING',
    resourceId: id,
    details: 'AWB deleted while still BOOKED',
  })));
  revalidatePath('/dashboard/bookings/awb');
  return { success: true };
}

// ── Dockets ───────────────────────────────────────────────────────────────────
export async function getDocketBookings() {
  await requireAuth();
  return prisma.docketBooking.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function createDocketBooking(data: unknown) {
  const session = await requireAuth();
  const parsed = DocketBookingSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  const partyId = await resolvePartyId(d.partyId, d.partyName);
  const booking = await prisma.docketBooking.create({
    data: { docketNo: d.docketNo, partyId, partyName: d.partyName, bookingDate: d.bookingDate, origin: d.origin ?? null, destination: d.destination ?? null, description: d.description ?? null, rateFittedAmount: d.rateFittedAmount, markupAmount: d.markupAmount, gstRate: d.gstRate, gstAmount: d.gstAmount, totalAmount: d.totalAmount, dueDatePolicy: d.dueDatePolicy, status: d.status, notes: d.notes ?? null, linkedAwbId: d.linkedAwbId ?? null, wayBillNo: d.wayBillNo ?? null, consignee: d.consignee ?? null, value: d.value ?? 0, methodOfPacking: d.methodOfPacking ?? null, createdBy: session.user.id },
  });
  serverLog('info', 'docket.created', { userId: session.user.id, bookingId: booking.id, docketNo: d.docketNo });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'DOCKET_CREATED',
    resource: 'DOCKET_BOOKING',
    resourceId: booking.id,
    details: `${d.docketNo} created for ${d.partyName} on ${d.bookingDate}`,
  });
  revalidatePath('/dashboard/bookings/dockets');
  return { id: booking.id };
}

export async function updateDocketBooking(id: string, data: unknown) {
  const session = await requireAuth();
  const parsed = UpdateDocketBookingSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const existing = await prisma.docketBooking.findUnique({ where: { id } });
  if (!existing) return { error: 'Booking not found' };
  await prisma.docketBooking.update({ where: { id }, data: parsed.data as Parameters<typeof prisma.docketBooking.update>[0]['data'] });
  serverLog('info', 'docket.updated', { userId: session.user.id, bookingId: id });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'DOCKET_UPDATED',
    resource: 'DOCKET_BOOKING',
    resourceId: id,
    details: `${existing.docketNo} updated`,
  });
  revalidatePath('/dashboard/bookings/dockets');
  return { success: true };
}

export async function deleteDocketBookings(ids: string[]) {
  const session = await requireAuth();
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) return { error: 'Invalid IDs' };
  if (!ids.every(id => typeof id === 'string' && id.length > 0)) return { error: 'Invalid IDs' };
  await prisma.docketBooking.deleteMany({ where: { id: { in: ids }, status: 'BOOKED' } });
  serverLog('info', 'docket.deleted', { userId: session.user.id, count: ids.length });
  await Promise.all(ids.map(id => recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'DOCKET_DELETED',
    resource: 'DOCKET_BOOKING',
    resourceId: id,
    details: 'Docket deleted while still BOOKED',
  })));
  revalidatePath('/dashboard/bookings/dockets');
  return { success: true };
}

export async function linkAwbToDocket(docketId: string, awbId: string) {
  const session = await requireAuth();
  const [docket, awb, duplicate] = await Promise.all([
    prisma.docketBooking.findUnique({ where: { id: docketId } }),
    prisma.awbBooking.findUnique({ where: { id: awbId } }),
    prisma.docketBooking.findFirst({ where: { linkedAwbId: awbId, NOT: { id: docketId } } }),
  ]);

  if (!docket) return { error: 'Docket not found' };
  if (!awb) return { error: 'AWB not found' };
  if (docket.status === 'CANCELLED' || awb.status === 'CANCELLED') return { error: 'Cancelled records cannot be linked' };
  if (duplicate) return { error: 'This AWB is already linked to another docket' };

  await prisma.docketBooking.update({ where: { id: docketId }, data: { linkedAwbId: awbId } });
  serverLog('info', 'booking.linked', { userId: session.user.id, docketId, awbId });
  await Promise.all([
    recordAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: 'DOCKET_LINKED_AWB',
      resource: 'DOCKET_BOOKING',
      resourceId: docketId,
      details: `${docket.docketNo} linked to ${awb.awbNo}`,
    }),
    recordAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: 'AWB_LINKED_DOCKET',
      resource: 'AWB_BOOKING',
      resourceId: awbId,
      details: `${awb.awbNo} linked to ${docket.docketNo}`,
    }),
  ]);
  revalidatePath('/dashboard/bookings/awb');
  revalidatePath('/dashboard/bookings/dockets');
  return { success: true };
}

export async function unlinkAwbFromDocket(docketId: string) {
  const session = await requireAuth();
  const docket = await prisma.docketBooking.findUnique({ where: { id: docketId } });
  if (!docket) return { error: 'Docket not found' };
  if (!docket.linkedAwbId) return { error: 'Docket is not linked to an AWB' };

  const awb = await prisma.awbBooking.findUnique({ where: { id: docket.linkedAwbId } });
  await prisma.docketBooking.update({ where: { id: docketId }, data: { linkedAwbId: null } });
  serverLog('info', 'booking.unlinked', { userId: session.user.id, docketId, awbId: docket.linkedAwbId });
  await Promise.all([
    recordAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: 'DOCKET_UNLINKED_AWB',
      resource: 'DOCKET_BOOKING',
      resourceId: docketId,
      details: `${docket.docketNo} unlinked from ${awb?.awbNo ?? 'AWB'}`,
    }),
    docket.linkedAwbId ? recordAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: 'AWB_UNLINKED_DOCKET',
      resource: 'AWB_BOOKING',
      resourceId: docket.linkedAwbId,
      details: `${awb?.awbNo ?? 'AWB'} unlinked from ${docket.docketNo}`,
    }) : Promise.resolve(),
  ]);
  revalidatePath('/dashboard/bookings/awb');
  revalidatePath('/dashboard/bookings/dockets');
  return { success: true };
}
