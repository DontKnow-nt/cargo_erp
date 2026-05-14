'use client';
import { useState, useTransition } from 'react';
import { CreditCard, Plus, Search, Download, X, CheckCircle } from 'lucide-react';
import { useStore } from '@/lib/store';
import toast from 'react-hot-toast';
import { addPaymentReceipt } from '@/lib/actions/payments';
import { useSharedData } from '@/lib/useSharedData';
import { LiveIndicator } from '@/components/LiveIndicator';

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MODES = ['CASH','CHEQUE','BANK_TRANSFER','UPI','NEFT','RTGS'] as const;

export default function PaymentsPage() {
  const { paymentReceipts, invoices, parties, refresh } = useSharedData();
  const [isPending, startTransition] = useTransition();

  const [showForm, setShowForm] = useState(false);
  const [search, setSearch]     = useState('');

  const init = { partyId:'', invoiceId:'', paymentDate:new Date().toISOString().split('T')[0], paymentAmount:0, paymentMode:'NEFT' as const, referenceNo:'', bankName:'', remarks:'' };
  const [form, setForm] = useState(init);

  const selParty    = parties.find(p => p.id===form.partyId);
  const partyInvoices = invoices.filter(i => i.partyId===form.partyId && ['FINALIZED','SENT','PARTIALLY_PAID','OVERDUE'].includes(i.status));
  const selInvoice  = invoices.find(i => i.id===form.invoiceId);
  const maxPayable  = selInvoice ? selInvoice.outstandingTotal : 0;

  const gstFrac  = selInvoice ? selInvoice.gstTotal / selInvoice.grandTotal : 0;
  const gstComp  = form.paymentAmount * gstFrac;
  const freightComp = form.paymentAmount - gstComp;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.partyId || !form.invoiceId || form.paymentAmount <= 0) { toast.error('Fill all required fields'); return; }
    if (form.paymentAmount > maxPayable) { toast.error(`Max payable is ${fmt(maxPayable)}`); return; }
    startTransition(async () => {
      const res = await addPaymentReceipt({
        partyId:form.partyId, partyName:selParty?.partyName||'',
        invoiceId:form.invoiceId, invoiceNo:selInvoice?.invoiceNo||'',
        paymentDate:form.paymentDate, paymentAmount:form.paymentAmount,
        freightComponent:freightComp, gstComponent:gstComp,
        paymentMode:form.paymentMode as 'CASH'|'CHEQUE'|'BANK_TRANSFER'|'NEFT'|'RTGS'|'UPI'|'OTHER',
        referenceNo:form.referenceNo,
        bankName:form.bankName,
        notes:form.remarks,
      });
      if (res && 'error' in res) { toast.error('Validation error'); return; }
      toast.success('Payment receipt recorded');
      setShowForm(false); setForm(init);
      refresh();
    });
  }

  const filtered = paymentReceipts.filter(r =>
    r.receiptNo.toLowerCase().includes(search.toLowerCase()) ||
    r.partyName.toLowerCase().includes(search.toLowerCase()) ||
    r.invoiceNo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fadeIn">
      {/* Toolbar */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:9, marginBottom:14, alignItems:'center' }}>
        <LiveIndicator onRefresh={refresh} />
        <button className="btn btn-secondary btn-sm"><Download size={12}/> Export</button>
        <button className="btn btn-primary btn-sm" onClick={()=>setShowForm(true)}><Plus size={12}/> Record Payment</button>
      </div>

      {/* Stats */}
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
                <th>Receipt No.</th><th>Party</th><th>Invoice</th><th>Date</th><th>Mode</th>
                <th>Reference</th><th style={{textAlign:'right'}}>Amount</th>
                <th style={{textAlign:'right'}}>Freight</th><th style={{textAlign:'right'}}>GST</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length===0&&<tr><td colSpan={10} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No payment receipts</td></tr>}
              {filtered.map(r=>(
                <tr key={r.id}>
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
              <h2 style={{fontSize:16,fontWeight:800}}>Record Payment Receipt</h2>
              <button className="btn btn-ghost btn-icon" onClick={()=>{setShowForm(false);setForm(init);}}><X size={16}/></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-row form-row-2" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Party *</label>
                  <select className="input" value={form.partyId} onChange={e=>setForm(f=>({...f,partyId:e.target.value,invoiceId:''}))} required>
                    <option value="">Select party…</option>
                    {parties.filter(p=>p.status==='ACTIVE').map(p=><option key={p.id} value={p.id}>{p.partyName}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Invoice *</label>
                  <select className="input" value={form.invoiceId} onChange={e=>setForm(f=>({...f,invoiceId:e.target.value,paymentAmount:0}))} required disabled={!form.partyId}>
                    <option value="">Select invoice…</option>
                    {partyInvoices.map(i=><option key={i.id} value={i.id}>{i.invoiceNo} · Outstanding: ₹{i.outstandingTotal.toLocaleString('en-IN')}</option>)}
                  </select>
                  {form.partyId&&partyInvoices.length===0&&<div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>No payable invoices for this party</div>}
                </div>
              </div>

              {selInvoice && (
                <div style={{background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:8,padding:'10px 14px',marginBottom:12,fontSize:12,color:'var(--info)'}}>
                  Invoice Total: <strong>{fmt(selInvoice.grandTotal)}</strong> · Paid: <strong>{fmt(selInvoice.paidTotal)}</strong> · <strong style={{color:'#dc2626'}}>Outstanding: {fmt(selInvoice.outstandingTotal)}</strong>
                </div>
              )}

              <div className="form-row form-row-2" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Payment Amount (₹) *</label>
                  <input className="input" type="number" min="0.01" step="0.01" max={maxPayable} value={form.paymentAmount||''} onChange={e=>setForm(f=>({...f,paymentAmount:parseFloat(e.target.value)||0}))} style={{fontFamily:'var(--font-mono)'}} required/>
                  {maxPayable>0&&<div style={{fontSize:10,color:'var(--text-muted)',marginTop:3}}>Max: {fmt(maxPayable)}</div>}
                </div>
                <div className="form-group">
                  <label className="label">Payment Date</label>
                  <input className="input" type="date" value={form.paymentDate} onChange={e=>setForm(f=>({...f,paymentDate:e.target.value}))}/>
                </div>
              </div>

              <div className="form-row form-row-2" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Payment Mode</label>
                  <select className="input" value={form.paymentMode} onChange={e=>setForm(f=>({...f,paymentMode:e.target.value as typeof form.paymentMode}))}>
                    {MODES.map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Reference No.</label>
                  <input className="input" placeholder="NEFT/RTGS/Cheque no." value={form.referenceNo} onChange={e=>setForm(f=>({...f,referenceNo:e.target.value}))}/>
                </div>
              </div>

              <div className="form-row form-row-2" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Bank Name</label>
                  <input className="input" placeholder="e.g. HDFC Bank" value={form.bankName} onChange={e=>setForm(f=>({...f,bankName:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="label">Remarks</label>
                  <input className="input" value={form.remarks} onChange={e=>setForm(f=>({...f,remarks:e.target.value}))}/>
                </div>
              </div>

              {form.paymentAmount>0&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
                  {[
                    {label:'Total Payment',val:fmt(form.paymentAmount),hi:true},
                    {label:'Freight Component',val:fmt(freightComp)},
                    {label:'GST Component',val:fmt(gstComp)},
                  ].map(s=>(
                    <div key={s.label} style={{padding:'9px 12px',background:s.hi?'var(--success-bg)':'var(--surface-sunken)',border:`1px solid ${s.hi?'var(--success-border)':'var(--border)'}`,borderRadius:8}}>
                      <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{s.label}</div>
                      <div style={{fontSize:14,fontWeight:800,fontFamily:'var(--font-mono)',color:s.hi?'#059669':'var(--text-primary)'}}>{s.val}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={()=>{setShowForm(false);setForm(init);}}>Cancel</button>
                <button type="submit" className="btn btn-primary"><CheckCircle size={13}/> Save Receipt</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
