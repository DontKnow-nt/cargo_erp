'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@/lib/store';

// Types matching DB snake_case → mapped to camelCase for compatibility
export type DbParty = { id: string; party_name: string; partyName: string; gstin?: string; contactPerson?: string; phone?: string; email?: string; billingAddress?: string; creditLimit: number; creditDays: number; status: string; createdAt: string };
export type DbAwbBooking = Record<string, unknown>;
export type DbDocketBooking = Record<string, unknown>;
export type DbInvoice = Record<string, unknown>;
export type DbPayment = Record<string, unknown>;
export type DbOutstanding = Record<string, unknown>;

interface SharedData {
  parties: DbParty[];
  awbBookings: DbAwbBooking[];
  docketBookings: DbDocketBooking[];
  invoices: DbInvoice[];
  paymentReceipts: DbPayment[];
  outstanding: DbOutstanding[];
  loading: boolean;
  refresh: () => void;
}

const POLL_INTERVAL = 5_000; // 5 seconds

// Normalize DB snake_case record to camelCase for UI compatibility
function normalize(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    // Keep original snake_case key
    out[k] = v;
    // Also add camelCase version
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (camel !== k) out[camel] = v;
  }
  return out;
}

export function useSharedData(): SharedData {
  const zustandParties = useStore(s => s.parties);
  const zustandAwb = useStore(s => s.awbBookings);
  const zustandDockets = useStore(s => s.docketBookings);
  const zustandInvoices = useStore(s => s.invoices);
  const zustandPayments = useStore(s => s.paymentReceipts);
  const zustandOutstanding = useStore(s => s.outstanding);

  const [dbData, setDbData] = useState<Omit<SharedData, 'loading' | 'refresh'> | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/data');
      if (res.status === 401) return; // not authenticated yet, skip silently
      if (!res.ok) return;
      const data = await res.json();
      if (!data || data.error) return;
      setDbData({
        parties: (data.parties || []).map(normalize) as DbParty[],
        awbBookings: (data.awbBookings || []).map(normalize),
        docketBookings: (data.docketBookings || []).map(normalize),
        invoices: (data.invoices || []).map((inv: Record<string, unknown>) => ({
          ...normalize(inv),
          lines: ((inv.lines as Record<string, unknown>[]) || []).map(normalize),
        })),
        paymentReceipts: (data.paymentReceipts || []).map(normalize),
        outstanding: (data.outstanding || []).map(normalize),
      });
    } catch { /* keep using Zustand fallback */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  // Use DB data if it has actual transactional data; otherwise fall back to Zustand mock
  const hasDbData = dbData && (
    dbData.awbBookings.length > 0 ||
    dbData.docketBookings.length > 0 ||
    dbData.invoices.length > 0 ||
    dbData.paymentReceipts.length > 0
  );

  if (hasDbData) {
    return { ...dbData!, loading, refresh: fetchData };
  }

  return {
    parties: zustandParties as unknown as DbParty[],
    awbBookings: zustandAwb as unknown as DbAwbBooking[],
    docketBookings: zustandDockets as unknown as DbDocketBooking[],
    invoices: zustandInvoices as unknown as DbInvoice[],
    paymentReceipts: zustandPayments as unknown as DbPayment[],
    outstanding: zustandOutstanding as unknown as DbOutstanding[],
    loading,
    refresh: fetchData,
  };
}
