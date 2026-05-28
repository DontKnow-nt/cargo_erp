'use client';
import { AlertTriangle, Download, Search, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useSharedData } from '@/lib/useSharedData';
import { LiveIndicator } from '@/components/LiveIndicator';
import { deleteOutstandingEntries } from '@/lib/actions/invoices';
import toast from 'react-hot-toast';

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const BUCKET_LABELS: Record<string,string> = {
  CURRENT:'Current', DAYS_1_15:'1-15 Days', DAYS_16_30:'16-30 Days',
  DAYS_31_60:'31-60 Days', DAYS_61_90:'61-90 Days', DAYS_90_PLUS:'90+ Days',
};
const BUCKET_COLORS: Record<string,string> = {
  CURRENT:'#059669', DAYS_1_15:'#2563eb', DAYS_16_30:'#d97706',
  DAYS_31_60:'#ea580c', DAYS_61_90:'#dc2626', DAYS_90_PLUS:'#7c3aed',
};

export default function OutstandingPage() {
  const { outstanding, parties, refresh } = useSharedData();

  const [search, setSearch]     = useState('');
  const [partyFilter, setPartyFilter] = useState('ALL');
  const [bucketFilter, setBucketFilter] = useState('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirmDelete() {
    const ids = [...selected];
    setSelected(new Set()); setShowDeleteConfirm(false);
    startTransition(async () => {
      await deleteOutstandingEntries(ids);
      toast.success(`${ids.length} entr${ids.length > 1 ? 'ies' : 'y'} deleted`);
      refresh();
    });
  }

  const totalOut = outstanding.filter(o => o.outstandingAmount > 0).reduce((sum, o) => sum + o.outstandingAmount, 0);
  const totalOvd = outstanding.filter(o => {
    const isOverdue = new Date(o.dueDate) < new Date();
    return isOverdue && o.outstandingAmount > 0;
  }).reduce((sum, o) => sum + o.outstandingAmount, 0);

  // Bucket summary
  const bucketSummary = Object.keys(BUCKET_LABELS).map(b => ({
    bucket: b,
    amount: outstanding.filter(o=>o.agingBucket===b&&o.outstandingAmount>0).reduce((s,o)=>s+o.outstandingAmount,0),
    count:  outstanding.filter(o=>o.agingBucket===b&&o.outstandingAmount>0).length,
  }));

  // Party wise summary
  const partyMap: Record<string,{name:string;amount:number;creditLimit:number}> = {};
  outstanding.forEach(o=>{
    const party = parties.find(p => p.id === o.partyId);
    const creditLimit = party ? party.creditLimit : o.creditLimit;
    if(!partyMap[o.partyId]) partyMap[o.partyId]={name:o.partyName,amount:0,creditLimit};
    partyMap[o.partyId].amount+=o.outstandingAmount;
  });

  const filtered = outstanding.filter(o =>
    o.outstandingAmount > 0 &&
    (o.partyName.toLowerCase().includes(search.toLowerCase()) || o.invoiceNo.toLowerCase().includes(search.toLowerCase()) || o.bookingRef.toLowerCase().includes(search.toLowerCase())) &&
    (partyFilter==='ALL' || o.partyId===partyFilter) &&
    (bucketFilter==='ALL' || o.agingBucket===bucketFilter)
  );

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><AlertTriangle size={20} color="var(--accent-dark)"/> Outstanding & Aging</h1>
          <p className="page-subtitle">Party-wise outstanding balances with aging buckets. Red = overdue.</p>
        </div>
        <div style={{display:'flex',gap:9}}>
          <LiveIndicator onRefresh={refresh} />
          {selected.size > 0 && (
            <button className="btn btn-danger btn-sm" onClick={()=>setShowDeleteConfirm(true)}><Trash2 size={12}/> Delete ({selected.size})</button>
          )}
          <button className="btn btn-secondary btn-sm"><Download size={12}/> Export Statement</button>
        </div>
      </div>

      {/* KPI summary */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:12,padding:'14px 18px'}}>
          <div style={{fontSize:11,color:'#dc2626',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em'}}>Total Outstanding</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:'var(--font-mono)',color:'#dc2626',marginTop:4}}>{fmt(totalOut)}</div>
        </div>
        <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:12,padding:'14px 18px'}}>
          <div style={{fontSize:11,color:'#ea580c',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em'}}>Overdue Amount</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:'var(--font-mono)',color:'#ea580c',marginTop:4}}>{fmt(totalOvd)}</div>
        </div>
        <div style={{background:'var(--surface-base)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 18px'}}>
          <div style={{fontSize:11,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em'}}>Pending Invoices</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:'var(--font-mono)',color:'var(--text-primary)',marginTop:4}}>{outstanding.filter(o=>o.outstandingAmount>0).length}</div>
        </div>
        <div style={{background:'var(--surface-base)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 18px'}}>
          <div style={{fontSize:11,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em'}}>Parties With Dues</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:'var(--font-mono)',color:'var(--text-primary)',marginTop:4}}>{Object.keys(partyMap).length}</div>
        </div>
      </div>

      {/* Aging buckets */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8,marginBottom:20}}>
        {bucketSummary.map(b=>(
          <div key={b.bucket} style={{background:'var(--surface-base)',border:`1.5px solid ${b.amount>0?BUCKET_COLORS[b.bucket]+'40':'var(--border)'}`,borderRadius:10,padding:'10px 12px',cursor:'pointer',transition:'all 150ms'}} onClick={()=>setBucketFilter(bucketFilter===b.bucket?'ALL':b.bucket)}>
            <div style={{fontSize:10,color:BUCKET_COLORS[b.bucket],fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em'}}>{BUCKET_LABELS[b.bucket]}</div>
            <div style={{fontSize:16,fontWeight:800,fontFamily:'var(--font-mono)',color:b.amount>0?BUCKET_COLORS[b.bucket]:'var(--text-muted)',marginTop:4}}>{fmt(b.amount)}</div>
            <div style={{fontSize:10,color:'var(--text-muted)'}}>{b.count} invoice{b.count!==1?'s':''}</div>
          </div>
        ))}
      </div>

      {/* Party summary */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Party-wise Outstanding</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:8}}>
          {Object.entries(partyMap).map(([id,{name,amount,creditLimit}])=>{
            const pct = creditLimit>0 ? amount/creditLimit : 0;
            return (
              <div key={id} style={{background:'var(--surface-base)',border:`1px solid ${pct>=1?'#fca5a5':pct>=0.8?'#fcd34d':'var(--border)'}`,borderRadius:10,padding:'12px 14px',cursor:'pointer'}} onClick={()=>setPartyFilter(partyFilter===id?'ALL':id)}>
                <div style={{fontSize:12,fontWeight:700,marginBottom:4}}>{name}</div>
                <div style={{fontSize:16,fontWeight:800,fontFamily:'var(--font-mono)',color:pct>=1?'#dc2626':pct>=0.8?'#d97706':'var(--text-primary)'}}>{fmt(amount)}</div>
                {creditLimit>0&&(
                  <div style={{marginTop:6}}>
                    <div style={{width:'100%',height:4,background:'var(--border)',borderRadius:99}}>
                      <div style={{width:`${Math.min(pct*100,100)}%`,height:'100%',borderRadius:99,background:pct>=1?'#dc2626':pct>=0.8?'#d97706':'#059669'}}/>
                    </div>
                    <div style={{fontSize:10,color:'var(--text-muted)',marginTop:3}}>{fmt(amount)} / {fmt(creditLimit)} limit</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:10,marginBottom:12}}>
        <div style={{position:'relative',flex:1}}>
          <Search size={12} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
          <input className="input" placeholder="Search party, invoice, booking ref…" style={{paddingLeft:30,height:36,fontSize:12}} value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="input" style={{width:200,height:36,fontSize:12}} value={partyFilter} onChange={e=>setPartyFilter(e.target.value)}>
          <option value="ALL">All Parties</option>
          {parties.map(p=><option key={p.id} value={p.id}>{p.partyName}</option>)}
        </select>
        <select className="input" style={{width:160,height:36,fontSize:12}} value={bucketFilter} onChange={e=>setBucketFilter(e.target.value)}>
          <option value="ALL">All Buckets</option>
          {Object.keys(BUCKET_LABELS).map(k=><option key={k} value={k}>{BUCKET_LABELS[k]}</option>)}
        </select>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{width:36}}>
                  <input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0}
                    onChange={()=>selected.size===filtered.length?setSelected(new Set()):setSelected(new Set(filtered.map(o=>o.id)))}
                    style={{width:15,height:15,cursor:'pointer',accentColor:'var(--accent)'}}/>
                </th>
                <th>Party</th><th>Invoice No.</th><th>Booking Ref</th>
                <th>Invoice Date</th><th>Due Date</th>
                <th style={{textAlign:'right'}}>Original</th><th style={{textAlign:'right'}}>Paid</th>
                <th style={{textAlign:'right'}}>Outstanding</th><th>Aging</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length===0&&<tr><td colSpan={11} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No outstanding entries</td></tr>}
              {filtered.map(o=>{
                const isOverdue = new Date(o.dueDate)<new Date();
                const c = BUCKET_COLORS[o.agingBucket];
                return (
                  <tr key={o.id} style={{background: selected.has(o.id) ? 'rgba(239,68,68,0.05)' : undefined}}>
                    <td style={{padding:'0 10px'}}>
                      <input type="checkbox" checked={selected.has(o.id)}
                        onChange={()=>setSelected(s=>{const n=new Set(s);n.has(o.id)?n.delete(o.id):n.add(o.id);return n;})}
                        style={{width:15,height:15,cursor:'pointer',accentColor:'var(--accent)'}}/>
                    </td>
                    <td style={{fontWeight:600}}>{o.partyName}</td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--accent-dark)'}}>{o.invoiceNo}</span></td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{o.bookingRef}</span></td>
                    <td style={{fontSize:12,color:'var(--text-muted)'}}>{o.invoiceDate}</td>
                    <td style={{fontSize:12,color:isOverdue?'#dc2626':'var(--text-muted)',fontWeight:isOverdue?700:400}}>{o.dueDate}{isOverdue&&' ⚠'}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12}}>{fmt(o.originalAmount)}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'#059669'}}>{fmt(o.paidAmount)}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800,color:isOverdue?'#dc2626':'var(--text-primary)'}}>{fmt(o.outstandingAmount)}</td>
                    <td><span style={{padding:'2px 9px',borderRadius:99,fontSize:10,fontWeight:600,color:c,background:c+'15',border:`1px solid ${c}40`,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{BUCKET_LABELS[o.agingBucket]}</span></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 6px',color:'#dc2626'}}
                        onClick={()=>{setSelected(new Set([o.id]));setShowDeleteConfirm(true);}}><Trash2 size={11}/></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:380}}>
            <div style={{textAlign:'center',padding:'8px 0 20px'}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'#fef2f2',border:'2px solid #fca5a5',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
                <Trash2 size={22} color="#dc2626"/>
              </div>
              <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>Delete {selected.size} Entr{selected.size>1?'ies':'y'}?</div>
              <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:20}}>This cannot be undone.</div>
              <div style={{display:'flex',gap:10,justifyContent:'center'}}>
                <button className="btn btn-secondary" onClick={()=>{setShowDeleteConfirm(false);setSelected(new Set());}}>Cancel</button>
                <button className="btn btn-danger" disabled={isPending} onClick={confirmDelete}><Trash2 size={13}/> Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
