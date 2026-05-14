'use client';
import { useMemo, useState } from 'react';
import type { DbAuditLog, DbUserSummary } from '@/lib/useSharedData';

type Props = {
  resource: 'AWB_BOOKING' | 'DOCKET_BOOKING';
  resourceId: string;
  auditLogs: DbAuditLog[];
  users: DbUserSummary[];
};

type ActivityEntry = {
  key: string;
  label: string;
  timestamp: string | Date;
};

function formatTimestamp(timestamp: string | Date) {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString('en-IN')} ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function RecordActivityAvatars({ resource, resourceId, auditLogs, users }: Props) {
  const [open, setOpen] = useState(false);

  const entries = useMemo(() => {
    const seen = new Set<string>();
    const relevant = auditLogs
      .filter(log => log.resource === resource && log.resourceId === resourceId)
      .filter(log => /(CREATED|UPDATED|LINKED|UNLINKED)/.test(log.action))
      .slice(0, 10);

    return relevant.reduce<ActivityEntry[]>((acc, log) => {
      const user = users.find(item => item.id === log.userId);
      const label = user?.name || log.userEmail || 'System';
      const dedupeKey = `${label}-${log.action}`;
      if (seen.has(dedupeKey)) return acc;
      seen.add(dedupeKey);
      acc.push({
        key: dedupeKey,
        label,
        timestamp: log.createdAt,
      });
      return acc;
    }, []).slice(0, 2);
  }, [auditLogs, resource, resourceId, users]);

  if (entries.length === 0) return null;

  return (
    <div
      style={{ position:'relative', display:'inline-flex', alignItems:'center', marginLeft:8 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div style={{ display:'inline-flex', alignItems:'center' }}>
        {entries.map((entry, index) => (
          <div
            key={entry.key}
            title={`${entry.label} • ${formatTimestamp(entry.timestamp)}`}
            style={{
              width:18,
              height:18,
              borderRadius:'50%',
              marginLeft:index === 0 ? 0 : -5,
              border:'1px solid #fff',
              background:index === 0 ? '#1d4ed8' : '#7c3aed',
              color:'#fff',
              fontSize:9,
              fontWeight:700,
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              boxShadow:'0 0 0 1px rgba(15,23,42,0.08)',
              cursor:'default',
            }}
          >
            {entry.label.charAt(0).toUpperCase()}
          </div>
        ))}
      </div>
      {open && (
        <div style={{
          position:'absolute',
          top:'120%',
          right:0,
          minWidth:180,
          background:'#0f172a',
          color:'#fff',
          borderRadius:8,
          padding:'8px 10px',
          fontSize:10,
          zIndex:20,
          boxShadow:'0 8px 24px rgba(15,23,42,0.24)',
        }}>
          {entries.map(entry => (
            <div key={entry.key} style={{ marginBottom:6 }}>
              <div style={{ fontWeight:700 }}>{entry.label}</div>
              <div style={{ opacity:0.8 }}>{formatTimestamp(entry.timestamp)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
