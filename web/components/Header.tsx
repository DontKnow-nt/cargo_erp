'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import {
  ChevronDown, Sun, Share2, Search, Bell, HelpCircle,
  LayoutDashboard, BarChart2, Plane, ClipboardList, Upload,
  FileText, CreditCard, AlertTriangle, Users, BookOpen, Settings
} from 'lucide-react';

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

export default function Header() {
  const path = usePathname();
  const { data: session } = useSession();
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [permittedPages, setPermittedPages] = useState<string[]>([]);

  // Fetch permitted pages for the current user
  useEffect(() => {
    fetch('/api/user-permissions')
      .then(r => r.json())
      .then(d => setPermittedPages(d.pages ?? []))
      .catch(() => {});
  }, []);

  const isSuperAdmin = (session?.user as { role?: string })?.role === 'SUPER_ADMIN';
  
  // Filter nav sections based on RBAC permissions
  const visibleSections = navSections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (isSuperAdmin) return true;
      const pageKey = item.href.replace('/dashboard/', '').replace('/dashboard', 'dashboard');
      if (item.href === '/dashboard') return true;
      return permittedPages.some(p => pageKey === p || pageKey.startsWith(p));
    }),
  })).filter(s => s.items.length > 0);

  function openQuickNav() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Top Main Navigation Bar */}
      <header style={{
        height: 56,
        background: '#090d16', // Sleek dark slate
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        gap: 20,
      }}>
        {/* Left Side: Logo & Subtitle */}
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/logo.png" alt="Triveni Logo" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain' }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#fff', letterSpacing: '-0.02em' }}>
              Cargo<span style={{ color: '#fbbf24' }}>ERP</span>
            </div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1, fontFamily: 'var(--font-mono)' }}>by Triveni</div>
          </div>
        </Link>

        {/* Center: Dropdown Navigation Items */}
        <nav style={{
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          height: '100%',
        }}>
          {visibleSections.map(s => (
            <div
              key={s.label}
              onMouseEnter={() => setHoveredSection(s.label)}
              onMouseLeave={() => setHoveredSection(null)}
              style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}
            >
              <button style={{
                background: 'none',
                border: 'none',
                color: hoveredSection === s.label ? '#fff' : '#cbd5e1',
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                height: '100%',
                padding: '0 4px',
                transition: 'color 150ms ease',
              }}>
                {s.label} <ChevronDown size={10} style={{ opacity: 0.7 }} />
              </button>

              {/* Floating Dropdown Menu */}
              {hoveredSection === s.label && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                  padding: '8px 0',
                  minWidth: 200,
                  zIndex: 200,
                  marginTop: -2,
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  {s.items.map(item => {
                    const itemActive = path === item.href || (item.href !== '/dashboard' && path.startsWith(item.href));
                    if (item.children) {
                      return (
                        <div key={item.href} style={{ padding: '4px 0' }}>
                          <div style={{
                            padding: '6px 16px 2px',
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#64748b',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            {item.label}
                          </div>
                          {item.children.map(child => {
                            const childActive = path === child.href;
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={() => setHoveredSection(null)}
                                style={{
                                  padding: '6px 24px',
                                  fontSize: 13,
                                  fontWeight: 500,
                                  color: childActive ? '#f59e0b' : '#94a3b8',
                                  background: childActive ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
                                  textDecoration: 'none',
                                  display: 'block',
                                  transition: 'all 150ms ease',
                                }}
                              >
                                {child.label}
                              </Link>
                            );
                          })}
                        </div>
                      );
                    }
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setHoveredSection(null)}
                        style={{
                          padding: '8px 16px',
                          fontSize: 13,
                          fontWeight: 500,
                          color: itemActive ? '#f59e0b' : '#cbd5e1',
                          background: itemActive ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          transition: 'all 150ms ease',
                        }}
                      >
                        <item.icon size={13} style={{ flexShrink: 0 }} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Right Side: Tools, Search, Sign Out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Action Icons */}
          <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Toggle Theme">
            <Sun size={15} />
          </button>
          <button style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Share Link">
            <Share2 size={15} />
          </button>

          <div style={{ height: 16, width: 1, background: '#1e293b' }} />

          {/* Quick Search */}
          <div style={{ position: 'relative', width: 160 }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              placeholder="Search"
              onClick={openQuickNav}
              readOnly
              style={{
                width: '100%',
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '5px 10px 5px 28px',
                fontSize: 11,
                color: '#fff',
                outline: 'none',
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Sign Out Button */}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 150ms ease',
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Bottom Sub-Navbar (Quick Link Tools) */}
      <div style={{
        height: 36,
        background: '#0c101b', // Slightly darker slate banner
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 12,
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Recent Tools:
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/dashboard/bookings/awb" style={{
            border: '1px solid #1d4ed8',
            color: '#60a5fa',
            background: 'transparent',
            padding: '3px 12px',
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'background 150ms ease',
          }}>
            AWB Booking
          </Link>
          <Link href="/dashboard/bookings/dockets" style={{
            border: '1px solid #1d4ed8',
            color: '#60a5fa',
            background: 'transparent',
            padding: '3px 12px',
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'background 150ms ease',
          }}>
            Docket Booking
          </Link>
          <Link href="/dashboard/invoices" style={{
            border: '1px solid #1d4ed8',
            color: '#60a5fa',
            background: 'transparent',
            padding: '3px 12px',
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'background 150ms ease',
          }}>
            Invoices List
          </Link>
          <Link href="/dashboard/parties" style={{
            border: '1px solid #1d4ed8',
            color: '#60a5fa',
            background: 'transparent',
            padding: '3px 12px',
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'background 150ms ease',
          }}>
            Parties Master
          </Link>
        </div>
      </div>
    </div>
  );
}
