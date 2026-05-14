'use client';
import { AlertTriangle, FileText, Plane, ClipboardList, Upload, CreditCard, Users, TrendingUp, ArrowRight, CheckCircle2, Circle, Info, Activity } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useSharedData } from '@/lib/useSharedData';
import Link from 'next/link';

const agingChartData: unknown[] = [];
const revenueData: unknown[] = [];
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';

const fmt = (n: number) => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n.toFixed(0)}`;

const STATUS_COLOR: Record<string, string> = {
  PAID: '#059669', OVERDUE: '#dc2626', PARTIALLY_PAID: '#d97706',
  FINALIZED: '#2563eb', DRAFT: '#94a3b8', CANCELLED: '#64748b',
  REVIEWED: '#7c3aed', SENT: '#0891b2',
};

function KpiCard({ title, value, sub, hint, color, icon, href }: {
  title: string; value: string | number; sub?: string; hint?: string;
  color: string; icon: React.ReactNode; href?: string;
}) {
  const card = (
    <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>
          {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>{hint}</div>}
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>{icon}</div>
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: '-0.04em', color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
      </div>
      {href && <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 2 }}>View details →</div>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{card}</Link> : card;
}

export default function DashboardPage() {
  const { invoices, awbBookings: awb, docketBookings: dockets, outstanding, parties, paymentReceipts: payments } = useSharedData();
  const importJobs  = useStore(s => s.importJobs);
  const totalOut    = outstanding.reduce((s, o) => s + ((o as Record<string,unknown>).outstandingAmount as number || (o as Record<string,unknown>).outstanding_amount as number || 0), 0);
  const now = new Date();
  const totalOvd    = outstanding.filter(o => { const d = new Date((o as Record<string,unknown>).dueDate as string || (o as Record<string,unknown>).due_date as string || ''); return d < now && ((o as Record<string,unknown>).outstandingAmount as number || (o as Record<string,unknown>).outstanding_amount as number || 0) > 0; }).reduce((s, o) => s + ((o as Record<string,unknown>).outstandingAmount as number || (o as Record<string,unknown>).outstanding_amount as number || 0), 0);

  const todayStr = new Date().toISOString().split('T')[0];
  const awbToday = awb.filter(b => b.bookingDate === todayStr).length;
  const unpaid   = invoices.filter(i => !['PAID','CANCELLED'].includes(i.status)).length;
  const activeParties = parties.filter(p => p.status === 'ACTIVE').length;

  // Credit alerts
  const creditAlerts = parties.filter(p => {
    const used = outstanding.filter(o => o.partyId === p.id && o.outstandingAmount > 0).reduce((s,o) => s + o.outstandingAmount, 0);
    return p.creditLimit > 0 && used / p.creditLimit > 0.8;
  });

  // Party-wise outstanding
  const partyMap: Record<string, { name: string; amount: number }> = {};
  outstanding.forEach(o => {
    if (!partyMap[o.partyId]) partyMap[o.partyId] = { name: o.partyName, amount: 0 };
    partyMap[o.partyId].amount += o.outstandingAmount;
  });
  const topParties = Object.values(partyMap).sort((a, b) => b.amount - a.amount).slice(0, 5);

  // Invoice status breakdown
  const invStatuses = ['DRAFT','FINALIZED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED'];
  const invBreakdown = invStatuses.map(s => ({ status: s, count: invoices.filter(i => i.status === s).length })).filter(x => x.count > 0);

  // Recent activity (last 5 events across bookings + payments)
  const activity = [
    ...awb.slice(-3).map(b => ({ type: 'AWB', label: `AWB ${b.awbNo}`, sub: b.partyName, date: b.bookingDate, color: '#2563eb', href: '/dashboard/bookings/awb' })),
    ...payments.slice(-3).map(p => ({ type: 'Payment', label: `Receipt ${p.receiptNo}`, sub: `${p.partyName} · ${fmt(p.paymentAmount)}`, date: p.paymentDate, color: '#059669', href: '/dashboard/payments' })),
    ...invoices.slice(-3).map(i => ({ type: 'Invoice', label: i.invoiceNo, sub: `${i.partyName} · ${fmt(i.grandTotal)}`, date: i.invoiceDate, color: STATUS_COLOR[i.status] || '#64748b', href: '/dashboard/invoices' })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  // Getting started checklist
  const checklist = [
    { done: parties.length > 0,    label: 'Add your first customer (Party)',  href: '/dashboard/parties',         hint: 'Customers you bill for cargo' },
    { done: awb.length > 0,        label: 'Create an AWB booking',            href: '/dashboard/bookings/awb',    hint: 'Air waybill for air cargo' },
    { done: invoices.length > 0,   label: 'Generate an invoice',              href: '/dashboard/invoices',        hint: 'Bill your customer' },
    { done: payments.length > 0,   label: 'Record a payment receipt',         href: '/dashboard/payments',        hint: 'Mark invoice as paid' },
  ];
  const allDone = checklist.every(c => c.done);

  return (
    <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Welcome banner */}
      <div style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '1px solid var(--warning-border)', borderRadius: 14, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-dark)' }}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, Admin 👋</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {awbToday > 0 && <span style={{ marginLeft: 10, color: '#2563eb', fontWeight: 600 }}>· {awbToday} AWB booking{awbToday > 1 ? 's' : ''} today</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/dashboard/bookings/awb" className="btn btn-primary btn-sm"><Plane size={12} /> New AWB</Link>
          <Link href="/dashboard/invoices" className="btn btn-secondary btn-sm"><FileText size={12} /> Invoices</Link>
        </div>
      </div>

      {/* Credit alert */}
      {creditAlerts.length > 0 && (
        <div className="alert alert-danger" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <AlertTriangle size={15} />
            <span><strong>{creditAlerts.length}</strong> party credit limit{creditAlerts.length > 1 ? 's' : ''} near/at breach: {creditAlerts.map(p => p.partyName).join(', ')}</span>
          </div>
          <Link href="/dashboard/parties" style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600, textDecoration: 'none' }}>Manage →</Link>
        </div>
      )}

      {/* Getting started checklist — hide when all done */}
      {!allDone && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Info size={15} color="#2563eb" />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Getting Started</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{checklist.filter(c => c.done).length}/{checklist.length} completed</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {checklist.map((c, i) => (
              <Link key={i} href={c.href} style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 10, border: `1px solid ${c.done ? 'var(--success-border)' : 'var(--border)'}`, background: c.done ? 'var(--success-bg)' : 'var(--surface-sunken)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {c.done ? <CheckCircle2 size={15} color="#059669" style={{ flexShrink: 0, marginTop: 1 }} /> : <Circle size={15} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 1 }} />}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: c.done ? '#059669' : 'var(--text-primary)' }}>{c.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.hint}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* KPI Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <KpiCard title="Total Outstanding" value={fmt(totalOut)} sub="Money owed to you" hint="Sum of all unpaid invoices" color="#dc2626" icon={<AlertTriangle size={18} />} href="/dashboard/outstanding" />
        <KpiCard title="Overdue Amount"    value={fmt(totalOvd)} sub="Past due date"     hint="Invoices past their due date" color="#ea580c" icon={<TrendingUp size={18} />} href="/dashboard/outstanding" />
        <KpiCard title="Unpaid Invoices"   value={unpaid}        sub="Pending collection" hint="Invoices not yet fully paid" color="#d97706" icon={<FileText size={18} />}   href="/dashboard/invoices" />
        <KpiCard title="AWB Today"         value={awbToday}      sub="Bookings today"     hint="Air waybills created today" color="#2563eb" icon={<Plane size={18} />}      href="/dashboard/bookings/awb" />
      </div>

      {/* KPI Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <KpiCard title="Total Bookings" value={awb.length + dockets.length} sub={`${awb.length} AWB · ${dockets.length} Dockets`} hint="All cargo bookings" color="#7c3aed" icon={<ClipboardList size={18} />} href="/dashboard/bookings/awb" />
        <KpiCard title="Active Parties" value={activeParties} sub="Customers on record" hint="Active billing customers" color="#059669" icon={<Users size={18} />} href="/dashboard/parties" />
        <KpiCard title="Total Invoices" value={invoices.length} sub={`${invoices.filter(i => i.status === 'PAID').length} paid · ${invoices.filter(i => i.status === 'OVERDUE').length} overdue`} hint="All generated invoices" color="#0891b2" icon={<FileText size={18} />} href="/dashboard/invoices" />
        <KpiCard title="Payments Received" value={fmt(payments.reduce((s, p) => s + p.paymentAmount, 0))} sub={`${payments.length} receipts`} hint="Total cash collected" color="#059669" icon={<CreditCard size={18} />} href="/dashboard/payments" />
      </div>

      {/* Invoice status breakdown bar */}
      {invBreakdown.length > 0 && (
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)' }}>Invoice Status Breakdown</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {invBreakdown.map(({ status, count }) => (
              <Link key={status} href="/dashboard/invoices" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99, background: (STATUS_COLOR[status] || '#64748b') + '15', border: `1px solid ${(STATUS_COLOR[status] || '#64748b')}30` }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[status] || '#64748b', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[status] || '#64748b' }}>{status.replace('_', ' ')}</span>
                <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 700 }}>Revenue Trend</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>Monthly revenue vs expenses over the last 7 months</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" fontSize={11} stroke="var(--text-muted)" />
              <YAxis fontSize={11} stroke="var(--text-muted)" tickFormatter={v => `₹${v / 100000}L`} />
              <Tooltip contentStyle={{ background: 'var(--surface-base)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`]} />
              <Line type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3.5 }} name="Revenue" />
              <Line type="monotone" dataKey="expenses" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" name="Expenses" />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 700 }}>Outstanding by Age</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>How long invoices have been unpaid</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={agingChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" fontSize={10} tickFormatter={v => `₹${v / 1000}K`} stroke="var(--text-muted)" />
              <YAxis type="category" dataKey="bucket" fontSize={10} width={52} stroke="var(--text-muted)" />
              <Tooltip contentStyle={{ background: 'var(--surface-base)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Amount']} />
              <Bar dataKey="amount" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Outstanding" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

        {/* Top outstanding parties */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Top Outstanding Parties</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Customers with highest unpaid amounts</div>
            </div>
            <Link href="/dashboard/outstanding" style={{ fontSize: 11, color: 'var(--accent-dark)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>View All →</Link>
          </div>
          {topParties.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>🎉 No outstanding amounts!</div>
            : topParties.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < topParties.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--surface-sunken)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: p.amount > 50000 ? '#dc2626' : 'var(--text-primary)' }}>{fmt(p.amount)}</div>
              </div>
            ))
          }
        </div>

        {/* Recent activity */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
            <Activity size={14} color="var(--text-muted)" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Recent Activity</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Latest bookings, invoices & payments</div>
            </div>
          </div>
          {activity.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>No activity yet</div>
            : activity.map((a, i) => (
              <Link key={i} href={a.href} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < activity.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: a.color }}>{a.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.sub}</div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.date}</div>
              </Link>
            ))
          }
        </div>

        {/* Quick actions */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Quick Actions</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>Common tasks — click to get started</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              { label: 'New AWB Booking',    desc: 'Book air cargo shipment',   href: '/dashboard/bookings/awb',    icon: <Plane size={13} />,         color: '#2563eb' },
              { label: 'New Docket Booking', desc: 'Book surface cargo',        href: '/dashboard/bookings/dockets', icon: <ClipboardList size={13} />, color: '#7c3aed' },
              { label: 'Generate Invoice',   desc: 'Bill a customer',           href: '/dashboard/invoices',         icon: <FileText size={13} />,      color: '#d97706' },
              { label: 'Record Payment',     desc: 'Mark invoice as paid',      href: '/dashboard/payments',         icon: <CreditCard size={13} />,    color: '#059669' },
              { label: 'Import Data',        desc: 'Upload CSV / Excel',        href: '/dashboard/import',           icon: <Upload size={13} />,        color: '#64748b' },
              { label: 'View Outstanding',   desc: 'Check who owes you',        href: '/dashboard/outstanding',      icon: <AlertTriangle size={13} />, color: '#dc2626' },
            ].map(a => (
              <Link key={a.href} href={a.href} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 11px', borderRadius: 9, textDecoration: 'none',
                background: 'var(--surface-sunken)', border: '1px solid var(--border)',
                transition: 'all 150ms ease',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-base)'; e.currentTarget.style.borderColor = 'var(--border-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-sunken)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: a.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', color: a.color, flexShrink: 0 }}>{a.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{a.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.desc}</div>
                </div>
                <ArrowRight size={12} color="var(--text-muted)" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
