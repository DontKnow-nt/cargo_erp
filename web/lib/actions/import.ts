'use server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { ImportRowSchema, PartySchema, PaymentReceiptSchema, FreightRateSchema } from '@/lib/validations';
import { recordAuditLog, serverLog } from '@/lib/logger';
import { z } from 'zod';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.csv', '.txt']);

type CsvImportModule = 'AWB_BOOKINGS' | 'DOCKET_BOOKINGS' | 'CUSTOMERS' | 'PAYMENTS' | 'RATE_SHEET';

const PaymentImportSchema = z.object({
  invoiceNo: z.string().min(1).max(50).trim(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentAmount: z.coerce.number().positive().max(100_000_000),
  paymentMode: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'NEFT', 'RTGS', 'UPI', 'OTHER']).optional().default('NEFT'),
  referenceNo: z.string().max(100).trim().optional(),
  bankName: z.string().max(200).trim().optional(),
  notes: z.string().max(500).trim().optional(),
});

const CustomerImportSchema = z.object({
  partyName: z.string().min(2).max(200).trim(),
  gstin: z.string().optional().default(''),
  contactPerson: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
  billingAddress: z.string().optional().default(''),
  creditLimit: z.coerce.number().min(0).default(0),
  creditDays: z.coerce.number().int().min(0).max(365).default(30),
});

const RateSheetImportSchema = z.object({
  carrier: z.string().min(2).max(100).trim(),
  origin: z.string().length(3).trim().transform(v => v.toUpperCase()),
  destination: z.string().length(3).trim().transform(v => v.toUpperCase()),
  baseRate: z.coerce.number().positive().max(100_000),
  uom: z.enum(['KG', 'PIECE', 'FLAT']).optional().default('KG'),
});

async function ensurePartyForImport(partyName: string) {
  const normalized = partyName.trim();
  let party = await prisma.party.findFirst({
    where: {
      partyName: {
        equals: normalized,
        mode: 'insensitive',
      },
    },
  });

  if (!party) {
    party = await prisma.party.create({
      data: {
        partyName: normalized,
        status: 'ACTIVE',
      },
    });
  }

  return party;
}

async function importPaymentRow(row: z.infer<typeof PaymentImportSchema>) {
  const invoice = await prisma.invoice.findFirst({
    where: {
      invoiceNo: {
        equals: row.invoiceNo,
        mode: 'insensitive',
      },
    },
  });

  if (!invoice) {
    return { error: `Invoice ${row.invoiceNo} not found` };
  }

  if (invoice.status === 'CANCELLED') {
    return { error: `Invoice ${row.invoiceNo} is cancelled` };
  }

  const receiptCount = await prisma.paymentReceipt.count();
  const receiptNo = `RCP-${new Date().getFullYear()}-${String(receiptCount + 1).padStart(4, '0')}`;
  const gstFraction = invoice.grandTotal > 0 ? invoice.gstTotal / invoice.grandTotal : 0;
  const gstComponent = row.paymentAmount * gstFraction;
  const freightComponent = row.paymentAmount - gstComponent;
  const paidTotal = invoice.paidTotal + row.paymentAmount;
  const outstandingTotal = Math.max(0, invoice.grandTotal - paidTotal);
  const status = outstandingTotal === 0 ? 'PAID' : 'PARTIALLY_PAID';

  await prisma.$transaction([
    prisma.paymentReceipt.create({
      data: {
        receiptNo,
        partyId: invoice.partyId,
        partyName: invoice.partyName,
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        paymentDate: row.paymentDate,
        paymentAmount: row.paymentAmount,
        freightComponent,
        gstComponent,
        paymentMode: row.paymentMode ?? 'NEFT',
        referenceNo: row.referenceNo ?? null,
        bankName: row.bankName ?? null,
        remarks: row.notes ?? null,
        status: 'CONFIRMED',
      },
    }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { paidTotal, outstandingTotal, status },
    }),
    prisma.outstandingEntry.updateMany({
      where: { invoiceId: invoice.id },
      data: { paidAmount: paidTotal, outstandingAmount: outstandingTotal },
    }),
  ]);

  return { success: true };
}

export async function importCsvBookings(formData: FormData, module: CsvImportModule) {
  const session = await requireRole(module === 'PAYMENTS' ? 'ACCOUNTS_EXECUTIVE' : 'OPERATIONS_MANAGER');
  const file = formData.get('file') as File | null;
  if (!file) return { error: 'No file provided' };
  if (file.size > MAX_FILE_SIZE) return { error: 'File too large (max 5MB)' };
  if (file.size === 0) return { error: 'File is empty' };

  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return { error: 'Only CSV/TXT files are allowed' };

  const text = await file.text();
  if (!text.includes(',') && !text.includes('\n')) return { error: 'File does not appear to be a valid CSV' };

  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { error: 'CSV must have a header row and at least one data row' };
  if (lines.length > 10001) return { error: 'CSV too large (max 10,000 rows)' };

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const errors: string[] = [];
  let importedRows = 0;

  const job = await prisma.importJob.create({
    data: {
      fileName: file.name,
      fileType: ext.replace('.', '').toUpperCase(),
      sourceModule: module,
      status: 'PROCESSING',
      totalRows: lines.length - 1,
    },
  });

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });

    const sanitized: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) sanitized[k] = sanitizeCsvInput(v);

    try {
      const today = new Date().toISOString().split('T')[0];

      if (module === 'AWB_BOOKINGS') {
        const parsed = ImportRowSchema.safeParse({
          awbNo: sanitized.awb_no || sanitized.awbno || sanitized.awbNo,
          partyName: sanitized.party_name || sanitized.partyname || sanitized.customer,
          origin: sanitized.origin,
          destination: sanitized.destination,
          weight: sanitized.weight,
          pieces: sanitized.pieces,
          baseRate: sanitized.base_rate || sanitized.baserate || sanitized.rate,
          amount: sanitized.amount || sanitized.total,
          bookingDate: sanitized.booking_date || sanitized.date,
        });
        if (!parsed.success || !parsed.data.awbNo) {
          errors.push(`Row ${i}: Invalid AWB booking row`);
          continue;
        }

        const party = await ensurePartyForImport(parsed.data.partyName);
        const weight = parsed.data.weight ?? 0;
        const baseRate = parsed.data.baseRate ?? 0;
        const markupAmount = 0;
        const gstRate = 18;
        const gstAmount = (weight * baseRate + markupAmount) * gstRate / 100;
        const totalAmount = parsed.data.amount ?? (weight * baseRate + markupAmount + gstAmount);

        await prisma.awbBooking.create({
          data: {
            awbNo: parsed.data.awbNo,
            partyId: party.id,
            partyName: party.partyName,
            origin: parsed.data.origin ?? '',
            destination: parsed.data.destination ?? '',
            airlineName: sanitized.airline_name || sanitized.airlinename || 'IMPORTED',
            bookingDate: parsed.data.bookingDate ?? today,
            weight,
            pieces: parsed.data.pieces ?? 1,
            baseRate,
            markupAmount,
            gstRate,
            gstAmount,
            totalAmount,
            status: 'BOOKED',
          },
        });
        importedRows++;
        continue;
      }

      if (module === 'DOCKET_BOOKINGS') {
        const parsed = ImportRowSchema.safeParse({
          docketNo: sanitized.docket_no || sanitized.docketno || sanitized.docketNo,
          partyName: sanitized.party_name || sanitized.partyname || sanitized.customer,
          origin: sanitized.origin,
          destination: sanitized.destination,
          amount: sanitized.rate_fitted_amount || sanitized.ratefittedamount || sanitized.amount || sanitized.total,
          bookingDate: sanitized.booking_date || sanitized.date,
        });
        if (!parsed.success || !parsed.data.docketNo) {
          errors.push(`Row ${i}: Invalid docket booking row`);
          continue;
        }

        const party = await ensurePartyForImport(parsed.data.partyName);
        const rateFittedAmount = parsed.data.amount ?? 0;
        const markupAmount = Number(sanitized.markup_amount || sanitized.markup || 0);
        const gstRate = Number(sanitized.gst_rate || 18);
        const gstAmount = (rateFittedAmount + markupAmount) * gstRate / 100;
        const totalAmount = rateFittedAmount + markupAmount + gstAmount;

        await prisma.docketBooking.create({
          data: {
            docketNo: parsed.data.docketNo,
            partyId: party.id,
            partyName: party.partyName,
            bookingDate: parsed.data.bookingDate ?? today,
            origin: parsed.data.origin ?? null,
            destination: parsed.data.destination ?? null,
            description: sanitized.description || null,
            rateFittedAmount,
            markupAmount,
            gstRate,
            gstAmount,
            totalAmount,
            dueDatePolicy: Number(sanitized.due_date_policy || sanitized.credit_days || 30),
            status: 'BOOKED',
            wayBillNo: sanitized.way_bill_no || sanitized.waybillno || null,
            consignee: sanitized.consignee || null,
            value: sanitized.value ? Number(sanitized.value) : 0,
            methodOfPacking: sanitized.method_of_packing || sanitized.methodofpacking || null,
          },
        });
        importedRows++;
        continue;
      }

      if (module === 'CUSTOMERS') {
        const parsed = CustomerImportSchema.safeParse({
          partyName: sanitized.party_name || sanitized.partyname || sanitized.customer,
          gstin: sanitized.gstin || '',
          contactPerson: sanitized.contact_person || sanitized.contactperson || '',
          phone: sanitized.phone || '',
          email: sanitized.email || '',
          billingAddress: sanitized.billing_address || sanitized.billingaddress || '',
          creditLimit: sanitized.credit_limit || sanitized.creditlimit || 0,
          creditDays: sanitized.credit_days || sanitized.creditdays || 30,
        });
        if (!parsed.success) {
          errors.push(`Row ${i}: Invalid customer row`);
          continue;
        }

        const partyData = PartySchema.parse({
          ...parsed.data,
          status: 'ACTIVE',
        });

        const existing = await prisma.party.findFirst({
          where: {
            partyName: {
              equals: partyData.partyName,
              mode: 'insensitive',
            },
          },
        });

        if (existing) {
          await prisma.party.update({
            where: { id: existing.id },
            data: {
              gstin: partyData.gstin || null,
              contactPerson: partyData.contactPerson || null,
              phone: partyData.phone || null,
              email: partyData.email || null,
              billingAddress: partyData.billingAddress || null,
              creditLimit: partyData.creditLimit,
              creditDays: partyData.creditDays,
              status: partyData.status,
            },
          });
        } else {
          await prisma.party.create({
            data: {
              partyName: partyData.partyName,
              gstin: partyData.gstin || null,
              contactPerson: partyData.contactPerson || null,
              phone: partyData.phone || null,
              email: partyData.email || null,
              billingAddress: partyData.billingAddress || null,
              creditLimit: partyData.creditLimit,
              creditDays: partyData.creditDays,
              status: partyData.status,
            },
          });
        }
        importedRows++;
        continue;
      }

      if (module === 'PAYMENTS') {
        const parsed = PaymentImportSchema.safeParse({
          invoiceNo: sanitized.invoice_no || sanitized.invoiceno || sanitized.invoiceNo,
          paymentDate: sanitized.payment_date || sanitized.paymentdate || sanitized.date,
          paymentAmount: sanitized.payment_amount || sanitized.paymentamount || sanitized.amount,
          paymentMode: sanitized.payment_mode || sanitized.paymentmode || 'NEFT',
          referenceNo: sanitized.reference_no || sanitized.referenceno || '',
          bankName: sanitized.bank_name || sanitized.bankname || '',
          notes: sanitized.notes || sanitized.remarks || '',
        });
        if (!parsed.success) {
          errors.push(`Row ${i}: Invalid payment row`);
          continue;
        }

        const result = await importPaymentRow(parsed.data);
        if ('error' in result) {
          errors.push(`Row ${i}: ${result.error}`);
          continue;
        }
        importedRows++;
        continue;
      }

      if (module === 'RATE_SHEET') {
        const parsed = RateSheetImportSchema.safeParse({
          carrier: sanitized.carrier || sanitized.carrier_name || 'Imported Carrier',
          origin: sanitized.origin,
          destination: sanitized.destination,
          baseRate: sanitized.base_rate || sanitized.baserate || sanitized.rate,
          uom: sanitized.uom || 'KG',
        });
        if (!parsed.success) {
          errors.push(`Row ${i}: Invalid rate row`);
          continue;
        }

        const version = await prisma.freightRateVersion.findFirst({
          where: {
            carrierName: parsed.data.carrier,
            validFrom: today,
            status: 'ACTIVE',
          },
        });

        const versionId = version?.id ?? (await prisma.freightRateVersion.create({
          data: {
            carrierName: parsed.data.carrier,
            validFrom: today,
            status: 'ACTIVE',
            notes: `Imported from ${file.name}`,
          },
        })).id;

        await prisma.freightRate.create({
          data: {
            versionId,
            origin: parsed.data.origin,
            destination: parsed.data.destination,
            baseRate: parsed.data.baseRate,
            uom: parsed.data.uom,
            activeFlag: true,
          },
        });
        importedRows++;
      }
    } catch (error) {
      errors.push(`Row ${i}: ${error instanceof Error ? error.message : 'Database error'}`);
    }
  }

  const status = importedRows === 0
    ? 'FAILED'
    : errors.length > 0
      ? 'PARTIAL'
      : 'COMPLETED';

  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status,
      importedRows,
      errorRows: errors.length,
      errors: errors.slice(0, 50).join('\n'),
    },
  });

  serverLog('info', 'import.completed', { userId: session.user.id, jobId: job.id, module, importedRows, errorRows: errors.length });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'IMPORT_COMPLETED',
    resource: 'IMPORT_JOB',
    resourceId: job.id,
    details: `${module} import completed: ${importedRows} imported, ${errors.length} errors`,
  });

  revalidatePath('/dashboard/import');
  revalidatePath('/dashboard/bookings/awb');
  revalidatePath('/dashboard/bookings/dockets');
  revalidatePath('/dashboard/payments');
  revalidatePath('/dashboard/rates');
  revalidatePath('/dashboard/parties');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/reports');
  revalidatePath('/dashboard/notifications');

  return {
    jobId: job.id,
    totalRows: lines.length - 1,
    importedRows,
    errorRows: errors.length,
    errors: errors.slice(0, 20),
  };
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
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  result.push(current);
  return result;
}
