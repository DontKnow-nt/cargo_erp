'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

export type DbParty = Record<string, unknown>;
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
        invoices: (json.invoices ?? []).map((inv: Record<string, unknown>) => ({
          ...inv,
          lines: inv.lines ?? [],
        })),
        paymentReceipts: json.paymentReceipts ?? [],
        outstanding: json.outstanding ?? [],
      });
    } catch { /* network error, keep current data */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  return { ...data, loading, refresh: fetchData };
}
