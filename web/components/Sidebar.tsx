'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, BarChart2, Bell, Settings,
  LogOut, FileText, ClipboardList, Plane, TrendingUp, Upload, ShoppingCart,
  CreditCard, AlertTriangle, BookOpen, ChevronLeft, ChevronRight,
  ChevronDown, ChevronRight as CRight,
} from 'lucide-react';
import { prefetchSharedDataForPath } from '@/lib/useSharedData';

const navSections = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard',  icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Analytics',  icon: BarChart2,        href: '/dashboard/analytics' },
    ],
  },
  {
    label: 'Bookings',
    items: [
      { label: 'AWB Bookings',    icon: Plane,         href: '/dashboard/bookings/awb' },
      { label: 'Docket Bookings', icon: ClipboardList, href: '/dashboard/bookings/dockets' },
    ],
  },
  {
    label: 'Rates & Import',
    items: [
      { label: 'Import Wizard', icon: Upload,     href: '/dashboard/import' },
      { label: 'Import Excel',  icon: Upload,     href: '/dashboard/import-excel' },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        label: 'Invoices', icon: FileText, href: '/dashboard/invoices',
        children: [
          { label: 'All Invoices', href: '/dashboard/invoices' },
          { label: 'New Invoice',  href: '/dashboard/invoices/new' },
        ],
      },
      { label: 'Credit Note',          icon: FileText,      href: '/dashboard/credit-note' },
      { label: 'Payments',             icon: CreditCard,    href: '/dashboard/payments' },
      { label: 'Outstanding & Aging', icon: AlertTriangle, href: '/dashboard/outstanding' },
      { label: 'Bills to Pay',        icon: CreditCard,    href: '/dashboard/purchases' },
      { label: 'Reports',              icon: BarChart2,     href: '/dashboard/reports' },
    ],
  },
  {
    label: 'Master Data',
    items: [
      { label: 'Parties / Customers', icon: Users,    href: '/dashboard/parties' },
      { label: 'Audit Log',            icon: BookOpen, href: '/dashboard/audit' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Notifications', icon: Bell,     href: '/dashboard/notifications' },
      { label: 'Settings',      icon: Settings, href: '/dashboard/settings' },
    ],
  },
];

type NavItem = {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;
  href: string;
  children?: { label: string; href: string }[];
};

const prefetchTimers = new Map<string, number>();

function scheduleNavPrefetch(href: string) {
  if (typeof window === 'undefined' || prefetchTimers.has(href)) return;
  const timer = window.setTimeout(() => {
    prefetchTimers.delete(href);
    const requestIdle = (window as typeof window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    }).requestIdleCallback;

    if (requestIdle) {
      requestIdle(() => prefetchSharedDataForPath(href), { timeout: 600 });
      return;
    }
    window.setTimeout(() => prefetchSharedDataForPath(href), 0);
  }, 120);
  prefetchTimers.set(href, timer);
}

function cancelNavPrefetch(href: string) {
  const timer = prefetchTimers.get(href);
  if (!timer) return;
  window.clearTimeout(timer);
  prefetchTimers.delete(href);
}

const NavRow = memo(function NavRow({ item, collapsed, path, onNavigate }: { item: NavItem; collapsed: boolean; path: string; onNavigate?: () => void }) {
  const hasChildren = !!item.children?.length;
  const parentActive = path.startsWith(item.href);
  const [open, setOpen] = useState(parentActive);

  const textStyle: React.CSSProperties = {
    opacity: collapsed ? 0 : 1,
    width: collapsed ? 0 : undefined,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    transition: 'opacity 120ms ease',
    flexShrink: 0,
  };

  if (!hasChildren) {
    const active = path === item.href || (item.href !== '/dashboard' && path.startsWith(item.href));
    return (
      <Link href={item.href} className={`nav-item ${active ? 'active' : ''}`}
        onClick={onNavigate}
        onMouseEnter={() => scheduleNavPrefetch(item.href)}
        onMouseLeave={() => cancelNavPrefetch(item.href)}
        onFocus={() => scheduleNavPrefetch(item.href)}
        onBlur={() => cancelNavPrefetch(item.href)}
        title={collapsed ? item.label : undefined}>
        <item.icon size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
        <span style={textStyle}>{item.label}</span>
      </Link>
    );
  }

  return (
    <div>
      <div className={`nav-item ${parentActive ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer' }}>
        <item.icon size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
        <span style={{ ...textStyle, flex: collapsed ? undefined : 1 }}>{item.label}</span>
        {!collapsed && (open
          ? <ChevronDown size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
          : <CRight size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
        )}
      </div>
      {open && !collapsed && (
        <div style={{ marginLeft: 12, borderLeft: '1px solid var(--border)', paddingLeft: 4 }}>
          {item.children!.map(c => (
            <Link key={c.href} href={c.href} className={`nav-item ${path === c.href ? 'active' : ''}`}
              onClick={onNavigate}
              onMouseEnter={() => scheduleNavPrefetch(c.href)}
              onMouseLeave={() => cancelNavPrefetch(c.href)}
              onFocus={() => scheduleNavPrefetch(c.href)}
              onBlur={() => cancelNavPrefetch(c.href)}
              style={{ fontSize: 12, padding: '5px 10px', margin: '1px 4px' }}>
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
});

export default function Sidebar({ onClose, mobileOpen }: { onClose?: () => void; mobileOpen?: boolean }) {
  const [collapsed, setCollapsed] = useState(true);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const path = usePathname();
  const [permittedPages, setPermittedPages] = useState<string[]>([]);
  const { data: session } = useSession();
  const userName = session?.user?.name ?? 'User';
  const userEmail = session?.user?.email ?? '';

  const expanded = !collapsed || hoverExpanded;
  const sidebarWidth = expanded ? 'var(--sidebar-width)' : 'var(--sidebar-collapsed)';

  // Fetch permitted pages for current user
  useEffect(() => {
    fetch('/api/user-permissions')
      .then(r => r.json())
      .then(d => setPermittedPages(d.pages ?? []))
      .catch(() => {});
  }, []);

  // Filter nav sections to only show permitted items
  const isSuperAdmin = (session?.user as { role?: string })?.role === 'SUPER_ADMIN';
  const visibleSections = useMemo(() => navSections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (isSuperAdmin) return true; // SUPER_ADMIN sees everything
      const pageKey = item.href.replace('/dashboard/', '').replace('/dashboard', 'dashboard');
      if (item.href === '/dashboard') return true;
      return permittedPages.some(p => pageKey === p || pageKey.startsWith(p));
    }),
  })).filter(s => s.items.length > 0), [isSuperAdmin, permittedPages]);

  function handleMouseEnter() {
    if (!collapsed) return;
    setHoverExpanded(true);
  }
  function handleMouseLeave() {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    setHoverExpanded(false);
  }

  // Broadcast sidebar width to CSS so Header can respond
  const handleToggleCollapsed = useCallback(() => {
    setCollapsed(value => !value);
    setHoverExpanded(false);
  }, []);

  const handleNavigate = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-current-width',
      collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)'
    );
  }, [collapsed]);

  return (
    <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}
      data-expanded={expanded}
      style={{ width: sidebarWidth }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Logo */}
      <div style={{ padding: '16px 14px 13px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <img src="/logo.png" alt="Triveni Logo" style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'contain', flexShrink: 0 }} />
        {/* Logo text — always rendered, fades out when collapsed */}
        <div style={{ overflow: 'hidden', opacity: expanded ? 1 : 0, width: expanded ? 'auto' : 0, transition: 'opacity 120ms ease', whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>
            Cargo<span style={{ color: '#b45309' }}>ERP</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Domestic Billing System</div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 0' }}>
        {visibleSections.map(s => (
          <div key={s.label} style={{ marginBottom: 2 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', padding: expanded ? '9px 20px 4px' : '0 20px', opacity: expanded ? 1 : 0, height: expanded ? 'auto' : 0, overflow: 'hidden', transition: 'opacity 120ms ease', whiteSpace: 'nowrap' }}>
                {s.label}
              </div>
            {s.items.map(item => (
              <NavRow key={item.href} item={item as NavItem} collapsed={!expanded} path={path} onNavigate={handleNavigate} />
            ))}
          </div>
        ))}
      </div>

      {/* User + Logout — fixed at bottom, no overlap */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '6px 0', flexShrink: 0 }}>
        <div className="nav-item" style={{ justifyContent: !expanded ? 'center' : undefined, cursor: 'default' }}>
          <div style={{ width: 27, height: 27, borderRadius: 7, background: 'linear-gradient(135deg,#f59e0b,#d97706)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>{userName.charAt(0).toUpperCase()}</div>
          <div style={{ overflow: 'hidden', opacity: expanded ? 1 : 0, width: expanded ? 'auto' : 0, transition: 'opacity 120ms ease', whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{userName}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{userEmail}</div>
          </div>
        </div>
        <button onClick={() => signOut({ callbackUrl: '/login' })} className="nav-item" style={{ justifyContent: !expanded ? 'center' : undefined, background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
          <LogOut size={14} style={{ flexShrink: 0 }} />
          <span style={{ opacity: expanded ? 1 : 0, width: expanded ? 'auto' : 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'opacity 120ms ease' }}>Logout</span>
        </button>
      </div>

      {/* Collapse toggle */}
      <button onClick={handleToggleCollapsed} style={{
        position: 'absolute', right: -13, top: 72,
        width: 26, height: 26, borderRadius: '50%',
        background: 'var(--surface-base)', border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', zIndex: 51, cursor: 'pointer',
        transition: 'border-color 150ms ease',
      }}>
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}
