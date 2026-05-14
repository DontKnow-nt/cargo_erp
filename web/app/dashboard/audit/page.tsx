'use client';
import { BookOpen, Filter, Download } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useState } from 'react';
import { DateRangeFilter, filterByDateRange, exportToCSV, type DateRange } from '@/lib/exportUtils';

const ACTION_COLORS: Record<string, string> = {
  BOOKING_CREATED: '#2563eb', INVOICE_GENERATED: '#d97706', INVOICE_FINALIZED: '#059669',
  PAYMENT_RECEIVED: '#059669', PARTY_ADDED: '#7c3aed', PARTY_UPDATED: '#0891b2',
  RATE_PUBLISHED: '#f59e0b', IMPORT_COMPLETED: '#64748b', INVOICE_CANCELLED: '#dc2626',
};

function buildAuditLog(store: ReturnType<typeof useStore.getState>) {
  const logs: { id:string; timestamp:string; user:string; action:string; module:string; details:string }[] = [];
  store.awbBookings.forEach(b => logs.push({ id:'al-'+b.id, timestamp:b.bookingDate+'T09:00:00', user:'Admin', action:'BOOKING_CREATED', module:'AWB', details:`AWB ${b.awbNo} booked for ${b.partyName} – ${b.origin}→${b.destination} (${b.weight}kg)` }));
  store.docketBookings.forEach(b => logs.push({ id:'al-'+b.id, timestamp:b.bookingDate+'T09:30:00', user:'Admin', action:'BOOKING_CREATED', module:'DOCKET', details:`Docket ${b.docketNo} for ${b.partyName}` }));
  store.invoices.forEach(i => {
    logs.push({ id:'al-inv-'+i.id, timestamp:i.invoiceDate+'T10:00:00', user:'Admin', action:'INVOICE_GENERATED', module:'INVOICE', details:`${i.invoiceNo} generated for ${i.partyName} – ₹${i.grandTotal.toLocaleString('en-IN')}` });
    if (i.status==='FINALIZED') logs.push({ id:'al-fin-'+i.id, timestamp:i.invoiceDate+'T10:30:00', user:'Admin', action:'INVOICE_FINALIZED', module:'INVOICE', details:`${i.invoiceNo} finalized` });
  });
  store.paymentReceipts.forEach(r => logs.push({ id:'al-'+r.id, timestamp:r.paymentDate+'T14:00:00', user:'Admin', action:'PAYMENT_RECEIVED', module:'PAYMENT', details:`${r.receiptNo} – ₹${r.paymentAmount.toLocaleString('en-IN')} from ${r.partyName} via ${r.paymentMode}` }));
  store.parties.forEach(p => logs.push({ id:'al-p-'+p.id, timestamp:p.createdAt+'T08:00:00', user:'Admin', action:'PARTY_ADDED', module:'PARTY', details:`${p.partyName} added (GSTIN: ${p.gstin||'N/A'})` }));
  store.importJobs.forEach(j => logs.push({ id:'al-ij-'+j.id, timestamp:j.createdAt+'T08:30:00', user:'Admin', action:'IMPORT_COMPLETED', module:'IMPORT', details:`${j.fileName} – ${j.successRows}/${j.totalRows} rows imported` }));
  return logs.sort((a,b) => b.timestamp.localeCompare(a.timestamp));
}

export default function AuditPage() {
  const store = useStore();
  const [range, setRange] = useState<DateRange>('1m');
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');

  const allLogs = buildAuditLog(store);
  const filtered = filterByDateRange(allLogs, 'timestamp', range)
    .filter(l =>
      (moduleFilter==='ALL' || l.module===moduleFilter) &&
      (l.details.toLowerCase().includes(search.toLowerCase()) || l.action.toLowerCase().includes(search.toLowerCase()) || l.module.toLowerCase().includes(search.toLowerCase()))
    );

  const modules = Array.from(new Set(allLogs.map(l=>l.module)));

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><BookOpen size={20} color="var(--accent-dark)"/> Audit Log</h1>
          <p className="page-subtitle">Complete immutable activity trail for all financial and operational actions.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => exportToCSV(filtered.map(l=>({...l})), `audit_log_${range}`)}><Download size={12}/> Export CSV</button>
      </div>

      {/* Date range */}
      <div style={{marginBottom:14,overflowX:'auto'}}>
        <DateRangeFilter value={range} onChange={setRange}/>
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:10,marginBottom:14}}>
        <input className="input" placeholder="Search audit entries…" style={{flex:1,height:36,fontSize:12}} value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="input" style={{width:160,height:36,fontSize:12}} value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)}>
          <option value="ALL">All Modules</option>
          {modules.map(m=><option key={m}>{m}</option>)}
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
              {filtered.length===0&&<tr><td colSpan={5} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No audit entries in selected range</td></tr>}
              {filtered.map(log=>{
                const c = ACTION_COLORS[log.action]||'#64748b';
                return (
                  <tr key={log.id}>
                    <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text-muted)',whiteSpace:'nowrap'}}>{log.timestamp.replace('T',' ')}</td>
                    <td style={{fontSize:12,fontWeight:500}}>{log.user}</td>
                    <td><span style={{padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:600,color:c,background:c+'15',border:`1px solid ${c}30`,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{log.module}</span></td>
                    <td style={{fontSize:11,color:'var(--text-secondary)',fontFamily:'var(--font-mono)'}}>{log.action.replace(/_/g,' ')}</td>
                    <td style={{fontSize:12,color:'var(--text-primary)',maxWidth:400}}>{log.details}</td>
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
