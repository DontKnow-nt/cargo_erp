import '@/lib/polyfill';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

function parseDate(value: unknown): string {
  if (!value) return new Date().toISOString().split('T')[0];
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return new Date().toISOString().split('T')[0];
}

async function ensureParty(name: string, userId: string): Promise<{ id: string; name: string }> {
  const partyName = name.trim() || 'Unknown';
  const existing = await prisma.party.findFirst({ where: { partyName: { equals: partyName, mode: 'insensitive' } } });
  if (existing) return { id: existing.id, name: existing.partyName };
  const created = await prisma.party.create({ data: { partyName, status: 'ACTIVE', createdBy: userId } });
  return { id: created.id, name: created.partyName };
}

type ImportSheet = {
  sheetName?: unknown;
  company?: unknown;
  billNo?: unknown;
  date?: unknown;
  netAmount?: unknown;
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  try {
    const payload = await req.json() as { sheets?: unknown };
    if (!Array.isArray(payload.sheets)) {
      return NextResponse.json({ error: 'No workbook sheets' }, { status: 400 });
    }
    if (payload.sheets.length > 1000) {
      return NextResponse.json({ error: 'Too many workbook sheets' }, { status: 400 });
    }

    const results = {
      outstanding: 0,
      skipped: 0,
      errors: [] as string[],
      skipReasons: {} as Record<string, number>,
    };
    const noteSkip = (reason: string) => {
      results.skipped++;
      results.skipReasons[reason] = (results.skipReasons[reason] ?? 0) + 1;
    };

    for (const rawSheet of payload.sheets as ImportSheet[]) {
      const sheetName = String(rawSheet?.sheetName ?? 'Sheet').slice(0, 120);
      try {
        const company = String(rawSheet?.company ?? '').trim().slice(0, 500);
        const billNo = String(rawSheet?.billNo ?? '').trim().slice(0, 160);
        const date = String(rawSheet?.date ?? '').trim().slice(0, 40);
        const amount = Number(rawSheet?.netAmount);
        const netAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;

        if (!company && !billNo && netAmount <= 0) { noteSkip('not_an_invoice_sheet'); continue; }
        if (netAmount <= 0) { noteSkip('zero_or_missing_amount'); continue; }
        if (!company) { noteSkip('missing_company_name'); continue; }

        const bookingDate = parseDate(date);
        const finalBillNo = billNo || `IMP-${sheetName}-${Date.now()}`;
        const duplicate = await prisma.invoice.findFirst({ where: { invoiceNo: finalBillNo }, select: { id: true } });
        if (duplicate) { noteSkip('already_imported'); continue; }

        const party = await ensureParty(company, userId);
        const due = new Date(bookingDate);
        due.setDate(due.getDate() + 30);
        const dueDate = due.toISOString().split('T')[0];

        const invoice = await prisma.invoice.create({
          data: {
            invoiceNo: finalBillNo,
            partyId: party.id,
            partyName: party.name,
            bookingType: 'IMPORTED',
            bookingRef: finalBillNo,
            invoiceDate: bookingDate,
            dueDate,
            subtotal: netAmount,
            gstTotal: 0,
            grandTotal: netAmount,
            paidTotal: 0,
            outstandingTotal: netAmount,
            status: 'IMPORTED',
            createdBy: userId,
            lines: {
              create: [{ description: `Imported invoice ${finalBillNo}`, qty: 1, rate: netAmount, amount: netAmount, taxRate: 0, taxAmount: 0, lineTotal: netAmount }],
            },
          },
        });

        await prisma.outstandingEntry.create({
          data: {
            partyId: party.id,
            partyName: party.name,
            invoiceId: invoice.id,
            invoiceNo: finalBillNo,
            bookingRef: finalBillNo,
            originalAmount: netAmount,
            paidAmount: 0,
            outstandingAmount: netAmount,
            invoiceDate: bookingDate,
            dueDate,
            agingBucket: 'CURRENT',
            creditLimit: 0,
          },
        });
        results.outstanding++;
      } catch (error) {
        results.errors.push(`Sheet ${sheetName}: ${String(error).slice(0, 80)}`);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
