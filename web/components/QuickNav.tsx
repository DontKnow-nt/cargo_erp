'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plane, ClipboardList, FileText, CreditCard, Users, BarChart2, Upload, TrendingUp, AlertTriangle } from 'lucide-react';

const ROUTES = [
  { label: 'Dashboard',          href: '/dashboard',                    icon: BarChart2 },
  { label: 'AWB Bookings',       href: '/dashboard/bookings/awb',       icon: Plane },
  { label: 'Docket Bookings',    href: '/dashboard/bookings/dockets',   icon: ClipboardList },
  { label: 'Invoices',           href: '/dashboard/invoices',           icon: FileText },
  { label: 'Payments',           href: '/dashboard/payments',           icon: CreditCard },
  { label: 'Parties',            href: '/dashboard/parties',            icon: Users },
  { label: 'Outstanding',        href: '/dashboard/outstanding',        icon: AlertTriangle },
  { label: 'Import Wizard',      href: '/dashboard/import',             icon: Upload },
  { label: 'Analytics',          href: '/dashboard/analytics',          icon: BarChart2 },
  { label: 'Cargo Way Bill',     href: '/dashboard/bookings/dockets/way-bill', icon: ClipboardList },
];

export default function QuickNav() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
        setQuery('');
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const filtered = ROUTES.filter(r => r.label.toLowerCase().includes(query.toLowerCase()));

  function go(href: string) {
    router.push(href);
    setOpen(false);
    setQuery('');
  }

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh' }}
      onClick={() => setOpen(false)}>
      <div className="quick-nav-box" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', width: '100%', maxWidth: 480, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <Search size={16} color="#94a3b8" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Go to page…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: '#0f172a', background: 'transparent' }} />
          <kbd style={{ fontSize: 10, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 6px', color: '#64748b' }}>ESC</kbd>
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {filtered.map(r => (
            <button key={r.href} onClick={() => go(r.href)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 14, color: '#0f172a' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <r.icon size={15} color="#94a3b8" />
              {r.label}
            </button>
          ))}
          {filtered.length === 0 && <div style={{ padding: '20px 16px', color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>No pages found</div>}
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#94a3b8', display: 'flex', gap: 12 }}>
          <span>↑↓ navigate</span><span>↵ open</span><span>Ctrl+K toggle</span>
        </div>
      </div>
    </div>
  );
}
