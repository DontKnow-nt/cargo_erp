'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

// ── Shared types matching Prisma/DB fields ────────────────────────────────────
export type DbParty = {
  id: string; partyName: string; gstin?: string | null; contactPerson?: string | null;
  phone?: string | null; email?: string | null; billingAddress?: string | null;
  creditLimit: number; creditDays: number; status: string; createdAt: string;
};

export type DbAwbBooking = {
  id: string; awbNo: string; partyId: string; partyName: string;
  origin: string; destination: string; airlineName: string;
  bookingDate: string; shipmentDate?: string | null;
  weight: number; pieces: number; baseRate: number; markupAmount: number;
  gstRate: number; gstAmount: number; totalAmount: number;
  status: string; notes?: string | null; createdAt: string;
};

export type DbDocketBooking = {
  id: string; docketNo: string; partyId: string; partyName: string;
  bookingDate: string; origin?: string | null; destination?: string | null;
  description?: string | null; rateFittedAmount: number; markupAmount: number;
  gstRate: number; gstAmount: number; totalAmount: number;
  dueDatePolicy: number; status: string; notes?: string | null;
  linkedAwbId?: string | null; wayBillNo?: string | null;
  consignee?: string | null; value?: number | null;
  methodOfPacking?: string | null; createdAt: string;
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
  notes?: string | null; createdAt: string; lines: DbInvoiceLine[];
};

export type DbPaymentReceipt = {
  id: string; receiptNo: string; partyId: string; partyName: string;
  invoiceId: string; invoiceNo: string; paymentDate: string;
  paymentAmount: number; freightComponent: number; gstComponent: number;
  paymentMode?: string | null; referenceNo?: string | null;
  bankName?: string | null; remarks?: string | null;
  status: string; createdAt: string;
};

export type DbOutstandingEntry = {
  id: string; partyId: string; partyName: string;
  invoiceId: string; invoiceNo: string; bookingRef: string;
  originalAmount: number; paidAmount: number; outstandingAmount: number;
  invoiceDate: string; dueDate: string; agingBucket: string;
  creditLimit: number; createdAt: string;
};

interface SharedData {
  parties: DbParty[];
  awbBookings: DbAwbBooking[];
  docketBookings: DbDocketBooking[];
  invoices: DbInvoice[];
  paymentReceipts: DbPaymentReceipt[];
  outstanding: DbOutstandingEntry[];
  loading: boolean;
  refresh: () => void;
}

const POLL_INTERVAL = 5_000;

const EMPTY: Omit<SharedData, 'loading' | 'refresh'> = {
  parties: [], awbBookings: [], docketBookings: [],
  invoices: [], paymentReceipts: [], outstanding: [],
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
