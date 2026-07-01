'use client';
import { useState, useTransition, useDeferredValue, useMemo } from 'react';
import { CreditCard, Plus, Search, Download, X, CheckCircle, Edit2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { addPaymentReceipt, updatePaymentReceipt, deletePaymentReceipts } from '@/lib/actions/payments';
import { useSharedData } from '@/lib/useSharedData';
import { LiveIndicator } from '@/components/LiveIndicator';
import { exportToCSV, exportToPDF } from '@/lib/exportUtils';

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MODES = ['CASH','CHEQUE','BANK_TRANSFER','UPI','NEFT','RTGS'] as const;

type FormState = { partyId:string; invoiceId:string; paymentDate:string; paymentAmount:number; paymentMode:typeof MODES[number]; referenceNo:string; bankName:string; remarks:string };
const initForm = (): FormState => ({ partyId:'', invoiceId:'', paymentDate:new Date().toISOString().split('T')[0], paymentAmount:0, paymentMode:'NEFT', referenceNo:'', bankName:'', remarks:'' });

export default function PaymentsPage() {
  const { paymentReceipts, invoices, parties, refresh, mutate } = useSharedData();
  const [isPending, startTransition] = useTransition();

  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editId, setEditId]     = useState<string|null>(null);
  const [search, setSearch]     = useState('');
  const deferredSearch = useDeferredValue(search);
  const [form, setForm]         = useState<FormState>(initForm());

  const selParty      = parties.find(p => p.id === form.partyId);
  const partyInvoices = useMemo(() => invoices.filter(i => i.partyId === form.partyId && ['DRAFT','FINALIZED','SENT','PARTIALLY_PAID','OVERDUE'].includes(i.status)), [form.partyId, invoices]);
  const selInvoice    = invoices.find(i => i.id === form.invoiceId);

  function openAdd() { setForm(initForm()); setEditId(null); setShowForm(true); }
  function openEdit(r: typeof paymentReceipts[0]) {
    setForm({ partyId:r.partyId, invoiceId:r.invoiceId, paymentDate:r.paymentDate, paymentAmount:r.paymentAmount, paymentMode:(r.paymentMode ?? 'NEFT') as typeof MODES[number], referenceNo:r.referenceNo??'', bankName:r.bankName??'', remarks:r.remarks??'' });
    setEditId(r.id); setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.partyId || form.paymentAmount <= 0) { toast.error('Fill all required fields'); return; }
    startTransition(async () => {
      if (editId) {
        const res = await updatePaymentReceipt(editId, form);
        if (res && 'error' in res) { toast.error(res.error as string); return; }
        mutate(current => ({
          ...current,
          paymentReceipts: current.paymentReceipts.map(r => r.id === editId ? {
            ...r,
            paymentDate: form.paymentDate,
            paymentAmount: form.paymentAmount,
            freightComponent: form.paymentAmount,
            paymentMode: form.paymentMode,
            referenceNo: form.referenceNo || null,
            bankName: form.bankName || null,
            remarks: form.remarks || null,
          } : r),
        }));
        toast.success('Payment updated');
      } else {
        const autoInv = [...partyInvoices].sort((a,b) => (b.outstandingTotal||0) - (a.outstandingTotal||0))[0];
        const invoiceId = form.invoiceId || autoInv?.id || '';
        const invoiceNo = form.invoiceId ? (selInvoice?.invoiceNo||'') : (autoInv?.invoiceNo||'MANUAL');
        const res = await addPaymentReceipt({
          partyId:form.partyId, partyName:selParty?.partyName||'',
          invoiceId,
          invoiceNo,
          paymentDate:form.paymentDate, paymentAmount:form.paymentAmount,
          freightComponent:form.paymentAmount, gstComponent:0,
          paymentMode:form.paymentMode as 'CASH'|'CHEQUE'|'BANK_TRANSFER'|'NEFT'|'RTGS'|'UPI'|'OTHER',
          referenceNo:form.referenceNo, bankName:form.bankName, notes:form.remarks,
        });
        if (res && 'error' in res) { toast.error(res.error as string); return; }
        const receiptId = res && 'receiptId' in res ? res.receiptId : `pending-${Date.now()}`;
        const receiptNo = res && 'receiptNo' in res ? res.receiptNo : 'Saving...';
        mutate(current => ({
          ...current,
          paymentReceipts: [{
            id: receiptId,
            receiptNo,
            partyId: form.partyId,
            partyName: selParty?.partyName || '',
            invoiceId,
            invoiceNo,
            paymentDate: form.paymentDate,
            paymentAmount: form.paymentAmount,
            freightComponent: form.paymentAmount,
            gstComponent: 0,
            paymentMode: form.paymentMode,
            referenceNo: form.referenceNo || null,
            bankName: form.bankName || null,
            remarks: form.remarks || null,
            status: 'CONFIRMED',
            createdAt: new Date().toISOString(),
          }, ...current.paymentReceipts],
          invoices: current.invoices.map(inv => {
            if (inv.id !== invoiceId) return inv;
            const paidTotal = inv.paidTotal + form.paymentAmount;
            const outstandingTotal = Math.max(0, inv.grandTotal - paidTotal);
            return {
              ...inv,
              paidTotal,
              outstandingTotal,
              status: outstandingTotal === 0 ? 'PAID' : 'PARTIALLY_PAID',
            };
          }),
        }));
        toast.success('Payment receipt recorded');
      }
      setShowForm(false); setForm(initForm()); setEditId(null); refresh();
    });
  }

  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    if (!term) return paymentReceipts;
    return paymentReceipts.filter(r =>
      r.receiptNo.toLowerCase().includes(term) ||
      r.partyName.toLowerCase().includes(term) ||
      r.invoiceNo.toLowerCase().includes(term)
    );
  }, [deferredSearch, paymentReceipts]);

  function handleExport(type: 'csv' | 'pdf') {
    const rows = filtered.map(r => ({
      'Receipt No': r.receiptNo,
      'Party': r.partyName,
      'Invoice': r.invoiceNo,
      'Date': r.paymentDate,
      'Mode': r.paymentMode ?? '',
      'Reference': r.referenceNo ?? '',
      'Amount (₹)': r.paymentAmount.toFixed(2),
      'Freight (₹)': r.freightComponent.toFixed(2),
      'GST (₹)': r.gstComponent.toFixed(2),
      'Status': r.status,
    }));
    if (type === 'csv') exportToCSV(rows, 'payment_receipts');
    else exportToPDF('Payment Receipts', rows, 'payment_receipts');
  }

  return (
    <div className="animate-fadeIn">
      <div style={{ display:'flex', justifyContent:'flex-end', gap:9, marginBottom:14, alignItems:'center' }}>
        <LiveIndicator onRefresh={refresh} />
        {selected.size > 0 && (
          <button className="btn btn-danger btn-sm" onClick={()=>setShowDeleteConfirm(true)}><Trash2 size={12}/> Delete ({selected.size})</button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => handleExport('csv')}><Download size={12}/> CSV</button>
        <button className="btn btn-secondary btn-sm" onClick={() => handleExport('pdf')}><Download size={12}/> PDF</button>
        <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={12}/> Record Payment</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
        {[
          { label:'Total Receipts', val:paymentReceipts.length, color:'#2563eb' },
          { label:'Total Collected', val:`₹${(paymentReceipts.filter(r=>r.status==='CONFIRMED').reduce((s,r)=>s+r.paymentAmount,0)/1000).toFixed(1)}K`, color:'#059669' },
          { label:'Total GST Received', val:`₹${(paymentReceipts.reduce((s,r)=>s+r.gstComponent,0)/1000).toFixed(1)}K`, color:'#7c3aed' },
        ].map(s=>(
          <div key={s.label} style={{background:'var(--surface-base)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontSize:12,color:'var(--text-secondary)'}}>{s.label}</div>
            <div style={{fontSize:18,fontWeight:800,fontFamily:'var(--font-mono)',color:s.color}}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{position:'relative',marginBottom:14}}>
        <Search size={12} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
        <input className="input" placeholder="Search receipt no., party, invoice…" style={{paddingLeft:30,height:36,fontSize:12}} value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{width:36}}><input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={()=>selected.size===filtered.length?setSelected(new Set()):setSelected(new Set(filtered.map(r=>r.id)))} style={{width:15,height:15,cursor:'pointer',accentColor:'var(--accent)'}}/></th>
                <th>Receipt No.</th><th>Party</th><th>Invoice</th><th>Date</th><th>Mode</th>
                <th>Reference</th><th style={{textAlign:'right'}}>Amount</th>
                <th style={{textAlign:'right'}}>Freight</th><th style={{textAlign:'right'}}>GST</th>
                <th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length===0&&<tr><td colSpan={12} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No payment receipts</td></tr>}
              {filtered.map(r=>(
                <tr key={r.id} style={{background:selected.has(r.id)?'rgba(239,68,68,0.05)':undefined}}>
                  <td style={{padding:'0 10px'}}><input type="checkbox" checked={selected.has(r.id)} onChange={()=>setSelected(s=>{const n=new Set(s);n.has(r.id)?n.delete(r.id):n.add(r.id);return n;})} style={{width:15,height:15,cursor:'pointer',accentColor:'var(--accent)'}}/></td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700}}>{r.receiptNo}</span></td>
                  <td style={{fontWeight:500}}>{r.partyName}</td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--accent-dark)'}}>{r.invoiceNo}</span></td>
                  <td style={{fontSize:12,color:'var(--text-muted)'}}>{r.paymentDate}</td>
                  <td><span style={{fontSize:10,fontFamily:'var(--font-mono)',background:'var(--surface-sunken)',padding:'2px 7px',borderRadius:5,border:'1px solid var(--border)'}}>{r.paymentMode}</span></td>
                  <td style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{r.referenceNo||'—'}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800,color:'#059669'}}>{fmt(r.paymentAmount)}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12}}>{fmt(r.freightComponent)}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text-muted)'}}>{fmt(r.gstComponent)}</td>
                  <td><span style={{fontSize:10,fontWeight:600,fontFamily:'var(--font-mono)',color:'#059669',background:'#ecfdf5',border:'1px solid #6ee7b7',padding:'2px 8px',borderRadius:99}}>{r.status}</span></td>
                  <td style={{display:'flex',gap:4}}>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px'}} onClick={()=>openEdit(r)}><Edit2 size={11}/> Edit</button>
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 6px',color:'#dc2626'}} title="Delete" onClick={()=>{setSelected(new Set([r.id]));setShowDeleteConfirm(true);}}><Trash2 size={11}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:560}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 style={{fontSize:16,fontWeight:800}}>{editId ? 'Edit Payment Receipt' : 'Record Payment Receipt'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={()=>{setShowForm(false);setForm(initForm());setEditId(null);}}><X size={16}/></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-row form-row-2" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Party *</label>
                  <select className="input" value={form.partyId} onChange={e=>setForm(f=>({...f,partyId:e.target.value,invoiceId:''}))} required disabled={!!editId}>
                    <option value="">Select party…</option>
                    {parties.filter(p=>p.status==='ACTIVE').map(p=><option key={p.id} value={p.id}>{p.partyName}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Payment Amount (₹) *</label>
                  <input className="input" type="number" min="0.01" step="0.01" value={form.paymentAmount||''} onChange={e=>setForm(f=>({...f,paymentAmount:parseFloat(e.target.value)||0}))} style={{fontFamily:'var(--font-mono)'}} required/>
                </div>
              </div>
              <div className="form-row form-row-2" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Payment Date</label>
                  <input className="input" type="date" value={form.paymentDate} onChange={e=>setForm(f=>({...f,paymentDate:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="label">Payment Mode</label>
                  <select className="input" value={form.paymentMode} onChange={e=>setForm(f=>({...f,paymentMode:e.target.value as typeof form.paymentMode}))}>
                    {MODES.map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row form-row-2" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Reference No.</label>
                  <input className="input" placeholder="NEFT/RTGS/Cheque no." value={form.referenceNo} onChange={e=>setForm(f=>({...f,referenceNo:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="label">Bank Name</label>
                  <input className="input" placeholder="e.g. HDFC Bank" value={form.bankName} onChange={e=>setForm(f=>({...f,bankName:e.target.value}))}/>
                </div>
              </div>
              <div className="form-group" style={{marginBottom:16}}>
                <label className="label">Remarks</label>
                <input className="input" value={form.remarks} onChange={e=>setForm(f=>({...f,remarks:e.target.value}))} placeholder="Optional remarks"/>
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={()=>{setShowForm(false);setForm(initForm());setEditId(null);}}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}><CheckCircle size={13}/> {editId ? 'Update Receipt' : 'Save Receipt'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:380}}>
            <div style={{textAlign:'center',padding:'8px 0 20px'}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'#fef2f2',border:'2px solid #fca5a5',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
                <Trash2 size={22} color="#dc2626"/>
              </div>
              <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>Delete {selected.size} Receipt{selected.size>1?'s':''}?</div>
              <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:20}}>This cannot be undone.</div>
              <div style={{display:'flex',gap:10,justifyContent:'center'}}>
                <button className="btn btn-secondary" onClick={()=>{setShowDeleteConfirm(false);setSelected(new Set());}}>Cancel</button>
                <button className="btn btn-danger" disabled={isPending} onClick={()=>startTransition(async()=>{
                  await deletePaymentReceipts([...selected]);
                  toast.success(`${selected.size} receipt${selected.size>1?'s':''} deleted`);
                  setSelected(new Set()); setShowDeleteConfirm(false); refresh();
                })}><Trash2 size={13}/> Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
