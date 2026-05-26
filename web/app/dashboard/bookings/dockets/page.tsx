'use client';
import React, { useState, useRef, useCallback, useTransition, useEffect } from 'react';
import { ClipboardList, Plus, Search, Download, X, CheckCircle, Edit2, Save, Trash2, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { exportToCSV, exportToXLSX, exportToPDF, filterByDateRange, DateRangeFilter, type DateRange, type ExportFormat } from '@/lib/exportUtils';
import { createAwbBooking, createDocketBooking, deleteAwbBookings, deleteDocketBookings, linkAwbToDocket, unlinkAwbFromDocket, updateDocketBooking } from '@/lib/actions/bookings';
import { generateInvoiceFromDocket, generateCombinedInvoice } from '@/lib/actions/invoices';
import { shortName, fmtDate } from '@/lib/utils';
import { CreatorAvatar } from '@/components/CreatorAvatar';
import { useSharedData } from '@/lib/useSharedData';
import { LiveIndicator } from '@/components/LiveIndicator';
import RecordActivityAvatars from '@/components/RecordActivityAvatars';
import { AddPartyModal } from '@/components/AddPartyModal';

const CITIES = ['DEL','BOM','BLR','HYD','MAA','CCU','AMD','COK','JAI','PNQ','PNE','SXR'];
const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function Badge({ status }: { status: string }) {
  const m: Record<string,[string,string]> = {
    BOOKED:['#2563eb','#eff6ff'], INVOICED:['#059669','#ecfdf5'], CANCELLED:['#dc2626','#fef2f2'],
  };
  const [c,bg] = m[status]||['#64748b','#f8fafc'];
  return <span style={{padding:'2px 9px',borderRadius:99,fontSize:10,fontWeight:600,color:c,background:bg,border:`1px solid ${c}30`,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{status}</span>;
}

export default function DocketBookingsPage() {
  const { docketBookings, parties, awbBookings, outstanding, auditLogs, users, refresh } = useSharedData();
  const [isPending, startTransition] = useTransition();

  const [showForm, setShowForm]   = useState(false);
  const [showBulk, setShowBulk]   = useState(false);
  const [showAddParty, setShowAddParty] = useState(false);
  const [canInvoice, setCanInvoice] = useState(false);
  useEffect(() => {
    fetch('/api/user-permissions').then(r => r.json()).then(d => {
      const pages: string[] = d.pages ?? [];
      setCanInvoice(pages.includes('invoices') || pages.includes('dashboard'));
    }).catch(() => setCanInvoice(false));
  }, []);
  const [connectAwbDocket, setConnectAwbDocket] = useState<typeof docketBookings[0]|null>(null);
  const [editingId, setEditingId]   = useState<string|null>(null);
  const [editForm, setEditForm]     = useState<Partial<typeof docketBookings[0]>>({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('ALL');
  const [partyFilter, setPartyFilter] = useState('ALL');
  const [linkFilter, setLinkFilter] = useState<'ALL' | 'LINKED' | 'UNLINKED'>('ALL');
  const [dateRange, setDateRange] = useState<DateRange>('all');

  // ── Multi-select / delete state ──────────────────────────────────────────
  const [selectMode, setSelectMode]         = useState(false);
  const [selected, setSelected]             = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  const enterSelectMode = useCallback(() => { setSelectMode(true); }, []);
  function handleRowPointerDown(id: string) {
    longPressTimer.current = setTimeout(() => { enterSelectMode(); setSelected(new Set([id])); }, 500);
  }
  function handleRowPointerUp() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }
  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSelectAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(b => b.id)));
  }
  function exitSelectMode() { setSelectMode(false); setSelected(new Set()); }
  function confirmDelete() {
    const deletedIds = new Set(selected);
    exitSelectMode(); setShowDeleteConfirm(false);
    toast.success(`${deletedIds.size} docket${deletedIds.size > 1 ? 's' : ''} deleted`);
    startTransition(async () => {
      await deleteDocketBookings([...deletedIds]);
      refresh();
    });
  }

  const init = { docketNo:'', partyId:'', bookingDate:new Date().toISOString().split('T')[0], origin:'', destination:'', description:'', weight:0, rateFittedAmount:0, markupAmount:0, gstRate:0, dueDatePolicy:30, notes:'', wayBillNo:'', consignee:'', value:0, methodOfPacking:'', shipperId:'', consigneePartyId:'' };
  const [form, setForm] = useState(init);
  // Rate per kg (UI-only, not persisted — freight = weight × rate)
  const [newDocketRate, setNewDocketRate] = useState<number>(0);
  // GST manual override: when user types a custom GST amount, gstManualMode = true
  const [gstManualMode, setGstManualMode] = useState(false);
  const [gstAmountInput, setGstAmountInput] = useState('');

  const activeParties = parties.filter(p => p.status==='ACTIVE');
  const selParty      = parties.find(p => p.id===form.partyId);
  // Auto-calculated GST based on percentage
  const gstAutoAmount  = parseFloat(((form.rateFittedAmount + form.markupAmount) * form.gstRate / 100).toFixed(2));
  // If in manual mode, use the typed value; otherwise use auto
  const gstAmount      = gstManualMode ? (parseFloat(gstAmountInput) || 0) : gstAutoAmount;
  const totalAmount    = form.rateFittedAmount + form.markupAmount + gstAmount;

  const checkCreditLimit = useCallback((partyId: string, newAmount: number) => {
    const party = parties.find(p => p.id === partyId);
    if (!party || party.creditLimit === 0) return { allowed: true, warning: false, message: '' };
    const used = outstanding.filter(o => o.partyId === partyId && o.outstandingAmount > 0).reduce((sum, item) => sum + item.outstandingAmount, 0);
    const projected = used + newAmount;
    if (projected > party.creditLimit) return { allowed: false, warning: true, message: `Credit limit ₹${party.creditLimit.toLocaleString('en-IN')} exceeded! Currently used: ₹${used.toLocaleString('en-IN')}` };
    if (projected > party.creditLimit * 0.8) return { allowed: true, warning: true, message: `Warning: 80%+ of credit limit used. ₹${used.toLocaleString('en-IN')} / ₹${party.creditLimit.toLocaleString('en-IN')}` };
    return { allowed: true, warning: false, message: '' };
  }, [outstanding, parties]);

  function startEdit(b: typeof docketBookings[0]) {
    setEditingId(b.id);
    setEditForm({
      docketNo: b.docketNo,
      partyId: b.partyId,
      bookingDate: b.bookingDate,
      origin: b.origin,
      destination: b.destination,
      description: b.description,
      weight: b.weight,
      rateFittedAmount: b.rateFittedAmount,
      markupAmount: b.markupAmount,
      gstRate: b.gstRate,
      dueDatePolicy: b.dueDatePolicy,
      notes: b.notes,
      pieces: b.pieces,
      wayBillNo: b.wayBillNo,
      consignee: b.consignee,
      value: b.value,
      methodOfPacking: b.methodOfPacking,
    });
    setShowEditModal(true);
  }

  function saveEdit(id: string) {
    const rate = editForm.rateFittedAmount||0; const markup = editForm.markupAmount||0;
    const gst = editForm.gstRate||18; const gstAmt = (rate+markup)*gst/100;
    startTransition(async () => {
      await updateDocketBooking(id, { ...editForm, gstAmount:gstAmt, totalAmount:rate+markup+gstAmt });
      setEditingId(null); setShowEditModal(false); toast.success('Docket updated');
    });
  }

  function handleExport(fmt: 'csv'|'xlsx'|'pdf') {
    const data = filtered.map(b => ({ 'Docket No':b.docketNo, Party:b.partyName, Route:b.origin&&b.destination?`${b.origin}→${b.destination}`:'—', Description:b.description||'', Date:fmtDate(b.bookingDate), 'Rate(₹)':b.rateFittedAmount, 'Markup(₹)':b.markupAmount, 'GST(₹)':b.gstAmount.toFixed(2), 'Total(₹)':b.totalAmount.toFixed(2), Status:b.status }));
    const fname = `docket_bookings_${dateRange}`;
    if(fmt==='csv') exportToCSV(data,fname);
    else if(fmt==='xlsx') exportToXLSX(data,fname);
    else exportToPDF('Docket Bookings Report',data,fname);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.docketNo || !form.partyId) {
      toast.error('Fill all required fields'); return;
    }
    // Save any new custom cities to localStorage
    if (typeof window !== 'undefined') {
      const saved: string[] = JSON.parse(localStorage.getItem('customCities') || '[]');
      const updated = [...new Set([...saved, ...[form.origin, form.destination].filter(c => c && !CITIES.includes(c))])];
      localStorage.setItem('customCities', JSON.stringify(updated));
    }
    const ck = checkCreditLimit(form.partyId, totalAmount);
    if (!ck.allowed) { toast.error(ck.message); return; }
    if (ck.warning) toast(ck.message,{icon:'⚠️'});
    startTransition(async () => {
      const res = await createDocketBooking({
        docketNo:form.docketNo, partyId:form.partyId, partyName:selParty?.partyName||'',
        bookingDate:form.bookingDate, origin:form.origin, destination:form.destination,
        description:form.description, weight:form.weight, rateFittedAmount:form.rateFittedAmount, markupAmount:form.markupAmount,
        gstRate:form.gstRate, gstAmount, totalAmount, dueDatePolicy:form.dueDatePolicy, status:'BOOKED', notes:form.notes,
        wayBillNo:form.wayBillNo||undefined, consignee:form.consignee||undefined, value:form.value||undefined, methodOfPacking:form.methodOfPacking||undefined, pieces:(form as any).pieces||1,
      });
      if (res && 'error' in res) { toast.error('Validation error'); return; }
      toast.success(`Docket ${form.docketNo} saved`);
      setShowForm(false); setForm(init);
      refresh();
    });
  }

  const rangeFiltered = filterByDateRange(docketBookings, 'bookingDate', dateRange);
  const filtered = rangeFiltered.filter(b =>
    (b.docketNo.toLowerCase().includes(search.toLowerCase()) || b.partyName.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter==='ALL' || b.status===statusFilter) &&
    (partyFilter==='ALL' || b.partyName===partyFilter) &&
    (linkFilter === 'ALL' || (linkFilter === 'LINKED' ? Boolean(b.linkedAwbId) : !b.linkedAwbId))
  );

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}>
            <ClipboardList size={20} color="var(--accent-dark)"/> Docket Bookings
          </h1>
          <p className="page-subtitle">House-level docket / LR bookings. Invoice date = generation date.</p>
        </div>
        <div style={{display:'flex',gap:9,alignItems:'center'}}>
          <LiveIndicator onRefresh={refresh} />
          {selectMode ? (
            <>
              <span style={{fontSize:12,color:'var(--text-secondary)',alignSelf:'center',fontWeight:600}}>{selected.size} selected</span>
              <button className="btn btn-secondary btn-sm" onClick={exitSelectMode}>Cancel</button>
              <button className="btn btn-danger btn-sm" disabled={selected.size===0} onClick={()=>setShowDeleteConfirm(true)}>
                <Trash2 size={12}/> Delete ({selected.size})
              </button>
              {canInvoice && selected.size >= 2 && (
                <button className="btn btn-sm" style={{background:'#059669',color:'#fff',border:'none',whiteSpace:'nowrap'}}
                  disabled={isPending}
                  onClick={()=>startTransition(async()=>{
                    const res = await generateCombinedInvoice([], [...selected]);
                    if (res && 'error' in res) toast.error(res.error as string);
                    else { toast.success(`Combined invoice ${(res as any).invoiceNo} created`); exitSelectMode(); refresh(); }
                  })}>
                  🔗 Combine Invoice ({selected.size})
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={()=>handleExport('csv')}><Download size={12}/> CSV</button>
              <button className="btn btn-secondary btn-sm" onClick={()=>handleExport('xlsx')}><Download size={12}/> XLSX</button>
              <button className="btn btn-secondary btn-sm" onClick={()=>handleExport('pdf')}><Download size={12}/> PDF</button>
              <button className="btn btn-secondary btn-sm" onClick={()=>setShowBulk(true)}>Bulk Download</button>
              <button className="btn btn-secondary btn-sm" style={{color:'#7c3aed',borderColor:'#7c3aed'}} onClick={()=>window.open('/dashboard/bookings/dockets/way-bill','_blank')}><FileText size={12}/> Way Bill</button>
              <button className="btn btn-primary btn-sm" onClick={()=>setShowForm(true)}><Plus size={12}/> New Docket</button>
            </>
          )}
        </div>
      </div>

      {/* Date Range */}
      <div style={{marginBottom:12,overflowX:'auto'}}><DateRangeFilter value={dateRange} onChange={setDateRange}/></div>

      <div style={{display:'flex',gap:10,marginBottom:14}}>
        <div style={{position:'relative',flex:1}}>
          <Search size={12} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
          <input className="input" placeholder="Search docket no. or party…" style={{paddingLeft:30,height:36,fontSize:12}} value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="input" style={{width:150,height:36,fontSize:12}} value={statusFilter} onChange={e=>setStatus(e.target.value)}>
          <option value="ALL">All Status</option>
          <option value="BOOKED">Booked</option>
          <option value="INVOICED">Invoiced</option>
        </select>
        <select className="input" style={{width:180,height:36,fontSize:12}} value={partyFilter} onChange={e=>setPartyFilter(e.target.value)}>
          <option value="ALL">All Companies</option>
          {[...new Set(docketBookings.map(b=>b.partyName))].sort().map(n=>(
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <select className="input" style={{width:150,height:36,fontSize:12}} value={linkFilter} onChange={e=>setLinkFilter(e.target.value as 'ALL' | 'LINKED' | 'UNLINKED')}>
          <option value="ALL">All Link States</option>
          <option value="LINKED">Linked</option>
          <option value="UNLINKED">Unlinked</option>
        </select>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {selectMode && (
                  <th style={{width:36,padding:'9px 10px'}}>
                    <input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={toggleSelectAll}
                      style={{width:15,height:15,cursor:'pointer',accentColor:'var(--accent)'}}/>
                  </th>
                )}
                <th>Docket No.</th><th>Party</th><th>Consignee</th><th>Way Bill No.</th><th>Route</th><th>Description</th>
                <th>Date</th><th style={{textAlign:'right'}}>Value</th><th style={{textAlign:'right'}}>Rate (₹)</th>
                <th style={{textAlign:'right'}}>Markup</th><th style={{textAlign:'right'}}>GST</th>
                <th style={{textAlign:'right'}}>Total</th><th>Packing</th><th>Status</th><th style={{textAlign:'center'}}>By</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={selectMode?12:11} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No docket bookings</td></tr>}
              {filtered.map(b=>(
                <React.Fragment key={b.id}>
                <tr
                  style={{background: selected.has(b.id) ? 'rgba(239,68,68,0.06)' : undefined, cursor: selectMode ? 'pointer' : undefined}}
                  onPointerDown={()=>handleRowPointerDown(b.id)}
                  onPointerUp={handleRowPointerUp}
                  onPointerLeave={handleRowPointerUp}
                  onClick={selectMode ? ()=>toggleSelect(b.id) : undefined}
                >
                  {selectMode && (
                    <td style={{padding:'0 10px'}} onClick={e=>{e.stopPropagation();toggleSelect(b.id);}}>
                      <input type="checkbox" checked={selected.has(b.id)} onChange={()=>toggleSelect(b.id)}
                        style={{width:15,height:15,cursor:'pointer',accentColor:'var(--accent)'}}/>
                    </td>
                  )}
                  <>
                      <td>
                        <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700}}>{b.docketNo}</span>
                        <RecordActivityAvatars resource="DOCKET_BOOKING" resourceId={b.id} auditLogs={auditLogs} users={users} />
                      </td>
                      <td style={{fontWeight:500}} title={b.partyName}>{shortName(b.partyName)}</td>
                      <td style={{fontSize:12,color:'var(--text-secondary)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={(b as any).consignee||''}>{(b as any).consignee||'—'}</td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{(b as any).way_bill_no||'—'}</span></td>
                      <td>{b.origin&&b.destination?<span style={{fontFamily:'var(--font-mono)',fontSize:11,background:'var(--surface-sunken)',padding:'2px 7px',borderRadius:5}}>{b.origin}→{b.destination}</span>:'—'}</td>
                      <td style={{fontSize:12,color:'var(--text-secondary)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.description||'—'}</td>
                      <td style={{fontSize:12,color:'var(--text-muted)'}}>{b.bookingDate}</td>
                      <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12}}>{(b as any).value>0?`₹${(b as any).value}`:'—'}</td>
                      <td style={{textAlign:'right',fontFamily:'var(--font-mono)'}}>₹{b.rateFittedAmount.toLocaleString('en-IN')}</td>
                      <td style={{textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--text-secondary)'}}>₹{b.markupAmount}</td>
                      <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text-muted)'}}>₹{b.gstAmount.toFixed(0)}</td>
                      <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800}}>{fmt(b.totalAmount)}</td>
                      <td style={{fontSize:11,color:'var(--text-muted)',maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={(b as any).method_of_packing||''}>{(b as any).method_of_packing||'—'}</td>
                      <td><Badge status={b.status}/></td>
                      <td style={{textAlign:'center'}}><CreatorAvatar userId={(b as {createdBy?:string|null}).createdBy} createdAt={b.createdAt} /></td>
                      <td style={{display:'flex',gap:4,flexWrap:'nowrap'}}>
                        {!selectMode && b.status==='BOOKED' && (
                          <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px'}} onClick={e=>{e.stopPropagation();startEdit(b);}}><Edit2 size={11}/> Edit</button>
                        )}
                        {!selectMode && b.status==='BOOKED' && canInvoice && (
                          <button className="btn btn-secondary btn-sm" style={{fontSize:11,padding:'3px 9px',whiteSpace:'nowrap'}}
                            onClick={e=>{e.stopPropagation();startTransition(async()=>{const res=await generateInvoiceFromDocket(b.id);if(res&&'error'in res)toast.error(res.error as string);else if(res&&'invoiceNo'in res)toast.success(`Invoice ${res.invoiceNo} generated`);});}}>
                            Gen Invoice
                          </button>
                        )}
                        {!selectMode && (
                          <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px',color:'#7c3aed',whiteSpace:'nowrap'}} title="Open docket editor"
                            onClick={e=>{e.stopPropagation();window.open(`/dashboard/bookings/dockets/editor?id=${b.id}`,'_blank');}}>
                            🖨️ Print
                          </button>
                        )}
                        {!selectMode && !b.linkedAwbId && (
                          <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px',color:'#0369a1',whiteSpace:'nowrap'}} onClick={e=>{e.stopPropagation();setConnectAwbDocket(b);}}>
                            + AWB
                          </button>
                        )}
                        {!selectMode && (
                          <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 6px',color:'#dc2626'}}
                            title="Delete" onClick={e=>{e.stopPropagation();setSelected(new Set([b.id]));setShowDeleteConfirm(true);}}>
                            <Trash2 size={11}/>
                          </button>
                        )}
                      </td>
                    </>
                </tr>
                {b.linkedAwbId && (() => {
                  const linked = awbBookings.find(a => a.id === b.linkedAwbId);
                  if (!linked) return null;
                  const colSpan = selectMode ? 12 : 11;
                  return (
                    <tr key={b.id+'-awb'} style={{background:'#f0f9ff'}}>
                      <td colSpan={colSpan} style={{padding:'5px 14px 5px 28px',fontSize:11,color:'#0369a1',borderTop:'none'}}>
                        🔗 <strong>Connected AWB:</strong>&nbsp;
                        <span style={{fontFamily:'var(--font-mono)',fontWeight:700}}>{linked.awbNo}</span>
                        &nbsp;·&nbsp;{linked.partyName}
                        &nbsp;·&nbsp;<span style={{fontFamily:'var(--font-mono)'}}>{linked.origin}→{linked.destination}</span>
                        &nbsp;·&nbsp;{linked.airlineName}
                        &nbsp;·&nbsp;{linked.bookingDate}
                        &nbsp;·&nbsp;Wt: {linked.weight}kg
                        &nbsp;·&nbsp;Total: ₹{linked.totalAmount.toLocaleString('en-IN')}
                        &nbsp;·&nbsp;<Badge status={linked.status}/>
                        &nbsp;&nbsp;
                        <button className="btn btn-ghost btn-sm" style={{fontSize:10,padding:'2px 8px',color:'#d97706',marginLeft:8}} title="Remove link only"
                          onClick={e=>{e.stopPropagation();startTransition(async()=>{const res = await unlinkAwbFromDocket(b.id); if (res && 'error' in res) toast.error(res.error as string); else { toast('AWB unlinked',{icon:'🔓'}); refresh(); }});}}>
                          Unlink
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{fontSize:10,padding:'2px 8px',color:'#dc2626',marginLeft:4}} title="Delete AWB permanently"
                          onClick={e=>{e.stopPropagation();if(confirm(`Delete AWB ${linked.awbNo} permanently?`)){startTransition(async()=>{await deleteAwbBookings([linked.id]);await unlinkAwbFromDocket(b.id);toast.success('AWB deleted');refresh();});}}}>
                          Delete AWB
                        </button>
                      </td>
                    </tr>
                  );
                })()}
              </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:380}}>
            <div style={{textAlign:'center',padding:'8px 0 20px'}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'#fef2f2',border:'2px solid #fca5a5',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
                <Trash2 size={22} color="#dc2626"/>
              </div>
              <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>Delete {selected.size} Docket{selected.size>1?'s':''}?</div>
              <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:20}}>
                This will permanently remove the selected docket{selected.size>1?'s':''} and cannot be undone.
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'center'}}>
                <button className="btn btn-secondary" onClick={()=>{setShowDeleteConfirm(false);if(!selectMode)setSelected(new Set());}}>Cancel</button>
                <button className="btn btn-danger" onClick={confirmDelete}><Trash2 size={13}/> Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:760,padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h2 style={{fontSize:15,fontWeight:800}}>New Docket Booking</h2>
              <button className="btn btn-ghost btn-icon" onClick={()=>{setShowForm(false);setForm(init);}}><X size={16}/></button>
            </div>
            <form onSubmit={handleSubmit}>
              {/* Row 1: Docket No + Party */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Docket No. *</label>
                  <input className="input" style={{height:32,fontSize:12}} placeholder="e.g. DKT-2026-0010" value={form.docketNo} onChange={e=>setForm(f=>({...f,docketNo:e.target.value}))} required/>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Shipper *</label>
                  <div style={{display:'flex',gap:5}}>
                    <select className="input" style={{flex:1,height:32,fontSize:12}} value={form.shipperId||form.partyId} onChange={e=>{const p=activeParties.find(x=>x.id===e.target.value);setForm(f=>({...f,shipperId:e.target.value,partyId:e.target.value,notes:p?`Shipper: ${p.partyName}\n${p.billingAddress||''}\nPhone: ${p.phone||''}`:f.notes}));}} required>
                      <option value="">Select shipper…</option>
                      {activeParties.map(p=><option key={p.id} value={p.id}>{p.partyName}</option>)}
                    </select>
                    <button type="button" className="btn btn-secondary btn-sm" style={{whiteSpace:'nowrap',height:32,fontSize:11}} onClick={()=>setShowAddParty(true)}><Plus size={11}/></button>
                  </div>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Consignee</label>
                  <select className="input" style={{height:32,fontSize:12}} value={form.consigneePartyId} onChange={e=>{const p=activeParties.find(x=>x.id===e.target.value);setForm(f=>({...f,consigneePartyId:e.target.value,consignee:p?`${p.partyName}\n${p.billingAddress||''}`:f.consignee}));}}>
                    <option value="">Select consignee…</option>
                    {activeParties.map(p=><option key={p.id} value={p.id}>{p.partyName}</option>)}
                  </select>
                </div>
              </div>
              {/* Row 2: Origin + Destination + Date + Description */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 2fr',gap:8,marginBottom:8}}>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Origin</label>
                  <input className="input" style={{height:32,fontSize:12}} list="cities-list" placeholder="e.g. DEL" value={form.origin} onChange={e=>setForm(f=>({...f,origin:e.target.value.toUpperCase()}))}/>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Destination</label>
                  <input className="input" style={{height:32,fontSize:12}} list="cities-list" placeholder="e.g. BOM" value={form.destination} onChange={e=>setForm(f=>({...f,destination:e.target.value.toUpperCase()}))}/>
                </div>
                <datalist id="cities-list">
                  {[...new Set([...CITIES,...(typeof window!=='undefined'?JSON.parse(localStorage.getItem('customCities')||'[]'):[])])].map((c:string)=><option key={c} value={c}/>)}
                </datalist>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Booking Date</label>
                  <input className="input" style={{height:32,fontSize:12}} type="date" value={form.bookingDate} onChange={e=>setForm(f=>({...f,bookingDate:e.target.value}))}/>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Description / Goods</label>
                  <input className="input" style={{height:32,fontSize:12}} placeholder="e.g. Packaging materials…" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
                </div>
              </div>
              {/* Row 3: Weight + Packets + Rate + Freight + Markup + Due Date */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr',gap:8,marginBottom:8}}>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Weight (kg)</label>
                  <input className="input" style={{height:32,fontSize:12}} type="number" min="0" step="0.1" placeholder="0" value={form.weight||''} onChange={e=>{
                    const w = parseFloat(e.target.value)||0;
                    setForm(f=>({...f, weight:w, rateFittedAmount: parseFloat((w * newDocketRate).toFixed(2))}));
                  }}/>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Packets / Boxes</label>
                  <input className="input" style={{height:32,fontSize:12}} type="number" min="1" step="1" placeholder="1" value={(form as any).pieces||''} onChange={e=>setForm(f=>({...f,pieces:parseInt(e.target.value)||1} as any))}/>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Rate (₹/kg)</label>
                  <input className="input" style={{height:32,fontSize:12,fontFamily:'var(--font-mono)',borderColor:'var(--accent)',fontWeight:700}} type="number" min="0" step="0.01" placeholder="0" value={newDocketRate||''} onChange={e=>{
                    const r = parseFloat(e.target.value)||0;
                    setNewDocketRate(r);
                    setForm(f=>({...f, rateFittedAmount: parseFloat((f.weight * r).toFixed(2))}));
                  }}/>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Freight Charge (₹)</label>
                  <input className="input" style={{height:32,fontSize:12,fontFamily:'var(--font-mono)',background:'var(--surface-sunken)',color:'var(--accent-dark)',fontWeight:700}} type="number" min="0" step="0.01" placeholder="Auto" value={form.rateFittedAmount||''} readOnly title={`Auto-calculated: ${form.weight} kg × ₹${newDocketRate}/kg`}/>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Markup (₹)</label>
                  <input className="input" style={{height:32,fontSize:12,fontFamily:'var(--font-mono)'}} type="number" min="0" step="0.01" value={form.markupAmount||''} onChange={e=>setForm(f=>({...f,markupAmount:parseFloat(e.target.value)||0}))}/>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr',gap:8,marginBottom:8}}>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Due Date (days)</label>
                  <input className="input" style={{height:32,fontSize:12,maxWidth:160}} type="number" min="0" value={form.dueDatePolicy} onChange={e=>setForm(f=>({...f,dueDatePolicy:parseInt(e.target.value)||30}))}/>
                </div>
              </div>
              {/* Totals summary */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:8}}>
                {[
                  { label:'Freight Charge', val:`₹${(form.rateFittedAmount||0).toFixed(0)}` },
                  { label:'Markup', val:`₹${(form.markupAmount||0).toFixed(0)}` },
                  { label:'Total Prepaid (incl. GST)', val:fmt(totalAmount), hi:true },
                ].map(s=>(
                  <div key={s.label} style={{padding:'6px 10px',background:s.hi?'var(--accent-subtle)':'var(--surface-sunken)',border:`1px solid ${s.hi?'var(--warning-border)':'var(--border)'}`,borderRadius:7}}>
                    <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{s.label}</div>
                    <div style={{fontSize:13,fontWeight:800,fontFamily:'var(--font-mono)',color:s.hi?'var(--accent-dark)':'var(--text-primary)'}}>{s.val}</div>
                  </div>
                ))}
              </div>
              {/* GST calculation row */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8,padding:'10px 12px',background:'var(--surface-sunken)',border:'1px solid var(--border)',borderRadius:8}}>
                {/* Left: GST Amount input */}
                <div>
                  <label className="label" style={{fontSize:11,marginBottom:4}}>💰 GST Amount (₹)</label>
                  <input
                    id="gst-amount-input"
                    className="input"
                    style={{height:32,fontSize:12,fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--accent-dark)',borderColor:'var(--accent)',background:'var(--surface)'}}
                    type="number" min="0" step="0.01"
                    value={gstManualMode ? gstAmountInput : gstAutoAmount.toFixed(2)}
                    onChange={e => {
                      setGstManualMode(true);
                      setGstAmountInput(e.target.value);
                    }}
                    placeholder="Enter GST amount…"
                  />
                  {gstManualMode && (
                    <button type="button" onClick={()=>{setGstManualMode(false);setGstAmountInput('');}} style={{marginTop:4,fontSize:10,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:0,textDecoration:'underline'}}>
                      ↩ Reset to auto ({form.gstRate}%)
                    </button>
                  )}
                </div>
                {/* Right: % dropdown */}
                <div>
                  <label className="label" style={{fontSize:11,marginBottom:4}}>📊 GST % (auto-calculate)</label>
                  <select
                    className="input"
                    style={{height:32,fontSize:12,fontWeight:600,color:'var(--text-primary)'}}
                    value={gstManualMode ? '' : form.gstRate}
                    onChange={e => {
                      setForm(f => ({...f, gstRate: parseFloat(e.target.value)}));
                      setGstManualMode(false);
                      setGstAmountInput('');
                    }}
                  >
                    {[0,1,5,9,12,18,28].map(pct => (
                      <option key={pct} value={pct}>{pct}%</option>
                    ))}
                    {gstManualMode && <option value="">Custom (manual)</option>}
                  </select>
                  <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4}}>
                    Auto GST: ₹{gstAutoAmount.toFixed(2)}
                  </div>
                </div>
              </div>
              {/* Row 4: Way Bill + Consignee + Value + Packing */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginBottom:8}}>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Way Bill No.</label>
                  <input className="input" style={{height:32,fontSize:12}} placeholder="WB-2026-001" value={form.wayBillNo} onChange={e=>setForm(f=>({...f,wayBillNo:e.target.value}))}/>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Consignee</label>
                  <input className="input" style={{height:32,fontSize:12}} placeholder="Consignee name" value={form.consignee} onChange={e=>setForm(f=>({...f,consignee:e.target.value}))}/>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Value (₹)</label>
                  <input className="input" style={{height:32,fontSize:12,fontFamily:'var(--font-mono)'}} type="number" min="0" step="0.01" value={form.value||''} onChange={e=>setForm(f=>({...f,value:parseFloat(e.target.value)||0}))}/>
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="label" style={{fontSize:11}}>Method of Packing</label>
                  <input className="input" style={{height:32,fontSize:12}} placeholder="e.g. Carton…" value={form.methodOfPacking} onChange={e=>setForm(f=>({...f,methodOfPacking:e.target.value}))}/>
                </div>
              </div>

              {selParty && selParty.creditLimit > 0 && (()=>{
                const ck = checkCreditLimit(selParty.id, totalAmount);
                if (!ck.warning) return null;
                return <div className={`alert ${ck.allowed?'alert-warning':'alert-danger'}`} style={{marginBottom:14,fontSize:12}}>⚠️ {ck.message}</div>;
              })()}

              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={()=>{setShowForm(false);setForm(init);}}>Cancel</button>
                <button type="submit" className="btn btn-primary"><CheckCircle size={13}/> Save Docket</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulk && <DocketBulkDownloadModal docketBookings={docketBookings} onClose={()=>setShowBulk(false)}/>}

      {showAddParty && (
        <AddPartyModal
          onCreated={(party) => {
            setForm(f => ({ ...f, partyId: party.id }));
            refresh();
          }}
          onClose={() => setShowAddParty(false)}
        />
      )}

      {connectAwbDocket && (
        <ConnectAwbModal
          docket={connectAwbDocket}
          awbBookings={awbBookings}
          parties={activeParties}
          onConnectExisting={(awbId)=>{ startTransition(async()=>{ const res = await linkAwbToDocket(connectAwbDocket.id, awbId); if (res && 'error' in res) { toast.error(res.error as string); return; } toast.success('AWB linked'); setConnectAwbDocket(null); refresh(); }); }}
          onAddNew={(awbData)=>{ startTransition(async()=>{ const created = await createAwbBooking(awbData); if (created && 'error' in created) { toast.error('Could not create AWB'); return; } const res = await linkAwbToDocket(connectAwbDocket.id, created.id); if (res && 'error' in res) { toast.error(res.error as string); return; } toast.success('New AWB created & linked'); setConnectAwbDocket(null); refresh(); }); }}
          onClose={()=>setConnectAwbDocket(null)}
        />
      )}

      {showEditModal && editingId && (
        <DocketEditModal
          booking={docketBookings.find(b=>b.id===editingId)!}
          parties={activeParties}
          editForm={editForm} setEditForm={setEditForm}
          onSave={()=>saveEdit(editingId)}
          onClose={()=>{setShowEditModal(false);setEditingId(null);}}
        />
      )}
    </div>
  );
}

// ── Docket-only Bulk Download Modal ──────────────────────────────────────────
function DocketBulkDownloadModal({ docketBookings, onClose }: { docketBookings: {id:string;docketNo:string;partyName:string;origin?:string | null;destination?:string | null;description?:string | null;bookingDate:string;rateFittedAmount:number;markupAmount:number;gstAmount:number;totalAmount:number;status:string}[]; onClose: ()=>void }) {
  const [range, setRange] = useState<DateRange>('1m');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const DATE_OPTS: {value:DateRange;label:string}[] = [
    {value:'1d',label:'Today'},{value:'7d',label:'7 Days'},{value:'1m',label:'1 Month'},
    {value:'3m',label:'3 Months'},{value:'6m',label:'6 Months'},{value:'1y',label:'1 Year'},{value:'all',label:'All Time'},
  ];

  function doDownload() {
    let data = filterByDateRange(docketBookings,'bookingDate',range);
    if (statusFilter !== 'ALL') data = data.filter((b: any) => b.status === statusFilter);
    const rows = data.map((b: any) => ({ 'Docket No':b.docketNo, Party:b.partyName, Origin:b.origin||'', Destination:b.destination||'', Description:b.description||'', Date:b.bookingDate, 'Rate(₹)':b.rateFittedAmount, 'Markup(₹)':b.markupAmount, 'GST(₹)':b.gstAmount.toFixed(2), 'Total(₹)':b.totalAmount.toFixed(2), Status:b.status }));
    const fname = `docket_bookings_${range}`;
    if(format==='csv') exportToCSV(rows,fname);
    else if(format==='xlsx') exportToXLSX(rows,fname);
    else exportToPDF('Docket Bookings Report',rows,fname);
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{maxWidth:440}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h2 style={{fontSize:16,fontWeight:800,display:'flex',alignItems:'center',gap:8}}><Download size={16}/> Docket Bulk Download</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{marginBottom:14}}>
          <label className="label">Status Filter</label>
          <select className="input" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="ALL">All Status</option>
            <option value="BOOKED">Booked</option>
            <option value="INVOICED">Invoiced</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div style={{marginBottom:14}}>
          <label className="label">Date Range</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {DATE_OPTS.map(opt=>(
              <button key={opt.value} onClick={()=>setRange(opt.value)} style={{padding:'5px 12px',borderRadius:99,fontSize:11,fontWeight:range===opt.value?700:500,background:range===opt.value?'var(--accent)':'var(--surface-sunken)',color:range===opt.value?'#fff':'var(--text-secondary)',border:`1px solid ${range===opt.value?'var(--accent)':'var(--border)'}`,cursor:'pointer',transition:'all 120ms'}}>{opt.label}</button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:20}}>
          <label className="label">Export Format</label>
          <div style={{display:'flex',gap:8}}>
            {(['csv','xlsx','pdf'] as ExportFormat[]).map(f=>(
              <button key={f} onClick={()=>setFormat(f)} className={`btn ${format===f?'btn-primary':'btn-secondary'}`} style={{flex:1,justifyContent:'center',fontSize:12}}>{f.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={doDownload}><Download size={13}/> Download Docket Data</button>
        </div>
      </div>
    </div>
  );
}

// ── Docket Edit Modal ─────────────────────────────────────────────────────────
function DocketEditModal({ booking, parties, editForm, setEditForm, onSave, onClose }: {
  booking: any; parties: any[];
  editForm: any; setEditForm: (fn: (f: any) => any) => void;
  onSave: () => void; onClose: () => void;
}) {
  const [editRate, setEditRate] = React.useState<number>(0);
  const freight = editForm.rateFittedAmount||0, m = editForm.markupAmount||0, g = editForm.gstRate||18;
  const gstAmt = parseFloat(((freight+m)*g/100).toFixed(2)), total = freight+m+gstAmt;
  const inp = (label: string, field: string, type = 'text', extra: any = {}) => (
    <div className="form-group">
      <label className="label">{label}</label>
      <input className="input" type={type} value={editForm[field]??''} {...extra}
        onChange={e=>setEditForm((f:any)=>({...f,[field]:type==='number'?parseFloat(e.target.value)||0:e.target.value}))}/>
    </div>
  );
  const CITIES = ['DEL','BOM','BLR','HYD','MAA','CCU','AMD','COK','JAI','PNQ','BHO','IXR'];
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{maxWidth:680}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h2 style={{fontSize:16,fontWeight:800}}>Edit Docket — <span style={{fontFamily:'var(--font-mono)',color:'var(--accent-dark)'}}>{booking.docketNo}</span></h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="form-row form-row-2" style={{marginBottom:12}}>
          {inp('Docket No. *','docketNo')}
          {inp('Booking Date','bookingDate','date')}
        </div>
        <div className="form-row form-row-2" style={{marginBottom:12}}>
          <div className="form-group">
            <label className="label">Shipper</label>
            <select className="input" value={editForm.partyId||''} onChange={e=>{const p=parties.find((x:any)=>x.id===e.target.value);setEditForm((f:any)=>({...f,partyId:e.target.value,notes:p?`Shipper: ${p.partyName}\n${p.billingAddress||''}\nPhone: ${p.phone||''}`:f.notes}));}}>
              <option value="">Select shipper…</option>
              {parties.map((p:any)=><option key={p.id} value={p.id}>{p.partyName}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Consignee</label>
            <select className="input" value={editForm._consigneePartyId||''} onChange={e=>{const p=parties.find((x:any)=>x.id===e.target.value);setEditForm((f:any)=>({...f,_consigneePartyId:e.target.value,consignee:p?`${p.partyName}\n${p.billingAddress||''}`:f.consignee}));}}>
              <option value="">Select consignee…</option>
              {parties.map((p:any)=><option key={p.id} value={p.id}>{p.partyName}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row form-row-2" style={{marginBottom:12}}>
          <div className="form-group">
            <label className="label">Origin</label>
            <select className="input" value={editForm.origin||''} onChange={e=>setEditForm((f:any)=>({...f,origin:e.target.value}))}>
              <option value="">—</option>
              {CITIES.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Destination</label>
            <select className="input" value={editForm.destination||''} onChange={e=>setEditForm((f:any)=>({...f,destination:e.target.value}))}>
              <option value="">—</option>
              {CITIES.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {inp('Description','description')}
        {/* Weight + Rate + Freight auto-calc */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12,marginTop:12,padding:'10px 12px',background:'var(--surface-sunken)',border:'1px solid var(--border)',borderRadius:8}}>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="label" style={{fontSize:11}}>Weight (kg)</label>
            <input className="input" style={{height:32,fontSize:12}} type="number" min="0" step="0.1" placeholder="0"
              value={editForm.weight??''}
              onChange={e=>{
                const w = parseFloat(e.target.value)||0;
                setEditForm((f:any)=>({...f, weight:w, rateFittedAmount: editRate>0 ? parseFloat((w*editRate).toFixed(2)) : f.rateFittedAmount}));
              }}/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="label" style={{fontSize:11}}>Rate (₹/kg)</label>
            <input className="input" style={{height:32,fontSize:12,fontFamily:'var(--font-mono)',borderColor:'var(--accent)',fontWeight:700}} type="number" min="0" step="0.01" placeholder="Enter rate…"
              value={editRate||''}
              onChange={e=>{
                const r = parseFloat(e.target.value)||0;
                setEditRate(r);
                setEditForm((f:any)=>({...f, rateFittedAmount: parseFloat(((f.weight||0)*r).toFixed(2))}));
              }}/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="label" style={{fontSize:11}}>Freight Charge (₹)</label>
            <input className="input" style={{height:32,fontSize:12,fontFamily:'var(--font-mono)',background:'var(--surface)',color:'var(--accent-dark)',fontWeight:700}} type="number" min="0" step="0.01"
              value={editForm.rateFittedAmount??''}
              onChange={e=>setEditForm((f:any)=>({...f,rateFittedAmount:parseFloat(e.target.value)||0}))}
              title={editRate>0?`${editForm.weight||0} kg × ₹${editRate}/kg`:'Enter manually or set rate above'}/>
            {editRate>0 && <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>= {editForm.weight||0} kg × ₹{editRate}/kg</div>}
          </div>
        </div>
        {/* Markup + GST */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12,padding:'10px 12px',background:'var(--surface-sunken)',border:'1px solid var(--border)',borderRadius:8}}>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="label" style={{fontSize:11}}>Markup (₹)</label>
            <input className="input" style={{height:32,fontSize:12,fontFamily:'var(--font-mono)'}} type="number" min="0" step="0.01"
              value={editForm.markupAmount??''}
              onChange={e=>setEditForm((f:any)=>({...f,markupAmount:parseFloat(e.target.value)||0}))}/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="label" style={{fontSize:11}}>GST Rate (%)</label>
            <select className="input" style={{height:32,fontSize:12,fontWeight:600}}
              value={editForm.gstRate??18}
              onChange={e=>setEditForm((f:any)=>({...f,gstRate:parseFloat(e.target.value)||0}))}>
              {[0,1,5,9,12,18,28].map(pct=><option key={pct} value={pct}>{pct}%</option>)}
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="label" style={{fontSize:11}}>GST Amount (₹) — Auto</label>
            <input className="input" style={{height:32,fontSize:12,fontFamily:'var(--font-mono)',background:'var(--surface-sunken)',color:'var(--text-secondary)'}} type="number" readOnly
              value={gstAmt.toFixed(2)}
              title={`(Freight ₹${freight} + Markup ₹${m}) × ${g}% = ₹${gstAmt.toFixed(2)}`}/>
            <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>(₹{freight}+₹{m}) × {g}% = ₹{gstAmt.toFixed(2)}</div>
          </div>
        </div>
        {inp('Notes','notes')}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,margin:'16px 0'}}>
          {[{l:'Freight',v:`₹${freight.toFixed(0)}`},{l:'Markup',v:`₹${m.toFixed(0)}`},{l:`GST ${g}%`,v:`₹${gstAmt.toFixed(0)}`},{l:'Total',v:`₹${total.toFixed(0)}`,hi:true}].map(s=>(
            <div key={s.l} style={{padding:'8px 12px',background:s.hi?'var(--accent-subtle)':'var(--surface-sunken)',border:`1px solid ${s.hi?'var(--warning-border)':'var(--border)'}`,borderRadius:8}}>
              <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase'}}>{s.l}</div>
              <div style={{fontSize:14,fontWeight:800,fontFamily:'var(--font-mono)',color:s.hi?'var(--accent-dark)':'var(--text-primary)'}}>{s.v}</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onSave}><Save size={13}/> Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ── Connect AWB Modal (from Docket) ───────────────────────────────────────────
const AIRLINES_D = ['IndiGo','Air India','SpiceJet','GoAir','Vistara','Akasa Air'];
const CITIES_D   = ['DEL','BOM','BLR','HYD','MAA','CCU','AMD','COK','JAI','PNQ'];

function ConnectAwbModal({ docket, awbBookings, parties, onConnectExisting, onAddNew, onClose }: {
  docket: any; awbBookings: any[]; parties: any[];
  onConnectExisting: (id: string) => void;
  onAddNew: (data: any) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'existing'|'new'>('existing');
  const [selAwbId, setSelAwbId] = useState('');
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ awbNo:'', partyId:docket.partyId, origin:docket.origin||'', destination:docket.destination||'', airlineName:'IndiGo', bookingDate:today, weight:0, pieces:1, baseRate:0, markupAmount:0, gstRate:0, notes:'' });
  const f = (k: string, v: any) => setForm(p=>({...p,[k]:v}));
  const total = form.weight * form.baseRate + form.markupAmount;
  const unlinked = awbBookings.filter(a => !awbBookings.find(() => false)); // all AWBs available

  function handleSave() {
    if (tab === 'existing') {
      if (!selAwbId) { alert('Select an AWB'); return; }
      onConnectExisting(selAwbId);
    } else {
      if (!form.awbNo || form.weight <= 0) { alert('AWB No. and Weight required'); return; }
      const p = parties.find((x:any)=>x.id===form.partyId);
      onAddNew({ awbNo:form.awbNo, partyId:form.partyId, partyName:p?.partyName||docket.partyName, origin:form.origin, destination:form.destination, airlineName:form.airlineName, bookingDate:form.bookingDate, weight:form.weight, pieces:form.pieces, baseRate:form.baseRate, markupAmount:form.markupAmount, gstRate:0, gstAmount:0, totalAmount:total, status:'BOOKED' as const, notes:form.notes });
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{maxWidth:540}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div>
            <h2 style={{fontSize:16,fontWeight:800}}>Connect AWB</h2>
            <div style={{fontSize:11,color:'var(--text-muted)'}}>Docket: <span style={{fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--accent-dark)'}}>{docket.docketNo}</span></div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16}/></button>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:0,marginBottom:16,border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
          {(['existing','new'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'8px',fontSize:12,fontWeight:tab===t?700:500,background:tab===t?'var(--accent)':'var(--surface-base)',color:tab===t?'#fff':'var(--text-secondary)',border:'none',cursor:'pointer'}}>
              {t==='existing' ? '🔗 Connect Existing AWB' : '➕ Create New AWB'}
            </button>
          ))}
        </div>

        {tab === 'existing' ? (
          <div className="form-group">
            <label className="label">Select AWB</label>
            <select className="input" value={selAwbId} onChange={e=>setSelAwbId(e.target.value)}>
              <option value="">Choose AWB…</option>
              {awbBookings.map(a=><option key={a.id} value={a.id}>{a.awbNo} · {a.partyName} · {a.origin}→{a.destination} · {a.status}</option>)}
            </select>
          </div>
        ) : (
          <>
            <div className="form-row form-row-2" style={{marginBottom:10}}>
              <div className="form-group"><label className="label">AWB No. *</label><input className="input" value={form.awbNo} onChange={e=>f('awbNo',e.target.value)} placeholder="e.g. 6E-113344"/></div>
              <div className="form-group"><label className="label">Airline</label>
                <select className="input" value={form.airlineName} onChange={e=>f('airlineName',e.target.value)}>{AIRLINES_D.map(a=><option key={a}>{a}</option>)}</select>
              </div>
            </div>
            <div className="form-row form-row-3" style={{marginBottom:10}}>
              <div className="form-group"><label className="label">Origin</label><select className="input" value={form.origin} onChange={e=>f('origin',e.target.value)}><option value="">—</option>{CITIES_D.map(c=><option key={c}>{c}</option>)}</select></div>
              <div className="form-group"><label className="label">Destination</label><select className="input" value={form.destination} onChange={e=>f('destination',e.target.value)}><option value="">—</option>{CITIES_D.map(c=><option key={c}>{c}</option>)}</select></div>
              <div className="form-group"><label className="label">Date</label><input className="input" type="date" value={form.bookingDate} onChange={e=>f('bookingDate',e.target.value)}/></div>
            </div>
            <div className="form-row form-row-3" style={{marginBottom:10}}>
              <div className="form-group"><label className="label">Weight (kg) *</label><input className="input" type="number" min="0" value={form.weight||''} onChange={e=>f('weight',parseFloat(e.target.value)||0)}/></div>
              <div className="form-group"><label className="label">Base Rate (₹)</label><input className="input" type="number" min="0" value={form.baseRate||''} onChange={e=>f('baseRate',parseFloat(e.target.value)||0)}/></div>
              <div className="form-group"><label className="label">Markup (₹)</label><input className="input" type="number" min="0" value={form.markupAmount||''} onChange={e=>f('markupAmount',parseFloat(e.target.value)||0)}/></div>
            </div>
            <div style={{padding:'8px 12px',background:'var(--surface-sunken)',borderRadius:8,fontSize:12,marginBottom:10}}>
              Total: <strong style={{fontFamily:'var(--font-mono)'}}>₹{total.toLocaleString('en-IN')}</strong>
            </div>
          </>
        )}

        <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}><CheckCircle size={13}/> {tab==='existing'?'Link AWB':'Create & Link'}</button>
        </div>
      </div>
    </div>
  );
}
