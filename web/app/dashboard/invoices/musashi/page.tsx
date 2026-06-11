'use client';
import { Suspense, useRef, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSharedData } from '@/lib/useSharedData';

// ── Toolbar ───────────────────────────────────────────────────────────────────
function Toolbar({ paperRef }: { paperRef: React.RefObject<HTMLDivElement | null> }) {
  const [fontSize, setFontSize] = useState('3');
  const savedRange = useRef<Range | null>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    const sel = window.getSelection();
    if (sel && savedRange.current) { try { sel.removeAllRanges(); sel.addRange(savedRange.current); } catch {} }
  }
  function exec(cmd: string, value?: string) {
    restoreSelection();
    document.execCommand(cmd, false, value);
  }
  function snapshot() {
    if (!paperRef.current) return;
    undoStack.current.push(paperRef.current.innerHTML);
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }
  function undo() {
    if (!paperRef.current || !undoStack.current.length) return;
    redoStack.current.push(paperRef.current.innerHTML);
    paperRef.current.innerHTML = undoStack.current.pop()!;
  }
  function redo() {
    if (!paperRef.current || !redoStack.current.length) return;
    undoStack.current.push(paperRef.current.innerHTML);
    paperRef.current.innerHTML = redoStack.current.pop()!;
  }
  function getAwbTbody(): HTMLTableSectionElement | null {
    return paperRef.current?.querySelector<HTMLTableSectionElement>('#musashi-body tbody') ?? null;
  }
  function getSelectedTd(): HTMLTableCellElement | null {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!node) return null;
    const el = (node.nodeType === 3 ? node.parentElement : node) as Element;
    return el?.closest?.('td') ?? null;
  }
  function addRow() {
    const tbody = getAwbTbody();
    if (!tbody) return;
    const td = getSelectedTd();
    const tr = td?.closest('tr');
    if (!tr || !tbody.contains(tr)) { alert('Click inside a data row first.'); return; }
    snapshot();
    const newRow = tr.cloneNode(true) as HTMLTableRowElement;
    newRow.querySelectorAll('[contenteditable]').forEach(el => { (el as HTMLElement).innerText = ''; });
    tr.after(newRow);
  }
  function delRow() {
    const tbody = getAwbTbody();
    if (!tbody) return;
    const td = getSelectedTd();
    const tr = td?.closest('tr');
    if (!tr || !tbody.contains(tr)) { alert('Click inside a data row first.'); return; }
    if (tbody.querySelectorAll('tr').length <= 2) return;
    snapshot();
    tr.remove();
  }

  const [activeCommands, setActiveCommands] = useState<Set<string>>(new Set());
  function updateActiveState() {
    const active = new Set(['bold','italic','underline','justifyLeft','justifyCenter','justifyRight'].filter(cmd => { try { return document.queryCommandState(cmd); } catch { return false; } }));
    setActiveCommands(active);
  }
  const btn = (label: string, title: string, onClick: () => void, color?: string, cmd?: string) => {
    const isActive = cmd ? activeCommands.has(cmd) : false;
    return (
      <button key={label} title={title}
        onMouseDown={e => { e.preventDefault(); saveSelection(); onClick(); setTimeout(updateActiveState, 10); }}
        style={{ padding: '4px 10px', borderRadius: 5, border: isActive ? '2px solid #059669' : '1px solid #d1d5db', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: isActive ? '#ecfdf5' : '#fff', color: color || '#374151', minWidth: 32 }}>
        {label}
      </button>
    );
  };
  const sep = <div style={{ width: 1, background: '#e5e7eb', margin: '0 4px', alignSelf: 'stretch' }} />;

  useEffect(() => {
    document.addEventListener('selectionchange', updateActiveState);
    return () => document.removeEventListener('selectionchange', updateActiveState);
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '6px 12px', background: '#f0f4ff', borderBottom: '1px solid #e5e7eb' }}>
      {btn('↩ Undo', 'Undo', undo)}
      {btn('↪ Redo', 'Redo', redo)}
      {sep}
      {btn('B', 'Bold', () => exec('bold'), '#111', 'bold')}
      {btn('I', 'Italic', () => exec('italic'), '#111', 'italic')}
      {btn('U̲', 'Underline', () => exec('underline'), '#111', 'underline')}
      {sep}
      <span style={{ fontSize: 11, color: '#6b7280' }}>Size:</span>
      <select value={fontSize}
        onMouseDown={() => saveSelection()}
        onChange={e => { const v = e.target.value; setFontSize(v); restoreSelection(); exec('fontSize', v); }}
        style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 12, cursor: 'pointer', width: 70 }}>
        {[['1','8px'],['2','10px'],['3','12px'],['4','14px'],['5','18px'],['6','24px'],['7','32px']].map(([v,l]) =>
          <option key={v} value={v}>{l}</option>
        )}
      </select>
      {sep}
      {btn('⬅', 'Align Left', () => exec('justifyLeft'))}
      {btn('≡', 'Align Center', () => exec('justifyCenter'))}
      {btn('➡', 'Align Right', () => exec('justifyRight'))}
      {sep}
      {btn('+ Row', 'Add row below', addRow, '#059669')}
      {btn('− Row', 'Delete row', delRow, '#dc2626')}
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
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


// ── Inner Editor ──────────────────────────────────────────────────────────────
function MusashiEditorInner() {
  const searchParams = useSearchParams();
  const invId = searchParams.get('id');
  const { invoices, awbBookings, docketBookings } = useSharedData();
  const paperRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [banks, setBanks] = useState<{id:string;bank_name:string;account_name:string;account_number:string;ifsc:string;branch:string;is_default:number}[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [gstPercent, setGstPercent] = useState(18);
  const [isRounded, setIsRounded] = useState(false);
  const isRoundedRef = useRef(isRounded);
  useEffect(() => { isRoundedRef.current = isRounded; }, [isRounded]);

  useEffect(() => {
    fetch('/api/banks').then(r => r.json()).then(data => {
      setBanks(data);
      const def = data.find((b: {is_default:number}) => b.is_default === 1);
      if (def) setSelectedBankId(def.id);
    }).catch(() => {});
  }, []);

  const inv = invoices.find(i => i.id === invId);
  const bank = banks.find(b => b.id === selectedBankId) ?? banks[0];

  // Build initial rows from linked bookings
  const buildRows = useCallback(() => {
    if (!inv) return [];
    const rows: {date:string;docketNo:string;invoiceNo:string;origin:string;destination:string;pkt:number;wt:number;rate:number}[] = [];
    // From invoice lines → match AWB/Docket bookings by bookingRef
    const refs = inv.bookingRef ? inv.bookingRef.split(',').map(s => s.trim()) : [];
    refs.forEach(ref => {
      const awb = awbBookings.find(a => a.awbNo === ref);
      const dkt = docketBookings.find(d => d.docketNo === ref);
      if (awb) {
        const linkedDkt = docketBookings.find(d => d.linkedAwbId === awb.id);
        rows.push({
          date: awb.bookingDate?.slice(0,10) ?? '',
          docketNo: linkedDkt?.docketNo ?? '',
          invoiceNo: inv.invoiceNo,
          origin: awb.origin,
          destination: awb.destination,
          pkt: awb.pieces,
          wt: awb.weight,
          rate: awb.baseRate,
        });
      } else if (dkt) {
        rows.push({
          date: dkt.bookingDate?.slice(0,10) ?? '',
          docketNo: dkt.docketNo,
          invoiceNo: inv.invoiceNo,
          origin: dkt.origin ?? '',
          destination: dkt.destination ?? '',
          pkt: dkt.pieces ?? 0,
          wt: dkt.weight ?? 0,
          rate: dkt.rateFittedAmount,
        });
      }
    });
    if (rows.length === 0) {
      rows.push({ date: '', docketNo: '', invoiceNo: inv.invoiceNo, origin: '', destination: '', pkt: 0, wt: 0, rate: 0 });
    }
    return rows;
  }, [inv, awbBookings, docketBookings]);

  // Load saved HTML or build fresh
  useEffect(() => {
    if (!inv || !paperRef.current) return;
    fetch(`/api/invoices/${inv.id}/editor-html`)
      .then(r => r.json())
      .then(data => {
        if (data.html && paperRef.current) {
          paperRef.current.innerHTML = data.html;
          paperRef.current.querySelector('#musashi-body')?.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          renderFreshTable();
        }
      })
      .catch(() => { renderFreshTable(); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv?.id]);

  function renderFreshTable() {
    if (!paperRef.current || !inv) return;
    const rows = buildRows();
    const ce = (text: string | number, align = 'center') =>
      `<td style="border:1px solid #000;padding:3px 5px;font-size:10px;vertical-align:top;text-align:${align}"><div contenteditable="true" style="outline:none;min-height:14px;font-family:Arial,sans-serif;font-size:10px;white-space:pre-wrap">${String(text ?? '')}</div></td>`;
    const headers = ['S.No','Date','Docket No.','Invoice No.','Origin','Destination','Pkt','Wt.','Rate','Freight','AWB','Pickup','Delivery','Total Amt'];
    const hdCell = (h: string) => `<td style="border:1px solid #000;padding:4px 5px;font-size:9.5px;text-align:center;font-weight:700;background:#f0f0f0"><div contenteditable="true" style="outline:none;min-height:14px;font-family:Arial,sans-serif;font-size:9.5px;font-weight:700;text-align:center">${h}</div></td>`;

    let body = `<tr style="background:#f0f0f0">${headers.map(hdCell).join('')}</tr>`;
    rows.forEach((row, i) => {
      const freight = row.wt * row.rate;
      body += `<tr>${ce(i+1)}${ce(row.date)}${ce(row.docketNo)}${ce(row.invoiceNo)}${ce(row.origin)}${ce(row.destination)}${ce(row.pkt)}${ce(row.wt > 0 ? row.wt.toString() : '', 'right')}${ce(row.rate > 0 ? row.rate.toString() : '', 'right')}${ce(freight > 0 ? freight.toFixed(2) : '', 'right')}${ce('0', 'right')}${ce('0', 'right')}${ce('0', 'right')}${ce(freight > 0 ? freight.toFixed(2) : '', 'right')}</tr>`;
    });
    // Pad to 5 rows min
    for (let i = 0; i < Math.max(0, 5 - rows.length); i++) {
      body += `<tr>${Array.from({length:14}).map(() => ce('')).join('')}</tr>`;
    }
    // Grand total row
    body += `<tr style="background:#f8f8f8;font-weight:700" data-grand-total="1">${ce('','center')}${ce('','center')}${ce('','center')}${ce('','center')}${ce('','center')}${ce('','center')}${ce('','center')}${ce('','right')}${ce('','right')}${ce('','right')}${ce('','right')}${ce('','right')}${ce('','right')}${ce('','right')}</tr>`;

    const tableHtml = `<table id="musashi-body" data-musashi="1" style="border-collapse:collapse;width:100%;table-layout:fixed"><tbody>${body}</tbody></table>`;

    const taxSection = `<div data-tax-summary style="margin-top:12px;padding:8px;border:1px solid #000;font-size:11px;font-family:Arial,sans-serif;white-space:pre-wrap" contenteditable="true">Total Taxable Amount : 0.00\nGST @ ${gstPercent}%              : 0.00\nTotal with GST         : 0.00</div>`;

    const bankSection = `<div data-bank-detail style="margin-top:10px;padding:8px;border:1px solid #ccc;font-size:10px;font-family:Arial,sans-serif;white-space:pre-wrap" contenteditable="true">${bank ? `Bank           : ${bank.bank_name}\nA/c Name     : ${bank.account_name}\nAccount No.  : ${bank.account_number}\nIFSC Code    : ${bank.ifsc}\nBranch         : ${bank.branch}` : 'Bank details will appear here'}</div>`;

    const wordsSection = `<div data-words style="margin-top:6px;padding:4px 8px;font-size:10px;font-style:italic;font-family:Arial,sans-serif" contenteditable="true">Rupees Zero Only</div>`;

    paperRef.current.innerHTML = tableHtml + taxSection + wordsSection + bankSection;
    paperRef.current.querySelector('#musashi-body')?.dispatchEvent(new Event('input', { bubbles: true }));
  }


  // Auto-calculate: Freight = Wt × Rate, Total Amt = Freight + AWB + Pickup + Delivery
  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;

    const parseNum = (s: string) => { const n = parseFloat(s.replace(/,/g, '').trim()); return isNaN(n) ? 0 : n; };

    function recalc() {
      const tbody = paper!.querySelector<HTMLTableSectionElement>('#musashi-body tbody');
      if (!tbody) return;
      const allRows = [...tbody.querySelectorAll<HTMLTableRowElement>('tr')];
      const dataRows = allRows.filter(r => !r.dataset.grandTotal && r !== allRows[0]);

      let totalWt = 0, totalFreight = 0, totalAwb = 0, totalPickup = 0, totalDelivery = 0, totalAmt = 0;

      dataRows.forEach(row => {
        const cells = row.querySelectorAll<HTMLTableCellElement>('td');
        if (cells.length < 14) return;
        const get = (i: number) => cells[i]?.querySelector('[contenteditable]')?.textContent?.trim() ?? '';
        const set = (i: number, v: string) => { const ce = cells[i]?.querySelector('[contenteditable]') as HTMLElement | null; if (ce && ce.textContent?.trim() !== v) ce.textContent = v; };

        const wt = parseNum(get(7));
        const rate = parseNum(get(8));
        const freight = wt * rate;
        if (wt > 0 && rate > 0) set(9, freight.toFixed(2));

        const freightVal = parseNum(get(9));
        const awb = parseNum(get(10));
        const pickup = parseNum(get(11));
        const delivery = parseNum(get(12));
        const total = freightVal + awb + pickup + delivery;
        if (freightVal > 0 || awb > 0 || pickup > 0 || delivery > 0) set(13, total.toFixed(2));

        totalWt += wt;
        totalFreight += freightVal;
        totalAwb += awb;
        totalPickup += pickup;
        totalDelivery += delivery;
        totalAmt += total;
      });

      // Grand total row
      const gtRow = tbody.querySelector<HTMLTableRowElement>('[data-grand-total]');
      if (gtRow) {
        const gcells = gtRow.querySelectorAll<HTMLTableCellElement>('td');
        const setGT = (i: number, v: string) => { const ce = gcells[i]?.querySelector('[contenteditable]') as HTMLElement | null; if (ce) ce.textContent = v; };
        setGT(7, totalWt.toFixed(2));
        setGT(9, totalFreight.toFixed(2));
        setGT(10, totalAwb.toFixed(2));
        setGT(11, totalPickup.toFixed(2));
        setGT(12, totalDelivery.toFixed(2));
        setGT(13, totalAmt.toFixed(2));
      }

      // Update GST section
      const taxEl = paper!.querySelector<HTMLElement>('[data-tax-summary]');
      if (taxEl) {
        const taxable = totalAmt;
        const gstAmt = parseFloat((taxable * gstPercent / 100).toFixed(2));
        const totalWithGst = isRoundedRef.current ? Math.round(taxable + gstAmt) : taxable + gstAmt;
        taxEl.innerText = `Total Taxable Amount : ${fmt(taxable)}\nGST @ ${gstPercent}%              : ${fmt(gstAmt)}\nTotal with GST         : ${fmt(totalWithGst)}`;
        const wordsEl = paper!.querySelector<HTMLElement>('[data-words]');
        if (wordsEl && totalWithGst > 0) wordsEl.innerText = `Rupees ${numberToWords(Math.round(totalWithGst))} Only`;
      }
    }

    paper.addEventListener('input', recalc);
    recalc();
    return () => { paper.removeEventListener('input', recalc); };
  }, [inv?.id, gstPercent, isRounded]);

  function handleRoundOff() {
    setIsRounded(r => !r);
    // Trigger recalc
    setTimeout(() => paperRef.current?.querySelector('#musashi-body')?.dispatchEvent(new Event('input', { bubbles: true })), 50);
  }

  async function handleSave() {
    if (!paperRef.current || !inv) return;
    setSaving(true);
    await fetch(`/api/invoices/${inv.id}/editor-html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: paperRef.current.innerHTML }),
    });
    setSaving(false);
    alert('Saved to database!');
  }

  const handlePrint = useCallback(async () => {
    const el = paperRef.current;
    if (!el) return;
    const clone = el.cloneNode(true) as HTMLElement;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Musashi Invoice - ${inv?.invoiceNo ?? ''}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:8px}table{border-collapse:collapse;width:100%}td{border:1px solid #000;padding:3px 5px;font-size:10px;vertical-align:top}[contenteditable]{outline:none;min-height:14px;white-space:pre-wrap}@media print{@page{size:A4 landscape;margin:8mm}}</style></head>
<body>${clone.innerHTML}<script>window.onload=function(){window.print();}<\/script></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'width=1200,height=800');
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }, [inv?.invoiceNo]);

  if (!invId) return <div style={{ padding: 40, textAlign: 'center' }}>No invoice ID provided. Use ?id=... in URL.</div>;
  if (!inv) return <div style={{ padding: 40, textAlign: 'center' }}>Loading invoice...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Toolbar paperRef={paperRef} />
      {/* Controls bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#fafbfc', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Musashi Format</span>
        <span style={{ fontSize: 11, color: '#6b7280' }}>Invoice: {inv.invoiceNo}</span>
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          GST %: <input type="number" value={gstPercent} onChange={e => setGstPercent(Number(e.target.value))} style={{ width: 50, padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11 }} />
        </label>
        <select value={selectedBankId} onChange={e => setSelectedBankId(e.target.value)} style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 4 }}>
          {banks.map(b => <option key={b.id} value={b.id}>{b.bank_name} - {b.account_number}</option>)}
        </select>
        <button onClick={handleRoundOff} style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 11, cursor: 'pointer', background: isRounded ? '#ecfdf5' : '#fff', fontWeight: 600 }}>
          {isRounded ? '✓ Rounded' : 'Round Off'}
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={handleSave} disabled={saving} style={{ padding: '4px 14px', borderRadius: 5, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving...' : '💾 Save'}
        </button>
        <button onClick={handlePrint} style={{ padding: '4px 14px', borderRadius: 5, border: 'none', background: '#059669', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          🖨️ Print / Download
        </button>
      </div>
      {/* Paper */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20, background: '#e5e7eb' }}>
        <div ref={paperRef} style={{ width: '297mm', minHeight: '210mm', margin: '0 auto', background: '#fff', padding: 16, boxShadow: '0 2px 12px rgba(0,0,0,.12)' }} />
      </div>
    </div>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────
export default function MusashiPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>}>
      <MusashiEditorInner />
    </Suspense>
  );
}
