import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [parties, awbBookings, docketBookings, invoices, paymentReceipts, outstanding] = await Promise.all([
    prisma.party.findMany({ orderBy: { partyName: 'asc' } }),
    prisma.awbBooking.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.docketBooking.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.invoice.findMany({ include: { lines: true }, orderBy: { createdAt: 'desc' } }),
    prisma.paymentReceipt.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.outstandingEntry.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);

  return NextResponse.json({ parties, awbBookings, docketBookings, invoices, paymentReceipts, outstanding, _ts: Date.now() });
}

