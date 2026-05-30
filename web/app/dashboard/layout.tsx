'use client';
import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import QuickNav from '@/components/QuickNav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="dashboard-main" style={{
        flex: 1,
        marginLeft: 'var(--sidebar-current-width, var(--sidebar-width))',
        paddingTop: 'var(--header-height)',
        transition: 'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <Header onMenuClick={() => setSidebarOpen(o => !o)} />
        <main style={{ padding: 24, minHeight: 'calc(100vh - var(--header-height))' }}>
          {children}
        </main>
      </div>
      <QuickNav />
    </div>
  );
}
