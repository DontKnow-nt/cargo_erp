'use client';
import { useState, useEffect } from 'react';

interface Props {
  userId?: string | null;
  createdAt?: string | null;
}

// Cache user names to avoid repeated fetches
const userCache: Record<string, string> = {};

export function CreatorAvatar({ userId, createdAt }: Props) {
  const [name, setName] = useState<string>('');

  useEffect(() => {
    if (!userId) return;
    if (userCache[userId]) { setName(userCache[userId]); return; }
    fetch('/api/user-name?id=' + encodeURIComponent(userId))
      .then(r => r.json())
      .then(d => { if (d.name) { userCache[userId] = d.name; setName(d.name); } })
      .catch(() => {});
  }, [userId]);

  if (!userId) return null;

  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const dt = createdAt ? new Date(createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} className="creator-avatar-wrap">
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: 'linear-gradient(135deg,#f59e0b,#d97706)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 800, color: '#fff', cursor: 'default',
        flexShrink: 0,
      }}>{initial}</div>
      <div className="creator-tooltip" style={{
        position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
        background: '#1e293b', color: '#f1f5f9', borderRadius: 7, padding: '5px 9px',
        fontSize: 10, whiteSpace: 'nowrap', pointerEvents: 'none',
        opacity: 0, transition: 'opacity 150ms', zIndex: 50,
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontWeight: 700 }}>{name || 'Loading…'}</div>
        {dt && <div style={{ color: '#94a3b8', marginTop: 1 }}>{dt}</div>}
      </div>
      <style>{`.creator-avatar-wrap:hover .creator-tooltip { opacity: 1 !important; }`}</style>
    </div>
  );
}
