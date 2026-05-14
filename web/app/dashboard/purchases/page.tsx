'use client';
import { useState, useRef, useTransition, useEffect } from 'react';
import { ShoppingCart, Upload, Plus, X, CheckCircle, Trash2, Search, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { createPurchaseInvoice, getPurchaseInvoices, updatePurchaseInvoiceStatus, deletePurchaseInvoices } from '@/lib/actions/purchases';
import { fmtDate } from '@/lib/utils';

type PurchaseInvoice = {
  id: string; vendorName: string; vendorGstin?: string | null; invoiceNo: string;
  invoiceDate: string; dueDate?: string | null; subtotal: number; gstAmount: number;
  totalAmount: number; description?: string | null; category?: string | null;
  status: string; createdAt: string;
};

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const STATUS_COLORS: Record<string, [string, string]> = {
  PENDING: ['#d97706', '#fffbeb'], APPROVED: ['#2563eb', '#eff6ff'],
  PAID: ['#059669', '#ecfdf5'], REJECTED: ['#dc2626', '#fef2f2'],
};

const CATEGORIES = ['Transport', 'Fuel', 'Office Supplies', 'Maintenance', 'Utilities', 'Salary', 'Other'];

const emptyForm = {
  vendorName: '', vendorGstin: '', invoiceNo: '', invoiceDate: new Date().toISOString().split('T')[0],
  dueDate: '', subtotal: 0, gstAmount: 0, totalAmount: 0, description: '', category: 'Transport', rawText: '',
};

export default function PurchasesPage() {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getPurchaseInvoices().then(data => setInvoices(data as PurchaseInvoice[])).catch(() => {});
  }, []);

  function refresh() {
    getPurchaseInvoices().then(data => setInvoices(data as PurchaseInvoice[])).catch(() => {});
  }

  // ── PDF/text extraction ───────────────────────────────────────────────────
  async function handleFileUpload(file: File) {
    if (!file) return;
    setExtracting(true);
    try {
      const text = await file.text();
      // Extract key fields using regex patterns
      const extracted = extractFromText(text);
      setForm(f => ({ ...f, ...extracted, rawText: text.slice(0, 2000) }));
      setShowForm(true);
      toast.success('Invoice data extracted — please review and save');
    } catch {
      toast.error('Could not read file');
    } finally { setExtracting(false); }
  }

  function extractFromText(text: string) {
    const t = text.replace(/\r/g, ' ').replace(/\s+/g, ' ');
    const result: Partial<typeof emptyForm> = {};
    // Invoice number
    const invM = t.match(/invoice\s*(?:no|number|#)[:\s]*([A-Z0-9\-\/]+)/i);
    if (invM) result.invoiceNo = invM[1].trim();
    // Date
    const dateM = t.match(/(?:invoice\s*)?date[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (dateM) {
      const parts = dateM[1].split(/[\/\-]/);
      if (parts.length === 3) {
        const y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
        result.invoiceDate = `${y}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
      }
    }
    // GSTIN
    const gstM = t.match(/GSTIN[:\s]*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})/i);
    if (gstM) result.vendorGstin = gstM[1];
    // Total amount
    const totalM = t.match(/(?:grand\s*total|total\s*amount|net\s*payable)[:\s₹]*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (totalM) result.totalAmount = parseFloat(totalM[1].replace(/,/g, ''));
    // GST
    const gstAmtM = t.match(/(?:IGST|CGST\s*\+\s*SGST|total\s*gst|tax\s*amount)[:\s₹]*([0-9,]+(?:\.[0-9]{2})?)/i);
    if (gstAmtM) result.gstAmount = parseFloat(gstAmtM[1].replace(/,/g, ''));
    if (result.totalAmount && result.gstAmount) result.subtotal = result.totalAmount - result.gstAmount;
    return result;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createPurchaseInvoice({
        ...form,
        subtotal: Number(form.subtotal), gstAmount: Number(form.gstAmount), totalAmount: Number(form.totalAmount),
        dueDate: form.dueDate || undefined, vendorGstin: form.vendorGstin || undefined,
        description: form.description || undefined, category: form.category || undefined,
        rawText: form.rawText || undefined,
      });
      if (res && 'error' in res) { toast.error('Validation error'); return; }
      toast.success('Purchase invoice saved');
      setShowForm(false); setForm(emptyForm); refresh();
    });
  }

  function toggleSelect(id: string) { setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  function confirmDelete() {
    startTransition(async () => {
      await deletePurchaseInvoices([...selected]);
      toast.success(`${selected.size} invoice${selected.size > 1 ? 's' : ''} deleted`);
      setSelected(new Set()); setShowDeleteConfirm(false); refresh();
    });
  }

  const filtered = invoices.filter(i =>
    i.vendorName.toLowerCase().includes(search.toLowerCase()) ||
    i.invoiceNo.toLowerCase().includes(search.toLowerCase())
  );

  const totalPending = invoices.filter(i => i.status === 'PENDING').reduce((s, i) => s + i.totalAmount, 0);
  const totalPaid    = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + i.totalAmount, 0);

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><ShoppingCart size={20} color="var(--accent-dark)"/> Purchase Invoices</h1>
          <p className="page-subtitle">Upload, extract and manage vendor/purchase invoices.</p>
        </div>
        <div style={{display:'flex',gap:9}}>
          {selected.size > 0 && (
            <button className="btn btn-danger btn-sm" onClick={()=>setShowDeleteConfirm(true)}><Trash2 size={12}/> Delete ({selected.size})</button>
          )}
          <input ref={fileRef} type="file" accept=".pdf,.txt,.csv" style={{display:'none'}}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value=''; }} />
          <button className="btn btn-secondary btn-sm" disabled={extracting} onClick={()=>fileRef.current?.click()}>
            <Upload size={12}/> {extracting ? 'Extracting…' : 'Upload & Extract'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowForm(true)}><Plus size={12}/> Add Manual</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
        {[
          {label:'Total Invoices', val:invoices.length, color:'var(--text-primary)'},
          {label:'Pending Amount', val:fmt(totalPending), color:'#d97706'},
          {label:'Paid Amount',    val:fmt(totalPaid),    color:'#059669'},
        ].map(s=>(
          <div key={s.label} className="card" style={{padding:'14px 18px'}}>
            <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{s.label}</div>
            <div style={{fontSize:20,fontWeight:800,fontFamily:'var(--font-mono)',color:s.color,marginTop:4}}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{position:'relative',marginBottom:14}}>
        <Search size={12} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
        <input className="input" placeholder="Search vendor or invoice no…" style={{paddingLeft:30,height:36,fontSize:12}} value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>

      {/* Table */}
      <div className="card" style={{overflow:'hidden'}}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{width:36}}></th>
                <th>Invoice No.</th><th>Vendor</th><th>GSTIN</th><th>Category</th>
                <th>Date</th><th style={{textAlign:'right'}}>Subtotal</th>
                <th style={{textAlign:'right'}}>GST</th><th style={{textAlign:'right'}}>Total</th>
                <th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>
                  <FileText size={32} style={{opacity:0.3,display:'block',margin:'0 auto 8px'}}/>
                  No purchase invoices yet. Upload a PDF or add manually.
                </td></tr>
              )}
              {filtered.map(inv => {
                const [c, bg] = STATUS_COLORS[inv.status] ?? ['#64748b','#f8fafc'];
                return (
                  <tr key={inv.id} style={{background: selected.has(inv.id) ? 'rgba(239,68,68,0.05)' : undefined}}>
                    <td style={{padding:'0 10px'}}>
                      <input type="checkbox" checked={selected.has(inv.id)} onChange={()=>toggleSelect(inv.id)}
                        style={{width:15,height:15,cursor:'pointer',accentColor:'var(--accent)'}}/>
                    </td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700}}>{inv.invoiceNo}</span></td>
                    <td style={{fontWeight:500}}>{inv.vendorName}</td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text-muted)'}}>{inv.vendorGstin||'—'}</span></td>
                    <td style={{fontSize:12}}>{inv.category||'—'}</td>
                    <td style={{fontSize:12,color:'var(--text-muted)'}}>{fmtDate(inv.invoiceDate)}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12}}>{fmt(inv.subtotal)}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text-muted)'}}>{fmt(inv.gstAmount)}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800}}>{fmt(inv.totalAmount)}</td>
                    <td>
                      <span style={{padding:'2px 9px',borderRadius:99,fontSize:10,fontWeight:600,color:c,background:bg,border:`1px solid ${c}30`,fontFamily:'var(--font-mono)',textTransform:'uppercase'}}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{display:'flex',gap:4}}>
                      {inv.status === 'PENDING' && (
                        <button className="btn btn-ghost btn-sm" style={{fontSize:11,color:'#059669'}}
                          onClick={()=>startTransition(async()=>{await updatePurchaseInvoiceStatus(inv.id,'APPROVED');refresh();})}>Approve</button>
                      )}
                      {inv.status === 'APPROVED' && (
                        <button className="btn btn-ghost btn-sm" style={{fontSize:11,color:'#2563eb'}}
                          onClick={()=>startTransition(async()=>{await updatePurchaseInvoiceStatus(inv.id,'PAID');refresh();})}>Mark Paid</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:600}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 style={{fontSize:16,fontWeight:800}}>Purchase Invoice</h2>
              <button className="btn btn-ghost btn-icon" onClick={()=>{setShowForm(false);setForm(emptyForm);}}><X size={16}/></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-row form-row-2" style={{marginBottom:12}}>
                <div className="form-group"><label className="label">Vendor Name *</label>
                  <input className="input" required value={form.vendorName} onChange={e=>setForm(f=>({...f,vendorName:e.target.value}))}/></div>
                <div className="form-group"><label className="label">Vendor GSTIN</label>
                  <input className="input" value={form.vendorGstin} onChange={e=>setForm(f=>({...f,vendorGstin:e.target.value.toUpperCase()}))} style={{fontFamily:'var(--font-mono)'}}/></div>
              </div>
              <div className="form-row form-row-3" style={{marginBottom:12}}>
                <div className="form-group"><label className="label">Invoice No. *</label>
                  <input className="input" required value={form.invoiceNo} onChange={e=>setForm(f=>({...f,invoiceNo:e.target.value}))}/></div>
                <div className="form-group"><label className="label">Invoice Date *</label>
                  <input className="input" type="date" required value={form.invoiceDate} onChange={e=>setForm(f=>({...f,invoiceDate:e.target.value}))}/></div>
                <div className="form-group"><label className="label">Due Date</label>
                  <input className="input" type="date" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))}/></div>
              </div>
              <div className="form-row form-row-3" style={{marginBottom:12}}>
                <div className="form-group"><label className="label">Subtotal (₹)</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.subtotal||''} onChange={e=>setForm(f=>({...f,subtotal:parseFloat(e.target.value)||0}))} style={{fontFamily:'var(--font-mono)'}}/></div>
                <div className="form-group"><label className="label">GST Amount (₹)</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.gstAmount||''} onChange={e=>setForm(f=>({...f,gstAmount:parseFloat(e.target.value)||0}))} style={{fontFamily:'var(--font-mono)'}}/></div>
                <div className="form-group"><label className="label">Total Amount (₹) *</label>
                  <input className="input" type="number" min="0" step="0.01" required value={form.totalAmount||''} onChange={e=>setForm(f=>({...f,totalAmount:parseFloat(e.target.value)||0}))} style={{fontFamily:'var(--font-mono)'}}/></div>
              </div>
              <div className="form-row form-row-2" style={{marginBottom:16}}>
                <div className="form-group"><label className="label">Category</label>
                  <select className="input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                    {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                  </select></div>
                <div className="form-group"><label className="label">Description</label>
                  <input className="input" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={()=>{setShowForm(false);setForm(emptyForm);}}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}><CheckCircle size={13}/> Save Invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:360}}>
            <h2 style={{fontSize:16,fontWeight:800,marginBottom:12}}>Delete {selected.size} invoice{selected.size>1?'s':''}?</h2>
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
