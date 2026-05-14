'use server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/auth';
import { AwbBookingSchema, DocketBookingSchema, UpdateAwbBookingSchema, UpdateDocketBookingSchema } from '@/lib/validations';
import { serverLog } from '@/lib/logger';

// ── AWB ───────────────────────────────────────────────────────────────────────
export async function getAwbBookings() {
  await requireAuth();
  return prisma.awbBooking.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function createAwbBooking(data: unknown) {
  const session = await requireRole('OPERATIONS_MANAGER');
  const parsed = AwbBookingSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  const booking = await prisma.awbBooking.create({
    data: { awbNo: d.awbNo, partyId: d.partyId, partyName: d.partyName, origin: d.origin, destination: d.destination, airlineName: d.airlineName, bookingDate: d.bookingDate, shipmentDate: d.shipmentDate ?? null, weight: d.weight, pieces: d.pieces, baseRate: d.baseRate, markupAmount: d.markupAmount, gstRate: d.gstRate, gstAmount: d.gstAmount, totalAmount: d.totalAmount, status: d.status, notes: d.notes ?? null },
  });
  serverLog('info', 'awb.created', { userId: session.user.id, bookingId: booking.id, awbNo: d.awbNo });
  revalidatePath('/dashboard/bookings/awb');
  return { id: booking.id };
}

export async function updateAwbBooking(id: string, data: unknown) {
  const session = await requireRole('OPERATIONS_MANAGER');
  const parsed = UpdateAwbBookingSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const existing = await prisma.awbBooking.findUnique({ where: { id } });
  if (!existing) return { error: 'Booking not found' };
  await prisma.awbBooking.update({ where: { id }, data: parsed.data as Parameters<typeof prisma.awbBooking.update>[0]['data'] });
  serverLog('info', 'awb.updated', { userId: session.user.id, bookingId: id });
  revalidatePath('/dashboard/bookings/awb');
  return { success: true };
}

export async function deleteAwbBookings(ids: string[]) {
  const session = await requireRole('OPERATIONS_MANAGER');
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) return { error: 'Invalid IDs' };
  if (!ids.every(id => typeof id === 'string' && id.length > 0)) return { error: 'Invalid IDs' };
  await prisma.awbBooking.deleteMany({ where: { id: { in: ids }, status: 'BOOKED' } });
  serverLog('info', 'awb.deleted', { userId: session.user.id, count: ids.length });
  revalidatePath('/dashboard/bookings/awb');
  return { success: true };
}

// ── Dockets ───────────────────────────────────────────────────────────────────
export async function getDocketBookings() {
  await requireAuth();
  return prisma.docketBooking.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function createDocketBooking(data: unknown) {
  const session = await requireRole('OPERATIONS_MANAGER');
  const parsed = DocketBookingSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  const booking = await prisma.docketBooking.create({
    data: { docketNo: d.docketNo, partyId: d.partyId, partyName: d.partyName, bookingDate: d.bookingDate, origin: d.origin ?? null, destination: d.destination ?? null, description: d.description ?? null, rateFittedAmount: d.rateFittedAmount, markupAmount: d.markupAmount, gstRate: d.gstRate, gstAmount: d.gstAmount, totalAmount: d.totalAmount, dueDatePolicy: d.dueDatePolicy, status: d.status, notes: d.notes ?? null, linkedAwbId: d.linkedAwbId ?? null, wayBillNo: d.wayBillNo ?? null, consignee: d.consignee ?? null, value: d.value ?? 0, methodOfPacking: d.methodOfPacking ?? null },
  });
  serverLog('info', 'docket.created', { userId: session.user.id, bookingId: booking.id, docketNo: d.docketNo });
  revalidatePath('/dashboard/bookings/dockets');
  return { id: booking.id };
}

export async function updateDocketBooking(id: string, data: unknown) {
  const session = await requireRole('OPERATIONS_MANAGER');
  const parsed = UpdateDocketBookingSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
  const existing = await prisma.docketBooking.findUnique({ where: { id } });
  if (!existing) return { error: 'Booking not found' };
  await prisma.docketBooking.update({ where: { id }, data: parsed.data as Parameters<typeof prisma.docketBooking.update>[0]['data'] });
  serverLog('info', 'docket.updated', { userId: session.user.id, bookingId: id });
  revalidatePath('/dashboard/bookings/dockets');
  return { success: true };
}

export async function deleteDocketBookings(ids: string[]) {
  const session = await requireRole('OPERATIONS_MANAGER');
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) return { error: 'Invalid IDs' };
  if (!ids.every(id => typeof id === 'string' && id.length > 0)) return { error: 'Invalid IDs' };
  await prisma.docketBooking.deleteMany({ where: { id: { in: ids }, status: 'BOOKED' } });
  serverLog('info', 'docket.deleted', { userId: session.user.id, count: ids.length });
  revalidatePath('/dashboard/bookings/dockets');
  return { success: true };
}
