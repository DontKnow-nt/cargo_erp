'use client';
import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export function LiveIndicator({ onRefresh }: { onRefresh: () => void }) {
  const [lastSync, setLastSync] = useState(new Date());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setLastSync(new Date()), 10000);
    return () => clearInterval(interval);
  }, []);

  function handleRefresh() {
    setSyncing(true);
    onRefresh();
    setTimeout(() => { setSyncing(false); setLastSync(new Date()); }, 800);
  }

  const secs = Math.floor((Date.now() - lastSync.getTime()) / 1000);
  const label = secs < 5 ? 'Just now' : secs < 60 ? `${secs}s ago` : 'Syncing…';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 0 2px rgba(16,185,129,0.2)', animation: 'pulse 2s infinite' }} />
      <span>Live · {label}</span>
      <button onClick={handleRefresh} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center' }}>
        <RefreshCw size={11} style={{ animation: syncing ? 'spin 0.8s linear infinite' : 'none' }} />
      </button>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}} @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
