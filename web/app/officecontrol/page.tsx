'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';

export default function OfficeControlLogin() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/officecontrol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) setError('Invalid password.');
      else router.push('/officecontrol/panel');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '40px 36px', width: '100%', maxWidth: 380, border: '1px solid #e2e8f0' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#fff', border: '2px solid #f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
            <img src="/logo.png" alt="Triveni" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>Office Control</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Restricted — administrators only</div>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Admin Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', color: '#0f172a' }}
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '11px', background: loading ? '#d97706' : '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 2px 8px rgba(245,158,11,0.3)' }}>
            {loading ? 'Verifying…' : 'Enter Office Control'}
          </button>
        </form>
      </div>
    </div>
  );
}
