import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const DATA_RESOURCES = [
  'parties',
  'awbBookings',
  'docketBookings',
  'invoices',
  'paymentReceipts',
  'outstanding',
  'rateVersions',
  'freightRates',
  'importJobs',
  'auditLogs',
  'users',
  'purchaseBills',
] as const;

type DataResource = typeof DATA_RESOURCES[number];

const DATA_RESOURCE_SET = new Set<string>(DATA_RESOURCES);

const invoiceSelect = {
  id: true,
  invoiceNo: true,
  partyId: true,
  partyName: true,
  bookingType: true,
  bookingRef: true,
  invoiceDate: true,
  dueDate: true,
  subtotal: true,
  gstTotal: true,
  grandTotal: true,
  paidTotal: true,
  outstandingTotal: true,
  status: true,
  notes: true,
  createdBy: true,
  createdAt: true,
  lines: true,
};

function getRequestedResources(request: Request) {
  const params = new URL(request.url).searchParams;
  const raw = params.get('resources');
  if (!raw) return null;
  return new Set(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter((item): item is DataResource => DATA_RESOURCE_SET.has(item))
  );
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const requested = getRequestedResources(request);
  const shouldLoad = (resource: DataResource) => !requested || requested.has(resource);
  const payload: Record<string, unknown> = { _ts: Date.now() };

  await Promise.all([
    shouldLoad('parties') && prisma.party.findMany({ orderBy: { partyName: 'asc' } }).then((data) => { payload.parties = data; }),
    shouldLoad('awbBookings') && prisma.awbBooking.findMany({ orderBy: { createdAt: 'desc' } }).then((data) => { payload.awbBookings = data; }),
    shouldLoad('docketBookings') && prisma.docketBooking.findMany({ orderBy: { createdAt: 'desc' } }).then((data) => { payload.docketBookings = data; }),
    shouldLoad('invoices') && prisma.invoice.findMany({ select: invoiceSelect, orderBy: { createdAt: 'desc' } }).then((data) => { payload.invoices = data; }),
    shouldLoad('paymentReceipts') && prisma.paymentReceipt.findMany({ orderBy: { createdAt: 'desc' } }).then((data) => { payload.paymentReceipts = data; }),
    shouldLoad('outstanding') && prisma.outstandingEntry.findMany({ orderBy: { createdAt: 'desc' } }).then((data) => { payload.outstanding = data; }),
    shouldLoad('rateVersions') && prisma.freightRateVersion.findMany({ orderBy: { createdAt: 'desc' } }).then((data) => { payload.rateVersions = data; }),
    shouldLoad('freightRates') && prisma.freightRate.findMany().then((data) => { payload.freightRates = data; }),
    shouldLoad('importJobs') && prisma.importJob.findMany({ orderBy: { createdAt: 'desc' } }).then((data) => { payload.importJobs = data; }),
    shouldLoad('auditLogs') && prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }).then((data) => { payload.auditLogs = data; }),
    shouldLoad('users') && prisma.user.findMany({ select: { id: true, name: true, email: true, status: true }, orderBy: { name: 'asc' } }).then((data) => { payload.users = data; }),
    shouldLoad('purchaseBills') && prisma.purchaseInvoice.findMany({ orderBy: { createdAt: 'desc' } }).then((data) => { payload.purchaseBills = data; }),
  ].filter(Boolean));

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store' }
  });
}

