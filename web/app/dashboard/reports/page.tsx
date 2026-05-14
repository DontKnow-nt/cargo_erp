'use client';
import { BarChart2, Download, FileText } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useState } from 'react';
import { DateRangeFilter, filterByDateRange, exportToCSV, exportToXLSX, exportToPDF, BulkDownloadModal, type DateRange, type ExportFormat, type ExportModule } from '@/lib/exportUtils';
import { useSharedData } from '@/lib/useSharedData';

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReportsPage() {
  const { invoices, outstanding, paymentReceipts: payments, awbBookings: awb, docketBookings: dockets } = useSharedData();
  const parties     = useStore(s => s.parties);
  const freightRates = useStore(s => s.freightRates);
  const rateVersions = useStore(s => s.rateVersions);

  const [range, setRange] = useState<DateRange>('1m');
  const [activeReport, setActiveReport] = useState('ar_aging');
  const [showBulk, setShowBulk] = useState(false);

  const filtInv  = filterByDateRange(invoices, 'invoiceDate', range);
  const filtOuts = outstanding.filter(o => o.outstandingAmount > 0);
  const filtPay  = filterByDateRange(payments, 'paymentDate', range);
  const filtAwb  = filterByDateRange(awb, 'bookingDate', range);
  const filtDkt  = filterByDateRange(dockets, 'bookingDate', range);

  // AR Aging data grouped by party
  const agingReport = (() => {
    const map: Record<string,{party:string;current:number;d1_15:number;d16_30:number;d31_60:number;d61_90:number;d90plus:number;total:number}> = {};
    filtOuts.forEach(o => {
      if (!map[o.partyId]) map[o.partyId] = { party:o.partyName, current:0, d1_15:0, d16_30:0, d31_60:0, d61_90:0, d90plus:0, total:0 };
      const b = o.agingBucket;
      if (b==='CURRENT')    map[o.partyId].current  += o.outstandingAmount;
      if (b==='DAYS_1_15')  map[o.partyId].d1_15    += o.outstandingAmount;
      if (b==='DAYS_16_30') map[o.partyId].d16_30   += o.outstandingAmount;
      if (b==='DAYS_31_60') map[o.partyId].d31_60   += o.outstandingAmount;
      if (b==='DAYS_61_90') map[o.partyId].d61_90   += o.outstandingAmount;
      if (b==='DAYS_90_PLUS') map[o.partyId].d90plus += o.outstandingAmount;
      map[o.partyId].total += o.outstandingAmount;
    });
    return Object.values(map).sort((a,b)=>b.total-a.total);
  })();

  // Invoice summary
  const invoiceSummary = filtInv.map(i=>({ 'Invoice No':i.invoiceNo, 'Party':i.partyName, 'Type':i.bookingType, 'Booking Ref':i.bookingRef, 'Invoice Date':i.invoiceDate, 'Due Date':i.dueDate, 'Subtotal':i.subtotal, 'GST':i.gstTotal, 'Total':i.grandTotal, 'Paid':i.paidTotal, 'Outstanding':i.outstandingTotal, 'Status':i.status }));
  const paymentSummary = filtPay.map(p=>({ 'Receipt No':p.receiptNo, 'Party':p.partyName, 'Invoice':p.invoiceNo, 'Date':p.paymentDate, 'Mode':p.paymentMode, 'Reference':p.referenceNo||'', 'Amount':p.paymentAmount, 'Freight':p.freightComponent, 'GST':p.gstComponent, 'Status':p.status }));
  const awbSummary    = filtAwb.map(b=>({ 'AWB No':b.awbNo, 'Party':b.partyName, 'Route':`${b.origin}→${b.destination}`, 'Airline':b.airlineName, 'Date':b.bookingDate, 'Weight':b.weight, 'Rate':b.baseRate, 'Markup':b.markupAmount, 'GST':b.gstAmount, 'Total':b.totalAmount, 'Status':b.status }));
  const dktSummary    = filtDkt.map(b=>({ 'Docket No':b.docketNo, 'Party':b.partyName, 'Route':`${b.origin||''}→${b.destination||''}`, 'Description':b.description||'', 'Date':b.bookingDate, 'Rate':b.rateFittedAmount, 'Markup':b.markupAmount, 'GST':b.gstAmount, 'Total':b.totalAmount, 'Status':b.status }));

  function handleBulkDownload(modules: ExportModule[], range: DateRange, format: ExportFormat) {
    const datasets: Record<ExportModule, Record<string,unknown>[]> = {
      awb: awbSummary, dockets: dktSummary, invoices: invoiceSummary,
      payments: paymentSummary,
      outstanding: filtOuts.map(o=>({ Party:o.partyName, Invoice:o.invoiceNo, Ref:o.bookingRef, Date:o.invoiceDate, Due:o.dueDate, Original:o.originalAmount, Paid:o.paidAmount, Outstanding:o.outstandingAmount, Bucket:o.agingBucket })),
      parties: parties.map(p=>({ Name:p.partyName, GSTIN:p.gstin||'', Contact:p.contactPerson||'', Email:p.email||'', 'Credit Limit':p.creditLimit, 'Credit Days':p.creditDays, Status:p.status })),
      rates: freightRates.map(r=>({ Version:rateVersions.find(v=>v.id===r.versionId)?.carrierName||'', Origin:r.origin, Destination:r.destination, Rate:r.baseRate, UOM:r.uom, Active:r.activeFlag })),
    };
    modules.forEach(mod => {
      const data = datasets[mod];
      if (!data.length) return;
      const fname = `${mod}_${range}_${new Date().toISOString().split('T')[0]}`;
      if (format==='csv')  exportToCSV(data, fname);
      if (format==='xlsx') exportToXLSX(data, fname);
      if (format==='pdf')  exportToPDF(`${mod.toUpperCase()} Report`, data, fname);
    });
  }

  const REPORTS = [
    { id:'ar_aging', label:'AR Aging Report' },
    { id:'invoices', label:'Invoice Register' },
    { id:'payments', label:'Payment Register' },
    { id:'awb',      label:'AWB Booking Report' },
    { id:'dockets',  label:'Docket Booking Report' },
  ];

  function downloadActive(fmt: 'csv'|'xlsx'|'pdf') {
    const dataMap: Record<string,Record<string,unknown>[]> = { ar_aging: agingReport.map(r=>({Party:r.party,Current:r.current,'1-15d':r.d1_15,'16-30d':r.d16_30,'31-60d':r.d31_60,'61-90d':r.d61_90,'90+d':r.d90plus,Total:r.total})), invoices:invoiceSummary, payments:paymentSummary, awb:awbSummary, dockets:dktSummary };
    const data = dataMap[activeReport];
    const fname = `${activeReport}_${range}`;
    if (fmt==='csv')  exportToCSV(data, fname);
    if (fmt==='xlsx') exportToXLSX(data, fname);
    if (fmt==='pdf')  exportToPDF(activeReport.replace('_',' ').toUpperCase(), data, fname);
  }

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><BarChart2 size={20} color="var(--accent-dark)"/> Reports</h1>
          <p className="page-subtitle">Generate, preview, and download financial and operational reports.</p>
        </div>
        <div style={{display:'flex',gap:9}}>
          <button className="btn btn-secondary btn-sm" onClick={()=>setShowBulk(true)}><Download size={12}/> Bulk Download</button>
        </div>
      </div>

      {/* Date Range */}
      <div style={{marginBottom:16,overflowX:'auto'}}><DateRangeFilter value={range} onChange={setRange}/></div>

      <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:20}}>
        {/* Report list */}
        <div>
          {REPORTS.map(r=>(
            <div key={r.id} onClick={()=>setActiveReport(r.id)} style={{padding:'10px 14px',borderRadius:9,marginBottom:4,border:`1.5px solid ${activeReport===r.id?'var(--accent)':'var(--border)'}`,background:activeReport===r.id?'var(--accent-subtle)':'var(--surface-base)',cursor:'pointer',fontSize:12,fontWeight:activeReport===r.id?700:400,color:activeReport===r.id?'var(--accent-dark)':'var(--text-primary)',transition:'all 150ms'}}>
              <FileText size={12} style={{display:'inline',marginRight:7}}/>{r.label}
            </div>
          ))}
        </div>

        {/* Report preview */}
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700}}>{REPORTS.find(r=>r.id===activeReport)?.label}</div>
            <div style={{display:'flex',gap:6}}>
              {(['csv','xlsx','pdf'] as const).map(f=>(
                <button key={f} className="btn btn-secondary btn-sm" style={{fontSize:11}} onClick={()=>downloadActive(f)}>
                  <Download size={11}/> {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* AR Aging Report */}
          {activeReport==='ar_aging' && (
            <div className="card" style={{overflow:'hidden'}}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Party</th><th style={{textAlign:'right'}}>Current</th><th style={{textAlign:'right'}}>1-15d</th><th style={{textAlign:'right'}}>16-30d</th><th style={{textAlign:'right'}}>31-60d</th><th style={{textAlign:'right'}}>61-90d</th><th style={{textAlign:'right'}}>90+d</th><th style={{textAlign:'right'}}>Total</th></tr>
                  </thead>
                  <tbody>
                    {agingReport.length===0&&<tr><td colSpan={8} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No outstanding balances</td></tr>}
                    {agingReport.map((r,i)=>(
                      <tr key={i}>
                        <td style={{fontWeight:600}}>{r.party}</td>
                        {[r.current,r.d1_15,r.d16_30,r.d31_60,r.d61_90,r.d90plus].map((v,j)=>(
                          <td key={j} style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:v>0&&j>2?'#dc2626':v>0?'var(--text-primary)':'var(--text-muted)'}}>{v>0?fmt(v):'—'}</td>
                        ))}
                        <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800,color:'#dc2626'}}>{fmt(r.total)}</td>
                      </tr>
                    ))}
                    {agingReport.length>0&&(
                      <tr style={{background:'var(--surface-sunken)',fontWeight:700}}>
                        <td>Total</td>
                        {(['current','d1_15','d16_30','d31_60','d61_90','d90plus'] as const).map(k=>(
                          <td key={k} style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12}}>{fmt(agingReport.reduce((s,r)=>s+r[k],0))}</td>
                        ))}
                        <td style={{textAlign:'right',fontFamily:'var(--font-mono)',color:'#dc2626'}}>{fmt(agingReport.reduce((s,r)=>s+r.total,0))}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Invoice Register */}
          {activeReport==='invoices' && (
            <div className="card" style={{overflow:'hidden'}}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Invoice No</th><th>Party</th><th>Date</th><th>Due</th><th style={{textAlign:'right'}}>Total</th><th style={{textAlign:'right'}}>Outstanding</th><th>Status</th></tr></thead>
                  <tbody>
                    {filtInv.length===0&&<tr><td colSpan={7} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No invoices in range</td></tr>}
                    {filtInv.map(i=>(
                      <tr key={i.id}>
                        <td style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700}}>{i.invoiceNo}</td>
                        <td>{i.partyName}</td>
                        <td style={{fontSize:12,color:'var(--text-muted)'}}>{i.invoiceDate}</td>
                        <td style={{fontSize:12,color:new Date(i.dueDate)<new Date()&&i.status!=='PAID'?'#dc2626':'var(--text-muted)'}}>{i.dueDate}</td>
                        <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700}}>{fmt(i.grandTotal)}</td>
                        <td style={{textAlign:'right',fontFamily:'var(--font-mono)',color:i.outstandingTotal>0?'#dc2626':'#059669',fontWeight:700}}>{fmt(i.outstandingTotal)}</td>
                        <td style={{fontSize:11,fontFamily:'var(--font-mono)',color:i.status==='PAID'?'#059669':i.status==='OVERDUE'?'#dc2626':'#d97706'}}>{i.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payment Register */}
          {activeReport==='payments' && (
            <div className="card" style={{overflow:'hidden'}}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Receipt No</th><th>Party</th><th>Invoice</th><th>Date</th><th>Mode</th><th style={{textAlign:'right'}}>Amount</th><th style={{textAlign:'right'}}>GST</th></tr></thead>
                  <tbody>
                    {filtPay.length===0&&<tr><td colSpan={7} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No payments in range</td></tr>}
                    {filtPay.map(p=>(
                      <tr key={p.id}>
                        <td style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700}}>{p.receiptNo}</td>
                        <td>{p.partyName}</td>
                        <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--accent-dark)'}}>{p.invoiceNo}</td>
                        <td style={{fontSize:12,color:'var(--text-muted)'}}>{p.paymentDate}</td>
                        <td style={{fontSize:11,fontFamily:'var(--font-mono)'}}>{p.paymentMode}</td>
                        <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:800,color:'#059669'}}>{fmt(p.paymentAmount)}</td>
                        <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text-muted)'}}>{fmt(p.gstComponent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AWB Report */}
          {activeReport==='awb' && (
            <div className="card" style={{overflow:'hidden'}}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>AWB No</th><th>Party</th><th>Route</th><th>Date</th><th style={{textAlign:'right'}}>Weight</th><th style={{textAlign:'right'}}>Total</th><th>Status</th></tr></thead>
                  <tbody>
                    {filtAwb.length===0&&<tr><td colSpan={7} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No AWB bookings in range</td></tr>}
                    {filtAwb.map(b=>(
                      <tr key={b.id}>
                        <td style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700}}>{b.awbNo}</td>
                        <td>{b.partyName}</td>
                        <td style={{fontFamily:'var(--font-mono)',fontSize:11}}>{b.origin}→{b.destination}</td>
                        <td style={{fontSize:12,color:'var(--text-muted)'}}>{b.bookingDate}</td>
                        <td style={{textAlign:'right',fontFamily:'var(--font-mono)'}}>{b.weight}kg</td>
                        <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700}}>{fmt(b.totalAmount)}</td>
                        <td style={{fontSize:11,fontFamily:'var(--font-mono)',color:b.status==='INVOICED'?'#059669':'#2563eb'}}>{b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Docket Report */}
          {activeReport==='dockets' && (
            <div className="card" style={{overflow:'hidden'}}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Docket No</th><th>Party</th><th>Route</th><th>Date</th><th style={{textAlign:'right'}}>Total</th><th>Status</th></tr></thead>
                  <tbody>
                    {filtDkt.length===0&&<tr><td colSpan={6} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No docket bookings in range</td></tr>}
                    {filtDkt.map(b=>(
                      <tr key={b.id}>
                        <td style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700}}>{b.docketNo}</td>
                        <td>{b.partyName}</td>
                        <td style={{fontFamily:'var(--font-mono)',fontSize:11}}>{b.origin||''}→{b.destination||''}</td>
                        <td style={{fontSize:12,color:'var(--text-muted)'}}>{b.bookingDate}</td>
                        <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700}}>{fmt(b.totalAmount)}</td>
                        <td style={{fontSize:11,fontFamily:'var(--font-mono)',color:b.status==='INVOICED'?'#059669':'#2563eb'}}>{b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {showBulk && <BulkDownloadModal onClose={()=>setShowBulk(false)} onDownload={handleBulkDownload}/>}
    </div>
  );
}
