'use client';
import { useState, useTransition } from 'react';
import { Users, Plus, Search, Download, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { useStore } from '@/lib/store';
import toast from 'react-hot-toast';
import { createParty, updateParty } from '@/lib/actions/parties';
import type { Party } from '@/lib/mockData';
import { shortName } from '@/lib/utils';
import { useSharedData } from '@/lib/useSharedData';
import { LiveIndicator } from '@/components/LiveIndicator';

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
type PartyForm = Omit<Party, 'id' | 'createdAt'>;
const normalizePartyStatus = (status: string): PartyForm['status'] => status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

export default function PartiesPage() {
  const { parties, outstanding, refresh } = useSharedData();

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]   = useState<string|null>(null);
  const [isPending, startTransition] = useTransition();

  const init: PartyForm = { partyName:'', gstin:'', contactPerson:'', phone:'', email:'', billingAddress:'', creditLimit:0, creditDays:30, status:'ACTIVE' };
  const [form, setForm] = useState(init);

  const filtered = parties.filter(p =>
    p.partyName.toLowerCase().includes(search.toLowerCase()) ||
    (p.gstin||'').toLowerCase().includes(search.toLowerCase()) ||
    (p.email||'').toLowerCase().includes(search.toLowerCase())
  );

  function getUsed(partyId: string) {
    return outstanding.filter(o => o.partyId === partyId && o.outstandingAmount > 0).reduce((s,o)=>s+o.outstandingAmount,0);
  }

  function openAdd() { setForm(init); setEditId(null); setShowForm(true); }
  function openEdit(p: typeof parties[0]) {
    setForm({ partyName:p.partyName, gstin:p.gstin||'', contactPerson:p.contactPerson||'', phone:p.phone||'', email:p.email||'', billingAddress:p.billingAddress||'', creditLimit:p.creditLimit, creditDays:p.creditDays, status:normalizePartyStatus(p.status) });
    setEditId(p.id); setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.partyName) { toast.error('Party name is required'); return; }
    startTransition(async () => {
      const res = editId ? await updateParty(editId, form) : await createParty(form);
      if (res && 'error' in res) {
        toast.error(typeof res.error === 'string' ? res.error : 'Validation error');
        return;
      }
      toast.success(editId ? 'Party updated' : `${form.partyName} added`);
      setShowForm(false); setForm(init); setEditId(null);
      refresh();
    });
  }

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><Users size={20} color="var(--accent-dark)"/> Parties & Customers</h1>
          <p className="page-subtitle">Manage customer master, GSTIN, credit limits and outstanding balances.</p>
        </div>
        <div style={{display:'flex',gap:9,alignItems:'center'}}>
          <LiveIndicator onRefresh={refresh} />
          <button className="btn btn-secondary btn-sm"><Download size={12}/> Export</button>
          <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={12}/> Add Party</button>
        </div>
      </div>

      <div style={{position:'relative',marginBottom:14}}>
        <Search size={12} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
        <input className="input" placeholder="Search by name, GSTIN, email…" style={{paddingLeft:30,height:36,fontSize:12}} value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Party Name</th><th>GSTIN</th><th>Contact</th><th>Email</th>
                <th style={{textAlign:'right'}}>Credit Limit</th><th style={{textAlign:'right'}}>Used</th>
                <th style={{textAlign:'right'}}>Available</th><th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={9} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No parties found</td></tr>}
              {filtered.map(p => {
                const used = getUsed(p.id);
                const avail = Math.max(0, p.creditLimit - used);
                const pct = p.creditLimit > 0 ? used / p.creditLimit : 0;
                const warn = pct >= 1;
                const caution = pct >= 0.8 && pct < 1;
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                        {(warn||caution) && <AlertTriangle size={12} color={warn?'#dc2626':'#d97706'}/>}
                        <span title={p.partyName}>{shortName(p.partyName)}</span>
                      </div>
                    </td>
                    <td><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text-secondary)'}}>{p.gstin||'—'}</span></td>
                    <td style={{fontSize:12,color:'var(--text-secondary)'}}>{p.contactPerson||'—'}</td>
                    <td style={{fontSize:12,color:'var(--text-muted)'}}>{p.email||'—'}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700}}>{p.creditLimit>0?fmt(p.creditLimit):'No Limit'}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--font-mono)',color:warn?'#dc2626':caution?'#d97706':'var(--text-primary)',fontWeight:700}}>{used>0?fmt(used):'₹0'}</td>
                    <td style={{textAlign:'right'}}>
                      {p.creditLimit > 0 ? (
                        <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700,color:warn?'#dc2626':'#059669'}}>{fmt(avail)}</span>
                      ) : <span style={{color:'var(--text-muted)',fontSize:12}}>Unlimited</span>}
                    </td>
                    <td>
                      <span style={{padding:'2px 9px',borderRadius:99,fontSize:10,fontWeight:600,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.07em',color:p.status==='ACTIVE'?'#059669':'#dc2626',background:p.status==='ACTIVE'?'#ecfdf5':'#fef2f2',border:`1px solid ${p.status==='ACTIVE'?'#6ee7b7':'#fca5a5'}`}}>{p.status}</span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>openEdit(p)}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:600}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 style={{fontSize:16,fontWeight:800}}>{editId?'Edit Party':'Add New Party'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={()=>{setShowForm(false);setForm(init);setEditId(null);}}><X size={16}/></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-row form-row-2" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Party Name *</label>
                  <input className="input" placeholder="Company or individual name" value={form.partyName} onChange={e=>setForm(f=>({...f,partyName:e.target.value}))} required/>
                </div>
                <div className="form-group">
                  <label className="label">GSTIN</label>
                  <input className="input" placeholder="15-digit GSTIN" maxLength={15} value={form.gstin} onChange={e=>setForm(f=>({...f,gstin:e.target.value.toUpperCase()}))} style={{fontFamily:'var(--font-mono)',letterSpacing:'0.05em'}}/>
                </div>
              </div>
              <div className="form-row form-row-3" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Contact Person</label>
                  <input className="input" value={form.contactPerson} onChange={e=>setForm(f=>({...f,contactPerson:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="label">Phone</label>
                  <input className="input" type="tel" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="label">Email</label>
                  <input className="input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
                </div>
              </div>
              <div className="form-group" style={{marginBottom:12}}>
                <label className="label">Billing Address</label>
                <input className="input" value={form.billingAddress} onChange={e=>setForm(f=>({...f,billingAddress:e.target.value}))}/>
              </div>
              <div className="form-row form-row-3" style={{marginBottom:16}}>
                <div className="form-group">
                  <label className="label">Credit Limit (₹)</label>
                  <input className="input" type="number" min="0" value={form.creditLimit||''} onChange={e=>setForm(f=>({...f,creditLimit:parseFloat(e.target.value)||0}))} style={{fontFamily:'var(--font-mono)'}}/>
                  <div style={{fontSize:10,color:'var(--text-muted)',marginTop:3}}>Set 0 for unlimited</div>
                </div>
                <div className="form-group">
                  <label className="label">Credit Days</label>
                  <input className="input" type="number" min="0" value={form.creditDays} onChange={e=>setForm(f=>({...f,creditDays:parseInt(e.target.value)||30}))}/>
                </div>
                <div className="form-group">
                  <label className="label">Status</label>
                  <select className="input" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value as 'ACTIVE'|'INACTIVE'}))}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={()=>{setShowForm(false);setForm(init);setEditId(null);}}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isPending}><CheckCircle size={13}/> {editId?'Update Party':'Add Party'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
