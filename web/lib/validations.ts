import { z } from 'zod';

// ── Shared ────────────────────────────────────────────────────────────────────
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)');
const positiveNum = z.number().positive('Must be positive');
const nonNegNum = z.number().min(0, 'Must be non-negative');
const gstRate = z.number().min(0).max(28, 'GST rate must be 0-28%');
const creditDays = z.number().int().min(0).max(365);
const creditLimit = z.number().min(0).max(100_000_000);

// ── Party ─────────────────────────────────────────────────────────────────────
export const PartySchema = z.object({
  partyName: z.string().min(2).max(200).trim(),
  gstin: z.string().max(15).regex(/^[0-9A-Z]{1,15}$/, 'GSTIN must be alphanumeric, max 15 chars').optional().or(z.literal('')),
  pan: z.string().max(10).regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format').optional().or(z.literal('')),
  contactPerson: z.string().max(100).trim().optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number').optional().or(z.literal('')),
  email: z.string().email('Invalid email').max(200).optional().or(z.literal('')),
  billingAddress: z.string().max(500).trim().optional(),
  creditLimit: creditLimit,
  creditDays: creditDays,
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const UpdatePartySchema = PartySchema.partial();

// ── Freight Rate ──────────────────────────────────────────────────────────────
export const FreightRateVersionSchema = z.object({
  carrierName: z.string().min(2).max(100).trim(),
  validFrom: dateStr,
  validTo: dateStr.optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED']).default('DRAFT'),
  notes: z.string().max(500).optional(),
});

export const FreightRateSchema = z.object({
  origin: z.string().length(3, 'Origin must be 3-letter airport code').toUpperCase(),
  destination: z.string().length(3, 'Destination must be 3-letter airport code').toUpperCase(),
  baseRate: positiveNum.max(100_000, 'Rate too high'),
  uom: z.enum(['KG', 'PIECE', 'FLAT']).default('KG'),
  activeFlag: z.boolean().default(true),
});

// ── AWB Booking ───────────────────────────────────────────────────────────────
export const AwbBookingSchema = z.object({
  awbNo: z.string().min(3).max(50).trim(),
  partyId: z.string().min(1),
  partyName: z.string().min(1).max(200).trim(),
  origin: z.string().length(3).toUpperCase(),
  destination: z.string().length(3).toUpperCase(),
  airlineName: z.string().min(2).max(100).trim(),
  bookingDate: dateStr,
  shipmentDate: dateStr.optional().nullable(),
  weight: positiveNum.max(100_000, 'Weight too high'),
  pieces: z.number().int().positive().max(10_000),
  baseRate: positiveNum.max(100_000),
  markupAmount: nonNegNum.max(1_000_000),
  gstRate: gstRate,
  gstAmount: nonNegNum,
  totalAmount: nonNegNum,
  status: z.enum(['BOOKED', 'INVOICED', 'CANCELLED']).default('BOOKED'),
  notes: z.string().max(1000).optional().nullable(),
  weightCharge: nonNegNum.optional().nullable(),
  valuationCharge: nonNegNum.optional().nullable(),
  otherChargesDueAgent: nonNegNum.optional().nullable(),
  otherChargesDueCarrier: nonNegNum.optional().nullable(),
  totalPrepaid: nonNegNum.optional().nullable(),
});

export const UpdateAwbBookingSchema = AwbBookingSchema.partial();

// ── Docket Booking ────────────────────────────────────────────────────────────
export const DocketBookingSchema = z.object({
  docketNo: z.string().min(3).max(50).trim(),
  partyId: z.string().min(1),
  partyName: z.string().min(1).max(200).trim(),
  bookingDate: dateStr,
  origin: z.string().max(100).trim().optional().nullable(),
  destination: z.string().max(100).trim().optional().nullable(),
  description: z.string().max(500).trim().optional().nullable(),
  weight: nonNegNum.max(100_000, 'Weight too high').optional().nullable(),
  rateFittedAmount: nonNegNum.max(10_000_000),
  markupAmount: nonNegNum.max(1_000_000),
  gstRate: gstRate,
  gstAmount: nonNegNum,
  totalAmount: nonNegNum,
  dueDatePolicy: creditDays,
  status: z.enum(['BOOKED', 'INVOICED', 'CANCELLED']).default('BOOKED'),
  notes: z.string().max(1000).optional().nullable(),
  linkedAwbId: z.string().optional().nullable(),
  wayBillNo: z.string().max(50).trim().optional().nullable(),
  consignee: z.string().max(200).trim().optional().nullable(),
  value: nonNegNum.optional().nullable(),
  methodOfPacking: z.string().max(200).trim().optional().nullable(),
  pieces: z.number().int().min(1).optional().nullable(),
});

export const UpdateDocketBookingSchema = DocketBookingSchema.partial();

// ── Invoice ───────────────────────────────────────────────────────────────────
export const InvoiceLineSchema = z.object({
  description: z.string().min(1).max(500).trim(),
  qty: positiveNum.max(100_000),
  rate: positiveNum.max(1_000_000),
  amount: nonNegNum,
  taxRate: gstRate,
  taxAmount: nonNegNum,
  lineTotal: nonNegNum,
});

export const UpdateInvoiceLineSchema = InvoiceLineSchema.partial();

// ── Payment ───────────────────────────────────────────────────────────────────
export const PaymentReceiptSchema = z.object({
  partyId: z.string().min(1),
  partyName: z.string().min(1).max(200).trim(),
  invoiceId: z.string().optional().default(''),
  invoiceNo: z.string().min(1).max(50),
  paymentDate: dateStr,
  paymentAmount: positiveNum.max(100_000_000),
  freightComponent: nonNegNum,
  gstComponent: nonNegNum,
  paymentMode: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'NEFT', 'RTGS', 'UPI', 'OTHER']).optional(),
  referenceNo: z.string().max(100).trim().optional(),
  bankName: z.string().max(200).trim().optional(),
  notes: z.string().max(500).optional(),
});

// ── User Management ───────────────────────────────────────────────────────────
export const CreateUserSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().max(200).toLowerCase(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number'),
  role: z.enum(['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'ACCOUNTS_EXECUTIVE', 'VIEWER']),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  role: z.enum(['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'ACCOUNTS_EXECUTIVE', 'VIEWER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

// ── Import ────────────────────────────────────────────────────────────────────
export const ImportRowSchema = z.object({
  awbNo: z.string().min(1).max(50).trim().optional(),
  docketNo: z.string().min(1).max(50).trim().optional(),
  partyName: z.string().min(1).max(200).trim(),
  origin: z.string().max(100).trim().optional(),
  destination: z.string().max(100).trim().optional(),
  weight: z.coerce.number().positive().max(100_000).optional(),
  pieces: z.coerce.number().int().positive().max(10_000).optional(),
  baseRate: z.coerce.number().positive().max(100_000).optional(),
  amount: z.coerce.number().positive().max(10_000_000).optional(),
  bookingDate: dateStr.optional(),
});

// ── CSV formula injection prevention ─────────────────────────────────────────
/** Sanitize a string value for safe CSV export - prevents formula injection */
export function sanitizeCsvValue(value: string): string {
  const trimmed = value.trim();
  // Prefix dangerous formula starters with a single quote
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}
