'use client';
import { useState, useTransition } from 'react';
import { TrendingUp, Plus, X, CheckCircle, Download, Search } from 'lucide-react';
import { useStore } from '@/lib/store';
import toast from 'react-hot-toast';
import { createRateVersion } from '@/lib/actions/rates';

const CARRIERS = ['IndiGo Cargo','Air India Cargo','SpiceJet Cargo','GoAir Cargo','Vistara Cargo','Akasa Air Cargo'];
const CITIES   = ['DEL','BOM','BLR','HYD','MAA','CCU','AMD','COK','JAI','PNQ','SXR','IXR','BHO'];

const STATUS_COLORS: Record<string,[string,string]> = {
  ACTIVE:['#059669','#ecfdf5'], DRAFT:['#94a3b8','#f8fafc'], SUPERSEDED:['#d97706','#fffbeb'], ARCHIVED:['#64748b','#f8fafc'],
};

export default function RatesPage() {
  const rateVersions = useStore(s => s.rateVersions);
  const freightRates  = useStore(s => s.freightRates);
  const [isPending, startTransition] = useTransition();

  const [selVersion, setSelVersion] = useState(rateVersions.find(v=>v.status==='ACTIVE')?.id || rateVersions[0]?.id || '');
  const [showForm, setShowForm]     = useState(false);
  const [search, setSearch]         = useState('');

  const [rvForm, setRvForm] = useState({ carrierName:CARRIERS[0], validFrom:'', validTo:'', notes:'' });
  const [rateRows, setRateRows] = useState([
    { origin:'DEL', destination:'BOM', baseRate:85, uom:'KG' },
    { origin:'DEL', destination:'BLR', baseRate:90, uom:'KG' },
  ]);

  const versionRates = freightRates.filter(r =>
    r.versionId === selVersion &&
    (r.origin.toLowerCase().includes(search.toLowerCase()) || r.destination.toLowerCase().includes(search.toLowerCase()))
  );

  function addRow() { setRateRows(rows=>[...rows,{origin:'',destination:'',baseRate:0,uom:'KG'}]); }
  function removeRow(i: number) { setRateRows(rows=>rows.filter((_,j)=>j!==i)); }
  function updateRow(i: number, key: string, val: string|number) {
    setRateRows(rows=>rows.map((r,j)=>j===i?{...r,[key]:val}:r));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rvForm.validFrom) { toast.error('Valid From date required'); return; }
    const validRows = rateRows.filter(r=>r.origin&&r.destination&&r.baseRate>0);
    if (validRows.length===0) { toast.error('Add at least one valid rate row'); return; }
    addRateVersion(
      { carrierName:rvForm.carrierName, validFrom:rvForm.validFrom, validTo:rvForm.validTo||undefined, status:'ACTIVE', notes:rvForm.notes },
      validRows.map(r=>({...r,activeFlag:true}))
    );
    toast.success(`Rate sheet for ${rvForm.carrierName} published`);
    setShowForm(false);
    setRvForm({ carrierName:CARRIERS[0], validFrom:'', validTo:'', notes:'' });
    setRateRows([{origin:'DEL',destination:'BOM',baseRate:85,uom:'KG'}]);
  }

  const selV = rateVersions.find(v=>v.id===selVersion);

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><TrendingUp size={20} color="var(--accent-dark)"/> Freight Rate Management</h1>
          <p className="page-subtitle">Versioned carrier rate sheets. Active rates auto-populate booking forms.</p>
        </div>
        <div style={{display:'flex',gap:9}}>
          <button className="btn btn-secondary btn-sm"><Download size={12}/> Export</button>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowForm(true)}><Plus size={12}/> Add Rate Sheet</button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:20}}>
        {/* Version list */}
        <div>
          <div style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>Rate Versions</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {rateVersions.map(v=>{
              const [c,bg] = STATUS_COLORS[v.status]||['#64748b','#f8fafc'];
              return (
                <div key={v.id} onClick={()=>setSelVersion(v.id)} style={{padding:'12px 14px',borderRadius:10,border:`1.5px solid ${selVersion===v.id?'var(--accent)':'var(--border)'}`,background:selVersion===v.id?'var(--accent-subtle)':'var(--surface-base)',cursor:'pointer',transition:'all 150ms'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                    <div style={{fontSize:12,fontWeight:700,color:selVersion===v.id?'var(--accent-dark)':'var(--text-primary)'}}>{v.carrierName}</div>
                    <span style={{fontSize:9,fontWeight:700,color:c,background:bg,padding:'2px 6px',borderRadius:99,border:`1px solid ${c}30`,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{v.status}</span>
                  </div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{v.validFrom} → {v.validTo||'Open'}</div>
                  {v.notes&&<div style={{fontSize:10,color:'var(--text-muted)',marginTop:4,fontStyle:'italic'}}>{v.notes}</div>}
                  <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4}}>
                    {freightRates.filter(r=>r.versionId===v.id).length} routes
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rate table */}
        <div>
          {selV && (
            <div style={{marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:13,fontWeight:700}}>{selV.carrierName} · {selV.validFrom} {selV.validTo?`→ ${selV.validTo}`:''}</div>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>{selV.notes}</div>
              </div>
              <div style={{position:'relative',width:200}}>
                <Search size={11} style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
                <input className="input" placeholder="Filter origin/dest…" style={{paddingLeft:26,height:32,fontSize:12}} value={search} onChange={e=>setSearch(e.target.value)}/>
              </div>
            </div>
          )}
          <div className="card" style={{overflow:'hidden'}}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Origin</th><th>Destination</th><th style={{textAlign:'right'}}>Base Rate</th>
                    <th>UOM</th><th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {versionRates.length===0&&<tr><td colSpan={5} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>{selVersion?'No rates match filter':'Select a rate version'}</td></tr>}
                  {versionRates.map(r=>(
                    <tr key={r.id}>
                      <td><span style={{fontFamily:'var(--font-mono)',fontWeight:700,fontSize:12,background:'var(--surface-sunken)',padding:'2px 8px',borderRadius:5}}>{r.origin}</span></td>
                      <td><span style={{fontFamily:'var(--font-mono)',fontWeight:700,fontSize:12,background:'var(--surface-sunken)',padding:'2px 8px',borderRadius:5}}>{r.destination}</span></td>
                      <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800,fontSize:14}}>₹{r.baseRate}</td>
                      <td style={{fontSize:11,color:'var(--text-muted)'}}>{r.uom}</td>
                      <td><div style={{width:10,height:10,borderRadius:'50%',background:r.activeFlag?'#059669':'#dc2626'}}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Add Rate Sheet Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:700,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 style={{fontSize:16,fontWeight:800}}>Add New Rate Sheet</h2>
              <button className="btn btn-ghost btn-icon" onClick={()=>setShowForm(false)}><X size={16}/></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-row form-row-2" style={{marginBottom:12}}>
                <div className="form-group">
                  <label className="label">Carrier *</label>
                  <select className="input" value={rvForm.carrierName} onChange={e=>setRvForm(f=>({...f,carrierName:e.target.value}))} required>
                    {CARRIERS.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Status Note</label>
                  <input className="input" placeholder="e.g. June 2026 revised rates" value={rvForm.notes} onChange={e=>setRvForm(f=>({...f,notes:e.target.value}))}/>
                </div>
              </div>
              <div className="form-row form-row-2" style={{marginBottom:16}}>
                <div className="form-group">
                  <label className="label">Valid From *</label>
                  <input className="input" type="date" value={rvForm.validFrom} onChange={e=>setRvForm(f=>({...f,validFrom:e.target.value}))} required/>
                </div>
                <div className="form-group">
                  <label className="label">Valid To</label>
                  <input className="input" type="date" value={rvForm.validTo} onChange={e=>setRvForm(f=>({...f,validTo:e.target.value}))}/>
                </div>
              </div>

              <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Rate Rows</div>
              <div style={{border:'1px solid var(--border)',borderRadius:10,overflow:'hidden',marginBottom:12}}>
                <table style={{width:'100%'}}>
                  <thead>
                    <tr style={{background:'var(--surface-page)',borderBottom:'1px solid var(--border)'}}>
                      {['Origin','Destination','Base Rate (₹/kg)','UOM',''].map(h=>(
                        <th key={h} style={{padding:'8px 12px',fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em',textAlign:'left'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rateRows.map((r,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'6px 8px'}}>
                          <select className="input" value={r.origin} onChange={e=>updateRow(i,'origin',e.target.value)} style={{height:32,fontSize:12}}>
                            <option value="">—</option>{CITIES.map(c=><option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={{padding:'6px 8px'}}>
                          <select className="input" value={r.destination} onChange={e=>updateRow(i,'destination',e.target.value)} style={{height:32,fontSize:12}}>
                            <option value="">—</option>{CITIES.map(c=><option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={{padding:'6px 8px'}}>
                          <input className="input" type="number" min="0" step="0.01" value={r.baseRate||''} onChange={e=>updateRow(i,'baseRate',parseFloat(e.target.value)||0)} style={{height:32,fontSize:12,fontFamily:'var(--font-mono)'}}/>
                        </td>
                        <td style={{padding:'6px 8px'}}>
                          <select className="input" value={r.uom} onChange={e=>updateRow(i,'uom',e.target.value)} style={{height:32,fontSize:12}}>
                            <option>KG</option><option>CBM</option><option>FLAT</option>
                          </select>
                        </td>
                        <td style={{padding:'6px 8px'}}>
                          <button type="button" className="btn btn-ghost btn-icon" style={{padding:'4px'}} onClick={()=>removeRow(i)}><X size={13}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" style={{marginBottom:16}} onClick={addRow}><Plus size={12}/> Add Route</button>

              <div style={{background:'var(--warning-bg)',border:'1px solid var(--warning-border)',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:12,color:'var(--warning)'}}>
                ⚠️ Adding this rate sheet will automatically <strong>supersede</strong> the existing active sheet for {rvForm.carrierName}.
              </div>

              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={()=>setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><CheckCircle size={13}/> Publish Rate Sheet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
