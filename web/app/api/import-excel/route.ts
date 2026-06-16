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
  if (m) { const y = m[3].length===2?`20${m[3]}`:m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date().toISOString().split('T')[0];
}
function num(v: unknown): number { return parseFloat(String(v||0).replace(/,/g,''))||0; }
function str(v: unknown): string { return String(v||'').trim(); }
function nh(h: string): string { return h.toLowerCase().replace(/[^a-z0-9]/g,''); }

async function ensureParty(name: string, userId: string): Promise<string> {
  if (!name.trim()) return (await prisma.party.findFirst({where:{partyName:'Unknown'}}) || await prisma.party.create({data:{partyName:'Unknown',status:'ACTIVE',createdBy:userId}})).id;
  const ex = await prisma.party.findFirst({where:{partyName:{equals:name.trim(),mode:'insensitive'}}});
  if (ex) return ex.id;
  return (await prisma.party.create({data:{partyName:name.trim(),status:'ACTIVE',createdBy:userId}})).id;
}

// Detect if a row is AWB type or Docket type based on cell values
function detectRowType(row: unknown[], headers: string[]): 'awb' | 'docket' | 'skip' {
  const h = headers.map(nh);
  const vals = row.map(v => str(v));
  // If any cell looks like an AWB number (e.g. 312-12345678 or starts with airline code)
  const awbPat = /^\d{3}[-\s]?\d{7,8}$|^\d{9,11}$/;
  for (const v of vals) { if (awbPat.test(v.replace(/\s/g,''))) return 'awb'; }
  // If has a docket-like number (shorter, 5-7 digits)
  const dktIdx = h.findIndex(x => x.includes('docket'));
  if (dktIdx >= 0 && vals[dktIdx] && /^\d{4,7}$/.test(vals[dktIdx])) return 'docket';
  // Fallback: check header context
  if (h.some(x => x.includes('docket'))) return 'docket';
  if (h.some(x => x.includes('awb') || x.includes('airway'))) return 'awb';
  return 'skip';
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
    const results = { dockets: 0, awbs: 0, invoices: 0, skipped: 0, errors: [] as string[] };

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) continue;

      // Find header row
      let headerIdx = 0;
      for (let i = 0; i < Math.min(6, rows.length); i++) {
        const row = rows[i] as unknown[];
        const nonEmpty = row.filter(c => String(c||'').trim().length > 0).length;
        const hasId = row.some(c => /sno|s\.no|date/i.test(String(c||'')));
        if (nonEmpty >= 4 && hasId) { headerIdx = i; break; }
        if (nonEmpty >= 6) { headerIdx = i; break; }
      }

      const headers = (rows[headerIdx] as unknown[]).map(h => str(h));
      const h = headers.map(nh);

      const get = (row: unknown[], ...names: string[]): unknown => {
        for (const n of names) {
          const idx = h.findIndex(x => x.includes(n));
          if (idx >= 0 && row[idx] !== undefined && String(row[idx]||'').trim()) return row[idx];
        }
        return '';
      };

      // Collect all data rows, sort by date ascending (oldest first → created first → appears at bottom of list)
      const dataRows = rows.slice(headerIdx + 1).filter(r => {
        const row = r as unknown[];
        const firstCells = row.slice(0, 4).map(c => String(c||'').trim());
        return firstCells.filter(Boolean).length >= 2 && /\d/.test(firstCells.join(''));
      });

      dataRows.sort((a, b) => {
        const da = parseDate(get(a as unknown[], 'date'));
        const db = parseDate(get(b as unknown[], 'date'));
        return da.localeCompare(db);
      });

      for (const rawRow of dataRows) {
        const row = rawRow as unknown[];
        const rowType = detectRowType(row, headers);
        if (rowType === 'skip') { results.skipped++; continue; }

        const bookingDate = parseDate(get(row, 'date'));
        const invoiceNo   = str(get(row, 'invoice'));
        const pkt         = parseInt(str(get(row, 'pkt','pieces','boxes'))) || 1;
        const weight      = num(get(row, 'wt','weight'));
        const freight     = num(get(row, 'freight'));
        const totalAmt    = num(get(row, 'totalamt','amount','total')) || num(row[row.length-1]);

        try {
          if (rowType === 'docket') {
            const docketNo = str(get(row, 'docket')) || str(get(row, 'docketno'));
            if (!docketNo || docketNo.length < 2) { results.skipped++; continue; }

            const origin      = str(get(row, 'origin'));
            const destination = str(get(row, 'destination','dest'));
            const partyName   = str(get(row, 'party','consignee')) || sheetName;
            const rate        = num(get(row, 'rate'));

            const dup = await prisma.docketBooking.findFirst({ where: { docketNo } });
            if (dup) { results.skipped++; continue; }

            const partyId = await ensureParty(partyName, userId);
            const dkt = await prisma.docketBooking.create({
              data: {
                docketNo, partyId, partyName,
                bookingDate, origin: origin||null, destination: destination||null,
                rateFittedAmount: freight||rate, markupAmount: 0, gstRate: 18,
                gstAmount: 0, totalAmount: totalAmt||freight,
                dueDatePolicy: 30, status: 'BOOKED',
                weight: weight||null, pieces: pkt, createdBy: userId,
              }
            });
            results.dockets++;

            if (invoiceNo && invoiceNo.length > 2 && !await prisma.invoice.findUnique({ where: { invoiceNo } })) {
              const due = new Date(bookingDate); due.setDate(due.getDate()+30);
              await prisma.invoice.create({ data: {
                invoiceNo, partyId, partyName, bookingType:'DOCKET', bookingRef:docketNo,
                invoiceDate:bookingDate, dueDate:due.toISOString().split('T')[0],
                subtotal:totalAmt, gstTotal:0, grandTotal:totalAmt,
                paidTotal:0, outstandingTotal:totalAmt, status:'DRAFT', createdBy:userId,
                lines:{create:[{description:`Docket ${docketNo} · ${origin}→${destination}`,qty:pkt,rate:weight>0?freight/weight:freight,amount:freight,taxRate:0,taxAmount:0,lineTotal:freight}]}
              }});
              results.invoices++;
            }

          } else {
            // AWB
            const awbNo = str(get(row, 'awbno','awb','airway')) || str(get(row, 'awbno'));
            if (!awbNo || awbNo.length < 3) { results.skipped++; continue; }

            const sector = str(get(row, 'sector','route'));
            let origin = str(get(row, 'origin','from'));
            let destination = str(get(row, 'destination','dest','to'));
            if (!origin && sector) {
              const parts = sector.split(/[-–→\/\s]+/);
              origin = parts[0]?.trim()||''; destination = parts[1]?.trim()||'';
            }
            const partyName = str(get(row, 'party','shipper','consignee')) || sheetName;

            const dup = await prisma.awbBooking.findFirst({ where: { awbNo } });
            if (dup) { results.skipped++; continue; }

            const partyId = await ensureParty(partyName, userId);
            await prisma.awbBooking.create({ data: {
              awbNo, partyId, partyName, origin, destination,
              airlineName:'IndiGo', bookingDate, weight, pieces:pkt,
              baseRate: weight>0 ? freight/weight : 0,
              markupAmount:0, gstRate:18, gstAmount:0,
              totalAmount:totalAmt||freight, status:'BOOKED', createdBy:userId,
            }});
            results.awbs++;

            if (invoiceNo && invoiceNo.length > 2 && !await prisma.invoice.findUnique({ where: { invoiceNo } })) {
              const due = new Date(bookingDate); due.setDate(due.getDate()+30);
              await prisma.invoice.create({ data: {
                invoiceNo, partyId, partyName, bookingType:'AWB', bookingRef:awbNo,
                invoiceDate:bookingDate, dueDate:due.toISOString().split('T')[0],
                subtotal:totalAmt, gstTotal:0, grandTotal:totalAmt,
                paidTotal:0, outstandingTotal:totalAmt, status:'DRAFT', createdBy:userId,
                lines:{create:[{description:`AWB ${awbNo} · ${origin}→${destination} · ${weight}kg`,qty:weight||1,rate:weight>0?freight/weight:freight,amount:freight,taxRate:0,taxAmount:0,lineTotal:freight}]}
              }});
              results.invoices++;
            }
          }
        } catch (err) {
          results.errors.push(`${rowType} row error: ${String(err).slice(0,80)}`);
        }
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
