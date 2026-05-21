'use client';
import { useState, useTransition } from 'react';
import { FileText, Search, Trash2, Edit2, Printer } from 'lucide-react';
import { useSharedData } from '@/lib/useSharedData';
import { deleteInvoices, cancelInvoice } from '@/lib/actions/invoices';
import { shortName, fmtDate } from '@/lib/utils';
import { CreatorAvatar } from '@/components/CreatorAvatar';
import { LiveIndicator } from '@/components/LiveIndicator';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Badge({ status }: { status: string }) {
  const m: Record<string,[string,string]> = {
    DRAFT:['#64748b','#f8fafc'], FINALIZED:['#2563eb','#eff6ff'],
    PAID:['#059669','#ecfdf5'], CANCELLED:['#dc2626','#fef2f2'],
    PARTIALLY_PAID:['#d97706','#fffbeb'], OVERDUE:['#dc2626','#fef2f2'],
  };
  const [c,bg] = m[status]||['#64748b','#f8fafc'];
  return <span style={{padding:'2px 9px',borderRadius:99,fontSize:10,fontWeight:600,color:c,background:bg,border:`1px solid ${c}30`,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{status}</span>;
}

export default function CreditNotePage() {
  const { invoices, refresh } = useSharedData();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const router = useRouter();

  const filtered = invoices.filter(inv =>
    (inv.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
     inv.partyName.toLowerCase().includes(search.toLowerCase()) ||
     inv.bookingRef.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === 'ALL' || inv.status === statusFilter)
  );

  function toggleSelect(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function confirmDelete() {
    startTransition(async () => {
      await deleteInvoices([...selected]);
      toast.success(`${selected.size} credit note${selected.size>1?'s':''} deleted`);
      setSelected(new Set()); setShowDeleteConfirm(false); refresh();
    });
  }

  const statusCounts = {
    DRAFT: invoices.filter(i=>i.status==='DRAFT').length,
    FINALIZED: invoices.filter(i=>i.status==='FINALIZED').length,
    PAID: invoices.filter(i=>i.status==='PAID').length,
    OVERDUE: invoices.filter(i=>i.status==='OVERDUE').length,
    CANCELLED: invoices.filter(i=>i.status==='CANCELLED').length,
  };

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><FileText size={20} color="var(--accent-dark)"/> Credit Notes</h1>
          <p className="page-subtitle">Manage and edit credit notes. Click Edit to open the Credit Note editor.</p>
        </div>
        <div style={{display:'flex',gap:9,alignItems:'center'}}>
          <LiveIndicator onRefresh={refresh}/>
          {selected.size > 0 && (
            <button className="btn btn-danger btn-sm" onClick={()=>setShowDeleteConfirm(true)}><Trash2 size={12}/> Delete ({selected.size})</button>
          )}
          <button className="btn btn-primary btn-sm" onClick={()=>router.push('/dashboard/credit-note/editor')}>+ Make Credit Note</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:16}}>
        {Object.entries(statusCounts).map(([s,c])=>(
          <div key={s} style={{background:'var(--surface-base)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px',cursor:'pointer'}} onClick={()=>setStatusFilter(statusFilter===s?'ALL':s)}>
            <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{s}</div>
            <div style={{fontSize:20,fontWeight:800,fontFamily:'var(--font-mono)',marginTop:2}}>{c}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:10,marginBottom:14}}>
        <div style={{position:'relative',flex:1}}>
          <Search size={12} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
          <input className="input" placeholder="Search credit note, party, booking ref…" style={{paddingLeft:30,height:36,fontSize:12}} value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="input" style={{width:160,height:36,fontSize:12}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="ALL">All Status</option>
          {['DRAFT','FINALIZED','PAID','OVERDUE','CANCELLED','PARTIALLY_PAID'].map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{width:36}}></th>
                <th>Credit Note No.</th><th>Party</th><th>Booking Ref</th><th>Type</th>
                <th>Date</th><th>Due Date</th>
                <th style={{textAlign:'right'}}>Subtotal</th><th style={{textAlign:'right'}}>GST</th>
                <th style={{textAlign:'right'}}>Total</th><th style={{textAlign:'right'}}>Paid</th>
                <th style={{textAlign:'right'}}>Outstanding</th><th>Status</th>
                <th style={{textAlign:'center'}}>By</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={15} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No credit notes found</td></tr>}
              {filtered.map(inv => (
                <tr key={inv.id} style={{background: selected.has(inv.id) ? 'rgba(239,68,68,0.05)' : undefined}}>
                  <td style={{padding:'0 10px'}}>
                    <input type="checkbox" checked={selected.has(inv.id)} onChange={()=>toggleSelect(inv.id)}
                      style={{width:15,height:15,cursor:'pointer',accentColor:'var(--accent)'}}/>
                  </td>
                  <td>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700,color:'var(--accent-dark)',cursor:'pointer'}}
                      onClick={()=>router.push(`/dashboard/credit-note/editor?id=${inv.id}`)}>
                      {inv.invoiceNo}
                    </span>
                  </td>
                  <td style={{fontWeight:500}} title={inv.partyName}>{shortName(inv.partyName)}</td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{inv.bookingRef}</span></td>
                  <td><span style={{fontSize:10,fontFamily:'var(--font-mono)',background:'var(--surface-sunken)',padding:'2px 7px',borderRadius:5,border:'1px solid var(--border)'}}>{inv.bookingType}</span></td>
                  <td style={{fontSize:12,color:'var(--text-muted)'}}>{fmtDate(inv.invoiceDate)}</td>
                  <td style={{fontSize:12,color: new Date(inv.dueDate)<new Date()&&inv.status!=='PAID' ? '#dc2626' : 'var(--text-muted)'}}>{fmtDate(inv.dueDate)}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12}}>{fmt(inv.subtotal)}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text-muted)'}}>{fmt(inv.gstTotal)}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800}}>{fmt(inv.grandTotal)}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'#059669'}}>{fmt(inv.paidTotal)}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700,color: inv.outstandingTotal>0 ? '#dc2626' : '#059669'}}>{fmt(inv.outstandingTotal)}</td>
                  <td><Badge status={inv.status}/></td>
                  <td style={{textAlign:'center'}}><CreatorAvatar userId={(inv as any).createdBy} createdAt={inv.createdAt}/></td>
                  <td style={{display:'flex',gap:4,flexWrap:'nowrap'}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px',color:'var(--accent-dark)'}}
                      onClick={()=>router.push(`/dashboard/credit-note/editor?id=${inv.id}`)}>
                      <Edit2 size={11}/> Edit
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px'}}
                      onClick={()=>window.open(`/dashboard/credit-note/editor?id=${inv.id}`,'_blank')}>
                      <Printer size={11}/>
                    </button>
                    {inv.status !== 'PAID' && (
                      <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 6px',color:'#dc2626'}}
                        onClick={()=>{setSelected(new Set([inv.id]));setShowDeleteConfirm(true);}}>
                        <Trash2 size={11}/>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
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
              <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>Delete {selected.size} Credit Note{selected.size>1?'s':''}?</div>
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
