'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, Plus } from 'lucide-react';
import { useSharedData } from '@/lib/useSharedData';
import { createCreditNote } from '@/lib/actions/invoices';
import toast from 'react-hot-toast';

const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function numberToWords(num: number): string {
  const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if(num===0)return'Zero';
  function cv(n:number):string{if(n<20)return ones[n];if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'');if(n<1000)return ones[Math.floor(n/100)]+' Hundred'+(n%100?' '+cv(n%100):'');if(n<100000)return cv(Math.floor(n/1000))+' Thousand'+(n%1000?' '+cv(n%1000):'');return cv(Math.floor(n/100000))+' Lakh'+(n%100000?' '+cv(n%100000):'')}
  return cv(Math.floor(num))+' Only';
}

export default function CreditNoteNewPage() {
  const { parties } = useSharedData();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const today = new Date().toISOString().split('T')[0];
  const activeParties = parties.filter(p => p.status === 'ACTIVE').filter((p,i,arr)=>arr.findIndex(x=>x.partyName.toLowerCase()===p.partyName.toLowerCase())===i);

  const [form, setForm] = useState({
    partyId: '', creditNoteNo: `TCN/CCU/${new Date().getFullYear().toString().slice(-2)}-${String(new Date().getFullYear()+1).slice(-2)}/`,
    creditNoteDate: today, pos: 'DELHI',
    periodFrom: '', periodTo: '', referenceNo: '',
    sacCode: '996531',
    description: 'CREDIT NOTE ISSUED AGAINST INVOICE NO  AWB  , FOR CHARGED ON BILL',
    taxableAmount: 0, gstRate: 18, gstAmount: 0, netPayable: 0,
  });

  const selParty = parties.find(p => p.id === form.partyId);
  const igst = parseFloat(((form.taxableAmount * form.gstRate) / 100).toFixed(2));
  const netPay = parseFloat((form.taxableAmount + igst).toFixed(2));

  function handleAmtChange(taxable: number) {
    const gst = parseFloat(((taxable * form.gstRate) / 100).toFixed(2));
    setForm(f => ({ ...f, taxableAmount: taxable, gstAmount: gst, netPayable: taxable + gst }));
  }
  function handleGstChange(rate: number) {
    const gst = parseFloat(((form.taxableAmount * rate) / 100).toFixed(2));
    setForm(f => ({ ...f, gstRate: rate, gstAmount: gst, netPayable: form.taxableAmount + gst }));
  }

  function handlePrint() {
    startTransition(async () => {
      const res = await createCreditNote({
        partyId: form.partyId,
        partyName: selParty?.partyName || 'TRIVENI CARGO EXPRESS INDIA PRIVATE LIMITED',
        creditNoteNo: form.creditNoteNo,
        description: form.description,
        amount: netPay,
        gstRate: form.gstRate,
        gstAmount: igst,
        taxableAmount: form.taxableAmount,
      });
      if (!res || 'error' in res) { toast.error((res as any)?.error || 'Failed'); return; }
      router.push(`/dashboard/credit-note/editor?id=${res.id}&prefill=1`);
    });
  }

  const rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 };
  const inp = (label: string, val: string|number, onChange: (v: string)=>void, type='text', placeholder='') => (
    <div className="form-group" style={{marginBottom:0}}>
      <label className="label">{label}</label>
      <input className="input" type={type} placeholder={placeholder} value={val} onChange={e=>onChange(e.target.value)}/>
    </div>
  );

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Credit Note</h1>
          <p className="page-subtitle">Fill in the details. Click Print to open the fully-editable credit note.</p>
        </div>
        <button className="btn btn-primary" disabled={isPending} onClick={handlePrint}>
          <Printer size={14}/> {isPending ? 'Opening…' : 'Print / Open Editor'}
        </button>
      </div>

      <div className="card" style={{padding:24}}>
        {/* Party + Credit Note No */}
        <div style={rowStyle}>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="label">Party (M/s) *</label>
            <select className="input" value={form.partyId} onChange={e=>setForm(f=>({...f,partyId:e.target.value}))}>
              <option value="">Select party…</option>
              {activeParties.map(p=><option key={p.id} value={p.id}>{p.partyName}</option>)}
            </select>
          </div>
          {inp('Credit Note No.', form.creditNoteNo, v=>setForm(f=>({...f,creditNoteNo:v})))}
        </div>

        {/* Date, POS, Period */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12,marginBottom:12}}>
          {inp('Credit Note Date', form.creditNoteDate, v=>setForm(f=>({...f,creditNoteDate:v})),'date')}
          {inp('POS', form.pos, v=>setForm(f=>({...f,pos:v})),'text','e.g. DELHI')}
          {inp('Period From', form.periodFrom, v=>setForm(f=>({...f,periodFrom:v})),'date')}
          {inp('Period To', form.periodTo, v=>setForm(f=>({...f,periodTo:v})),'date')}
        </div>

        {inp('Reference No#', form.referenceNo, v=>setForm(f=>({...f,referenceNo:v})),'text','e.g. CCU/24-25/0391')}

        {/* SAC + Description */}
        <div style={{marginTop:12,marginBottom:12}}>
          <div style={rowStyle}>
            {inp('SAC Code', form.sacCode, v=>setForm(f=>({...f,sacCode:v})))}
          </div>
          <div className="form-group">
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={{height:'auto',resize:'vertical'}}/>
          </div>
        </div>

        {/* Amount breakdown */}
        <div style={{background:'var(--surface-sunken)',border:'1px solid var(--border)',borderRadius:8,padding:'14px 16px'}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:12}}>Amount Breakdown</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="label">Taxable Amount (₹) *</label>
              <input className="input" type="number" min="0" step="0.01" value={form.taxableAmount||''} onChange={e=>handleAmtChange(parseFloat(e.target.value)||0)} style={{fontFamily:'var(--font-mono)',fontWeight:700}} placeholder="0"/>
            </div>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="label">GST / IGST Rate (%)</label>
              <select className="input" value={form.gstRate} onChange={e=>handleGstChange(parseFloat(e.target.value))}>
                {[0,5,10,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div className="form-group" style={{marginBottom:0}}>
              <label className="label">GST Amount (₹)</label>
              <input className="input" type="number" min="0" step="0.01" value={form.gstAmount||''} onChange={e=>{const v=parseFloat(e.target.value)||0;setForm(f=>({...f,gstAmount:v,netPayable:f.taxableAmount+v}));}} style={{fontFamily:'var(--font-mono)'}} placeholder="Auto"/>
            </div>
          </div>
          {/* Summary */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
            {[
              {label:'Taxable Amount',val:`₹${fmt(form.taxableAmount)}`,color:'var(--text-primary)'},
              {label:`IGST @ ${form.gstRate}%`,val:`₹${fmt(igst)}`,color:'#2563eb'},
              {label:'Net Payable',val:`₹${fmt(netPay)}`,color:'#059669',bold:true},
            ].map(s=>(
              <div key={s.label} style={{padding:'10px 14px',background:'var(--surface-base)',border:`1px solid ${s.color}30`,borderRadius:8,textAlign:'center'}}>
                <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',marginBottom:4}}>{s.label}</div>
                <div style={{fontSize:16,fontWeight:(s as any).bold?800:700,fontFamily:'var(--font-mono)',color:s.color}}>{s.val}</div>
              </div>
            ))}
          </div>
          {form.taxableAmount > 0 && (
            <div style={{marginTop:10,fontSize:11,color:'var(--text-secondary)'}}>
              <strong>Amount in Words:</strong> Rupees {numberToWords(Math.round(netPay))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
