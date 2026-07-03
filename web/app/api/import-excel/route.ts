import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';

function parseDate(val: unknown): string {
  if (!val) return new Date().toISOString().split('T')[0];
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date().toISOString().split('T')[0];
}

function num(v: unknown): number { return parseFloat(String(v||0).replace(/,/g,''))||0; }
function str(v: unknown): string { return String(v||'').trim(); }
function nh(h: string): string { return h.toLowerCase().replace(/[^a-z0-9]/g,''); }

async function ensureParty(name: string, userId: string): Promise<{id:string;name:string}> {
  const n = name.trim() || 'Unknown';
  const ex = await prisma.party.findFirst({ where: { partyName: { equals: n, mode: 'insensitive' } } });
  if (ex) return { id: ex.id, name: ex.partyName };
  const cr = await prisma.party.create({ data: { partyName: n, status: 'ACTIVE', createdBy: userId } });
  return { id: cr.id, name: cr.partyName };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const results = { outstanding: 0, skipped: 0, errors: [] as string[] };

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) continue;

      // Find header row
      let headerIdx = 0;
      for (let i = 0; i < Math.min(6, rows.length); i++) {
        const row = rows[i] as unknown[];
        const nonEmpty = row.filter(c => String(c||'').trim().length > 0).length;
        const hasDateOrSno = row.some(c => /sno|s\.no|date/i.test(String(c||'')));
        if (nonEmpty >= 4 && hasDateOrSno) { headerIdx = i; break; }
        if (nonEmpty >= 6) { headerIdx = i; break; }
      }

      const headers = (rows[headerIdx] as unknown[]).map(h => str(h));
      const h = headers.map(nh);

      const get = (row: unknown[], ...names: string[]): unknown => {
        for (const n of names) {
          const idx = h.findIndex(x => x.includes(n));
          if (idx >= 0 && String(row[idx]||'').trim()) return row[idx];
        }
        return '';
      };

      // Sort rows by date ascending (oldest first)
      const dataRows = rows.slice(headerIdx + 1).filter(r => {
        const row = r as unknown[];
        return row.slice(0, 5).some(c => String(c||'').trim()) && /\d/.test(row.slice(0,5).join(''));
      });
      dataRows.sort((a, b) => parseDate(get(a as unknown[], 'date')).localeCompare(parseDate(get(b as unknown[], 'date'))));

      for (const rawRow of dataRows) {
        const row = rawRow as unknown[];
        try {
          const invoiceNo = str(get(row, 'invoice'));
          const docketNo  = str(get(row, 'docket'));
          const awbNo     = str(get(row, 'awbno','awb'));
          const bookingRef = invoiceNo || docketNo || awbNo || `REF-${Date.now()}`;
          const bookingDate = parseDate(get(row, 'date'));
          const totalAmt = num(get(row, 'totalamt','amount','total')) || num(row[row.length - 1]);
          let partyName = str(get(row, 'party','shipper','consignee')) || sheetName;

          if (totalAmt <= 0) { results.skipped++; continue; }

          // Match this row against an EXISTING AWB or Docket booking already in the system
          // (not against the Invoice table -- a booking may exist without ever having been
          // invoiced). When matched, use the booking's own party name (more reliable than the
          // Excel row's free-text party column) and mark that booking as "IMPORTED" so it's
          // visible in the AWB/Docket lists. If this exact booking was already marked IMPORTED
          // by an earlier run of this same import, skip it -- re-uploading the same file must
          // not add the same amount to Outstanding twice.
          let matchedAwb: { id: string; awbNo: string; partyName: string; status: string } | null = null;
          let matchedDocket: { id: string; docketNo: string; partyName: string; status: string } | null = null;
          if (awbNo) {
            matchedAwb = await prisma.awbBooking.findFirst({ where: { awbNo: { equals: awbNo, mode: 'insensitive' } }, select: { id: true, awbNo: true, partyName: true, status: true } });
          }
          if (!matchedAwb && docketNo) {
            matchedDocket = await prisma.docketBooking.findFirst({ where: { docketNo: { equals: docketNo, mode: 'insensitive' } }, select: { id: true, docketNo: true, partyName: true, status: true } });
          }

          if (matchedAwb?.status === 'IMPORTED' || matchedDocket?.status === 'IMPORTED') { results.skipped++; continue; }
          // A booking already billed through the normal invoicing flow (status INVOICED) already
          // has its own real Invoice + OutstandingEntry. Adding this row would double-count that
          // amount, so skip it -- but a BOOKED (not yet invoiced) match still gets processed below.
          if (matchedAwb?.status === 'INVOICED' || matchedDocket?.status === 'INVOICED') { results.skipped++; continue; }

          // Safety guard: if this row's own invoice number already belongs to a real invoice
          // (e.g. the Excel file repeats the same invoice number, or it collides with one already
          // in the system), skip -- Invoice.invoiceNo is unique and creating it again would fail.
          if (invoiceNo) {
            const dupeInvoiceNo = await prisma.invoice.findFirst({ where: { invoiceNo }, select: { id: true } });
            if (dupeInvoiceNo) { results.skipped++; continue; }
          }

          if (matchedAwb) partyName = matchedAwb.partyName;
          if (matchedDocket) partyName = matchedDocket.partyName;

          const party = await ensureParty(partyName, userId);

          // Create a draft invoice to anchor the outstanding entry
          const finalInvoiceNo = invoiceNo || `IMP-${bookingRef}-${Date.now()}`;
          const due = new Date(bookingDate); due.setDate(due.getDate() + 30);
          const inv = await prisma.invoice.create({
            data: {
              invoiceNo: finalInvoiceNo,
              partyId: party.id, partyName: party.name,
              bookingType: docketNo ? 'DOCKET' : 'AWB',
              bookingRef,
              invoiceDate: bookingDate,
              dueDate: due.toISOString().split('T')[0],
              subtotal: totalAmt, gstTotal: 0, grandTotal: totalAmt,
              paidTotal: 0, outstandingTotal: totalAmt,
              status: 'FINALIZED', createdBy: userId,
              lines: { create: [{ description: bookingRef, qty: 1, rate: totalAmt, amount: totalAmt, taxRate: 0, taxAmount: 0, lineTotal: totalAmt }] }
            }
          });
          const invoiceId = inv.id;

          // Mark the matched booking as IMPORTED so it's clearly flagged in the AWB/Docket lists.
          if (matchedAwb) await prisma.awbBooking.update({ where: { id: matchedAwb.id }, data: { status: 'IMPORTED' } });
          if (matchedDocket) await prisma.docketBooking.update({ where: { id: matchedDocket.id }, data: { status: 'IMPORTED' } });

          // Create outstanding entry
          const due2 = new Date(bookingDate); due2.setDate(due2.getDate() + 30);
          await prisma.outstandingEntry.create({
            data: {
              partyId: party.id, partyName: party.name,
              invoiceId, invoiceNo: finalInvoiceNo,
              bookingRef,
              originalAmount: totalAmt, paidAmount: 0, outstandingAmount: totalAmt,
              invoiceDate: bookingDate, dueDate: due2.toISOString().split('T')[0],
              agingBucket: 'CURRENT', creditLimit: 0,
            }
          });
          results.outstanding++;
        } catch (err) {
          results.errors.push(`Row error: ${String(err).slice(0, 80)}`);
        }
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
