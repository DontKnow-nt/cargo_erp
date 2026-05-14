'use client';
import { Bell, CheckCheck, AlertTriangle, FileText, CreditCard, TrendingUp } from 'lucide-react';
import { useStore } from '@/lib/store';

export default function NotificationsPage() {
  const invoices    = useStore(s => s.invoices);
  const parties     = useStore(s => s.parties);
  const outstanding = useStore(s => s.outstanding);

  const notifications = [
    ...invoices.filter(i=>i.status==='OVERDUE').map(i=>({ id:'n-'+i.id, type:'danger', icon:<AlertTriangle size={14}/>, title:`Invoice ${i.invoiceNo} is overdue`, body:`${i.partyName} – ₹${i.outstandingTotal.toLocaleString('en-IN')} unpaid since ${i.dueDate}`, time:i.dueDate })),
    ...invoices.filter(i=>i.status==='PARTIALLY_PAID').map(i=>({ id:'np-'+i.id, type:'warning', icon:<CreditCard size={14}/>, title:`Partial payment on ${i.invoiceNo}`, body:`${i.partyName} – ₹${i.paidTotal.toLocaleString('en-IN')} paid, ₹${i.outstandingTotal.toLocaleString('en-IN')} outstanding`, time:i.invoiceDate })),
    ...parties.filter(p=>{ const used=outstanding.filter(o=>o.partyId===p.id&&o.outstandingAmount>0).reduce((s,o)=>s+o.outstandingAmount,0); return p.creditLimit>0&&used/p.creditLimit>0.8; }).map(p=>{ const used=outstanding.filter(o=>o.partyId===p.id&&o.outstandingAmount>0).reduce((s,o)=>s+o.outstandingAmount,0); return { id:'nc-'+p.id, type:'danger', icon:<TrendingUp size={14}/>, title:`Credit limit alert: ${p.partyName}`, body:`₹${used.toLocaleString('en-IN')} used of ₹${p.creditLimit.toLocaleString('en-IN')} limit (${(used/p.creditLimit*100).toFixed(0)}%)`, time:new Date().toISOString().split('T')[0] }; }),
    ...invoices.filter(i=>i.status==='DRAFT').map(i=>({ id:'nd-'+i.id, type:'info', icon:<FileText size={14}/>, title:`Draft invoice pending review`, body:`${i.invoiceNo} for ${i.partyName} – ₹${i.grandTotal.toLocaleString('en-IN')} not yet finalized`, time:i.invoiceDate })),
  ].sort((a,b)=>b.time.localeCompare(a.time));

  const colors: Record<string,{bg:string;border:string;text:string}> = {
    danger:  {bg:'#fef2f2',border:'#fca5a5',text:'#dc2626'},
    warning: {bg:'#fffbeb',border:'#fcd34d',text:'#d97706'},
    info:    {bg:'#eff6ff',border:'#93c5fd',text:'#2563eb'},
  };

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><Bell size={20} color="var(--accent-dark)"/> Notifications</h1>
          <p className="page-subtitle">{notifications.length} active alerts requiring attention.</p>
        </div>
        <button className="btn btn-secondary btn-sm"><CheckCheck size={12}/> Mark All Read</button>
      </div>

      {notifications.length===0 && (
        <div style={{textAlign:'center',padding:'60px 0',color:'var(--text-muted)'}}>
          <CheckCheck size={40} style={{margin:'0 auto 12px',opacity:0.3}}/>
          <div style={{fontSize:15,fontWeight:600}}>All clear!</div>
          <div style={{fontSize:13,marginTop:4}}>No pending notifications</div>
        </div>
      )}

      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {notifications.map(n=>{
          const c = colors[n.type];
          return (
            <div key={n.id} style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:10,padding:'14px 18px',display:'flex',gap:12,alignItems:'flex-start'}}>
              <div style={{width:30,height:30,borderRadius:8,background:c.text+'20',display:'flex',alignItems:'center',justifyContent:'center',color:c.text,flexShrink:0}}>{n.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:c.text}}>{n.title}</div>
                <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:3}}>{n.body}</div>
              </div>
              <div style={{fontSize:11,color:'var(--text-muted)',flexShrink:0}}>{n.time}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
