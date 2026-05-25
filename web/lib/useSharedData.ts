'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

// ── Shared types matching Prisma/DB fields ────────────────────────────────────
export type DbParty = {
  id: string; partyName: string; gstin?: string | null; contactPerson?: string | null;
  phone?: string | null; email?: string | null; billingAddress?: string | null;
  creditLimit: number; creditDays: number; status: string;
  createdBy?: string | null; createdAt: string | Date;
};

export type DbAwbBooking = {
  id: string; awbNo: string; partyId: string; partyName: string;
  origin: string; destination: string; airlineName: string;
  bookingDate: string; shipmentDate?: string | null;
  weight: number; pieces: number; baseRate: number; markupAmount: number;
  gstRate: number; gstAmount: number; totalAmount: number;
  status: string; notes?: string | null; createdBy?: string | null; createdAt: string | Date;
};

export type DbDocketBooking = {
  id: string; docketNo: string; partyId: string; partyName: string;
  bookingDate: string; origin?: string | null; destination?: string | null;
  description?: string | null; rateFittedAmount: number; markupAmount: number;
  gstRate: number; gstAmount: number; totalAmount: number;
  dueDatePolicy: number; status: string; notes?: string | null;
  linkedAwbId?: string | null; wayBillNo?: string | null;
  consignee?: string | null; value?: number | null; weight?: number | null;
  methodOfPacking?: string | null; createdBy?: string | null; createdAt: string | Date;
};

export type DbInvoiceLine = {
  id: string; invoiceId: string; description: string;
  qty: number; rate: number; amount: number;
  taxRate: number; taxAmount: number; lineTotal: number;
};

export type DbInvoice = {
  id: string; invoiceNo: string; partyId: string; partyName: string;
  bookingType: string; bookingRef: string; invoiceDate: string; dueDate: string;
  subtotal: number; gstTotal: number; grandTotal: number;
  paidTotal: number; outstandingTotal: number; status: string;
  notes?: string | null; createdBy?: string | null; createdAt: string | Date; lines: DbInvoiceLine[];
};

export type DbPaymentReceipt = {
  id: string; receiptNo: string; partyId: string; partyName: string;
  invoiceId: string; invoiceNo: string; paymentDate: string;
  paymentAmount: number; freightComponent: number; gstComponent: number;
  paymentMode?: string | null; referenceNo?: string | null;
  bankName?: string | null; remarks?: string | null;
  status: string; createdAt: string | Date;
};

export type DbOutstandingEntry = {
  id: string; partyId: string; partyName: string;
  invoiceId: string; invoiceNo: string; bookingRef: string;
  originalAmount: number; paidAmount: number; outstandingAmount: number;
  invoiceDate: string; dueDate: string; agingBucket: string;
  creditLimit: number; createdAt: string | Date;
};

export type DbFreightRateVersion = {
  id: string; carrierName: string; validFrom: string; validTo?: string | null;
  status: string; notes?: string | null; createdAt: string | Date;
};

export type DbFreightRate = {
  id: string; versionId: string; origin: string; destination: string;
  baseRate: number; uom: string; activeFlag: boolean;
};

export type DbImportJob = {
  id: string; fileName: string; fileType: string; sourceModule: string;
  status: string; totalRows: number; successRows: number; errorRows: number;
  errors?: string | null; createdAt: string | Date;
};

export type DbAuditLog = {
  id: string; userId?: string | null; userEmail?: string | null;
  action: string; resource: string; resourceId?: string | null;
  details?: string | null; ipAddress?: string | null; createdAt: string | Date;
};

export type DbUserSummary = {
  id: string; name: string; email: string; status: string;
};

export type DbPurchaseBill = {
  id: string; vendorName: string; invoiceNo: string;
  invoiceDate: string; dueDate?: string | null;
  totalAmount: number; description?: string | null;
  category?: string | null; status: string; createdAt: string | Date;
};

interface SharedData {
  parties: DbParty[];
  awbBookings: DbAwbBooking[];
  docketBookings: DbDocketBooking[];
  invoices: DbInvoice[];
  paymentReceipts: DbPaymentReceipt[];
  outstanding: DbOutstandingEntry[];
  rateVersions: DbFreightRateVersion[];
  freightRates: DbFreightRate[];
  importJobs: DbImportJob[];
  auditLogs: DbAuditLog[];
  users: DbUserSummary[];
  purchaseBills: DbPurchaseBill[];
  loading: boolean;
  refresh: () => void;
}

const POLL_INTERVAL = 15_000;

const EMPTY: Omit<SharedData, 'loading' | 'refresh'> = {
  parties: [], awbBookings: [], docketBookings: [],
  invoices: [], paymentReceipts: [], outstanding: [],
  rateVersions: [], freightRates: [], importJobs: [], auditLogs: [], users: [], purchaseBills: [],
};

export function useSharedData(): SharedData {
  const [data, setData] = useState<Omit<SharedData, 'loading' | 'refresh'>>(EMPTY);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/data');
      if (res.status === 401) return;
      if (!res.ok) return;
      const json = await res.json();
      if (!json || json.error) return;
      setData({
        parties: json.parties ?? [],
        awbBookings: json.awbBookings ?? [],
        docketBookings: json.docketBookings ?? [],
        invoices: (json.invoices ?? []).map((inv: DbInvoice) => ({ ...inv, lines: inv.lines ?? [] })),
        paymentReceipts: json.paymentReceipts ?? [],
        outstanding: json.outstanding ?? [],
        rateVersions: json.rateVersions ?? [],
        freightRates: json.freightRates ?? [],
        importJobs: (json.importJobs ?? []).map((job: { id: string; fileName: string; fileType: string; sourceModule: string; status: string; totalRows: number; importedRows: number; errorRows: number; errors?: string | null; createdAt: string }) => ({
          id: job.id,
          fileName: job.fileName,
          fileType: job.fileType,
          sourceModule: job.sourceModule,
          status: job.status,
          totalRows: job.totalRows,
          successRows: job.importedRows,
          errorRows: job.errorRows,
          errors: job.errors ?? null,
          createdAt: typeof job.createdAt === 'string' ? job.createdAt : new Date(job.createdAt).toISOString(),
        })),
        auditLogs: (json.auditLogs ?? []).map((log: DbAuditLog) => ({
          ...log,
          createdAt: typeof log.createdAt === 'string' ? log.createdAt : new Date(log.createdAt).toISOString(),
        })),
        users: json.users ?? [],
        purchaseBills: json.purchaseBills ?? [],
      });
    } catch { /* keep current data */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  return { ...data, loading, refresh: fetchData };
}
