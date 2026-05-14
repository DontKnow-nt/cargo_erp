import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>Access Denied</h1>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>You do not have permission to view this page.</p>
        <Link href="/dashboard" style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
