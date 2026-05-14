'use client';
import { Settings, Save } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const [s, setS] = useState({ companyName:'Cargo Freight Pvt Ltd', gstin:'07AABCC1234A1Z5', address:'123 Transport Nagar, Delhi - 110020', phone:'9811001100', email:'billing@cargofreight.in', defaultGst:18, defaultCreditDays:30, defaultMarkup:0, lowCreditThreshold:80, currency:'INR', dateFormat:'DD/MM/YYYY', emailNotifications:true, smsAlerts:false, overdueAlerts:true });

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><Settings size={20} color="var(--accent-dark)"/> Settings</h1>
          <p className="page-subtitle">Configure company profile, billing defaults, and notification preferences.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={()=>toast.success('Settings saved')}><Save size={12}/> Save Settings</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        {/* Company Profile */}
        <div className="card" style={{padding:22}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:16}}>Company Profile</div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {[
              {label:'Company Name',key:'companyName',type:'text'},
              {label:'GSTIN',key:'gstin',type:'text'},
              {label:'Billing Email',key:'email',type:'email'},
              {label:'Phone',key:'phone',type:'tel'},
            ].map(f=>(
              <div key={f.key} className="form-group">
                <label className="label">{f.label}</label>
                <input className="input" type={f.type} value={s[f.key as keyof typeof s] as string} onChange={e=>setS(p=>({...p,[f.key]:e.target.value}))}/>
              </div>
            ))}
            <div className="form-group">
              <label className="label">Billing Address</label>
              <textarea className="input" rows={3} value={s.address} onChange={e=>setS(p=>({...p,address:e.target.value}))} style={{resize:'vertical'}}/>
            </div>
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          {/* Billing Defaults */}
          <div className="card" style={{padding:22}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:16}}>Billing Defaults</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {[
                {label:'Default GST Rate (%)',key:'defaultGst',type:'number',min:0,max:28},
                {label:'Default Credit Days',key:'defaultCreditDays',type:'number',min:0},
                {label:'Default Markup (₹)',key:'defaultMarkup',type:'number',min:0},
                {label:'Credit Limit Alert Threshold (%)',key:'lowCreditThreshold',type:'number',min:50,max:100},
              ].map(f=>(
                <div key={f.key} className="form-group">
                  <label className="label">{f.label}</label>
                  <input className="input" type="number" min={f.min} max={f.max} value={s[f.key as keyof typeof s] as number} onChange={e=>setS(p=>({...p,[f.key]:parseFloat(e.target.value)||0}))}/>
                </div>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <div className="card" style={{padding:22}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:16}}>Notifications</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {[
                {label:'Email Notifications',key:'emailNotifications'},
                {label:'SMS Alerts',key:'smsAlerts'},
                {label:'Overdue Invoice Alerts',key:'overdueAlerts'},
              ].map(f=>(
                <div key={f.key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',background:'var(--surface-sunken)',borderRadius:8,border:'1px solid var(--border)'}}>
                  <span style={{fontSize:13}}>{f.label}</span>
                  <div onClick={()=>setS(p=>({...p,[f.key]:!p[f.key as keyof typeof s]}))} style={{width:40,height:22,borderRadius:99,background:s[f.key as keyof typeof s]?'var(--accent)':'var(--border)',transition:'background 200ms',cursor:'pointer',position:'relative'}}>
                    <div style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:s[f.key as keyof typeof s]?20:3,transition:'left 200ms',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
