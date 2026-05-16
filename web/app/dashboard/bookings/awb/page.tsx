'use client';
import React, { useState, useRef, useCallback, useTransition } from 'react';
import { Plane, Plus, Search, Download, X, CheckCircle, Edit2, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DateRangeFilter, filterByDateRange, exportToCSV, exportToXLSX, exportToPDF, BulkDownloadModal, type DateRange, type ExportFormat, type ExportModule } from '@/lib/exportUtils';
import { createAwbBooking, createDocketBooking, deleteAwbBookings, deleteDocketBookings, linkAwbToDocket, unlinkAwbFromDocket, updateAwbBooking } from '@/lib/actions/bookings';
import { generateInvoiceFromAwb } from '@/lib/actions/invoices';
import { shortName, fmtDate } from '@/lib/utils';
import { CreatorAvatar } from '@/components/CreatorAvatar';
import { useSharedData } from '@/lib/useSharedData';
import { LiveIndicator } from '@/components/LiveIndicator';
import RecordActivityAvatars from '@/components/RecordActivityAvatars';
import { AddPartyModal } from '@/components/AddPartyModal';

const AIRLINES = ['IndiGo','Air India','SpiceJet','GoAir','Vistara','Akasa Air'];
const CITIES   = ['DEL','BOM','BLR','HYD','MAA','CCU','AMD','COK','JAI','PNQ','BHO','IXR'];

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function Badge({ status }: { status: string }) {
  const m: Record<string,[string,string]> = {
    BOOKED:['#2563eb','#eff6ff'], INVOICED:['#059669','#ecfdf5'], CANCELLED:['#dc2626','#fef2f2'],
  };
  const [c,bg] = m[status] || ['#64748b','#f8fafc'];
  return <span style={{ padding:'2px 9px', borderRadius:99, fontSize:10, fontWeight:600, color:c, background:bg, border:`1px solid ${c}30`, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{status}</span>;
}

export default function AwbBookingsPage() {
  const { awbBookings, parties, docketBookings, rateVersions, freightRates, outstanding, auditLogs, users, refresh } = useSharedData();
  const [isPending, startTransition] = useTransition();

  const [showForm, setShowForm]     = useState(false);
  const [showBulk, setShowBulk]     = useState(false);
  const [showAddParty, setShowAddParty] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingId, setEditingId]   = useState<string|null>(null);
  const [editForm, setEditForm]     = useState<Partial<typeof awbBookings[0]>>({});
  const [docketAwb, setDocketAwb]   = useState<typeof awbBookings[0]|null>(null);
  const [connectDocketAwb, setConnectDocketAwb] = useState<typeof awbBookings[0]|null>(null);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [partyFilter, setPartyFilter] = useState('ALL');
  const [linkFilter, setLinkFilter] = useState<'ALL' | 'LINKED' | 'UNLINKED'>('ALL');
  const [dateRange, setDateRange]   = useState<DateRange>('all');

  // ── Multi-select / delete state ──────────────────────────────────────────
  const [selectMode, setSelectMode]   = useState(false);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  const enterSelectMode = useCallback(() => { setSelectMode(true); }, []);

  function handleRowPointerDown(id: string) {
    longPressTimer.current = setTimeout(() => {
      enterSelectMode();
      setSelected(new Set([id]));
    }, 500);
  }
  function handleRowPointerUp() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(b => b.id)));
  }
  function exitSelectMode() { setSelectMode(false); setSelected(new Set()); }
  function confirmDelete() {
    const deletedIds = new Set(selected);
    // Optimistic: close confirm immediately
    exitSelectMode(); setShowDeleteConfirm(false);
    toast.success(`${deletedIds.size} AWB booking${deletedIds.size > 1 ? 's' : ''} deleted`);
    startTransition(async () => {
      await deleteAwbBookings([...deletedIds]);
      refresh(); // immediate refresh after server confirms
    });
  }

  const initForm = { awbNo:'', awbPrefix:'312', partyId:'', origin:'', destination:'', airlineName:'', bookingDate:new Date().toISOString().split('T')[0], weight:0, pieces:1, baseRate:0, markupAmount:0, notes:'' };
  const [form, setForm] = useState(initForm);

  const activeParties = parties.filter(p => p.status === 'ACTIVE');
  const selParty      = parties.find(p => p.id === form.partyId);

  const getRateForRoute = useCallback((carrier: string, origin: string, dest: string) => {
    const activeIds = rateVersions
      .filter(v => v.status === 'ACTIVE' && (!carrier || v.carrierName === carrier || v.carrierName === `${carrier} Cargo`))
      .map(v => v.id);
    return freightRates.find(r => activeIds.includes(r.versionId) && r.origin === origin && r.destination === dest && r.activeFlag);
  }, [freightRates, rateVersions]);

  const checkCreditLimit = useCallback((partyId: string, newAmount: number) => {
    const party = parties.find(p => p.id === partyId);
    if (!party || party.creditLimit === 0) return { allowed: true, warning: false, message: '' };
    const used = outstanding.filter(o => o.partyId === partyId && o.outstandingAmount > 0).reduce((sum, item) => sum + item.outstandingAmount, 0);
    const projected = used + newAmount;
    if (projected > party.creditLimit) return { allowed: false, warning: true, message: `Credit limit ₹${party.creditLimit.toLocaleString('en-IN')} exceeded! Currently used: ₹${used.toLocaleString('en-IN')}` };
    if (projected > party.creditLimit * 0.8) return { allowed: true, warning: true, message: `Warning: 80%+ of credit limit used. ₹${used.toLocaleString('en-IN')} / ₹${party.creditLimit.toLocaleString('en-IN')}` };
    return { allowed: true, warning: false, message: '' };
  }, [outstanding, parties]);

  function onRouteChange(origin: string, dest: string) {
    const rate = getRateForRoute(form.airlineName, origin, dest);
    setForm(f => ({ ...f, origin, destination: dest, baseRate: rate ? rate.baseRate : f.baseRate }));
  }

  const freightBase = form.weight * form.baseRate;
  const gstAmount   = 0;
  const totalAmount = freightBase + form.markupAmount;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.awbNo || !form.partyId || !form.origin || !form.destination || !form.airlineName || form.weight <= 0) {
      toast.error('Fill all required fields'); return;
    }
    if (typeof window !== 'undefined') {
      const saved: string[] = JSON.parse(localStorage.getItem('customCities') || '[]');
      const updated = [...new Set([...saved, ...[form.origin, form.destination].filter(c => c && !CITIES.includes(c))])];
      localStorage.setItem('customCities', JSON.stringify(updated));
    }
    const ck = checkCreditLimit(form.partyId, totalAmount);
    if (!ck.allowed) { toast.error(ck.message); return; }
    if (ck.warning) toast(ck.message, { icon:'⚠️' });

    // Combine prefix + awbNo for full AWB number
    const fullAwbNo = form.awbPrefix ? `${form.awbPrefix}-${form.awbNo}` : form.awbNo;

    // Optimistic: close form immediately
    setShowForm(false); setForm(initForm);
    toast.success(`AWB ${fullAwbNo} booked`);

    startTransition(async () => {
      const res = await createAwbBooking({
        awbNo: fullAwbNo, partyId:form.partyId, partyName:selParty?.partyName||'',
        origin:form.origin, destination:form.destination, airlineName:form.airlineName,
        bookingDate:form.bookingDate, weight:form.weight, pieces:form.pieces,
        baseRate:form.baseRate, markupAmount:form.markupAmount,
        gstRate:0, gstAmount:0, totalAmount, status:'BOOKED', notes:form.notes,
      });
      if (res && 'error' in res) { toast.error('Validation error — booking may not have saved'); }
      refresh();
    });
  }

  function handleGenInvoice(id: string, awbNo: string) {
    startTransition(async () => {
      const res = await generateInvoiceFromAwb(id);
      if (res && 'error' in res) toast.error(res.error as string);
      else if (res && 'invoiceNo' in res) toast.success(`Invoice ${res.invoiceNo} generated for ${awbNo}`);
    });
  }

  function startEdit(b: typeof awbBookings[0]) {
    setEditingId(b.id);
    setEditForm({ awbNo:b.awbNo, partyId:b.partyId, origin:b.origin, destination:b.destination, airlineName:b.airlineName, bookingDate:b.bookingDate, weight:b.weight, pieces:b.pieces, baseRate:b.baseRate, markupAmount:b.markupAmount, notes:b.notes });
    setShowEditModal(true);
  }

  function saveEdit(id: string) {
    const w = editForm.weight||0; const rate = editForm.baseRate||0;
    const markup = editForm.markupAmount||0;
    startTransition(async () => {
      await updateAwbBooking(id, { ...editForm, gstAmount:0, gstRate:0, totalAmount:w*rate+markup });
      setEditingId(null); setShowEditModal(false); toast.success('AWB updated');
    });
  }

  const rangeFiltered = filterByDateRange(awbBookings, 'bookingDate', dateRange);
  const filtered = rangeFiltered.filter(b =>
    (b.awbNo.toLowerCase().includes(search.toLowerCase()) || b.partyName.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === 'ALL' || b.status === statusFilter) &&
    (partyFilter === 'ALL' || b.partyId === partyFilter || b.partyName === partyFilter) &&
    (linkFilter === 'ALL' || (linkFilter === 'LINKED' ? docketBookings.some(d => d.linkedAwbId === b.id) : !docketBookings.some(d => d.linkedAwbId === b.id)))
  );

  function handleExport(fmt: 'csv'|'xlsx'|'pdf') {
    const data = filtered.map(b => ({ 'AWB No':b.awbNo, Party:b.partyName, Route:`${b.origin}→${b.destination}`, Airline:b.airlineName, Date:fmtDate(b.bookingDate), 'Weight(kg)':b.weight, 'Rate(₹)':b.baseRate, 'Markup(₹)':b.markupAmount, 'Total(₹)':b.totalAmount.toFixed(2), Status:b.status }));
    const fname = `awb_bookings_${dateRange}`;
    if(fmt==='csv') exportToCSV(data,fname);
    else if(fmt==='xlsx') exportToXLSX(data,fname);
    else exportToPDF('AWB Bookings Report',data,fname);
  }

  function handleBulkDownload(modules: ExportModule[], range: DateRange, format: ExportFormat) {
    // AWB page bulk download is AWB-only
    const data = filterByDateRange(awbBookings,'bookingDate',range).map(b=>({ 'AWB No':b.awbNo, Party:b.partyName, Route:`${b.origin}→${b.destination}`, Airline:b.airlineName, Date:b.bookingDate, 'Weight(kg)':b.weight, 'Base Rate(₹)':b.baseRate, 'Markup(₹)':b.markupAmount, 'GST(₹)':b.gstAmount.toFixed(2), 'Total(₹)':b.totalAmount.toFixed(2), Status:b.status }));
    const fname = `awb_bookings_${range}`;
    if(format==='csv') exportToCSV(data,fname);
    else if(format==='xlsx') exportToXLSX(data,fname);
    else exportToPDF('AWB Bookings Report',data,fname);
  }

  const autoFilled = form.origin && form.destination && getRateForRoute(form.airlineName, form.origin, form.destination);

  return (
    <div className="animate-fadeIn">
      {/* Toolbar */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:9, marginBottom:14, alignItems:'center' }}>
        <LiveIndicator onRefresh={refresh} />
        {selectMode ? (
          <>
            <span style={{fontSize:12,color:'var(--text-secondary)',alignSelf:'center',fontWeight:600}}>{selected.size} selected</span>
            <button className="btn btn-secondary btn-sm" onClick={exitSelectMode}>Cancel</button>
            <button className="btn btn-danger btn-sm" disabled={selected.size===0} onClick={()=>setShowDeleteConfirm(true)}><Trash2 size={12}/> Delete ({selected.size})</button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary btn-sm" onClick={()=>handleExport('csv')}><Download size={12}/> CSV</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>handleExport('xlsx')}><Download size={12}/> XLSX</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>handleExport('pdf')}><Download size={12}/> PDF</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>setShowBulk(true)}>Bulk Download</button>
            <button className="btn btn-primary btn-sm" onClick={()=>setShowForm(true)}><Plus size={12}/> New AWB Booking</button>
          </>
        )}
      </div>

      {/* Date Range */}
      <div style={{marginBottom:12,overflowX:'auto'}}><DateRangeFilter value={dateRange} onChange={setDateRange}/></div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:14 }}>
        <div style={{ position:'relative', flex:1 }}>
          <Search size={12} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }} />
          <input className="input" placeholder="Search AWB no. or party…" style={{ paddingLeft:30, height:36, fontSize:12 }} value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <select className="input" style={{ width:150, height:36, fontSize:12 }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="ALL">All Status</option>
          <option value="BOOKED">Booked</option>
          <option value="INVOICED">Invoiced</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select className="input" style={{ width:180, height:36, fontSize:12 }} value={partyFilter} onChange={e=>setPartyFilter(e.target.value)}>
          <option value="ALL">All Companies</option>
          {[...new Map(awbBookings.map(b=>[b.partyName,b])).values()].sort((a,b)=>a.partyName.localeCompare(b.partyName)).map(b=>(
            <option key={b.partyName} value={b.partyName}>{b.partyName}</option>
          ))}
        </select>
        <select className="input" style={{ width:150, height:36, fontSize:12 }} value={linkFilter} onChange={e=>setLinkFilter(e.target.value as 'ALL' | 'LINKED' | 'UNLINKED')}>
          <option value="ALL">All Link States</option>
          <option value="LINKED">Linked</option>
          <option value="UNLINKED">Unlinked</option>
        </select>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'Total AWBs', value:awbBookings.length, color:'#2563eb' },
          { label:'Pending Invoicing', value:awbBookings.filter(b=>b.status==='BOOKED').length, color:'#d97706' },
          { label:'Invoiced', value:awbBookings.filter(b=>b.status==='INVOICED').length, color:'#059669' },
        ].map(s=>(
          <div key={s.label} style={{ background:'var(--surface-base)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:12, color:'var(--text-secondary)' }}>{s.label}</div>
            <div style={{ fontSize:20, fontWeight:800, fontFamily:'var(--font-mono)', color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow:'hidden' }}>
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
                <th>AWB No.</th><th>Party</th><th>Route</th><th>Airline</th>
                <th>Date</th><th style={{textAlign:'right'}}>Wt (kg)</th>
                <th style={{textAlign:'right'}}>Base Rate</th><th style={{textAlign:'right'}}>Markup</th>
                <th style={{textAlign:'right'}}>Total</th>
                <th>Status</th><th style={{textAlign:'center'}}>By</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={selectMode?13:12} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No AWB bookings found</td></tr>}
              {filtered.map(b => {
                const linkedDocket = docketBookings.find(d => d.linkedAwbId === b.id);
                return (
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
                        <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700}}>{b.awbNo}</span>
                        <RecordActivityAvatars resource="AWB_BOOKING" resourceId={b.id} auditLogs={auditLogs} users={users} />
                      </td>
                      <td style={{fontWeight:500}} title={b.partyName}>{shortName(b.partyName)}</td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,background:'var(--surface-sunken)',padding:'2px 7px',borderRadius:5}}>{b.origin}→{b.destination}</span></td>
                      <td style={{fontSize:12,color:'var(--text-secondary)'}}>{b.airlineName}</td>
                      <td style={{fontSize:12,color:'var(--text-muted)'}}>{b.bookingDate}</td>
                      <td style={{textAlign:'right',fontFamily:'var(--font-mono)'}}>{b.weight}</td>
                      <td style={{textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--text-secondary)'}}>₹{b.baseRate}</td>
                      <td style={{textAlign:'right',fontFamily:'var(--font-mono)',color:'var(--text-secondary)'}}>₹{b.markupAmount}</td>
                      <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800}}>{fmt(b.totalAmount)}</td>
                      <td><Badge status={b.status}/></td>
                      <td style={{textAlign:'center'}}><CreatorAvatar userId={(b as {createdBy?:string|null}).createdBy} createdAt={b.createdAt} /></td>
                      <td style={{display:'flex',gap:4,flexWrap:'nowrap'}}>
                        {!selectMode && b.status==='BOOKED' && (
                          <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px'}} onClick={e=>{e.stopPropagation();startEdit(b);}}><Edit2 size={11}/> Edit</button>
                        )}
                        {!selectMode && b.status==='BOOKED' && (
                          <button className="btn btn-secondary btn-sm" style={{fontSize:11,padding:'3px 9px',whiteSpace:'nowrap'}} onClick={e=>{e.stopPropagation();handleGenInvoice(b.id,b.awbNo);}}>
                            Gen Invoice
                          </button>
                        )}
                        {!selectMode && !linkedDocket && (
                          <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px',color:'#7c3aed',whiteSpace:'nowrap'}} onClick={e=>{e.stopPropagation();setDocketAwb(b);}}>
                            + New Docket
                          </button>
                        )}
                        {!selectMode && !linkedDocket && (
                          <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px',color:'#0369a1',whiteSpace:'nowrap'}} onClick={e=>{e.stopPropagation();setConnectDocketAwb(b);}}>
                            🔗 Docket
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
                {linkedDocket && (
                  <tr style={{background:'#faf5ff'}}>
                    <td colSpan={selectMode?12:11} style={{padding:'5px 14px 5px 28px',fontSize:11,color:'#7c3aed',borderTop:'none'}}>
                      🔗 <strong>Connected Docket:</strong>&nbsp;
                      <span style={{fontFamily:'var(--font-mono)',fontWeight:700}}>{linkedDocket.docketNo}</span>
                      &nbsp;·&nbsp;{linkedDocket.partyName}
                      &nbsp;·&nbsp;{linkedDocket.description||'—'}
                      &nbsp;·&nbsp;₹{linkedDocket.totalAmount.toLocaleString('en-IN')}
                      &nbsp;·&nbsp;<Badge status={linkedDocket.status}/>
                      &nbsp;&nbsp;
                      <button className="btn btn-ghost btn-sm" style={{fontSize:10,padding:'2px 8px',color:'#d97706',marginLeft:8}} title="Remove link (keep docket)"
                        onClick={e=>{e.stopPropagation();startTransition(async()=>{const res = await unlinkAwbFromDocket(linkedDocket.id); if (res && 'error' in res) toast.error(res.error as string); else { toast('Docket unlinked',{icon:'🔓'}); refresh(); }});}}>
                        Unlink
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{fontSize:10,padding:'2px 8px',color:'#dc2626',marginLeft:4}} title="Delete docket permanently"
                        onClick={e=>{e.stopPropagation();if(confirm(`Delete docket ${linkedDocket.docketNo} permanently?`)){startTransition(async()=>{await deleteDocketBookings([linkedDocket.id]);toast.success('Docket deleted');refresh();});}}}>
                        Delete Docket
                      </button>
                    </td>
                  </tr>
                )}
                </React.Fragment>
                );
              })}
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
              <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>Delete {selected.size} AWB Booking{selected.size>1?'s':''}?</div>
              <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:20}}>
                This will permanently remove the selected booking{selected.size>1?'s':''} and cannot be undone.
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'center'}}>
                <button className="btn btn-secondary" onClick={()=>{setShowDeleteConfirm(false);if(!selectMode)setSelected(new Set());}}>Cancel</button>
                <button className="btn btn-danger" onClick={confirmDelete}><Trash2 size={13}/> Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:660}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 style={{fontSize:16,fontWeight:800}}>New AWB Booking</h2>
              <button className="btn btn-ghost btn-icon" onClick={()=>{setShowForm(false);setForm(initForm);}}><X size={16}/></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-row form-row-2" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">AWB Number * <span style={{fontSize:10,color:'var(--text-muted)',fontWeight:400}}>(prefix-number, e.g. 312-31444)</span></label>
                  <div style={{display:'flex',alignItems:'center',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden',background:'var(--surface-base)'}}>
                    <input className="input" style={{border:'none',borderRadius:0,width:60,textAlign:'center',fontWeight:700,borderRight:'1px solid var(--border)',background:'var(--surface-sunken)',padding:'0 8px',fontFamily:'var(--font-mono)'}} value={form.awbPrefix??'312'} onChange={e=>setForm(f=>({...f,awbPrefix:e.target.value}))} maxLength={5} placeholder="312"/>
                    <span style={{padding:'0 6px',color:'var(--text-muted)',fontWeight:700}}>-</span>
                    <input className="input" style={{border:'none',borderRadius:0,flex:1,fontFamily:'var(--font-mono)'}} placeholder="31444" value={form.awbNo} onChange={e=>setForm(f=>({...f,awbNo:e.target.value}))} required/>
                  </div>
                </div>
                <div className="form-group">
                  <label className="label">Party / Customer *</label>
                  <div style={{display:'flex',gap:6}}>
                    <select className="input" style={{flex:1}} value={form.partyId} onChange={e=>setForm(f=>({...f,partyId:e.target.value}))} required>
                      <option value="">Select party…</option>
                      {activeParties.map(p=><option key={p.id} value={p.id}>{p.partyName}</option>)}
                    </select>
                    <button type="button" className="btn btn-secondary btn-sm" style={{whiteSpace:'nowrap'}} onClick={()=>setShowAddParty(true)}><Plus size={12}/> Party</button>
                  </div>
                </div>
              </div>
              <div className="form-row form-row-3" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Origin *</label>
                  <input className="input" list="awb-cities-list" placeholder="e.g. DEL" value={form.origin}
                    onChange={e=>onRouteChange(e.target.value.toUpperCase(),form.destination)} required/>
                </div>
                <div className="form-group">
                  <label className="label">Destination *</label>
                  <input className="input" list="awb-cities-list" placeholder="e.g. BOM" value={form.destination}
                    onChange={e=>onRouteChange(form.origin,e.target.value.toUpperCase())} required/>
                </div>
                <datalist id="awb-cities-list">
                  {[...new Set([...CITIES,...(typeof window!=='undefined'?JSON.parse(localStorage.getItem('customCities')||'[]'):[])])].map((c:string)=><option key={c} value={c}/>)}
                </datalist>
                <div className="form-group">
                  <label className="label">Airline *</label>
                  <select className="input" value={form.airlineName} onChange={e=>{setForm(f=>({...f,airlineName:e.target.value}));onRouteChange(form.origin,form.destination);}} required>
                    <option value="">Airline…</option>
                    {AIRLINES.map(a=><option key={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row form-row-3" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Date</label>
                  <input className="input" type="date" value={form.bookingDate} onChange={e=>setForm(f=>({...f,bookingDate:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="label">Weight (kg) *</label>
                  <input className="input" type="number" min="0" step="0.1" placeholder="0" value={form.weight||''} onChange={e=>setForm(f=>({...f,weight:parseFloat(e.target.value)||0}))} required/>
                </div>
                <div className="form-group">
                  <label className="label">Pieces</label>
                  <input className="input" type="number" min="1" value={form.pieces} onChange={e=>setForm(f=>({...f,pieces:parseInt(e.target.value)||1}))}/>
                </div>
              </div>
              <div className="form-row form-row-3" style={{marginBottom:16}}>
                <div className="form-group">
                  <label className="label">Base Rate (₹/kg) *</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.baseRate||''} onChange={e=>setForm(f=>({...f,baseRate:parseFloat(e.target.value)||0}))} style={{fontFamily:'var(--font-mono)'}} required/>
                  {autoFilled && <div style={{fontSize:10,color:'var(--success)',marginTop:3}}>✓ Auto-filled from rate sheet</div>}
                </div>
                <div className="form-group">
                  <label className="label">Markup (₹)</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.markupAmount||''} onChange={e=>setForm(f=>({...f,markupAmount:parseFloat(e.target.value)||0}))} style={{fontFamily:'var(--font-mono)'}}/>
                </div>
              </div>

              {/* Total summary */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
                {[
                  { label:'Freight', val:`₹${freightBase.toFixed(0)}` },
                  { label:'Markup',  val:`₹${form.markupAmount.toFixed(0)}` },
                  { label:'Total',   val:fmt(totalAmount), highlight:true },
                ].map(s=>(
                  <div key={s.label} style={{padding:'9px 12px',background:s.highlight?'var(--accent-subtle)':'var(--surface-sunken)',border:`1px solid ${s.highlight?'var(--warning-border)':'var(--border)'}`,borderRadius:8}}>
                    <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{s.label}</div>
                    <div style={{fontSize:15,fontWeight:800,fontFamily:'var(--font-mono)',color:s.highlight?'var(--accent-dark)':'var(--text-primary)'}}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Credit check */}
              {selParty && selParty.creditLimit > 0 && (()=>{
                const ck = checkCreditLimit(selParty.id, totalAmount);
                if (!ck.warning) return null;
                return <div className={`alert ${ck.allowed?'alert-warning':'alert-danger'}`} style={{marginBottom:14,fontSize:12}}>⚠️ {ck.message}</div>;
              })()}

              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={()=>{setShowForm(false);setForm(initForm);}}>Cancel</button>
                <button type="submit" className="btn btn-primary"><CheckCircle size={13}/> Save AWB Booking</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulk && <AwbBulkDownloadModal awbBookings={awbBookings} onClose={()=>setShowBulk(false)}/>}

      {showAddParty && (
        <AddPartyModal
          onCreated={(party) => {
            setForm(f => ({ ...f, partyId: party.id }));
            refresh();
          }}
          onClose={() => setShowAddParty(false)}
        />
      )}

      {docketAwb && (
        <AddDocketFromAwbModal
          awb={docketAwb}
          parties={activeParties}
          onSave={(d)=>{ startTransition(async()=>{ const res = await createDocketBooking(d); if (res && 'error' in res) { toast.error('Could not create docket'); return; } toast.success(`Docket ${d.docketNo} linked to AWB ${docketAwb.awbNo}`); setDocketAwb(null); refresh(); }); }}
          onClose={()=>setDocketAwb(null)}
        />
      )}

      {connectDocketAwb && (
        <ConnectDocketModal
          awb={connectDocketAwb}
          docketBookings={docketBookings}
          onConnect={(docketId)=>{ startTransition(async()=>{ const res = await linkAwbToDocket(docketId, connectDocketAwb.id); if (res && 'error' in res) { toast.error(res.error as string); return; } toast.success('Docket linked'); setConnectDocketAwb(null); refresh(); }); }}
          onClose={()=>setConnectDocketAwb(null)}
        />
      )}

      {showEditModal && editingId && (
        <AwbEditModal
          booking={awbBookings.find(b=>b.id===editingId)!}
          parties={activeParties}
          airlines={AIRLINES} cities={CITIES}
          onSave={(data)=>saveEdit(editingId)}
          editForm={editForm} setEditForm={setEditForm}
          onClose={()=>{setShowEditModal(false);setEditingId(null);}}
        />
      )}
    </div>
  );
}

// ── AWB-only Bulk Download Modal ──────────────────────────────────────────
function AwbBulkDownloadModal({ awbBookings, onClose }: { awbBookings: {id:string;awbNo:string;partyName:string;origin:string;destination:string;airlineName:string;bookingDate:string;weight:number;pieces:number;baseRate:number;markupAmount:number;gstAmount:number;totalAmount:number;status:string}[]; onClose: ()=>void }) {
  const [range, setRange] = useState<DateRange>('1m');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const DATE_OPTS: {value:DateRange;label:string}[] = [
    {value:'1d',label:'Today'},{value:'7d',label:'7 Days'},{value:'1m',label:'1 Month'},
    {value:'3m',label:'3 Months'},{value:'6m',label:'6 Months'},{value:'1y',label:'1 Year'},{value:'all',label:'All Time'},
  ];

  function doDownload() {
    let data = filterByDateRange(awbBookings,'bookingDate',range);
    if (statusFilter !== 'ALL') data = data.filter((b: any) => b.status === statusFilter);
    const rows = data.map((b: any) => ({ 'AWB No':b.awbNo, Party:b.partyName, Origin:b.origin, Destination:b.destination, Airline:b.airlineName, Date:b.bookingDate, 'Weight(kg)':b.weight, Pieces:b.pieces, 'Base Rate(₹)':b.baseRate, 'Markup(₹)':b.markupAmount, 'Total(₹)':b.totalAmount.toFixed(2), Status:b.status }));
    const fname = `awb_bookings_${range}`;
    if(format==='csv') exportToCSV(rows,fname);
    else if(format==='xlsx') exportToXLSX(rows,fname);
    else exportToPDF('AWB Bookings Report',rows,fname);
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{maxWidth:440}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h2 style={{fontSize:16,fontWeight:800,display:'flex',alignItems:'center',gap:8}}><Download size={16}/> AWB Bulk Download</h2>
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
          <button className="btn btn-primary" onClick={doDownload}><Download size={13}/> Download AWB Data</button>
        </div>
      </div>
    </div>
  );
}


// ── AWB Edit Modal ────────────────────────────────────────────────────────────
function AwbEditModal({ booking, parties, airlines, cities, onSave, editForm, setEditForm, onClose }: {
  booking: any; parties: any[]; airlines: string[]; cities: string[];
  onSave: (data: any) => void;
  editForm: any; setEditForm: (fn: (f: any) => any) => void;
  onClose: () => void;
}) {
  const w = editForm.weight||0, r = editForm.baseRate||0, m = editForm.markupAmount||0;
  const total  = w*r + m;
  const inp = (label: string, field: string, type = 'text', extra: any = {}) => (
    <div className="form-group">
      <label className="label">{label}</label>
      <input className="input" type={type} value={editForm[field]??''} {...extra}
        onChange={e=>setEditForm((f: any)=>({...f,[field]:type==='number'?parseFloat(e.target.value)||0:e.target.value}))}/>
    </div>
  );
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{maxWidth:660}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h2 style={{fontSize:16,fontWeight:800}}>Edit AWB Booking — <span style={{fontFamily:'var(--font-mono)',color:'var(--accent-dark)'}}>{booking.awbNo}</span></h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="form-row form-row-2" style={{marginBottom:12}}>
          {inp('AWB Number *','awbNo')}
          <div className="form-group">
            <label className="label">Airline *</label>
            <select className="input" value={editForm.airlineName||''} onChange={e=>setEditForm((f:any)=>({...f,airlineName:e.target.value}))}>
              {airlines.map(a=><option key={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row form-row-2" style={{marginBottom:12}}>
          <div className="form-group">
            <label className="label">Origin *</label>
            <select className="input" value={editForm.origin||''} onChange={e=>setEditForm((f:any)=>({...f,origin:e.target.value}))}>
              {cities.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Destination *</label>
            <select className="input" value={editForm.destination||''} onChange={e=>setEditForm((f:any)=>({...f,destination:e.target.value}))}>
              {cities.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row form-row-3" style={{marginBottom:12}}>
          {inp('Booking Date','bookingDate','date')}
          {inp('Weight (kg) *','weight','number',{min:0})}
          {inp('Pieces','pieces','number',{min:1})}
        </div>
        <div className="form-row form-row-2" style={{marginBottom:12}}>
          {inp('Base Rate (₹/kg)','baseRate','number',{min:0})}
          {inp('Markup (₹)','markupAmount','number',{min:0})}
        </div>
        {inp('Notes','notes')}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,margin:'16px 0'}}>
          {[{l:'Freight',v:`₹${(w*r).toFixed(0)}`},{l:'Markup',v:`₹${m.toFixed(0)}`},{l:'Total',v:`₹${total.toFixed(0)}`,hi:true}].map(s=>(
            <div key={s.l} style={{padding:'8px 12px',background:s.hi?'var(--accent-subtle)':'var(--surface-sunken)',border:`1px solid ${s.hi?'var(--warning-border)':'var(--border)'}`,borderRadius:8}}>
              <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase'}}>{s.l}</div>
              <div style={{fontSize:14,fontWeight:800,fontFamily:'var(--font-mono)',color:s.hi?'var(--accent-dark)':'var(--text-primary)'}}>{s.v}</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={()=>onSave(editForm)}><Save size={13}/> Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Docket from AWB Modal ─────────────────────────────────────────────────
function AddDocketFromAwbModal({ awb, parties, onSave, onClose }: {
  awb: any; parties: any[];
  onSave: (d: any) => void; onClose: () => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    docketNo: '', partyId: awb.partyId, bookingDate: today,
    origin: awb.origin, destination: awb.destination,
    description: '', rateFittedAmount: 0, markupAmount: 0,
    gstRate: 18, dueDatePolicy: 30, notes: '',
  });
  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const gstAmt = (form.rateFittedAmount + form.markupAmount) * form.gstRate / 100;
  const total  = form.rateFittedAmount + form.markupAmount + gstAmt;
  const selParty = parties.find((p: any) => p.id === form.partyId);

  function handleSave() {
    if (!form.docketNo || form.rateFittedAmount <= 0) { alert('Docket No. and Rate are required.'); return; }
    onSave({
      docketNo: form.docketNo, partyId: form.partyId, partyName: selParty?.partyName || awb.partyName,
      bookingDate: form.bookingDate, origin: form.origin, destination: form.destination,
      description: form.description, rateFittedAmount: form.rateFittedAmount,
      markupAmount: form.markupAmount, gstRate: form.gstRate, gstAmount: gstAmt,
      totalAmount: total, dueDatePolicy: form.dueDatePolicy, status: 'BOOKED' as const,
      notes: form.notes, linkedAwbId: awb.id,
    });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 580 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <h2 style={{ fontSize:16, fontWeight:800 }}>Add Docket</h2>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
              Linked to AWB: <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--accent-dark)' }}>{awb.awbNo}</span> · {awb.partyName}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16}/></button>
        </div>

        <div className="form-row form-row-2" style={{ marginBottom:12 }}>
          <div className="form-group">
            <label className="label">Docket No. *</label>
            <input className="input" value={form.docketNo} onChange={e=>f('docketNo',e.target.value)} placeholder="DKT-2026-XXXX"/>
          </div>
          <div className="form-group">
            <label className="label">Party</label>
            <select className="input" value={form.partyId} onChange={e=>f('partyId',e.target.value)}>
              {parties.map((p:any)=><option key={p.id} value={p.id}>{p.partyName}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row form-row-3" style={{ marginBottom:12 }}>
          <div className="form-group">
            <label className="label">Booking Date</label>
            <input className="input" type="date" value={form.bookingDate} onChange={e=>f('bookingDate',e.target.value)}/>
          </div>
          <div className="form-group">
            <label className="label">Origin</label>
            <input className="input" value={form.origin} onChange={e=>f('origin',e.target.value)}/>
          </div>
          <div className="form-group">
            <label className="label">Destination</label>
            <input className="input" value={form.destination} onChange={e=>f('destination',e.target.value)}/>
          </div>
        </div>
        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="label">Description</label>
          <input className="input" value={form.description} onChange={e=>f('description',e.target.value)} placeholder="Shipment description…"/>
        </div>
        <div className="form-row form-row-3" style={{ marginBottom:12 }}>
          <div className="form-group">
            <label className="label">Rate Fitted (₹) *</label>
            <input className="input" type="number" min="0" value={form.rateFittedAmount||''} onChange={e=>f('rateFittedAmount',parseFloat(e.target.value)||0)}/>
          </div>
          <div className="form-group">
            <label className="label">Markup (₹)</label>
            <input className="input" type="number" min="0" value={form.markupAmount||''} onChange={e=>f('markupAmount',parseFloat(e.target.value)||0)}/>
          </div>
          <div className="form-group">
            <label className="label">GST Rate (%)</label>
            <select className="input" value={form.gstRate} onChange={e=>f('gstRate',parseInt(e.target.value))}>
              <option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option>
            </select>
          </div>
        </div>

        {/* Summary */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
          {[{l:'Rate',v:`₹${form.rateFittedAmount.toFixed(0)}`},{l:'Markup',v:`₹${form.markupAmount.toFixed(0)}`},{l:`GST ${form.gstRate}%`,v:`₹${gstAmt.toFixed(0)}`},{l:'Total',v:`₹${total.toFixed(0)}`,hi:true}].map(s=>(
            <div key={s.l} style={{padding:'8px 10px',background:s.hi?'var(--accent-subtle)':'var(--surface-sunken)',border:`1px solid ${s.hi?'var(--warning-border)':'var(--border)'}`,borderRadius:8}}>
              <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase'}}>{s.l}</div>
              <div style={{fontSize:13,fontWeight:800,fontFamily:'var(--font-mono)',color:s.hi?'var(--accent-dark)':'var(--text-primary)'}}>{s.v}</div>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}><CheckCircle size={13}/> Save Docket</button>
        </div>
      </div>
    </div>
  );
}

// ── Connect Existing Docket Modal (from AWB) ──────────────────────────────────
function ConnectDocketModal({ awb, docketBookings, onConnect, onClose }: {
  awb: any; docketBookings: any[];
  onConnect: (docketId: string) => void; onClose: () => void;
}) {
  const [selId, setSelId] = useState('');
  const unlinked = docketBookings.filter((d:any) => !d.linkedAwbId);
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{maxWidth:460}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div>
            <h2 style={{fontSize:16,fontWeight:800}}>Connect Existing Docket</h2>
            <div style={{fontSize:11,color:'var(--text-muted)'}}>AWB: <span style={{fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--accent-dark)'}}>{awb.awbNo}</span></div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="form-group" style={{marginBottom:16}}>
          <label className="label">Select Unlinked Docket</label>
          <select className="input" value={selId} onChange={e=>setSelId(e.target.value)}>
            <option value="">Choose docket…</option>
            {unlinked.map((d:any)=><option key={d.id} value={d.id}>{d.docketNo} · {d.partyName} · {d.origin||''}→{d.destination||''} · {d.status}</option>)}
          </select>
          {unlinked.length===0 && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>No unlinked dockets available</div>}
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!selId} onClick={()=>{if(selId)onConnect(selId);}}><CheckCircle size={13}/> Link Docket</button>
        </div>
      </div>
    </div>
  );
}
