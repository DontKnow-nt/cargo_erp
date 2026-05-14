// ── Types ─────────────────────────────────────────────────────────────────────

export type Party = {
  id: string; partyName: string; gstin?: string; contactPerson?: string;
  phone?: string; email?: string; billingAddress?: string;
  creditLimit: number; creditDays: number;
  status: 'ACTIVE' | 'INACTIVE'; createdAt: string;
};

export type FreightRateVersion = {
  id: string; carrierName: string; validFrom: string; validTo?: string;
  status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED';
  notes?: string; createdAt: string;
};

export type FreightRate = {
  id: string; versionId: string; origin: string; destination: string;
  baseRate: number; uom: string; activeFlag: boolean;
};

export type AwbBooking = {
  id: string; awbNo: string; partyId: string; partyName: string;
  origin: string; destination: string; airlineName: string;
  bookingDate: string; shipmentDate?: string;
  weight: number; pieces: number;
  baseRate: number; markupAmount: number;
  gstRate: number; gstAmount: number; totalAmount: number;
  status: 'BOOKED' | 'INVOICED' | 'CANCELLED'; notes?: string;
};

export type DocketBooking = {
  id: string; docketNo: string; partyId: string; partyName: string;
  bookingDate: string; origin?: string; destination?: string; description?: string;
  rateFittedAmount: number; markupAmount: number;
  gstRate: number; gstAmount: number; totalAmount: number;
  dueDatePolicy: number; status: 'BOOKED' | 'INVOICED' | 'CANCELLED'; notes?: string;
  linkedAwbId?: string;
};

export type InvoiceLine = {
  id: string; invoiceId: string; description: string;
  qty: number; rate: number; amount: number;
  taxRate: number; taxAmount: number; lineTotal: number;
};

export type Invoice = {
  id: string; invoiceNo: string; partyId: string; partyName: string;
  bookingType: 'AWB' | 'DOCKET'; bookingRef: string;
  invoiceDate: string; dueDate: string;
  subtotal: number; gstTotal: number; grandTotal: number;
  paidTotal: number; outstandingTotal: number;
  status: 'DRAFT' | 'REVIEWED' | 'FINALIZED' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED' | 'OVERDUE';
  notes?: string; lines: InvoiceLine[];
};

export type PaymentReceipt = {
  id: string; receiptNo: string; partyId: string; partyName: string;
  invoiceId: string; invoiceNo: string;
  paymentDate: string; paymentAmount: number;
  freightComponent: number; gstComponent: number;
  paymentMode: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'UPI' | 'NEFT' | 'RTGS';
  referenceNo?: string; bankName?: string; remarks?: string;
  status: 'CONFIRMED' | 'BOUNCED' | 'CANCELLED';
};

export type OutstandingEntry = {
  id: string; partyId: string; partyName: string;
  invoiceId: string; invoiceNo: string; bookingRef: string;
  originalAmount: number; paidAmount: number; outstandingAmount: number;
  invoiceDate: string; dueDate: string;
  agingBucket: 'CURRENT' | 'DAYS_1_15' | 'DAYS_16_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'DAYS_90_PLUS';
  creditLimit: number;
};

export type ImportJob = {
  id: string; fileName: string; fileType: string;
  sourceModule: 'RATE_SHEET' | 'AWB_BOOKINGS' | 'DOCKET_BOOKINGS' | 'CUSTOMERS' | 'PAYMENTS';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
  totalRows: number; successRows: number; errorRows: number;
  errorSummary?: string; createdAt: string;
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

export const parties: Party[] = [
  { id:'p1', partyName:'Uflex Limited', gstin:'07AAACF0100K1ZN', contactPerson:'Rajesh Gupta', phone:'9811001100', email:'rajesh@uflex.com', billingAddress:'Plot 305, Sector 59, Noida, UP', creditLimit:500000, creditDays:30, status:'ACTIVE', createdAt:'2026-01-10' },
  { id:'p2', partyName:'Reliance Industries', gstin:'27AAACR5055K1ZT', contactPerson:'Amit Shah', phone:'9920001100', email:'amit@ril.com', billingAddress:'Maker Chambers IV, Nariman Point, Mumbai', creditLimit:1000000, creditDays:45, status:'ACTIVE', createdAt:'2026-01-12' },
  { id:'p3', partyName:'Mahindra Logistics', gstin:'27AACCM0671K1Z3', contactPerson:'Priya Nair', phone:'9822110011', email:'priya@mahindra.com', billingAddress:'Mahindra Towers, Worli, Mumbai', creditLimit:750000, creditDays:30, status:'ACTIVE', createdAt:'2026-01-15' },
  { id:'p4', partyName:'Blue Dart Express', gstin:'27AABCB0579C1ZR', contactPerson:'Suresh Kumar', phone:'9876543210', email:'suresh@bluedart.com', billingAddress:'Blue Dart Centre, Old Airport Rd, Bangalore', creditLimit:300000, creditDays:15, status:'ACTIVE', createdAt:'2026-01-18' },
  { id:'p5', partyName:'Delhivery Ltd', gstin:'07AABCD7839K1Z1', contactPerson:'Meera Patel', phone:'9654321098', email:'meera@delhivery.com', billingAddress:'Plot 5, Sector 44, Gurugram, Haryana', creditLimit:200000, creditDays:30, status:'INACTIVE', createdAt:'2026-02-01' },
];

export const rateVersions: FreightRateVersion[] = [
  { id:'rv1', carrierName:'IndiGo Cargo', validFrom:'2026-05-01', validTo:'2026-05-31', status:'ACTIVE', notes:'May 2026 – standard domestic rates', createdAt:'2026-05-01' },
  { id:'rv2', carrierName:'Air India Cargo', validFrom:'2026-05-01', validTo:'2026-05-31', status:'ACTIVE', notes:'May 2026 AI rates', createdAt:'2026-05-01' },
  { id:'rv3', carrierName:'IndiGo Cargo', validFrom:'2026-04-01', validTo:'2026-04-30', status:'SUPERSEDED', createdAt:'2026-04-01' },
];

export const freightRates: FreightRate[] = [
  { id:'fr1', versionId:'rv1', origin:'DEL', destination:'BOM', baseRate:85, uom:'KG', activeFlag:true },
  { id:'fr2', versionId:'rv1', origin:'DEL', destination:'BLR', baseRate:90, uom:'KG', activeFlag:true },
  { id:'fr3', versionId:'rv1', origin:'DEL', destination:'HYD', baseRate:88, uom:'KG', activeFlag:true },
  { id:'fr4', versionId:'rv1', origin:'DEL', destination:'MAA', baseRate:92, uom:'KG', activeFlag:true },
  { id:'fr5', versionId:'rv1', origin:'BOM', destination:'DEL', baseRate:82, uom:'KG', activeFlag:true },
  { id:'fr6', versionId:'rv1', origin:'BOM', destination:'BLR', baseRate:65, uom:'KG', activeFlag:true },
  { id:'fr7', versionId:'rv1', origin:'BLR', destination:'DEL', baseRate:92, uom:'KG', activeFlag:true },
  { id:'fr8', versionId:'rv1', origin:'BLR', destination:'BOM', baseRate:68, uom:'KG', activeFlag:true },
  { id:'fr9', versionId:'rv1', origin:'HYD', destination:'DEL', baseRate:86, uom:'KG', activeFlag:true },
  { id:'fr10', versionId:'rv1', origin:'MAA', destination:'DEL', baseRate:93, uom:'KG', activeFlag:true },
  { id:'fr11', versionId:'rv2', origin:'DEL', destination:'BOM', baseRate:88, uom:'KG', activeFlag:true },
  { id:'fr12', versionId:'rv2', origin:'DEL', destination:'BLR', baseRate:94, uom:'KG', activeFlag:true },
];

export const awbBookings: AwbBooking[] = [
  { id:'ab1', awbNo:'6E-112233', partyId:'p1', partyName:'Uflex Limited', origin:'DEL', destination:'BLR', airlineName:'IndiGo', bookingDate:'2026-05-08', weight:250, pieces:5, baseRate:90, markupAmount:750, gstRate:18, gstAmount:4185, totalAmount:27435, status:'INVOICED' },
  { id:'ab2', awbNo:'6E-112244', partyId:'p2', partyName:'Reliance Industries', origin:'DEL', destination:'BOM', airlineName:'IndiGo', bookingDate:'2026-05-09', weight:500, pieces:10, baseRate:85, markupAmount:2500, gstRate:18, gstAmount:9450, totalAmount:61950, status:'BOOKED' },
  { id:'ab3', awbNo:'AI-556677', partyId:'p3', partyName:'Mahindra Logistics', origin:'BOM', destination:'DEL', airlineName:'Air India', bookingDate:'2026-05-09', weight:150, pieces:3, baseRate:82, markupAmount:300, gstRate:18, gstAmount:2484, totalAmount:16284, status:'BOOKED' },
  { id:'ab4', awbNo:'6E-112255', partyId:'p4', partyName:'Blue Dart Express', origin:'BLR', destination:'DEL', airlineName:'IndiGo', bookingDate:'2026-05-07', weight:80, pieces:2, baseRate:92, markupAmount:240, gstRate:18, gstAmount:1501.92, totalAmount:9841.92, status:'INVOICED' },
  { id:'ab5', awbNo:'6E-112266', partyId:'p1', partyName:'Uflex Limited', origin:'DEL', destination:'HYD', airlineName:'IndiGo', bookingDate:'2026-05-05', weight:320, pieces:8, baseRate:88, markupAmount:960, gstRate:18, gstAmount:5112, totalAmount:33512, status:'INVOICED' },
];

export const docketBookings: DocketBooking[] = [
  { id:'db1', docketNo:'DKT-2026-0001', partyId:'p1', partyName:'Uflex Limited', bookingDate:'2026-05-07', origin:'DEL', destination:'BLR', description:'Flexible packaging material', rateFittedAmount:15000, markupAmount:500, gstRate:18, gstAmount:2790, totalAmount:18290, dueDatePolicy:30, status:'INVOICED' },
  { id:'db2', docketNo:'DKT-2026-0002', partyId:'p2', partyName:'Reliance Industries', bookingDate:'2026-05-08', origin:'BOM', destination:'DEL', description:'Chemical drums – hazmat grade B', rateFittedAmount:22000, markupAmount:1000, gstRate:18, gstAmount:4140, totalAmount:27140, dueDatePolicy:45, status:'BOOKED' },
  { id:'db3', docketNo:'DKT-2026-0003', partyId:'p3', partyName:'Mahindra Logistics', bookingDate:'2026-05-09', origin:'PNQ', destination:'DEL', description:'Auto spare parts', rateFittedAmount:18500, markupAmount:750, gstRate:18, gstAmount:3465, totalAmount:22715, dueDatePolicy:30, status:'BOOKED' },
];

const lines1: InvoiceLine[] = [
  { id:'il1', invoiceId:'inv1', description:'Airfreight DEL→BLR · 250 kg @ ₹90/kg', qty:250, rate:90, amount:22500, taxRate:18, taxAmount:4050, lineTotal:26550 },
  { id:'il2', invoiceId:'inv1', description:'Handling & documentation charges', qty:1, rate:750, amount:750, taxRate:18, taxAmount:135, lineTotal:885 },
];
const lines2: InvoiceLine[] = [
  { id:'il3', invoiceId:'inv2', description:'Docket freight DEL→BLR · flexible packaging', qty:1, rate:15000, amount:15000, taxRate:18, taxAmount:2700, lineTotal:17700 },
  { id:'il4', invoiceId:'inv2', description:'Markup – handling', qty:1, rate:500, amount:500, taxRate:18, taxAmount:90, lineTotal:590 },
];
const lines3: InvoiceLine[] = [
  { id:'il5', invoiceId:'inv3', description:'Airfreight BLR→DEL · 80 kg @ ₹92/kg', qty:80, rate:92, amount:7360, taxRate:18, taxAmount:1324.8, lineTotal:8684.8 },
  { id:'il6', invoiceId:'inv3', description:'Fuel surcharge', qty:1, rate:240, amount:240, taxRate:18, taxAmount:43.2, lineTotal:283.2 },
];
const lines4: InvoiceLine[] = [
  { id:'il7', invoiceId:'inv4', description:'Airfreight DEL→HYD · 320 kg @ ₹88/kg', qty:320, rate:88, amount:28160, taxRate:18, taxAmount:5068.8, lineTotal:33228.8 },
  { id:'il8', invoiceId:'inv4', description:'Markup charge', qty:1, rate:960, amount:960, taxRate:18, taxAmount:172.8, lineTotal:1132.8 },
];

export const invoices: Invoice[] = [
  { id:'inv1', invoiceNo:'INV-2026-0001', partyId:'p1', partyName:'Uflex Limited', bookingType:'AWB', bookingRef:'6E-112233', invoiceDate:'2026-05-08', dueDate:'2026-06-07', subtotal:23250, gstTotal:4185, grandTotal:27435, paidTotal:0, outstandingTotal:27435, status:'OVERDUE', lines:lines1 },
  { id:'inv2', invoiceNo:'INV-2026-0002', partyId:'p1', partyName:'Uflex Limited', bookingType:'DOCKET', bookingRef:'DKT-2026-0001', invoiceDate:'2026-05-07', dueDate:'2026-06-06', subtotal:15500, gstTotal:2790, grandTotal:18290, paidTotal:10000, outstandingTotal:8290, status:'PARTIALLY_PAID', lines:lines2 },
  { id:'inv3', invoiceNo:'INV-2026-0003', partyId:'p4', partyName:'Blue Dart Express', bookingType:'AWB', bookingRef:'6E-112255', invoiceDate:'2026-05-07', dueDate:'2026-05-22', subtotal:7600, gstTotal:1368, grandTotal:8968, paidTotal:8968, outstandingTotal:0, status:'PAID', lines:lines3 },
  { id:'inv4', invoiceNo:'INV-2026-0004', partyId:'p1', partyName:'Uflex Limited', bookingType:'AWB', bookingRef:'6E-112266', invoiceDate:'2026-05-05', dueDate:'2026-06-04', subtotal:29120, gstTotal:5241.6, grandTotal:34361.6, paidTotal:0, outstandingTotal:34361.6, status:'FINALIZED', lines:lines4 },
];

export const paymentReceipts: PaymentReceipt[] = [
  { id:'pr1', receiptNo:'RCP-2026-0001', partyId:'p1', partyName:'Uflex Limited', invoiceId:'inv2', invoiceNo:'INV-2026-0002', paymentDate:'2026-05-08', paymentAmount:10000, freightComponent:8474.58, gstComponent:1525.42, paymentMode:'NEFT', referenceNo:'NEFT20260508001', bankName:'HDFC Bank', remarks:'Partial payment against invoice', status:'CONFIRMED' },
  { id:'pr2', receiptNo:'RCP-2026-0002', partyId:'p4', partyName:'Blue Dart Express', invoiceId:'inv3', invoiceNo:'INV-2026-0003', paymentDate:'2026-05-08', paymentAmount:8968, freightComponent:7600, gstComponent:1368, paymentMode:'RTGS', referenceNo:'RTGS20260508002', bankName:'ICICI Bank', status:'CONFIRMED' },
];

export const outstandingEntries: OutstandingEntry[] = [
  { id:'os1', partyId:'p1', partyName:'Uflex Limited', invoiceId:'inv1', invoiceNo:'INV-2026-0001', bookingRef:'6E-112233', originalAmount:27435, paidAmount:0, outstandingAmount:27435, invoiceDate:'2026-05-08', dueDate:'2026-06-07', agingBucket:'CURRENT', creditLimit:500000 },
  { id:'os2', partyId:'p1', partyName:'Uflex Limited', invoiceId:'inv2', invoiceNo:'INV-2026-0002', bookingRef:'DKT-2026-0001', originalAmount:18290, paidAmount:10000, outstandingAmount:8290, invoiceDate:'2026-05-07', dueDate:'2026-06-06', agingBucket:'CURRENT', creditLimit:500000 },
  { id:'os3', partyId:'p1', partyName:'Uflex Limited', invoiceId:'inv4', invoiceNo:'INV-2026-0004', bookingRef:'6E-112266', originalAmount:34361.6, paidAmount:0, outstandingAmount:34361.6, invoiceDate:'2026-05-05', dueDate:'2026-06-04', agingBucket:'CURRENT', creditLimit:500000 },
];

export const importJobs: ImportJob[] = [
  { id:'ij1', fileName:'indigo_may_2026_rates.xlsx', fileType:'XLSX', sourceModule:'RATE_SHEET', status:'COMPLETED', totalRows:45, successRows:45, errorRows:0, createdAt:'2026-05-01' },
  { id:'ij2', fileName:'awb_bookings_07may.csv', fileType:'CSV', sourceModule:'AWB_BOOKINGS', status:'PARTIAL', totalRows:20, successRows:18, errorRows:2, errorSummary:'Row 14: missing partyId. Row 19: invalid AWB format.', createdAt:'2026-05-07' },
  { id:'ij3', fileName:'customer_master.csv', fileType:'CSV', sourceModule:'CUSTOMERS', status:'COMPLETED', totalRows:5, successRows:5, errorRows:0, createdAt:'2026-04-30' },
];

export const revenueData = [
  { month:'Nov', revenue:320000, expenses:180000 },
  { month:'Dec', revenue:410000, expenses:210000 },
  { month:'Jan', revenue:380000, expenses:195000 },
  { month:'Feb', revenue:450000, expenses:220000 },
  { month:'Mar', revenue:520000, expenses:240000 },
  { month:'Apr', revenue:490000, expenses:230000 },
  { month:'May', revenue:182000, expenses:95000 },
];

export const agingChartData = [
  { bucket:'Current', amount:70086 },
  { bucket:'1-15d', amount:0 },
  { bucket:'16-30d', amount:8290 },
  { bucket:'31-60d', amount:27435 },
  { bucket:'61-90d', amount:0 },
  { bucket:'90+d', amount:0 },
];
