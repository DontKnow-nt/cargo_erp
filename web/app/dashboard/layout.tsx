'use client';
import Header from '@/components/Header';
import QuickNav from '@/components/QuickNav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      <div className="dashboard-main" style={{
        flex: 1,
        marginLeft: 0,
        paddingTop: 'var(--header-height)',
      }}>
        <Header />
        <main style={{ padding: 24, minHeight: 'calc(100vh - var(--header-height))' }}>
          {children}
        </main>
      </div>
      <QuickNav />
    </div>
  );
}
