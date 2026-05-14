import { create } from 'zustand';
import type {
  Party, FreightRateVersion, FreightRate, AwbBooking, DocketBooking,
  Invoice, InvoiceLine, PaymentReceipt, OutstandingEntry, ImportJob,
} from './mockData';

const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 7);
const today = () => new Date().toISOString().split('T')[0];
const addDays = (d: string, n: number) => {
  const dt = new Date(d); dt.setDate(dt.getDate() + n);
  return dt.toISOString().split('T')[0];
};
function calcAging(dueDate: string): OutstandingEntry['agingBucket'] {
  const days = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
  if (days <= 0) return 'CURRENT';
  if (days <= 15) return 'DAYS_1_15';
  if (days <= 30) return 'DAYS_16_30';
  if (days <= 60) return 'DAYS_31_60';
  if (days <= 90) return 'DAYS_61_90';
  return 'DAYS_90_PLUS';
}

interface Store {
  parties: Party[];
  rateVersions: FreightRateVersion[];
  freightRates: FreightRate[];
  awbBookings: AwbBooking[];
  docketBookings: DocketBooking[];
  invoices: Invoice[];
  paymentReceipts: PaymentReceipt[];
  outstanding: OutstandingEntry[];
  importJobs: ImportJob[];

  // Party
  addParty: (p: Omit<Party, 'id' | 'createdAt'>) => void;
  updateParty: (id: string, p: Partial<Party>) => void;

  // Rates
  addRateVersion: (rv: Omit<FreightRateVersion, 'id' | 'createdAt'>, rates: Omit<FreightRate, 'id' | 'versionId'>[]) => void;
  getRateForRoute: (carrier: string, origin: string, dest: string) => FreightRate | undefined;

  // AWB Bookings
  addAwbBooking: (b: Omit<AwbBooking, 'id'>) => AwbBooking;
  updateAwbBooking: (id: string, b: Partial<AwbBooking>) => void;
  deleteAwbBookings: (ids: string[]) => void;

  // Docket Bookings
  addDocketBooking: (b: Omit<DocketBooking, 'id'>) => DocketBooking;
  updateDocketBooking: (id: string, b: Partial<DocketBooking>) => void;
  deleteDocketBookings: (ids: string[]) => void;

  // Invoices
  generateInvoiceFromAwb: (awbId: string) => Invoice | null;
  generateInvoiceFromDocket: (docketId: string) => Invoice | null;
  updateInvoiceLine: (invoiceId: string, lineId: string, u: Partial<InvoiceLine>) => void;
  addInvoiceLine: (invoiceId: string, line: Omit<InvoiceLine, 'id' | 'invoiceId'>) => void;
  finalizeInvoice: (id: string) => void;
  cancelInvoice: (id: string) => void;
  deleteInvoices: (ids: string[]) => void;

  // Payments
  addPaymentReceipt: (r: Omit<PaymentReceipt, 'id' | 'receiptNo'>) => void;

  // Imports
  addImportJob: (j: Omit<ImportJob, 'id'>) => void;
  updateImportJob: (id: string, j: Partial<ImportJob>) => void;

  // Helpers
  getTotalOutstanding: () => number;
  getTotalOverdue: () => number;
  getPartyCreditUsed: (partyId: string) => number;
  checkCreditLimit: (partyId: string, newAmount: number) => { allowed: boolean; warning: boolean; message: string };
  nextInvoiceNo: () => string;
  nextReceiptNo: () => string;
}

export const useStore = create<Store>()((set, get) => ({
  parties: [], rateVersions: [], freightRates: [],
  awbBookings: [], docketBookings: [],
  invoices: [], paymentReceipts: [],
  outstanding: [], importJobs: [],

  addParty: (p) => set(s => ({ parties: [...s.parties, { ...p, id: 'p' + uid(), createdAt: today() }] })),
  updateParty: (id, p) => set(s => ({ parties: s.parties.map(x => x.id === id ? { ...x, ...p } : x) })),

  addRateVersion: (rv, rates) => {
    const versionId = 'rv' + uid();
    set(s => ({
      rateVersions: [
        ...s.rateVersions.map(v =>
          v.carrierName === rv.carrierName && v.status === 'ACTIVE'
            ? { ...v, status: 'SUPERSEDED' as const } : v
        ),
        { ...rv, id: versionId, createdAt: today() },
      ],
      freightRates: [...s.freightRates, ...rates.map(r => ({ ...r, id: 'fr' + uid(), versionId }))],
    }));
  },

  getRateForRoute: (carrier, origin, dest) => {
    const { freightRates, rateVersions } = get();
    const activeIds = rateVersions
      .filter(v => v.status === 'ACTIVE' && (!carrier || v.carrierName === carrier))
      .map(v => v.id);
    return freightRates.find(r => activeIds.includes(r.versionId) && r.origin === origin && r.destination === dest && r.activeFlag);
  },

  addAwbBooking: (b) => {
    const bk: AwbBooking = { ...b, id: 'ab' + uid() };
    set(s => ({ awbBookings: [bk, ...s.awbBookings] }));
    return bk;
  },
  updateAwbBooking: (id, b) => set(s => ({ awbBookings: s.awbBookings.map(x => x.id === id ? { ...x, ...b } : x) })),
  deleteAwbBookings: (ids) => set(s => ({ awbBookings: s.awbBookings.filter(x => !ids.includes(x.id)) })),

  addDocketBooking: (b) => {
    const bk: DocketBooking = { ...b, id: 'db' + uid() };
    set(s => ({ docketBookings: [bk, ...s.docketBookings] }));
    return bk;
  },
  updateDocketBooking: (id, b) => set(s => ({ docketBookings: s.docketBookings.map(x => x.id === id ? { ...x, ...b } : x) })),
  deleteDocketBookings: (ids) => set(s => ({ docketBookings: s.docketBookings.filter(x => !ids.includes(x.id)) })),

  nextInvoiceNo: () => {
    const n = get().invoices.length + 1;
    return `INV-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
  },
  nextReceiptNo: () => {
    const n = get().paymentReceipts.length + 1;
    return `RCP-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
  },

  generateInvoiceFromAwb: (awbId) => {
    const { awbBookings, parties, nextInvoiceNo } = get();
    const bk = awbBookings.find(b => b.id === awbId);
    if (!bk || bk.status === 'INVOICED') return null;
    // For imported bookings (partyId='p-imported'), use a fallback party object
    const party = parties.find(p => p.id === bk.partyId) ?? {
      id: bk.partyId, partyName: bk.partyName, creditLimit: 0, creditDays: 30,
      status: 'ACTIVE' as const, createdAt: today(),
    };
    const invoiceDate = today();
    const dueDate = addDays(invoiceDate, party.creditDays);
    const invoiceId = 'inv' + uid();
    const line: InvoiceLine = {
      id: 'il' + uid(), invoiceId,
      description: `Airfreight ${bk.origin}→${bk.destination} · ${bk.weight} kg @ ₹${bk.baseRate}/kg`,
      qty: bk.weight, rate: bk.baseRate, amount: bk.weight * bk.baseRate,
      taxRate: bk.gstRate,
      taxAmount: (bk.weight * bk.baseRate) * bk.gstRate / 100,
      lineTotal: (bk.weight * bk.baseRate) * (1 + bk.gstRate / 100),
    };
    const lines: InvoiceLine[] = [line];
    if (bk.markupAmount > 0) {
      const ml: InvoiceLine = {
        id: 'il' + uid(), invoiceId, description: 'Handling & markup charges',
        qty: 1, rate: bk.markupAmount, amount: bk.markupAmount,
        taxRate: bk.gstRate,
        taxAmount: bk.markupAmount * bk.gstRate / 100,
        lineTotal: bk.markupAmount * (1 + bk.gstRate / 100),
      };
      lines.push(ml);
    }
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const gstTotal = lines.reduce((s, l) => s + l.taxAmount, 0);
    const grandTotal = subtotal + gstTotal;
    const inv: Invoice = {
      id: invoiceId, invoiceNo: nextInvoiceNo(),
      partyId: bk.partyId, partyName: bk.partyName,
      bookingType: 'AWB', bookingRef: bk.awbNo,
      invoiceDate, dueDate, subtotal, gstTotal, grandTotal,
      paidTotal: 0, outstandingTotal: grandTotal, status: 'DRAFT', lines,
    };
    const os: OutstandingEntry = {
      id: 'os' + uid(), partyId: bk.partyId, partyName: bk.partyName,
      invoiceId, invoiceNo: inv.invoiceNo, bookingRef: bk.awbNo,
      originalAmount: grandTotal, paidAmount: 0, outstandingAmount: grandTotal,
      invoiceDate, dueDate, agingBucket: calcAging(dueDate), creditLimit: party.creditLimit,
    };
    set(s => ({
      invoices: [inv, ...s.invoices],
      awbBookings: s.awbBookings.map(b => b.id === awbId ? { ...b, status: 'INVOICED' as const } : b),
      outstanding: [...s.outstanding, os],
    }));
    return inv;
  },

  generateInvoiceFromDocket: (docketId) => {
    const { docketBookings, parties, nextInvoiceNo } = get();
    const bk = docketBookings.find(b => b.id === docketId);
    if (!bk || bk.status === 'INVOICED') return null;
    // For imported bookings (partyId='p-imported'), use a fallback party object
    const party = parties.find(p => p.id === bk.partyId) ?? {
      id: bk.partyId, partyName: bk.partyName, creditLimit: 0, creditDays: 30,
      status: 'ACTIVE' as const, createdAt: today(),
    };
    const invoiceDate = today();
    const dueDate = addDays(invoiceDate, bk.dueDatePolicy || party.creditDays);
    const invoiceId = 'inv' + uid();
    const line: InvoiceLine = {
      id: 'il' + uid(), invoiceId,
      description: `Docket freight ${bk.origin || ''}→${bk.destination || ''} · ${bk.description || ''}`,
      qty: 1, rate: bk.rateFittedAmount, amount: bk.rateFittedAmount,
      taxRate: bk.gstRate, taxAmount: bk.rateFittedAmount * bk.gstRate / 100,
      lineTotal: bk.rateFittedAmount * (1 + bk.gstRate / 100),
    };
    const lines: InvoiceLine[] = [line];
    if (bk.markupAmount > 0) {
      lines.push({
        id: 'il' + uid(), invoiceId, description: 'Handling markup',
        qty: 1, rate: bk.markupAmount, amount: bk.markupAmount,
        taxRate: bk.gstRate, taxAmount: bk.markupAmount * bk.gstRate / 100,
        lineTotal: bk.markupAmount * (1 + bk.gstRate / 100),
      });
    }
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const gstTotal = lines.reduce((s, l) => s + l.taxAmount, 0);
    const grandTotal = subtotal + gstTotal;
    const inv: Invoice = {
      id: invoiceId, invoiceNo: nextInvoiceNo(),
      partyId: bk.partyId, partyName: bk.partyName,
      bookingType: 'DOCKET', bookingRef: bk.docketNo,
      invoiceDate, dueDate, subtotal, gstTotal, grandTotal,
      paidTotal: 0, outstandingTotal: grandTotal, status: 'DRAFT', lines,
    };
    set(s => ({
      invoices: [inv, ...s.invoices],
      docketBookings: s.docketBookings.map(b => b.id === docketId ? { ...b, status: 'INVOICED' as const } : b),
      outstanding: [...s.outstanding, { id: 'os' + uid(), partyId: bk.partyId, partyName: bk.partyName, invoiceId, invoiceNo: inv.invoiceNo, bookingRef: bk.docketNo, originalAmount: grandTotal, paidAmount: 0, outstandingAmount: grandTotal, invoiceDate, dueDate, agingBucket: calcAging(dueDate), creditLimit: party.creditLimit }],
    }));
    return inv;
  },

  updateInvoiceLine: (invoiceId, lineId, u) => {
    set(s => ({
      invoices: s.invoices.map(inv => {
        if (inv.id !== invoiceId) return inv;
        const lines = inv.lines.map(l => {
          if (l.id !== lineId) return l;
          const updated = { ...l, ...u };
          updated.amount = updated.qty * updated.rate;
          updated.taxAmount = updated.amount * updated.taxRate / 100;
          updated.lineTotal = updated.amount + updated.taxAmount;
          return updated;
        });
        const subtotal = lines.reduce((s, l) => s + l.amount, 0);
        const gstTotal = lines.reduce((s, l) => s + l.taxAmount, 0);
        const grandTotal = subtotal + gstTotal;
        return { ...inv, lines, subtotal, gstTotal, grandTotal, outstandingTotal: grandTotal - inv.paidTotal };
      }),
    }));
  },

  addInvoiceLine: (invoiceId, line) => {
    set(s => ({
      invoices: s.invoices.map(inv => {
        if (inv.id !== invoiceId) return inv;
        const newLine = { ...line, id: 'il' + uid(), invoiceId };
        const lines = [...inv.lines, newLine];
        const subtotal = lines.reduce((s, l) => s + l.amount, 0);
        const gstTotal = lines.reduce((s, l) => s + l.taxAmount, 0);
        const grandTotal = subtotal + gstTotal;
        return { ...inv, lines, subtotal, gstTotal, grandTotal, outstandingTotal: grandTotal - inv.paidTotal };
      }),
    }));
  },

  finalizeInvoice: (id) => set(s => ({ invoices: s.invoices.map(i => i.id === id ? { ...i, status: 'FINALIZED' as const } : i) })),
  cancelInvoice: (id) => set(s => ({ invoices: s.invoices.map(i => i.id === id ? { ...i, status: 'CANCELLED' as const } : i) })),
  deleteInvoices: (ids) => set(s => ({
    invoices: s.invoices.filter(i => !ids.includes(i.id)),
    outstanding: s.outstanding.filter(o => !ids.includes(o.invoiceId)),
  })),

  addPaymentReceipt: (r) => {
    const receiptNo = get().nextReceiptNo();
    const receipt: PaymentReceipt = { ...r, id: 'pr' + uid(), receiptNo };
    set(s => {
      const inv = s.invoices.find(i => i.id === r.invoiceId);
      if (!inv) return s;
      const newPaid = inv.paidTotal + r.paymentAmount;
      const newOut = Math.max(0, inv.grandTotal - newPaid);
      const newStatus: Invoice['status'] = newOut === 0 ? 'PAID' : 'PARTIALLY_PAID';
      return {
        paymentReceipts: [receipt, ...s.paymentReceipts],
        invoices: s.invoices.map(i => i.id === r.invoiceId ? { ...i, paidTotal: newPaid, outstandingTotal: newOut, status: newStatus } : i),
        outstanding: s.outstanding.map(o => o.invoiceId === r.invoiceId ? { ...o, paidAmount: newPaid, outstandingAmount: newOut } : o),
      };
    });
  },

  addImportJob: (j) => set(s => ({ importJobs: [{ ...j, id: 'ij' + uid() }, ...s.importJobs] })),
  updateImportJob: (id, j) => set(s => ({ importJobs: s.importJobs.map(x => x.id === id ? { ...x, ...j } : x) })),

  getTotalOutstanding: () => get().outstanding.reduce((s, o) => s + o.outstandingAmount, 0),
  getTotalOverdue: () => {
    const now = new Date();
    return get().outstanding.filter(o => new Date(o.dueDate) < now && o.outstandingAmount > 0).reduce((s, o) => s + o.outstandingAmount, 0);
  },
  getPartyCreditUsed: (partyId) => get().outstanding.filter(o => o.partyId === partyId && o.outstandingAmount > 0).reduce((s, o) => s + o.outstandingAmount, 0),
  checkCreditLimit: (partyId, newAmount) => {
    const party = get().parties.find(p => p.id === partyId);
    if (!party || party.creditLimit === 0) return { allowed: true, warning: false, message: '' };
    const used = get().getPartyCreditUsed(partyId);
    const projected = used + newAmount;
    if (projected > party.creditLimit)
      return { allowed: false, warning: true, message: `Credit limit ₹${party.creditLimit.toLocaleString('en-IN')} exceeded! Currently used: ₹${used.toLocaleString('en-IN')}` };
    if (projected > party.creditLimit * 0.8)
      return { allowed: true, warning: true, message: `Warning: 80%+ of credit limit used. ₹${used.toLocaleString('en-IN')} / ₹${party.creditLimit.toLocaleString('en-IN')}` };
    return { allowed: true, warning: false, message: '' };
  },
}));
