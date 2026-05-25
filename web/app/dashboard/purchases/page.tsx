'use client';
import { useState, useTransition, useEffect } from 'react';
import { Receipt, Plus, X, CheckCircle, Trash2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { createPurchaseInvoice, getPurchaseInvoices, updatePurchaseInvoiceStatus, deletePurchaseInvoices } from '@/lib/actions/purchases';
import { fmtDate } from '@/lib/utils';

type Bill = {
  id: string; vendorName: string; invoiceNo: string;
  invoiceDate: string; dueDate?: string | null;
  totalAmount: number; description?: string | null;
  category?: string | null; status: string; paidAmount?: number;
};

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const CATEGORIES = ['Transport', 'Fuel', 'Office Supplies', 'Maintenance', 'Utilities', 'Salary', 'Other'];
const emptyForm = {
  vendorName: '', invoiceNo: '', invoiceDate: new Date().toISOString().split('T')[0],
  dueDate: '', totalAmount: 0, subtotal: 0, gstAmount: 0, description: '', category: 'Transport',
  gstRate: 18, tdsRate: 0, tdsAmount: 0, netPayable: 0,
  periodType: 'single' as 'single' | 'range', periodEnd: '',
};

export default function PurchasesPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [partialModal, setPartialModal] = useState<{ id: string; total: number; paid: number } | null>(null);
  const [partialAmt, setPartialAmt] = useState(0);

  function refresh() {
    getPurchaseInvoices().then(d => setBills(d as unknown as Bill[])).catch(() => {});
  }
  useEffect(() => { refresh(); }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vendorName || !form.invoiceNo || form.totalAmount <= 0) { toast.error('Fill required fields'); return; }
    const periodLabel = form.periodType === 'range' && form.periodEnd
      ? `Period: ${form.invoiceDate} to ${form.periodEnd}` : '';
    const descWithPeriod = [form.description, periodLabel].filter(Boolean).join(' | ');
    startTransition(async () => {
      const res = await createPurchaseInvoice({
        vendorName: form.vendorName, invoiceNo: form.invoiceNo,
        invoiceDate: form.invoiceDate, dueDate: form.dueDate || undefined,
        subtotal: form.totalAmount, gstAmount: isNaN(form.gstAmount) ? 0 : (form.gstAmount || 0), totalAmount: isNaN(form.netPayable) ? form.totalAmount : (form.netPayable || form.totalAmount),
        description: descWithPeriod || undefined, category: form.category || undefined,
      });
      if (res && 'error' in res) { toast.error('Validation error'); return; }
      toast.success('Bill added');
      setShowForm(false); setForm(emptyForm); refresh();
    });
  }

  function markPaid(id: string) {
    startTransition(async () => {
      await updatePurchaseInvoiceStatus(id, 'PAID');
      toast.success('Marked as paid');
      refresh();
    });
  }

  function confirmDelete() {
    startTransition(async () => {
      await deletePurchaseInvoices([...selected]);
      toast.success(`${selected.size} bill${selected.size > 1 ? 's' : ''} deleted`);
      setSelected(new Set()); setShowDeleteConfirm(false); refresh();
    });
  }

  const filtered = bills.filter(b =>
    b.vendorName.toLowerCase().includes(search.toLowerCase()) ||
    b.invoiceNo.toLowerCase().includes(search.toLowerCase())
  );

  const pendingTotal = bills.filter(b => b.status !== 'PAID').reduce((s, b) => s + b.totalAmount, 0);
  const paidTotal    = bills.filter(b => b.status === 'PAID').reduce((s, b) => s + b.totalAmount, 0);

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><Receipt size={20} color="var(--accent-dark)"/> Bills to Pay</h1>
          <p className="page-subtitle">Track company bills and expenses. Mark as paid when settled.</p>
        </div>
        <div style={{display:'flex',gap:9}}>
          {selected.size > 0 && (
            <button className="btn btn-danger btn-sm" onClick={()=>setShowDeleteConfirm(true)}><Trash2 size={12}/> Delete ({selected.size})</button>
          )}
          <button className="btn btn-primary btn-sm" onClick={()=>setShowForm(true)}><Plus size={12}/> Add Bill</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
        {[
          {label:'Total Bills', val:bills.length, color:'var(--text-primary)'},
          {label:'Pending Payment', val:fmt(pendingTotal), color:'#dc2626'},
          {label:'Paid', val:fmt(paidTotal), color:'#059669'},
        ].map(s=>(
          <div key={s.label} className="card" style={{padding:'14px 18px'}}>
            <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{s.label}</div>
            <div style={{fontSize:20,fontWeight:800,fontFamily:'var(--font-mono)',color:s.color,marginTop:4}}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{position:'relative',marginBottom:14}}>
        <Search size={12} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
        <input className="input" placeholder="Search vendor or bill no…" style={{paddingLeft:30,height:36,fontSize:12}} value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{width:36}}></th>
                <th>Vendor</th><th>Bill No.</th><th>Category</th><th>Description</th>
                <th>Date</th><th>Due Date</th>
                <th style={{textAlign:'right'}}>Total</th>
                <th style={{textAlign:'right'}}>Paid</th>
                <th style={{textAlign:'right'}}>Left</th>
                <th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No bills yet. Click "Add Bill" to get started.</td></tr>
              )}
              {filtered.map(bill => {
                const paid = bill.status === 'PAID';
                const partial = bill.status === 'PARTIALLY_PAID';
                const statusColor = paid ? '#059669' : partial ? '#d97706' : '#dc2626';
                const statusBg   = paid ? '#ecfdf5' : partial ? '#fffbeb' : '#fef2f2';
                const statusBdr  = paid ? '#6ee7b7' : partial ? '#fcd34d' : '#fca5a5';
                const statusText = paid ? 'PAID' : partial ? 'PARTIAL' : 'PENDING';
                return (
                  <tr key={bill.id} style={{background: selected.has(bill.id) ? 'rgba(239,68,68,0.05)' : undefined}}>
                    <td style={{padding:'0 10px'}}>
                      <input type="checkbox" checked={selected.has(bill.id)}
                        onChange={()=>setSelected(s=>{const n=new Set(s);n.has(bill.id)?n.delete(bill.id):n.add(bill.id);return n;})}
                        style={{width:15,height:15,cursor:'pointer',accentColor:'var(--accent)'}}/>
                    </td>
                    <td style={{fontWeight:600}}>{bill.vendorName}</td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:12}}>{bill.invoiceNo}</span></td>
                    <td style={{fontSize:12,color:'var(--text-muted)'}}>{bill.category||'—'}</td>
                    <td style={{fontSize:12,color:'var(--text-secondary)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{bill.description||'—'}</td>
                    <td style={{fontSize:12,color:'var(--text-muted)'}}>{fmtDate(bill.invoiceDate)}</td>
                    <td style={{fontSize:12,color: bill.dueDate && !paid && new Date(bill.dueDate) < new Date() ? '#dc2626' : 'var(--text-muted)'}}>
                      {bill.dueDate ? fmtDate(bill.dueDate) : '—'}
                    </td>
                    <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800,color: statusColor}}>{fmt(bill.totalAmount)}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'#059669'}}>{bill.paidAmount ? fmt(bill.paidAmount) : '—'}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color: (bill.totalAmount-(bill.paidAmount||0))>0 ? '#dc2626' : '#059669'}}>
                      {fmt(Math.max(0, bill.totalAmount - (bill.paidAmount||0)))}
                    </td>
                    <td>
                      <span style={{padding:'2px 9px',borderRadius:99,fontSize:10,fontWeight:600,color:statusColor,background:statusBg,border:`1px solid ${statusBdr}`,fontFamily:'var(--font-mono)',textTransform:'uppercase'}}>
                        {statusText}
                      </span>
                    </td>
                    <td style={{display:'flex',gap:4,flexWrap:'nowrap'}}>
                      {!paid && (
                        <button className="btn btn-ghost btn-sm" style={{fontSize:11,color:'#059669',whiteSpace:'nowrap'}}
                          onClick={()=>startTransition(async()=>{await updatePurchaseInvoiceStatus(bill.id,'PAID');toast.success('Marked as paid');refresh();})}>
                          ✓ Paid
                        </button>
                      )}
                      {!partial && !paid && (
                        <button className="btn btn-ghost btn-sm" style={{fontSize:11,color:'#d97706',whiteSpace:'nowrap'}}
                          onClick={()=>{ setPartialAmt(bill.paidAmount||0); setPartialModal({id:bill.id,total:bill.totalAmount,paid:bill.paidAmount||0}); }}>
                          ~ Partial
                        </button>
                      )}
                      {(paid || partial) && (
                        <button className="btn btn-ghost btn-sm" style={{fontSize:11,color:'#dc2626',whiteSpace:'nowrap'}}
                          onClick={()=>startTransition(async()=>{await updatePurchaseInvoiceStatus(bill.id,'PENDING');toast('Marked as not paid',{icon:'↩️'});refresh();})}>
                          ↩ Unpaid
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 6px',color:'#dc2626'}}
                        title="Delete" onClick={()=>{setSelected(new Set([bill.id]));setShowDeleteConfirm(true);}}>
                        <Trash2 size={11}/>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Bill Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:520}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h2 style={{fontSize:16,fontWeight:800}}>Add Bill</h2>
              <button className="btn btn-ghost btn-icon" onClick={()=>{setShowForm(false);setForm(emptyForm);}}><X size={16}/></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-row form-row-2" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Vendor / Party Name *</label>
                  <input className="input" required placeholder="e.g. Indigo Airlines" value={form.vendorName} onChange={e=>setForm(f=>({...f,vendorName:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="label">Bill / Invoice No. *</label>
                  <input className="input" required placeholder="e.g. INV-2026-001" value={form.invoiceNo} onChange={e=>setForm(f=>({...f,invoiceNo:e.target.value}))}/>
                </div>
              </div>
              <div className="form-row form-row-3" style={{marginBottom:12}}>
                <div className="form-group" style={{gridColumn:'1 / -1'}}>
                  <label className="label">Period of Work *</label>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    <div style={{display:'flex',gap:0,border:'1px solid var(--border)',borderRadius:8,overflow:'hidden',flexShrink:0}}>
                      {(['single','range'] as const).map(t=>(
                        <button key={t} type="button"
                          onClick={()=>setForm(f=>({...f,periodType:t,periodEnd:''}))}
                          style={{padding:'6px 14px',fontSize:12,fontWeight:form.periodType===t?700:500,background:form.periodType===t?'var(--accent)':'var(--surface-base)',color:form.periodType===t?'#fff':'var(--text-secondary)',border:'none',cursor:'pointer'}}>
                          {t==='single'?'Single Date':'Date Range'}
                        </button>
                      ))}
                    </div>
                    <input className="input" type="date" required value={form.invoiceDate} onChange={e=>setForm(f=>({...f,invoiceDate:e.target.value}))} style={{flex:1,minWidth:120}}/>
                    {form.periodType==='range' && <>
                      <span style={{fontSize:12,color:'var(--text-muted)',flexShrink:0}}>to</span>
                      <input className="input" type="date" required={form.periodType==='range'} value={form.periodEnd} onChange={e=>setForm(f=>({...f,periodEnd:e.target.value}))} style={{flex:1,minWidth:120}}/>
                    </>}
                  </div>
                  {form.periodType==='range' && form.invoiceDate && form.periodEnd && (
                    <div style={{fontSize:10,color:'var(--text-muted)',marginTop:3}}>
                      Period: {new Date(form.invoiceDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} – {new Date(form.periodEnd).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="label">Due Date</label>
                  <input className="input" type="date" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="label">Category</label>
                  <select className="input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                    {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Amount breakdown */}
              <div style={{background:'var(--surface-sunken)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px',marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>Amount Breakdown</div>
                <div className="form-row form-row-2" style={{marginBottom:10}}>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="label">Taxable Amount (₹) *</label>
                    <input className="input" type="number" min="0" step="0.01" required value={form.totalAmount||''} style={{fontFamily:'var(--font-mono)'}}
                      onChange={e=>{const taxable=parseFloat(e.target.value)||0;const gst=parseFloat(((taxable*form.gstRate)/100).toFixed(2));const tds=parseFloat(((taxable*form.tdsRate)/100).toFixed(2));setForm(f=>({...f,totalAmount:taxable,gstAmount:gst,tdsAmount:tds,netPayable:parseFloat((taxable+gst-tds).toFixed(2))}));}}/>
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="label">Description</label>
                    <input className="input" placeholder="What is this bill for?" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
                  </div>
                </div>
                <div className="form-row form-row-2" style={{marginBottom:10}}>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="label">GST Rate (%)</label>
                    <select className="input" value={form.gstRate} onChange={e=>{const rate=parseFloat(e.target.value);const gst=parseFloat(((form.totalAmount*rate)/100).toFixed(2));const tds=form.tdsAmount;setForm(f=>({...f,gstRate:rate,gstAmount:gst,netPayable:parseFloat((f.totalAmount+gst-tds).toFixed(2))}));}}>
                      {[0,5,10,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="label">GST Amount (₹)</label>
                    <input className="input" type="number" min="0" step="0.01" value={form.gstAmount||''} style={{fontFamily:'var(--font-mono)'}} placeholder="Auto-calculated"
                      onChange={e=>{const gst=parseFloat(e.target.value)||0;setForm(f=>({...f,gstAmount:gst,netPayable:parseFloat((f.totalAmount+gst-f.tdsAmount).toFixed(2))}));}}/>
                  </div>
                </div>
                <div className="form-row form-row-2" style={{marginBottom:10}}>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="label">TDS Rate (%)</label>
                    <select className="input" value={form.tdsRate} onChange={e=>{const rate=parseFloat(e.target.value);const tds=parseFloat(((form.totalAmount*rate)/100).toFixed(2));setForm(f=>({...f,tdsRate:rate,tdsAmount:tds,netPayable:parseFloat((f.totalAmount+f.gstAmount-tds).toFixed(2))}));}}>
                      {[0,1,2,5,10,15,20].map(r=><option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="label">TDS Amount (₹)</label>
                    <input className="input" type="number" min="0" step="0.01" value={form.tdsAmount||''} style={{fontFamily:'var(--font-mono)'}} placeholder="Auto-calculated"
                      onChange={e=>{const tds=parseFloat(e.target.value)||0;setForm(f=>({...f,tdsAmount:tds,netPayable:parseFloat((f.totalAmount+f.gstAmount-tds).toFixed(2))}));}}/>
                  </div>
                </div>
                {/* Summary */}
                <div style={{borderTop:'1px solid var(--border)',paddingTop:10,display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8}}>
                  {[
                    {label:'Taxable',val:`₹${(form.totalAmount||0).toFixed(2)}`,color:'var(--text-primary)'},
                    {label:`GST`,val:`₹${(form.gstAmount||0).toFixed(2)}`,color:'#2563eb'},
                    {label:`TDS (-)`,val:`₹${(form.tdsAmount||0).toFixed(2)}`,color:'#dc2626'},
                    {label:'Net Payable',val:`₹${(form.netPayable||0).toFixed(2)}`,color:'#059669',bold:true},
                  ].map(s=>(
                    <div key={s.label} style={{padding:'8px 10px',background:'var(--surface-base)',border:`1px solid ${s.color}30`,borderRadius:7,textAlign:'center'}}>
                      <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',marginBottom:3}}>{s.label}</div>
                      <div style={{fontSize:13,fontWeight:(s as any).bold?800:700,fontFamily:'var(--font-mono)',color:s.color}}>{s.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={()=>{setShowForm(false);setForm(emptyForm);}}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}><CheckCircle size={13}/> Save Bill</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {partialModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:380}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h2 style={{fontSize:15,fontWeight:800}}>Partial Payment</h2>
              <button className="btn btn-ghost btn-icon" onClick={()=>setPartialModal(null)}><X size={16}/></button>
            </div>
            <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:12}}>
              Total Bill: <strong>{fmt(partialModal.total)}</strong> · Already Paid: <strong>{fmt(partialModal.paid)}</strong>
            </div>
            <div className="form-group" style={{marginBottom:16}}>
              <label className="label">Amount Paid (₹)</label>
              <input className="input" type="number" min="0" max={partialModal.total} step="0.01" autoFocus
                value={partialAmt||''} onChange={e=>setPartialAmt(parseFloat(e.target.value)||0)}
                style={{fontFamily:'var(--font-mono)',fontWeight:700}}/>
            </div>
            {partialAmt > 0 && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
                {[
                  {label:'Paid',val:fmt(partialAmt),color:'#059669'},
                  {label:'Left',val:fmt(Math.max(0,partialModal.total-partialAmt)),color:'#dc2626'},
                ].map(s=>(
                  <div key={s.label} style={{padding:'8px 12px',background:'var(--surface-sunken)',border:`1px solid ${s.color}30`,borderRadius:8,textAlign:'center'}}>
                    <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase'}}>{s.label}</div>
                    <div style={{fontSize:14,fontWeight:800,fontFamily:'var(--font-mono)',color:s.color}}>{s.val}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn btn-secondary" onClick={()=>setPartialModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!partialAmt || isPending}
                onClick={()=>startTransition(async()=>{
                  const status = partialAmt >= partialModal.total ? 'PAID' : 'PARTIALLY_PAID';
                  await updatePurchaseInvoiceStatus(partialModal.id, status as any, partialAmt);
                  toast.success(status==='PAID' ? 'Fully paid!' : `₹${partialAmt.toLocaleString('en-IN')} recorded`);
                  setPartialModal(null); refresh();
                })}>
                Save Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:360}}>
            <h2 style={{fontSize:16,fontWeight:800,marginBottom:12}}>Delete {selected.size} bill{selected.size>1?'s':''}?</h2>
            <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:20}}>This cannot be undone.</p>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn btn-secondary" onClick={()=>setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn btn-danger" disabled={isPending} onClick={confirmDelete}><Trash2 size={13}/> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
