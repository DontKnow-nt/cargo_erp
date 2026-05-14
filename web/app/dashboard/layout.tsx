import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import QuickNav from '@/components/QuickNav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, marginLeft: 'var(--sidebar-current-width, var(--sidebar-width))', paddingTop: 'var(--header-height)', transition: 'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)' }}>
        <Header />
        <main style={{ padding: 24, minHeight: 'calc(100vh - var(--header-height))' }}>
          {children}
        </main>
      </div>
      <QuickNav />
    </div>
  );
}
