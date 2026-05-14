'use server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { ImportRowSchema } from '@/lib/validations';
import { serverLog } from '@/lib/logger';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.csv', '.txt']);

export async function importCsvBookings(formData: FormData, module: 'AWB_BOOKINGS' | 'DOCKET_BOOKINGS' | 'CUSTOMERS') {
  const session = await requireRole('OPERATIONS_MANAGER');
  const file = formData.get('file') as File | null;
  if (!file) return { error: 'No file provided' };
  if (file.size > MAX_FILE_SIZE) return { error: 'File too large (max 5MB)' };
  if (file.size === 0) return { error: 'File is empty' };
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return { error: 'Only CSV files are allowed' };

  const text = await file.text();
  if (!text.includes(',') && !text.includes('\n')) return { error: 'File does not appear to be a valid CSV' };

  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { error: 'CSV must have a header row and at least one data row' };
  if (lines.length > 10001) return { error: 'CSV too large (max 10,000 rows)' };

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const errors: string[] = [];
  let importedRows = 0;

  const job = await prisma.importJob.create({ data: { fileName: file.name, fileType: module, sourceModule: module, status: 'PROCESSING', totalRows: lines.length - 1 } });

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    const sanitized: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) sanitized[k] = sanitizeCsvInput(v);

    const parsed = ImportRowSchema.safeParse({
      awbNo: sanitized['awb_no'] || sanitized['awbno'],
      docketNo: sanitized['docket_no'] || sanitized['docketno'],
      partyName: sanitized['party_name'] || sanitized['partyname'] || sanitized['customer'],
      origin: sanitized['origin'], destination: sanitized['destination'],
      weight: sanitized['weight'], pieces: sanitized['pieces'],
      baseRate: sanitized['base_rate'] || sanitized['rate'],
      amount: sanitized['amount'] || sanitized['total'],
      bookingDate: sanitized['booking_date'] || sanitized['date'],
    });

    if (!parsed.success) { errors.push(`Row ${i}: ${parsed.error.errors.map(e => e.message).join(', ')}`); continue; }

    try {
      const today = new Date().toISOString().split('T')[0];
      if (module === 'AWB_BOOKINGS' && parsed.data.awbNo) {
        await prisma.awbBooking.create({ data: { awbNo: parsed.data.awbNo, partyId: 'p-imported', partyName: parsed.data.partyName, origin: parsed.data.origin ?? '', destination: parsed.data.destination ?? '', airlineName: 'IMPORTED', bookingDate: parsed.data.bookingDate ?? today, weight: parsed.data.weight ?? 0, pieces: parsed.data.pieces ?? 1, baseRate: parsed.data.baseRate ?? 0, markupAmount: 0, gstRate: 18, gstAmount: (parsed.data.amount ?? 0) * 0.18, totalAmount: parsed.data.amount ?? 0, status: 'BOOKED' } });
        importedRows++;
      } else if (module === 'DOCKET_BOOKINGS' && parsed.data.docketNo) {
        await prisma.docketBooking.create({ data: { docketNo: parsed.data.docketNo, partyId: 'p-imported', partyName: parsed.data.partyName, bookingDate: parsed.data.bookingDate ?? today, origin: parsed.data.origin ?? '', destination: parsed.data.destination ?? '', rateFittedAmount: parsed.data.amount ?? 0, markupAmount: 0, gstRate: 18, gstAmount: (parsed.data.amount ?? 0) * 0.18, totalAmount: parsed.data.amount ?? 0, dueDatePolicy: 30, status: 'BOOKED' } });
        importedRows++;
      }
    } catch { errors.push(`Row ${i}: Database error`); }
  }

  await prisma.importJob.update({ where: { id: job.id }, data: { status: errors.length === importedRows ? 'FAILED' : 'COMPLETED', importedRows, errorRows: errors.length, errors: errors.slice(0, 50).join('\n') } });

  serverLog('info', 'import.completed', { userId: session.user.id, jobId: job.id, module, importedRows, errorRows: errors.length });
  revalidatePath('/dashboard/import');
  revalidatePath('/dashboard/bookings/awb');
  revalidatePath('/dashboard/bookings/dockets');
  return { jobId: job.id, totalRows: lines.length - 1, importedRows, errorRows: errors.length, errors: errors.slice(0, 20) };
}

function sanitizeCsvInput(value: string): string {
  return value.trim().replace(/^"|"$/g, '').replace(/^[=+\-@\t\r]+/, '');
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += ch;
  }
  result.push(current);
  return result;
}
