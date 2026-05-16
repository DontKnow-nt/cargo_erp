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
  category?: string | null; status: string;
};

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const CATEGORIES = ['Transport', 'Fuel', 'Office Supplies', 'Maintenance', 'Utilities', 'Salary', 'Other'];
const emptyForm = {
  vendorName: '', invoiceNo: '', invoiceDate: new Date().toISOString().split('T')[0],
  dueDate: '', totalAmount: 0, subtotal: 0, gstAmount: 0, description: '', category: 'Transport',
};

export default function PurchasesPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    getPurchaseInvoices().then(d => setBills(d as unknown as Bill[])).catch(() => {});
  }
  useEffect(() => { refresh(); }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vendorName || !form.invoiceNo || form.totalAmount <= 0) { toast.error('Fill required fields'); return; }
    startTransition(async () => {
      const res = await createPurchaseInvoice({
        vendorName: form.vendorName, invoiceNo: form.invoiceNo,
        invoiceDate: form.invoiceDate, dueDate: form.dueDate || undefined,
        subtotal: form.totalAmount, gstAmount: 0, totalAmount: form.totalAmount,
        description: form.description || undefined, category: form.category || undefined,
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
                <th style={{textAlign:'right'}}>Amount</th>
                <th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No bills yet. Click "Add Bill" to get started.</td></tr>
              )}
              {filtered.map(bill => {
                const paid = bill.status === 'PAID';
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
                    <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800,color: paid ? '#059669' : '#dc2626'}}>{fmt(bill.totalAmount)}</td>
                    <td>
                      <span style={{padding:'2px 9px',borderRadius:99,fontSize:10,fontWeight:600,
                        color: paid ? '#059669' : '#d97706',
                        background: paid ? '#ecfdf5' : '#fffbeb',
                        border: `1px solid ${paid ? '#6ee7b7' : '#fcd34d'}`,
                        fontFamily:'var(--font-mono)',textTransform:'uppercase'}}>
                        {paid ? 'PAID' : 'PENDING'}
                      </span>
                    </td>
                    <td>
                      {!paid && (
                        <button className="btn btn-ghost btn-sm" style={{fontSize:11,color:'#059669',whiteSpace:'nowrap'}}
                          onClick={()=>markPaid(bill.id)}>
                          <CheckCircle size={11}/> Mark Paid
                        </button>
                      )}
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
          <div className="modal-box" style={{maxWidth:500}}>
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
                <div className="form-group">
                  <label className="label">Bill Date *</label>
                  <input className="input" type="date" required value={form.invoiceDate} onChange={e=>setForm(f=>({...f,invoiceDate:e.target.value}))}/>
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
              <div className="form-row form-row-2" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Amount (₹) *</label>
                  <input className="input" type="number" min="0.01" step="0.01" required value={form.totalAmount||''} onChange={e=>setForm(f=>({...f,totalAmount:parseFloat(e.target.value)||0}))} style={{fontFamily:'var(--font-mono)'}}/>
                </div>
                <div className="form-group">
                  <label className="label">Description</label>
                  <input className="input" placeholder="What is this bill for?" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
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
