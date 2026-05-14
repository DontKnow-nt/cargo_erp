'use client';
import { Bell, Search, HelpCircle, Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/bookings/awb': 'AWB Bookings',
  '/dashboard/bookings/dockets': 'Docket Bookings',
  '/dashboard/rates': 'Freight Rate Management',
  '/dashboard/import': 'Import Wizard',
  '/dashboard/invoices': 'Invoices',
  '/dashboard/payments': 'Payment Receipts',
  '/dashboard/outstanding': 'Outstanding & Aging',
  '/dashboard/reports': 'Reports',
  '/dashboard/parties': 'Parties & Customers',
  '/dashboard/audit': 'Audit Log',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/settings': 'Settings',
  '/dashboard/admin': 'Admin & RBAC',
};

export default function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const path = usePathname();
  const title = PAGE_TITLES[path] || 'Cargo ERP';
  const { data: session } = useSession();
  const initial = session?.user?.name?.charAt(0).toUpperCase() ?? 'U';

  function openQuickNav() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  }

  return (
    <header style={{
      position: 'fixed', top: 0, right: 0,
      left: 'var(--sidebar-current-width, var(--sidebar-width))',
      height: 'var(--header-height)',
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: 16, zIndex: 40,
      transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)',
    }}>
      <button className="mobile-menu-btn" onClick={onMenuClick} aria-label="Open menu">
        <Menu size={18} />
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.03em' }}>{title}</div>
      </div>

      {/* Quick Nav trigger */}
      <button onClick={openQuickNav} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', background: 'var(--surface-sunken)',
        border: '1px solid var(--border)', borderRadius: 8,
        cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, width: 200,
      }}>
        <Search size={13} />
        <span style={{ flex: 1, textAlign: 'left' }}>Quick navigate…</span>
        <kbd style={{ fontSize: 10, background: '#fff', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>⌘K</kbd>
      </button>

      <button className="btn btn-ghost btn-icon" style={{ position: 'relative' }}>
        <Bell size={16} />
        <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, background: '#dc2626', borderRadius: '50%', border: '1.5px solid #fff' }} />
      </button>

      <button className="btn btn-ghost btn-icon">
        <HelpCircle size={16} />
      </button>

      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: 'linear-gradient(135deg,#f59e0b,#d97706)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800, color: '#fff',
        boxShadow: '0 2px 8px rgba(245,158,11,0.3)',
        title: session?.user?.name ?? '',
      } as React.CSSProperties}>{initial}</div>
    </header>
  );
}
