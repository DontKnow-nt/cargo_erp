'use client';
import { BarChart2, Download, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useState } from 'react';
import { DateRangeFilter, filterByDateRange, exportToCSV, type DateRange } from '@/lib/exportUtils';
import { useSharedData } from '@/lib/useSharedData';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#f59e0b','#2563eb','#059669','#dc2626','#7c3aed','#0891b2'];

export default function AnalyticsPage() {
  const { invoices, awbBookings: awb, docketBookings: dockets, paymentReceipts: payments } = useSharedData();
  const [range, setRange] = useState<DateRange>('3m');

  const filtInv = filterByDateRange(invoices, 'invoiceDate', range);
  const filtAwb = filterByDateRange(awb, 'bookingDate', range);
  const filtDkt = filterByDateRange(dockets, 'bookingDate', range);
  const filtPay = filterByDateRange(payments, 'paymentDate', range);

  const totalBilled    = filtInv.reduce((s,i)=>s+i.grandTotal,0);
  const totalCollected = filtPay.reduce((s,p)=>s+p.paymentAmount,0);
  const collectionRate = totalBilled>0 ? (totalCollected/totalBilled*100).toFixed(1) : '0';

  // Status breakdown pie
  const statusData = ['PAID','PARTIALLY_PAID','OVERDUE','FINALIZED','DRAFT'].map(s=>({
    name:s.replace('_',' '), value:filtInv.filter(i=>i.status===s).length,
  })).filter(d=>d.value>0);

  // Booking type bar
  const bookingData = [
    { type:'AWB', count:filtAwb.length, revenue:filtAwb.reduce((s,b)=>s+b.totalAmount,0) },
    { type:'Docket', count:filtDkt.length, revenue:filtDkt.reduce((s,b)=>s+b.totalAmount,0) },
  ];

  const fmt = (n:number) => n>=100000?`₹${(n/100000).toFixed(1)}L`:n>=1000?`₹${(n/1000).toFixed(0)}K`:`₹${n.toFixed(0)}`;

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><BarChart2 size={20} color="var(--accent-dark)"/> Analytics</h1>
          <p className="page-subtitle">Revenue, collection, and booking performance metrics.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={()=>exportToCSV(filtInv.map(i=>({InvoiceNo:i.invoiceNo,Party:i.partyName,Date:i.invoiceDate,Total:i.grandTotal,Paid:i.paidTotal,Outstanding:i.outstandingTotal,Status:i.status})),`analytics_${range}`)}><Download size={12}/> Export</button>
      </div>

      <div style={{marginBottom:16,overflowX:'auto'}}><DateRangeFilter value={range} onChange={setRange}/></div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        {[
          {label:'Total Billed',val:fmt(totalBilled),color:'#d97706'},
          {label:'Total Collected',val:fmt(totalCollected),color:'#059669'},
          {label:'Collection Rate',val:`${collectionRate}%`,color:parseFloat(collectionRate)>80?'#059669':'#dc2626'},
          {label:'Invoices',val:filtInv.length,color:'#2563eb'},
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{s.label}</div>
            <div style={{fontSize:26,fontWeight:800,fontFamily:'var(--font-mono)',color:s.color,marginTop:6}}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
        <div className="card" style={{padding:20}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Booking Volume</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bookingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="type" fontSize={11}/>
              <YAxis fontSize={11}/>
              <Tooltip contentStyle={{background:'var(--surface-base)',border:'1px solid var(--border)',borderRadius:8,fontSize:12}}/>
              <Bar dataKey="count" fill="#f59e0b" radius={[4,4,0,0]} name="Bookings"/>
              <Bar dataKey="revenue" fill="#2563eb" radius={[4,4,0,0]} name="Revenue" hide/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{padding:20}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Invoice Status Breakdown</div>
          {statusData.length>0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,value})=>`${name}: ${value}`} labelLine={false}>
                  {statusData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                </Pie>
                <Tooltip/>
                <Legend iconSize={10} wrapperStyle={{fontSize:11}}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-muted)',fontSize:12}}>No invoice data in selected range</div>}
        </div>
      </div>

      <div className="card" style={{padding:20}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Top Parties by Billed Amount</div>
        {(() => {
          const partyMap: Record<string,{name:string;billed:number;paid:number}> = {};
          filtInv.forEach(i=>{
            if(!partyMap[i.partyId]) partyMap[i.partyId]={name:i.partyName,billed:0,paid:0};
            partyMap[i.partyId].billed+=i.grandTotal;
            partyMap[i.partyId].paid+=i.paidTotal;
          });
          const parties = Object.values(partyMap).sort((a,b)=>b.billed-a.billed).slice(0,6);
          if(parties.length===0) return <div style={{textAlign:'center',padding:'20px 0',color:'var(--text-muted)',fontSize:12}}>No data in selected range</div>;
          return (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {parties.map((p,i)=>{
                const pct = p.billed>0 ? p.paid/p.billed : 0;
                return (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:12}}>
                    <div style={{width:120,fontSize:12,fontWeight:500,flexShrink:0}}>{p.name}</div>
                    <div style={{flex:1,height:20,background:'var(--surface-sunken)',borderRadius:99,overflow:'hidden',position:'relative'}}>
                      <div style={{height:'100%',width:`${Math.min(pct*100,100)}%`,background:'#059669',borderRadius:99,transition:'width 0.6s'}}/>
                      <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',paddingLeft:8,fontSize:10,color:'var(--text-muted)'}}>{(pct*100).toFixed(0)}% collected</div>
                    </div>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700,width:80,textAlign:'right'}}>{fmt(p.billed)}</div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
