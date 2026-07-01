'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';

// ── Shared types matching Prisma/DB fields ────────────────────────────────────
export type DbParty = {
  id: string; partyName: string; gstin?: string | null; pan?: string | null; contactPerson?: string | null;
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
  weightCharge?: number | null;
  valuationCharge?: number | null;
  otherChargesDueAgent?: number | null;
  otherChargesDueCarrier?: number | null;
  totalPrepaid?: number | null;
};

export type DbDocketBooking = {
  id: string; docketNo: string; partyId: string; partyName: string;
  bookingDate: string; origin?: string | null; destination?: string | null;
  description?: string | null; rateFittedAmount: number; markupAmount: number;
  gstRate: number; gstAmount: number; totalAmount: number;
  dueDatePolicy: number; status: string; notes?: string | null;
  linkedAwbId?: string | null; wayBillNo?: string | null;
  consignee?: string | null; value?: number | null; weight?: number | null;
  methodOfPacking?: string | null; pieces?: number | null; createdBy?: string | null; createdAt: string | Date;
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
  mutate: (updater: (current: SharedDataState) => SharedDataState) => void;
}

const POLL_INTERVAL = 15_000;
const CACHE_TTL = 30_000;

type DataResource =
  | 'parties'
  | 'awbBookings'
  | 'docketBookings'
  | 'invoices'
  | 'paymentReceipts'
  | 'outstanding'
  | 'rateVersions'
  | 'freightRates'
  | 'importJobs'
  | 'auditLogs'
  | 'users'
  | 'purchaseBills';

type SharedDataOptions = {
  resources?: DataResource[];
  polling?: boolean;
};

type SharedDataState = Omit<SharedData, 'loading' | 'refresh' | 'mutate'>;

const EMPTY: SharedDataState = {
  parties: [], awbBookings: [], docketBookings: [],
  invoices: [], paymentReceipts: [], outstanding: [],
  rateVersions: [], freightRates: [], importJobs: [], auditLogs: [], users: [], purchaseBills: [],
};

const sharedDataCache = new Map<string, {
  data?: SharedDataState;
  promise?: Promise<SharedDataState | null>;
  updatedAt: number;
}>();

const subscribers = new Map<string, Set<(data: SharedDataState) => void>>();

function writeCache(key: string, data: SharedDataState) {
  sharedDataCache.set(key, { data, updatedAt: Date.now() });
  subscribers.get(key)?.forEach((listener) => listener(data));
}

const RESOURCE_MAP: Array<[string, DataResource[]]> = [
  ['/dashboard/bookings/dockets/editor', ['docketBookings', 'parties']],
  ['/dashboard/bookings/dockets', ['docketBookings', 'parties', 'awbBookings', 'outstanding', 'auditLogs', 'users']],
  ['/dashboard/bookings/awb', ['awbBookings', 'parties', 'docketBookings', 'rateVersions', 'freightRates', 'outstanding', 'auditLogs', 'users']],
  ['/dashboard/invoices/editor', ['invoices', 'parties', 'awbBookings', 'docketBookings']],
  ['/dashboard/invoices/musashi', ['invoices', 'awbBookings', 'docketBookings']],
  ['/dashboard/invoices', ['invoices', 'parties', 'awbBookings', 'docketBookings']],
  ['/dashboard/credit-note/editor', ['invoices', 'parties']],
  ['/dashboard/credit-note/new', ['parties']],
  ['/dashboard/credit-note', ['invoices']],
  ['/dashboard/payments', ['paymentReceipts', 'invoices', 'parties']],
  ['/dashboard/outstanding', ['outstanding', 'parties']],
  ['/dashboard/parties', ['parties', 'outstanding']],
  ['/dashboard/rates', ['rateVersions', 'freightRates']],
  ['/dashboard/reports', ['invoices', 'outstanding', 'paymentReceipts', 'awbBookings', 'docketBookings', 'parties', 'freightRates', 'rateVersions']],
  ['/dashboard/analytics', ['invoices', 'awbBookings', 'docketBookings', 'paymentReceipts']],
  ['/dashboard/audit', ['auditLogs', 'users']],
  ['/dashboard/import', ['importJobs']],
  ['/dashboard/notifications', ['invoices', 'parties', 'outstanding']],
  ['/dashboard', ['invoices', 'awbBookings', 'docketBookings', 'outstanding', 'parties', 'paymentReceipts', 'importJobs', 'purchaseBills']],
];

function resourcesForPath(pathname: string): DataResource[] | undefined {
  return RESOURCE_MAP.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1];
}

function dataUrl(resources?: DataResource[]) {
  if (!resources?.length) return '/api/data';
  return `/api/data?resources=${encodeURIComponent([...new Set(resources)].join(','))}`;
}

function resourceKey(resources?: DataResource[]) {
  if (!resources?.length) return 'all';
  return [...new Set(resources)].join(',');
}

function normalizeData(json: Record<string, any>): SharedDataState {
  return {
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
  };
}

async function loadSharedData(resources?: DataResource[], force = false): Promise<SharedDataState | null> {
  const key = resourceKey(resources);
  const cached = sharedDataCache.get(key);
  const freshEnough = cached?.data && Date.now() - cached.updatedAt < CACHE_TTL;
  if (!force && freshEnough) return cached.data ?? null;
  if (!force && cached?.promise) return cached.promise;

  const promise = fetch(dataUrl(resources))
    .then(async (res) => {
      if (res.status === 401 || !res.ok) return null;
      const json = await res.json();
      if (!json || json.error) return null;
      const data = normalizeData(json);
      writeCache(key, data);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      const current = sharedDataCache.get(key);
      if (current?.promise === promise) {
        sharedDataCache.set(key, { data: current.data, updatedAt: current.updatedAt });
      }
    });

  sharedDataCache.set(key, { data: cached?.data, promise, updatedAt: cached?.updatedAt ?? 0 });
  return promise;
}

export function prefetchSharedDataForPath(pathname: string) {
  void loadSharedData(resourcesForPath(pathname), false);
}

function mutateSharedData(resources: DataResource[] | undefined, updater: (current: SharedDataState) => SharedDataState) {
  const key = resourceKey(resources);
  const current = sharedDataCache.get(key)?.data ?? EMPTY;
  writeCache(key, updater(current));
}

export function useSharedData(options: SharedDataOptions = {}): SharedData {
  const pathname = usePathname();
  const resources = options.resources ?? resourcesForPath(pathname);
  const key = resourceKey(resources);
  const cached = sharedDataCache.get(key)?.data;
  const [data, setData] = useState<SharedDataState>(cached ?? EMPTY);
  const [loading, setLoading] = useState(!cached);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const polling = options.polling ?? true;

  const fetchData = useCallback(async (force = true) => {
    const next = await loadSharedData(resources, force);
    if (next) setData(next);
    setLoading(false);
  }, [resources]);

  const refresh = useCallback(() => {
    void fetchData(true);
  }, [fetchData]);

  const mutate = useCallback((updater: (current: SharedDataState) => SharedDataState) => {
    mutateSharedData(resources, updater);
  }, [resources]);

  useEffect(() => {
    const listeners = subscribers.get(key) ?? new Set<(next: SharedDataState) => void>();
    listeners.add(setData);
    subscribers.set(key, listeners);

    const nextCached = sharedDataCache.get(key)?.data;
    if (nextCached) {
      setData(nextCached);
      setLoading(false);
    } else {
      setData(EMPTY);
      setLoading(true);
    }

    void fetchData(false);
    if (polling) timerRef.current = setInterval(() => { void fetchData(false); }, POLL_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const currentListeners = subscribers.get(key);
      currentListeners?.delete(setData);
      if (currentListeners?.size === 0) subscribers.delete(key);
    };
  }, [fetchData, key, polling]);

  return { ...data, loading, refresh, mutate };
}
