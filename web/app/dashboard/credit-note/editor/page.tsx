'use client';
import { Suspense, useRef, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { useSharedData } from '@/lib/useSharedData';

// ── Toolbar (identical to invoice editor) ────────────────────────────────────
function Toolbar({ paperRef }: { paperRef: React.RefObject<HTMLDivElement | null> }) {
  const [fontSize, setFontSize] = useState('3');
  const savedRange = useRef<Range | null>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  function saveSelection() { const sel = window.getSelection(); if (sel && sel.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange(); }
  function restoreSelection() { const sel = window.getSelection(); if (sel && savedRange.current) { try { sel.removeAllRanges(); sel.addRange(savedRange.current); } catch {} } }
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  function exec(cmd: string, value?: string) { restoreSelection(); document.execCommand(cmd, false, value); }
  function snapshot() { if (!paperRef.current) return; undoStack.current.push(paperRef.current.innerHTML); if (undoStack.current.length > 50) undoStack.current.shift(); redoStack.current = []; }
  function undo() { if (!paperRef.current || !undoStack.current.length) return; redoStack.current.push(paperRef.current.innerHTML); paperRef.current.innerHTML = undoStack.current.pop()!; }
  function redo() { if (!paperRef.current || !redoStack.current.length) return; undoStack.current.push(paperRef.current.innerHTML); paperRef.current.innerHTML = redoStack.current.pop()!; }
  function getDataTbody() { return paperRef.current?.querySelector<HTMLTableSectionElement>('#cn-body') ?? null; }
  function getSelectedTd() { const sel = window.getSelection(); const node = sel?.anchorNode; if (!node) return null; const el = (node.nodeType === 3 ? node.parentElement : node) as Element; return el?.closest?.('td') ?? null; }
  function addRow() { const tbody = getDataTbody(); if (!tbody) return; const td = getSelectedTd(); const tr = td?.closest('tr'); if (!tr || !tbody.contains(tr)) { alert('Click inside a data row first.'); return; } snapshot(); const newRow = tr.cloneNode(true) as HTMLTableRowElement; newRow.querySelectorAll('[contenteditable]').forEach(el => { (el as HTMLElement).innerText = ''; }); tr.after(newRow); }
  function delRow() { const tbody = getDataTbody(); if (!tbody) return; const td = getSelectedTd(); const tr = td?.closest('tr'); if (!tr || !tbody.contains(tr)) { alert('Click inside a data row first.'); return; } if (tbody.querySelectorAll('tr').length <= 1) return; snapshot(); tr.remove(); }
  const btn = (label: string, title: string, onClick: () => void, color?: string) => (
    <button key={label} title={title} onMouseDown={e => { e.preventDefault(); onClick(); }}
      style={{ padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: label === 'B' ? 700 : label === 'I' ? 400 : 500, fontStyle: label === 'I' ? 'italic' : 'normal', color: color || '#374151', minWidth: 28 }}>
      {label}
    </button>
  );
  const sep = <div style={{ width: 1, background: '#e5e7eb', margin: '0 4px', alignSelf: 'stretch' }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '6px 12px', background: '#f0f4ff', borderBottom: '1px solid #e5e7eb' }}>
      {btn('↩ Undo', 'Undo', undo)} {btn('↪ Redo', 'Redo', redo)} {sep}
      {btn('B', 'Bold', () => exec('bold'), '#111')}
      {btn('I', 'Italic', () => exec('italic'), '#111')}
      {btn('U̲', 'Underline', () => exec('underline'), '#111')} {sep}
      <span style={{ fontSize: 11, color: '#6b7280' }}>Size:</span>
      <select value={fontSize} onMouseDown={() => saveSelection()} onChange={e => { const v = e.target.value; setFontSize(v); restoreSelection(); exec('fontSize', v); }}
        style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 12, width: 70 }}>
        {[['1','8px'],['2','10px'],['3','12px'],['4','14px'],['5','18px'],['6','24px'],['7','32px']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
      </select> {sep}
      {btn('⬅', 'Align Left', () => exec('justifyLeft'))}
      {btn('≡', 'Align Center', () => exec('justifyCenter'))}
      {btn('➡', 'Align Right', () => exec('justifyRight'))} {sep}
      {btn('+ Row', 'Add row', addRow, '#059669')}
      {btn('− Row', 'Delete row', delRow, '#dc2626')}
    </div>
  );
}

function EC({ children, style, colSpan, rowSpan }: { children?: string | number; style?: React.CSSProperties; colSpan?: number; rowSpan?: number }) {
  return (
    <td colSpan={colSpan} rowSpan={rowSpan} style={{ border: '1px solid #000', padding: '3px 6px', fontSize: 10, verticalAlign: 'top', ...style }}>
      <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontFamily: 'Arial, sans-serif', fontSize: 10, whiteSpace: 'pre-wrap' }}>
        {children != null ? String(children) : ''}
      </div>
    </td>
  );
}

function numberToWords(num: number): string {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (num === 0) return 'Zero';
  function convert(n: number): string {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '');
    if (n < 1000) return ones[Math.floor(n/100)]+' Hundred'+(n%100 ? ' '+convert(n%100) : '');
    if (n < 100000) return convert(Math.floor(n/1000))+' Thousand'+(n%1000 ? ' '+convert(n%1000) : '');
    if (n < 10000000) return convert(Math.floor(n/100000))+' Lakh'+(n%100000 ? ' '+convert(n%100000) : '');
    return convert(Math.floor(n/10000000))+' Crore'+(n%10000000 ? ' '+convert(n%10000000) : '');
  }
  return convert(Math.floor(num)) + ' Only';
}

function fmt(n: number) { return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── Blank Credit Note (no invoice linked) ────────────────────────────────────
function BlankCreditNoteEditor() {
  const paperRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [banks, setBanks] = useState<{id:string;bank_name:string;account_name:string;account_number:string;ifsc:string;branch:string;is_default:number}[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  useEffect(() => { fetch('/api/banks').then(r=>r.json()).then(d=>{setBanks(d);const def=d.find((b:{is_default:number})=>b.is_default===1);if(def)setSelectedBankId(def.id);}).catch(()=>{}); }, []);
  const bank = banks.find(b=>b.id===selectedBankId) ?? banks[0];
  const today = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\//g,'/');

  const handlePrint = useCallback(async () => {
    const el = paperRef.current; if (!el) return;
    const clone = el.cloneNode(true) as HTMLElement;
    try { const resp = await fetch('/logo.png'); const blob2 = await resp.blob(); const b64 = await new Promise<string>(res=>{const r=new FileReader();r.onload=()=>res(r.result as string);r.readAsDataURL(blob2);}); clone.querySelectorAll('img').forEach(img=>{(img as HTMLImageElement).src=b64;}); } catch {}
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Credit Note</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:8px}table{border-collapse:collapse;width:100%}td{border:1px solid #000;padding:3px 6px;font-size:10px;vertical-align:top}[contenteditable]{outline:none;min-height:12px;white-space:pre-wrap}img{max-width:100%;object-fit:contain}@media print{@page{margin:6mm}body{padding:4px}}</style></head><body>${clone.innerHTML}<script>window.onload=function(){window.print();};<\/script></body></html>`;
    const blob = new Blob([html],{type:'text/html;charset=utf-8'}); const url = URL.createObjectURL(blob); const win = window.open(url,'_blank','width=1200,height=800'); if(win) setTimeout(()=>URL.revokeObjectURL(url),15000);
  }, []);

  const bankText = bank ? `Bank         : ${bank.bank_name}\nAccount No.: ${bank.account_number}\nIFSC Code  : ${bank.ifsc}\nBranch       : ${bank.branch}` : 'Bank         : HDFC BANK LIMITED\nAccount No.: 50200039767955\nIFSC Code  : HDFC0000106\nBranch       : Plot No 480, New Delhi 110037';

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Credit Note Editor</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {banks.length > 0 && (
            <select value={selectedBankId} onChange={e=>setSelectedBankId(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>
              {banks.map(b=><option key={b.id} value={b.id}>{b.bank_name}{b.is_default?'★':''}</option>)}
            </select>
          )}
          <span style={{ fontSize: 11, color: '#6b7280' }}>💡 Click any field to edit</span>
          <button onClick={handlePrint} style={{ display:'flex',alignItems:'center',gap:6,padding:'7px 16px',background:'#2563eb',color:'#fff',border:'none',borderRadius:7,fontWeight:700,fontSize:13,cursor:'pointer' }}>
            <Printer size={14}/> Print / Download
          </button>
        </div>
      </div>
      <Toolbar paperRef={paperRef} />

      <div ref={paperRef} style={{ background: '#fff', maxWidth: 1050, margin: '24px auto', padding: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
          <colgroup><col style={{width:'5%'}}/><col style={{width:'12%'}}/><col style={{width:'68%'}}/><col style={{width:'15%'}}/></colgroup>
          <tbody>
            <tr><td colSpan={4} style={{ border:'1px solid #000',padding:'8px 10px' }}>
              <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                <img src="/logo.png" alt="Triveni" style={{ width:60,height:60,objectFit:'contain',flexShrink:0 }}/>
                <div style={{ flex:1,textAlign:'center' }}>
                  <div style={{ fontSize:16,fontWeight:900 }}>TRIVENI CARGO EXPRESS INDIA PVT LTD</div>
                  <div style={{ fontSize:9 }}>Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15, Mahipalpur Extension, New Delhi, Delhi 110037</div>
                  <div style={{ fontSize:9 }}>Tel. : 011-65809456, 9311389456</div>
                  <div style={{ fontSize:10,fontWeight:700 }}>GSTIN : 07AAGCT2294N2ZR , CIN: U74999DL2017PTC316659</div>
                  <div style={{ fontSize:8,color:'#c00' }}>Regd. Office: Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15, Mahipalpur Extension, New Delhi 110037, near Hotel City Centre</div>
                  <div style={{ fontSize:9 }}>Email : info@tceipl.com</div>
                </div>
              </div>
            </td></tr>
            <tr><td colSpan={4} style={{ border:'1px solid #000',padding:'4px',textAlign:'center',fontWeight:700,fontSize:14,textDecoration:'underline' }}>CREDIT NOTE</td></tr>
            <tr>
              <td colSpan={2} style={{ border:'1px solid #000',padding:'6px 8px',verticalAlign:'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline:'none',minHeight:80,fontSize:10,fontFamily:'Arial,sans-serif',whiteSpace:'pre-wrap' }}>
                  {`M/s :      TRIVENI CARGO EXPRESS INDIA PRIVATE LIMITED\nGSTIN :   07AAGCT2294N2ZR\nAddress : Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15,\n             Mahipalpur Extension, New Delhi, Delhi 110037`}
                </div>
              </td>
              <td colSpan={2} style={{ border:'1px solid #000',padding:'6px 8px',verticalAlign:'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline:'none',minHeight:80,fontSize:10,fontFamily:'Arial,sans-serif',whiteSpace:'pre-wrap' }}>
                  {`Credit Note No.  :  TCN/CCU/25-26/\nCredit Note Date :  ${today}\nPOS                   :  DELHI\n\nCreditNote Period From : \nReference No#          :`}
                </div>
              </td>
            </tr>
            <tr style={{ background:'#f0f0f0' }}>
              <td style={{ border:'1px solid #000',padding:'4px 6px',fontSize:10,textAlign:'center',fontWeight:700,background:'#f0f0f0' }}><div contentEditable suppressContentEditableWarning style={{ outline:'none',fontFamily:'Arial,sans-serif',fontSize:10,fontWeight:700,textAlign:'center' }}>Sl#</div></td>
              <td style={{ border:'1px solid #000',padding:'4px 6px',fontSize:10,textAlign:'center',fontWeight:700,background:'#f0f0f0' }}><div contentEditable suppressContentEditableWarning style={{ outline:'none',fontFamily:'Arial,sans-serif',fontSize:10,fontWeight:700,textAlign:'center' }}>SAC Code</div></td>
              <td style={{ border:'1px solid #000',padding:'4px 6px',fontSize:10,textAlign:'center',fontWeight:700,background:'#f0f0f0' }}><div contentEditable suppressContentEditableWarning style={{ outline:'none',fontFamily:'Arial,sans-serif',fontSize:10,fontWeight:700,textAlign:'center' }}>Description</div></td>
              <td style={{ border:'1px solid #000',padding:'4px 6px',fontSize:10,textAlign:'center',fontWeight:700,background:'#f0f0f0' }}><div contentEditable suppressContentEditableWarning style={{ outline:'none',fontFamily:'Arial,sans-serif',fontSize:10,fontWeight:700,textAlign:'right' }}>Taxable Amount</div></td>
            </tr>
            {/* Data rows */}
            <EC style={{ textAlign:'center' }}>1</EC>
            <tr id="cn-body" data-cn-rows="1">
              <EC style={{ textAlign:'center' }}>1</EC>
              <EC style={{ textAlign:'center' }}>996531</EC>
              <EC style={{ lineHeight:1.5 }}>CREDIT NOTE ISSUED AGAINST INVOICE NO  AWB  , FOR CHARGED ON BILL</EC>
              <EC style={{ textAlign:'right' }}>0.00</EC>
            </tr>
            {/* Bank + Tax summary */}
            <tr>
              <td colSpan={2} style={{ border:'1px solid #000',padding:'6px 8px',verticalAlign:'top' }}>
                <div style={{ fontSize:10,marginBottom:4 }}><strong>Amount in Words :</strong> Zero Only</div>
                <div contentEditable suppressContentEditableWarning style={{ outline:'none',minHeight:70,fontSize:10,fontFamily:'Arial,sans-serif',whiteSpace:'pre-wrap',marginTop:6 }}>{bankText}</div>
              </td>
              <td colSpan={2} style={{ border:'1px solid #000',padding:'6px 8px',verticalAlign:'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline:'none',minHeight:70,fontSize:10,fontFamily:'Arial,sans-serif',whiteSpace:'pre-wrap' }}>
                  {`Total Taxable Amount  :  0.00\nSGST @ 0%                  :  0\nCGST @ 0%                  :  0\nIGST @ 18%                 :  0\nNet Payable Amount    :  0.00`}
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={3} style={{ border:'1px solid #000',padding:'5px 8px',verticalAlign:'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline:'none',minHeight:60,fontSize:9,fontFamily:'Arial,sans-serif',whiteSpace:'pre-wrap' }}>
                  {`NOTES :\n1. DIFFERENCE, IF ANY, MAY BE NOTIFIED WITHIN 3 DAYS OF RECEIPT.\n2. PLEASE PAY YOUR BILL AMOUNT WITHIN 15 DAYS OF RECEIPT.\n3. INTEREST AT 24% P.A. WILL BE CHARGED IF THE BILL IS NOT PAID WITHIN THE STIPULATED TIME.\n4. PAYMENT SHOULD BE MADE BY A/C PAYEE CHEQUE OR DD IN FAVOUR OF TRIVENI CARGO EXPRESS INDIA PVT LTD.\n5. JURISDICTION: ALL DISPUTES ARISING UNDER THIS BILL SHALL BE SUBJECT TO BE UNDER NEW DELHI JURISDICTION.`}
                </div>
              </td>
              <td style={{ border:'1px solid #000',padding:'5px 8px',verticalAlign:'bottom',textAlign:'right' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline:'none',fontSize:10,fontFamily:'Arial,sans-serif',whiteSpace:'pre-wrap',textAlign:'right' }}>
                  {`For TRIVENI CARGO EXPRESS INDIA PVT LTD\n\n\n\nAccts. Manager/Auth. Signatory`}
                </div>
              </td>
            </tr>
            <tr><td colSpan={4} style={{ border:'1px solid #000',padding:'3px 8px',textAlign:'center',fontSize:8 }}>
              Registered Office: Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15, Mahipalpur Extension, New Delhi 110037, near Hotel City Centre
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreditNoteEditorInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const { invoices, parties } = useSharedData();
  const paperRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [banks, setBanks] = useState<{id:string;bank_name:string;account_name:string;account_number:string;ifsc:string;branch:string;is_default:number}[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');

  useEffect(() => { fetch('/api/banks').then(r=>r.json()).then(d=>{setBanks(d);const def=d.find((b:{is_default:number})=>b.is_default===1);if(def)setSelectedBankId(def.id);}).catch(()=>{}); }, []);
  useEffect(() => {
    if (!id || !paperRef.current) return;
    fetch(`/api/invoices/${id}/editor-html`).then(r=>r.json()).then(data=>{if(data.html && paperRef.current) paperRef.current.innerHTML=data.html;}).catch(()=>{});
  }, [id]);

  const inv = invoices.find(i => i.id === id);
  const party = inv ? parties.find(p => p.id === inv.partyId) : undefined;
  const bank = banks.find(b=>b.id===selectedBankId) ?? banks[0];

  // If no id, show blank editor
  if (!id) return <BlankCreditNoteEditor />;

  async function handleSave() {
    if (!paperRef.current || !inv) return;
    setSaving(true);
    await fetch(`/api/invoices/${inv.id}/editor-html`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({html:paperRef.current.innerHTML})});
    setSaving(false);
    alert('Saved!');
  }

  const handlePrint = useCallback(async () => {
    const el = paperRef.current; if (!el) return;
    const clone = el.cloneNode(true) as HTMLElement;
    try { const resp = await fetch('/logo.png'); const blob2 = await resp.blob(); const b64 = await new Promise<string>(res=>{const r=new FileReader();r.onload=()=>res(r.result as string);r.readAsDataURL(blob2);}); clone.querySelectorAll('img').forEach(img=>{(img as HTMLImageElement).src=b64;}); } catch {}
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Credit Note - ${inv?.invoiceNo ?? ''}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:8px}table{border-collapse:collapse;width:100%}td{border:1px solid #000;padding:3px 6px;font-size:10px;vertical-align:top}[contenteditable]{outline:none;min-height:12px;white-space:pre-wrap}img{max-width:100%;object-fit:contain}@media print{@page{margin:6mm}body{padding:4px}}</style></head><body>${clone.innerHTML}<script>window.onload=function(){window.print();};<\/script></body></html>`;
    const blob = new Blob([html],{type:'text/html;charset=utf-8'}); const url = URL.createObjectURL(blob); const win = window.open(url,'_blank','width=1200,height=800'); if(win) setTimeout(()=>URL.revokeObjectURL(url),15000);
  }, [inv]);

  if (!inv) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'Arial',fontSize:16,color:'#6b7280'}}>Credit note not found.</div>;

  const today = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'});
  const grandTotal = inv.grandTotal;
  const amtWords = numberToWords(Math.round(grandTotal));
  const igstRate = inv.lines[0]?.taxRate ?? 18;
  const bankText = bank ? `Bank         : ${bank.bank_name}\nAccount No.: ${bank.account_number}\nIFSC Code  : ${bank.ifsc}\nBranch       : ${bank.branch}` : 'Bank         : HDFC BANK LIMITED\nAccount No.: 50200039767955\nIFSC Code  : HDFC0000106\nBranch       : Plot No 480, New Delhi 110037';

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Credit Note — <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{inv.invoiceNo}</span></span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{inv.partyName}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {banks.length > 0 && (
            <select value={selectedBankId} onChange={e=>setSelectedBankId(e.target.value)} style={{ fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db',background:'#fff' }}>
              {banks.map(b=><option key={b.id} value={b.id}>{b.bank_name}{b.is_default?'★':''}</option>)}
            </select>
          )}
          <span style={{ fontSize: 11, color: '#6b7280' }}>💡 Click any field to edit</span>
          <button onClick={handleSave} disabled={saving} style={{ display:'flex',alignItems:'center',gap:6,padding:'7px 16px',background:saving?'#6b7280':'#059669',color:'#fff',border:'none',borderRadius:7,fontWeight:700,fontSize:13,cursor:saving?'not-allowed':'pointer' }}>
            {saving ? '⏳ Saving…' : '💾 Save'}
          </button>
          <button onClick={handlePrint} style={{ display:'flex',alignItems:'center',gap:6,padding:'7px 16px',background:'#2563eb',color:'#fff',border:'none',borderRadius:7,fontWeight:700,fontSize:13,cursor:'pointer' }}>
            <Printer size={14}/> Print / Download
          </button>
        </div>
      </div>
      <Toolbar paperRef={paperRef} />

      <div ref={paperRef} style={{ background: '#fff', maxWidth: 1050, margin: '24px auto', padding: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
          <colgroup><col style={{width:'5%'}}/><col style={{width:'12%'}}/><col style={{width:'68%'}}/><col style={{width:'15%'}}/></colgroup>
          <tbody>
            <tr><td colSpan={4} style={{ border:'1px solid #000',padding:'8px 10px' }}>
              <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                <img src="/logo.png" alt="Triveni" style={{ width:60,height:60,objectFit:'contain',flexShrink:0 }}/>
                <div style={{ flex:1,textAlign:'center' }}>
                  <div style={{ fontSize:16,fontWeight:900 }}>TRIVENI CARGO EXPRESS INDIA PVT LTD</div>
                  <div style={{ fontSize:9 }}>Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15, Mahipalpur Extension, New Delhi, Delhi 110037</div>
                  <div style={{ fontSize:9 }}>Tel. : 011-65809456, 9311389456</div>
                  <div style={{ fontSize:10,fontWeight:700 }}>GSTIN : 07AAGCT2294N2ZR , CIN: U74999DL2017PTC316659</div>
                  <div style={{ fontSize:8,color:'#c00' }}>Regd. Office: Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15, Mahipalpur Extension, New Delhi 110037, near Hotel City Centre</div>
                  <div style={{ fontSize:9 }}>Email : info@tceipl.com</div>
                </div>
              </div>
            </td></tr>
            <tr><td colSpan={4} style={{ border:'1px solid #000',padding:'4px',textAlign:'center',fontWeight:700,fontSize:14,textDecoration:'underline' }}>CREDIT NOTE</td></tr>
            <tr>
              <td colSpan={2} style={{ border:'1px solid #000',padding:'6px 8px',verticalAlign:'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline:'none',minHeight:80,fontSize:10,fontFamily:'Arial,sans-serif',whiteSpace:'pre-wrap' }}>
                  {`M/s :      ${inv.partyName}\nGSTIN :   ${party?.gstin || '—'}\nAddress : ${party?.billingAddress || '—'}`}
                </div>
              </td>
              <td colSpan={2} style={{ border:'1px solid #000',padding:'6px 8px',verticalAlign:'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline:'none',minHeight:80,fontSize:10,fontFamily:'Arial,sans-serif',whiteSpace:'pre-wrap' }}>
                  {`Credit Note No.  :  TCN/CCU/25-26/${inv.invoiceNo}\nCredit Note Date :  ${today}\nPOS                   :  DELHI\n\nCreditNote Period From : ${inv.invoiceDate} to ${inv.dueDate}\nReference No#          :  ${inv.bookingRef}`}
                </div>
              </td>
            </tr>
            <tr style={{ background:'#f0f0f0' }}>
              <td style={{ border:'1px solid #000',padding:'4px 6px',fontSize:10,textAlign:'center',fontWeight:700,background:'#f0f0f0' }}>Sl#</td>
              <td style={{ border:'1px solid #000',padding:'4px 6px',fontSize:10,textAlign:'center',fontWeight:700,background:'#f0f0f0' }}>SAC Code</td>
              <td style={{ border:'1px solid #000',padding:'4px 6px',fontSize:10,textAlign:'center',fontWeight:700,background:'#f0f0f0' }}>Description</td>
              <td style={{ border:'1px solid #000',padding:'4px 6px',fontSize:10,textAlign:'right',fontWeight:700,background:'#f0f0f0' }}>Taxable Amount</td>
            </tr>
            {/* Data rows — wrapped in tbody with id for row add/remove */}
            {inv.lines.map((line,i) => (
              <tr key={i} id={i===0?'cn-body':undefined}>
                <EC style={{ textAlign:'center' }}>{i+1}</EC>
                <EC style={{ textAlign:'center' }}>996531</EC>
                <EC style={{ lineHeight:1.5 }}>{line.description}</EC>
                <EC style={{ textAlign:'right' }}>{fmt(line.amount)}</EC>
              </tr>
            ))}
            <tr>
              <td colSpan={2} style={{ border:'1px solid #000',padding:'6px 8px',verticalAlign:'top' }}>
                <div style={{ fontSize:10,marginBottom:4 }}><strong>Amount in Words :</strong> {amtWords}</div>
                <div contentEditable suppressContentEditableWarning style={{ outline:'none',minHeight:70,fontSize:10,fontFamily:'Arial,sans-serif',whiteSpace:'pre-wrap',marginTop:6 }}>{bankText}</div>
              </td>
              <td colSpan={2} style={{ border:'1px solid #000',padding:'6px 8px',verticalAlign:'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline:'none',minHeight:70,fontSize:10,fontFamily:'Arial,sans-serif',whiteSpace:'pre-wrap' }}>
                  {`Total Taxable Amount  :  ${fmt(inv.subtotal)}\nSGST @ 9%                  :  0.00\nCGST @ 9%                  :  0.00\nIGST @ ${igstRate}%                 :  ${fmt(inv.gstTotal)}\nNet Payable Amount    :  ${fmt(grandTotal)}`}
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={3} style={{ border:'1px solid #000',padding:'5px 8px',verticalAlign:'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline:'none',minHeight:60,fontSize:9,fontFamily:'Arial,sans-serif',whiteSpace:'pre-wrap' }}>
                  {`NOTES :\n1. DIFFERENCE, IF ANY, MAY BE NOTIFIED WITHIN 3 DAYS OF RECEIPT.\n2. PLEASE PAY YOUR BILL AMOUNT WITHIN 15 DAYS OF RECEIPT.\n3. INTEREST AT 24% P.A. WILL BE CHARGED IF THE BILL IS NOT PAID WITHIN THE STIPULATED TIME.\n4. PAYMENT SHOULD BE MADE BY A/C PAYEE CHEQUE OR DD IN FAVOUR OF TRIVENI CARGO EXPRESS INDIA PVT LTD.\n5. JURISDICTION: ALL DISPUTES ARISING UNDER THIS BILL SHALL BE SUBJECT TO BE UNDER NEW DELHI JURISDICTION.`}
                </div>
              </td>
              <td style={{ border:'1px solid #000',padding:'5px 8px',verticalAlign:'bottom',textAlign:'right' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline:'none',fontSize:10,fontFamily:'Arial,sans-serif',whiteSpace:'pre-wrap',textAlign:'right' }}>
                  {`For TRIVENI CARGO EXPRESS INDIA PVT LTD\n\n\n\nAccts. Manager/Auth. Signatory`}
                </div>
              </td>
            </tr>
            <tr><td colSpan={4} style={{ border:'1px solid #000',padding:'3px 8px',textAlign:'center',fontSize:8 }}>
              Registered Office: Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15, Mahipalpur Extension, New Delhi 110037, near Hotel City Centre
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
export default function CreditNoteEditorPage() {
  return (
    <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'Arial'}}>Loading…</div>}>
      <CreditNoteEditorInner />
    </Suspense>
  );
}
