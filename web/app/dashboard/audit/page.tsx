'use client';
import { BookOpen, Download } from 'lucide-react';
import { useState } from 'react';
import { DateRangeFilter, filterByDateRange, exportToCSV, type DateRange } from '@/lib/exportUtils';
import { useSharedData } from '@/lib/useSharedData';

const ACTION_COLORS: Record<string, string> = {
  AWB_CREATED: '#2563eb',
  AWB_UPDATED: '#0369a1',
  DOCKET_CREATED: '#7c3aed',
  DOCKET_UPDATED: '#6d28d9',
  DOCKET_LINKED_AWB: '#7c3aed',
  DOCKET_UNLINKED_AWB: '#a16207',
  AWB_LINKED_DOCKET: '#2563eb',
  AWB_UNLINKED_DOCKET: '#a16207',
  INVOICE_GENERATED: '#d97706',
  INVOICE_UPDATED: '#0891b2',
  INVOICE_FINALIZED: '#059669',
  INVOICE_CANCELLED: '#dc2626',
  PAYMENT_RECEIVED: '#059669',
  IMPORT_COMPLETED: '#64748b',
  RATE_VERSION_CREATED: '#f59e0b',
};

export default function AuditPage() {
  const { auditLogs, users } = useSharedData();
  const [range, setRange] = useState<DateRange>('1m');
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');

  const allLogs = auditLogs.map(log => ({
    id: log.id,
    timestamp: log.createdAt,
    user: users.find(user => user.id === log.userId)?.name || log.userEmail || 'System',
    action: log.action,
    module: log.resource.replace(/_/g, ' '),
    details: log.details || 'No details',
  }));

  const filtered = filterByDateRange(allLogs, 'timestamp', range).filter(log =>
    (moduleFilter === 'ALL' || log.module === moduleFilter) &&
    (log.details.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      log.module.toLowerCase().includes(search.toLowerCase()) ||
      log.user.toLowerCase().includes(search.toLowerCase()))
  );

  const modules = Array.from(new Set(allLogs.map(log => log.module))).sort();

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><BookOpen size={20} color="var(--accent-dark)"/> Audit Log</h1>
          <p className="page-subtitle">Shared activity history stored in the database for all operational and financial actions.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => exportToCSV(filtered.map(log => ({ ...log })), `audit_log_${range}`)}><Download size={12}/> Export CSV</button>
      </div>

      <div style={{marginBottom:14,overflowX:'auto'}}>
        <DateRangeFilter value={range} onChange={setRange}/>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:14}}>
        <input className="input" placeholder="Search audit entries..." style={{flex:1,height:36,fontSize:12}} value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="input" style={{width:180,height:36,fontSize:12}} value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)}>
          <option value="ALL">All Modules</option>
          {modules.map(module => <option key={module}>{module}</option>)}
        </select>
      </div>

      <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>{filtered.length} entries</div>

      <div className="card" style={{overflow:'hidden'}}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Timestamp</th><th>User</th><th>Module</th><th>Action</th><th>Details</th></tr>
            </thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={5} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No audit entries in selected range</td></tr>}
              {filtered.map(log => {
                const color = ACTION_COLORS[log.action] || '#64748b';
                return (
                  <tr key={log.id}>
                    <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text-muted)',whiteSpace:'nowrap'}}>{String(log.timestamp).replace('T', ' ').slice(0, 19)}</td>
                    <td style={{fontSize:12,fontWeight:500}}>{log.user}</td>
                    <td><span style={{padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:600,color,background:color+'15',border:`1px solid ${color}30`,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{log.module}</span></td>
                    <td style={{fontSize:11,color:'var(--text-secondary)',fontFamily:'var(--font-mono)'}}>{log.action.replace(/_/g, ' ')}</td>
                    <td style={{fontSize:12,color:'var(--text-primary)',maxWidth:420}}>{log.details}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
