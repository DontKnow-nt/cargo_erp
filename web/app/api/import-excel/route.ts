export const runtime = 'edge';
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
  // DD.MM.YY or DD.MM.YYYY or DD/MM/YY(YY) or DD-MM-YY(YY)
  const m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date().toISOString().split('T')[0];
}

function num(v: unknown): number { return parseFloat(String(v||0).replace(/,/g,''))||0; }
function str(v: unknown): string { return String(v||'').trim(); }

async function ensureParty(name: string, userId: string): Promise<{id:string;name:string}> {
  const n = name.trim() || 'Unknown';
  const ex = await prisma.party.findFirst({ where: { partyName: { equals: n, mode: 'insensitive' } } });
  if (ex) return { id: ex.id, name: ex.partyName };
  const cr = await prisma.party.create({ data: { partyName: n, status: 'ACTIVE', createdBy: userId } });
  return { id: cr.id, name: cr.partyName };
}

/**
 * Each sheet in the workbook represents ONE invoice printout (letterhead, bill-to block,
 * line items, totals, terms). We only need 4 facts out of the whole sheet:
 *   - Company name   : the cell containing "M/s" (the bill-to party), stripped of the "M/s" label
 *   - Bill No.        : the cell containing "Bill NO" / "Bill No." / "Invoice No.", stripped of its label
 *   - Date            : the cell right after/below the Bill No. cell that looks like a date
 *   - Net Amount      : the value next to a "Net Amount" label (falls back to "Grand Total" / the
 *                       row labeled "TOTAL" if no explicit Net Amount row exists)
 * Everything else on the sheet (line items, GST breakup, terms) is ignored.
 */
function extractInvoiceFacts(rows: unknown[][]): { company: string; billNo: string; date: string; netAmount: number } | null {
  let company = '';
  let billNo = '';
  let date = '';
  let netAmount = 0;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const cell = str(row[c]);
      if (!cell) continue;

      if (!company) {
        const mCompany = cell.match(/M\/s\.?\s*[:\-]?\s*(.+)/i);
        if (mCompany) company = mCompany[1].trim();
      }

      if (!billNo) {
        const mBill = cell.match(/bill\s*no\.?\s*[:\-]*\s*(\S.*)?$/i) || cell.match(/invoice\s*no\.?\s*[:\-]*\s*(\S.*)?$/i);
        if (mBill) {
          const inline = mBill[1]?.trim();
          if (inline) {
            billNo = inline;
          } else {
            // value is in a later column of the same row, or the row right below
            for (let c2 = c + 1; c2 < row.length; c2++) { const v = str(row[c2]); if (v) { billNo = v; break; } }
            if (!billNo && rows[r + 1]) { for (const v of rows[r + 1]) { const s = str(v); if (s) { billNo = s; break; } } }
          }
          // Also look for a date on this same row or the next row (bill-to blocks usually pair Bill No with Date)
          if (!date) {
            for (let c2 = c + 1; c2 < row.length; c2++) {
              const v = str(row[c2]);
              if (/^\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}$/.test(v)) { date = v; break; }
            }
            if (!date && rows[r + 1]) {
              for (const v of rows[r + 1]) { const s = str(v); if (/^\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}$/.test(s)) { date = s; break; } }
            }
          }
        }
      }

      if (/net\s*amount/i.test(cell)) {
        for (let c2 = c + 1; c2 < row.length; c2++) { const v = num(row[c2]); if (v > 0) { netAmount = v; break; } }
      }
    }
  }

  // Fallback: no explicit "Net Amount" row -- use the "TOTAL" row's last non-empty numeric cell.
  if (netAmount <= 0) {
    const totalRow = rows.find(row => row.some(c => /^total$/i.test(str(c))));
    if (totalRow) {
      const nums = totalRow.map(num).filter(n => n > 0);
      if (nums.length) netAmount = nums[nums.length - 1];
    }
  }

  if (!company && !billNo && netAmount <= 0) return null; // this sheet doesn't look like an invoice at all
  return { company, billNo, date, netAmount };
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
    const results = { outstanding: 0, skipped: 0, errors: [] as string[], skipReasons: {} as Record<string, number> };
    const noteSkip = (reason: string) => { results.skipped++; results.skipReasons[reason] = (results.skipReasons[reason] ?? 0) + 1; };

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) continue;

      try {
        const facts = extractInvoiceFacts(rows);
        if (!facts) { noteSkip('not_an_invoice_sheet'); continue; }
        const { company, billNo, date, netAmount } = facts;

        if (netAmount <= 0) { noteSkip('zero_or_missing_amount'); continue; }
        if (!company) { noteSkip('missing_company_name'); continue; }

        const bookingDate = parseDate(date);
        const finalBillNo = billNo || `IMP-${sheetName}-${Date.now()}`;

        // Skip only if this exact bill number was already imported before (idempotent re-upload).
        const dupe = await prisma.invoice.findFirst({ where: { invoiceNo: finalBillNo }, select: { id: true } });
        if (dupe) { noteSkip('already_imported'); continue; }

        const party = await ensureParty(company, userId);
        const due = new Date(bookingDate); due.setDate(due.getDate() + 30);

        const inv = await prisma.invoice.create({
          data: {
            invoiceNo: finalBillNo,
            partyId: party.id, partyName: party.name,
            bookingType: 'IMPORTED',
            bookingRef: finalBillNo,
            invoiceDate: bookingDate,
            dueDate: due.toISOString().split('T')[0],
            subtotal: netAmount, gstTotal: 0, grandTotal: netAmount,
            paidTotal: 0, outstandingTotal: netAmount,
            // IMPORTED (not FINALIZED/DRAFT): this is a historical invoice that was already
            // issued in the past, not a new live invoice needing review/finalize/cancel actions.
            // Keeps it out of the Invoices page's active-status KPI tiles and action buttons.
            status: 'IMPORTED', createdBy: userId,
            lines: { create: [{ description: `Imported invoice ${finalBillNo}`, qty: 1, rate: netAmount, amount: netAmount, taxRate: 0, taxAmount: 0, lineTotal: netAmount }] }
          }
        });

        await prisma.outstandingEntry.create({
          data: {
            partyId: party.id, partyName: party.name,
            invoiceId: inv.id, invoiceNo: finalBillNo,
            bookingRef: finalBillNo,
            originalAmount: netAmount, paidAmount: 0, outstandingAmount: netAmount,
            invoiceDate: bookingDate, dueDate: due.toISOString().split('T')[0],
            agingBucket: 'CURRENT', creditLimit: 0,
          }
        });
        results.outstanding++;
      } catch (err) {
        results.errors.push(`Sheet ${sheetName}: ${String(err).slice(0, 80)}`);
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
