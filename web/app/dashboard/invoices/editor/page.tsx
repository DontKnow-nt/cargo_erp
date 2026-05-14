'use client';
'use client';
import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { useStore } from '@/lib/store';

// ── Types ─────────────────────────────────────────────────────────────────────
type CellStyle = { bold?: boolean; italic?: boolean; underline?: boolean; fontSize?: number; align?: 'left' | 'center' | 'right'; color?: string; bg?: string };
type Cell = { value: string; style: CellStyle };
type Row = Cell[];

const DEFAULT_STYLE: CellStyle = { bold: false, italic: false, underline: false, fontSize: 11, align: 'center' };

function makeCell(value = '', style: Partial<CellStyle> = {}): Cell {
  return { value, style: { ...DEFAULT_STYLE, ...style } };
}

// ── Number to words ───────────────────────────────────────────────────────────
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

// ── Build initial rows from invoice data ──────────────────────────────────────
function buildInitialRows(inv: any, party: any): Row[] {
  const h = (v: string, extra: Partial<CellStyle> = {}) => makeCell(v, { bold: true, fontSize: 10, align: 'center', bg: '#f0f0f0', ...extra });
  const c = (v: string, extra: Partial<CellStyle> = {}) => makeCell(v, { fontSize: 10, ...extra });
  const num = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const billDate = inv.invoiceDate.split('-').reverse().join('.');

  // Header rows
  const rows: Row[] = [
    // Company name row (merged visually via colspan in render)
    [makeCell('TRIVENI CARGO EXPRESS INDIA PVT LTD', { bold: true, fontSize: 20, align: 'center' })],
    [makeCell('Domestic Air Cargo & Rail Agent', { fontSize: 10, align: 'center' })],
    [makeCell('Plot no-319/2/2, Badam Singh Market, NH-8 Rangpuri, New Delhi-110037', { fontSize: 10, align: 'center' })],
    [makeCell('Tel. : 011-65809456, 9311389456', { fontSize: 10, align: 'center' })],
    [makeCell('GSTIN: 07AAGCT2294N2ZR , CIN: U74999DL2017PTC316659', { bold: true, fontSize: 10, align: 'center' })],
    [makeCell('Regd. Office: Plot no 480, Flat no 301, First Floor, Gali no 15, L Block Mahipalpur Extn. New Delhi 110037', { fontSize: 9, align: 'center' })],
    [makeCell('Email : info@tceipl.com', { fontSize: 10, align: 'center' })],
    [makeCell('TAX INVOICE', { bold: true, fontSize: 13, align: 'center', underline: true })],

    // Party info row (two-column layout encoded as 2 cells)
    [
      makeCell(`M/s : ${inv.partyName}\nGSTIN : ${party?.gstin || '—'}\nAddress : ${party?.billingAddress || '—'}`, { fontSize: 10 }),
      makeCell(`Bill No. : ${inv.invoiceNo}\nBill Date : ${billDate}\nPOS : DELHI\nBilling Period From : ${inv.invoiceDate} to ${inv.dueDate}`, { fontSize: 10 }),
    ],
    [makeCell(`SAC Code : 996531`, { fontSize: 10, bold: true })],

    // Table header
    [
      h('Sl#'), h('Origin'), h('AWB#/Ref.\nNumber'), h('Date'), h('Dest#'),
      h('Boxes'), h('Charg.\nWeight'), h('Rate'), h('Freight'),
      h('AWB &\nDO'), h('Due\nCarrier'), h('Forwrd &\nOthers'), h('TSP &\nOthers'), h('Taxable\nAmount'),
    ],
  ];

  // Data rows
  inv.lines.forEach((line: any, i: number) => {
    const m = line.description.match(/([A-Z]{3})[→\-]([A-Z]{3}).*?(\d+)\s*kg\s*@\s*₹?([\d.]+)/i);
    const origin = m ? m[1] : 'DEL';
    const dest   = m ? m[2] : '';
    const boxes  = m ? m[3] : String(line.qty);
    const chgWt  = m ? m[3] : String(line.qty);
    const rate   = m ? m[4] : String(line.rate);
    const tsp    = i === 0 ? num(inv.lines.slice(1).reduce((s: number, l: any) => s + l.amount, 0)) : '0.00';
    const taxable = i === 0 ? num(inv.subtotal) : num(line.amount);
    rows.push([
      c(String(i+1), { align: 'center' }),
      c(origin, { align: 'center' }),
      c(i === 0 ? inv.bookingRef : '', { align: 'center' }),
      c(i === 0 ? inv.invoiceDate.replace(/\d{4}-/, '').replace('-', '/') : '', { align: 'center' }),
      c(dest, { align: 'center' }),
      c(boxes, { align: 'center' }),
      c(chgWt, { align: 'center' }),
      c(rate, { align: 'right' }),
      c(num(line.amount), { align: 'right' }),
      c('0.00', { align: 'right' }),
      c('0.00', { align: 'right' }),
      c('0', { align: 'right' }),
      c(tsp, { align: 'right' }),
      c(taxable, { align: 'right' }),
    ]);
  });

  // Grand total row
  const totalBoxes = inv.lines.reduce((s: number, l: any) => s + l.qty, 0);
  const totalFreight = num(inv.lines[0]?.amount || 0);
  const totalTSP = num(inv.lines.slice(1).reduce((s: number, l: any) => s + l.amount, 0));
  rows.push([
    h('', { bg: '#f8f8f8' }), h('', { bg: '#f8f8f8' }), h('', { bg: '#f8f8f8' }),
    h('Grand Total', { bg: '#f8f8f8', align: 'right' }),
    h('', { bg: '#f8f8f8' }),
    h(String(totalBoxes), { bg: '#f8f8f8', align: 'center' }),
    h(String(totalBoxes), { bg: '#f8f8f8', align: 'center' }),
    h('', { bg: '#f8f8f8' }),
    h(totalFreight, { bg: '#f8f8f8', align: 'right' }),
    h('0.00', { bg: '#f8f8f8', align: 'right' }),
    h('0.00', { bg: '#f8f8f8', align: 'right' }),
    h('0', { bg: '#f8f8f8', align: 'right' }),
    h(totalTSP, { bg: '#f8f8f8', align: 'right' }),
    h(num(inv.subtotal), { bg: '#f8f8f8', align: 'right' }),
  ]);

  const igstRate = inv.lines[0]?.taxRate || 18;
  const amtWords = numberToWords(Math.round(inv.grandTotal));

  // Bank + tax summary (two-column)
  const bankInfo = (bank: {bank_name:string;account_name:string;account_number:string;ifsc:string;branch:string}|null) =>
    bank
      ? `Amount in Words : Rupees ${amtWords}\n\nBank           : ${bank.bank_name}\nA/c Name     : ${bank.account_name}\nAccount No.  : ${bank.account_number}\nIFSC Code    : ${bank.ifsc}\nBranch         : ${bank.branch}`
      : `Amount in Words : Rupees ${amtWords}\n\nBank           : YES BANK Ltd.\nA/c Name     : TRIVENI CARGO EXPRESS INDIA PVT LTD\nAccount No.  : 008463700000641\nIFSC Code    : YESB0000283\nBranch         : Vasant Kunj, New Delhi`;
  rows.push([
    makeCell(bankInfo(null), { fontSize: 10 }),
    makeCell(
      `Total Taxable Amount : ${num(inv.subtotal)}\nSGST @ 9%              : 0.00\nCGST @ 9%              : 0.00\nIGST @ ${igstRate}%             : ${num(inv.gstTotal)}\nNet Payable Amount  : ${num(inv.grandTotal)}`,
      { fontSize: 10 }
    ),
  ]);

  // Bank footer line
  rows.push([makeCell('YES BANK Ltd., A/c Name: TRIVENI CARGO EXPRESS INDIA PVT LTD, A/C No. - 008463700000641, IFSC Code - YESB0000283, Branch - Vasant Kunj, New Delhi', { fontSize: 9 })]);

  // Notes + signature
  rows.push([
    makeCell('NOTES :\n1. DIFFERENCE, IF ANY, MAY BE NOTIFIED WITHIN 3 DAYS OF RECEIPT.\n2. PLEASE PAY YOUR BILL AMOUNT WITHIN 15 DAYS OF RECEIPT.\n3. INTEREST AT 24% P.A. WILL BE CHARGED IF THE BILL IS NOT PAID WITHIN THE STIPULATED TIME.\n4. PAYMENT SHOULD BE MADE BY A/C PAYEE CHEQUE OR DD IN FAVOUR OF TRIVENI CARGO EXPRESS INDIA PVT LTD.', { fontSize: 9 }),
    makeCell('For TRIVENI CARGO EXPRESS INDIA PVT LTD\n\n\n\nAuthorised Signatory', { fontSize: 10, align: 'right' }),
  ]);

  return rows;
}


// ── Toolbar ───────────────────────────────────────────────────────────────────
function Toolbar({ sel, onStyle, onAddRow, onAddCol, onDelRow, onDelCol, onPrint, onUndo, onRedo, canUndo, canRedo }: {
  sel: { row: number; col: number } | null;
  onStyle: (s: Partial<CellStyle>) => void;
  onAddRow: () => void; onAddCol: () => void;
  onDelRow: () => void; onDelCol: () => void;
  onPrint: () => void;
  onUndo: () => void; onRedo: () => void;
  canUndo: boolean; canRedo: boolean;
}) {
  const [fontSize, setFontSize] = useState(11);

  const btn = (label: string, title: string, onClick: () => void, color = '') =>
    <button title={title} onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 5, border: '1px solid #d1d5db', cursor: 'pointer', fontSize: 12, fontWeight: 600,
      background: '#fff', color: color || '#374151',
      minWidth: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    }}>{label}</button>;

  const sep = <div style={{ width: 1, background: '#e5e7eb', margin: '0 4px', alignSelf: 'stretch' }} />;

  const applyFontSize = (v: number) => { setFontSize(v); onStyle({ fontSize: v }); };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
      padding: '8px 12px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      {btn('↩ Undo', 'Undo (Ctrl+Z)', onUndo, canUndo ? '#374151' : '#9ca3af')}
      {btn('↪ Redo', 'Redo (Ctrl+Y)', onRedo, canRedo ? '#374151' : '#9ca3af')}
      {sep}

      {btn('B', 'Bold', () => onStyle({ bold: true }), '#111')}
      {btn('I', 'Italic', () => onStyle({ italic: true }), '#111')}
      {btn('U', 'Underline', () => onStyle({ underline: true }), '#111')}
      {sep}

      {/* Font size: dropdown + slider */}
      <span style={{ fontSize: 11, color: '#6b7280' }}>Size:</span>
      <select
        value={fontSize}
        onChange={e => applyFontSize(Number(e.target.value))}
        style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 12, cursor: 'pointer', width: 60 }}
      >
        {[8,9,10,11,12,14,16,18,20,24,28,32].map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <input
        type="range" min={8} max={32} step={1} value={fontSize}
        onChange={e => applyFontSize(Number(e.target.value))}
        style={{ width: 80, cursor: 'pointer', accentColor: '#3b82f6' }}
        title={`Font size: ${fontSize}`}
      />
      <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700, minWidth: 20 }}>{fontSize}</span>
      {sep}

      {btn('⬅', 'Align Left', () => onStyle({ align: 'left' }))}
      {btn('⬛', 'Align Center', () => onStyle({ align: 'center' }))}
      {btn('➡', 'Align Right', () => onStyle({ align: 'right' }))}
      {sep}

      {btn('+ Row', 'Add row below (select table cell first)', onAddRow, '#059669')}
      {btn('+ Col', 'Add column right (select table cell first)', onAddCol, '#059669')}
      {btn('− Row', 'Delete selected row', onDelRow, '#dc2626')}
      {btn('− Col', 'Delete selected column', onDelCol, '#dc2626')}
      {sep}

      {btn('🖨 Print / Save PDF', 'Print invoice only', onPrint, '#1d4ed8')}

      {sel && (
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
          Row {sel.row + 1}, Col {sel.col + 1}
        </span>
      )}
    </div>
  );
}



// ── Main Editor (inner — needs useSearchParams) ───────────────────────────────
function EditorInner() {
  const searchParams = useSearchParams();
  const invId = searchParams.get('id');
  const invoices = useStore(s => s.invoices);
  const parties  = useStore(s => s.parties);

  const inv    = invoices.find(i => i.id === invId);
  const party  = inv ? parties.find(p => p.id === inv.partyId) : undefined;

  // rows state + undo stack
  const [rows, setRows]       = useState<Row[]>(() => inv ? buildInitialRows(inv, party) : []);
  const [sel, setSel]         = useState<{ row: number; col: number } | null>(null);
  const [banks, setBanks]     = useState<{id:string;bank_name:string;account_name:string;account_number:string;ifsc:string;branch:string;is_default:number}[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');

  useEffect(() => {
    fetch('/api/banks').then(r=>r.json()).then(data => {
      setBanks(data);
      const def = data.find((b:{is_default:number}) => b.is_default === 1);
      if (def) setSelectedBankId(def.id);
    }).catch(()=>{});
  }, []);

  // Update bank rows when selected bank changes
  useEffect(() => {
    if (!selectedBankId || !banks.length || rows.length < 4) return;
    const b = banks.find(x => x.id === selectedBankId);
    if (!b) return;
    const amtWordsLine = rows[rows.length - 4]?.[0]?.value?.split('\n')[0] ?? '';
    const bankText = `${amtWordsLine}\n\nBank           : ${b.bank_name}\nA/c Name     : ${b.account_name}\nAccount No.  : ${b.account_number}\nIFSC Code    : ${b.ifsc}\nBranch         : ${b.branch}`;
    const footerText = `${b.bank_name}, A/c Name: ${b.account_name}, A/C No. - ${b.account_number}, IFSC Code - ${b.ifsc}, Branch - ${b.branch}`;
    setRows(prev => {
      const next = [...prev];
      const bankRowIdx = next.length - 3;
      const footerIdx  = next.length - 2;
      if (next[bankRowIdx]?.[0]) next[bankRowIdx] = [{ ...next[bankRowIdx][0], value: bankText }, next[bankRowIdx][1]];
      if (next[footerIdx]?.[0])  next[footerIdx]  = [{ ...next[footerIdx][0],  value: footerText }];
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBankId, rows.length]);
  const undoStack = useRef<Row[][]>([]);
  const redoStack = useRef<Row[][]>([]);

  // Re-init if invoice changes
  useEffect(() => {
    if (inv) setRows(buildInitialRows(inv, party));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invId]);

  // ── Undo helpers ────────────────────────────────────────────────────────────
  const pushUndo = useCallback((prev: Row[]) => {
    undoStack.current = [...undoStack.current.slice(-30), prev];
    redoStack.current = [];
  }, []);

  const mutate = useCallback((fn: (r: Row[]) => Row[]) => {
    setRows(prev => { pushUndo(prev); return fn(prev); });
  }, [pushUndo]);

  const undo = () => {
    if (!undoStack.current.length) return;
    const prev = undoStack.current.pop()!;
    redoStack.current.push(rows);
    setRows(prev);
  };
  const redo = () => {
    if (!redoStack.current.length) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(rows);
    setRows(next);
  };

  // Keyboard undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // ── Cell edit ───────────────────────────────────────────────────────────────
  const updateCell = (ri: number, ci: number, value: string) => {
    mutate(prev => prev.map((row, r) =>
      r !== ri ? row : row.map((cell, c) => c !== ci ? cell : { ...cell, value })
    ));
  };

  // ── Style selected cell ─────────────────────────────────────────────────────
  const applyStyle = (s: Partial<CellStyle>) => {
    if (!sel) return;
    mutate(prev => prev.map((row, r) =>
      r !== sel.row ? row : row.map((cell, c) =>
        c !== sel.col ? cell : { ...cell, style: { ...cell.style, ...s } }
      )
    ));
  };

  // ── Add / delete row / col ──────────────────────────────────────────────────
  // Table occupies rows 10 (header) through rows.length-4 (grand total).
  // Rows after that are bank/axis/notes — never touched by add/del.
  const TABLE_HEAD = 10;
  const tableEnd = () => rows.length - 4; // grand total row index

  const addRow = () => {
    if (!sel) { alert('Click a cell inside the AWB table first, then click + Row.'); return; }
    const ri = sel.row;
    if (ri < TABLE_HEAD || ri > tableEnd()) { alert('Select a cell inside the AWB data table to add a row there.'); return; }
    const cols = rows[TABLE_HEAD].length;
    mutate(prev => {
      const next = [...prev];
      const refRow = prev[ri];
      next.splice(ri + 1, 0, Array.from({ length: cols }, (_, ci) => {
        const { bg: _bg, ...style } = (refRow[ci] || refRow[0])?.style || DEFAULT_STYLE;
        return makeCell('', style);
      }));
      return next;
    });
  };

  const addCol = () => {
    if (!sel) { alert('Click a cell inside the AWB table first, then click + Col.'); return; }
    const ri = sel.row;
    if (ri < TABLE_HEAD || ri > tableEnd()) { alert('Select a cell inside the AWB data table to add a column there.'); return; }
    const ci = sel.col + 1;
    mutate(prev => prev.map((row, r) => {
      if (r < TABLE_HEAD || r > tableEnd()) return row;
      const next = [...row];
      // inherit style from the cell to the left so color/font/bg match
      const refStyle = { ...(row[ci - 1]?.style || row[0]?.style || DEFAULT_STYLE) };
      next.splice(ci, 0, makeCell('', refStyle));
      return next;
    }));
  };

  const delRow = () => {
    if (!sel) return;
    if (sel.row <= TABLE_HEAD || sel.row > tableEnd()) { alert('Can only delete data rows inside the AWB table.'); return; }
    mutate(prev => prev.filter((_, r) => r !== sel.row));
    setSel(null);
  };

  const delCol = () => {
    if (!sel) return;
    if (sel.row < TABLE_HEAD || sel.row > tableEnd()) { alert('Select a cell inside the AWB table to delete a column.'); return; }
    mutate(prev => prev.map((row, r) => {
      if (r < TABLE_HEAD || r > tableEnd()) return row;
      return row.filter((_, c) => c !== sel.col);
    }));
    setSel(null);
  };

  // ── Auto-sum: sum numeric cells in selected column, place result in last row ─
  const autoSum = () => {
    if (!sel) return;
    const ci = sel.col;
    const nums = rows.map(r => parseFloat(r[ci]?.value?.replace(/,/g, '') || '')).filter(n => !isNaN(n));
    if (!nums.length) return;
    const total = nums.reduce((a, b) => a + b, 0);
    mutate(prev => {
      const next = prev.map(r => [...r]);
      const lastRow = next[next.length - 1];
      if (lastRow[ci]) lastRow[ci] = { ...lastRow[ci], value: total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), style: { ...lastRow[ci].style, bold: true } };
      return next;
    });
  };

  // ── Print ───────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const el = document.getElementById('invoice-paper');
    if (!el) return;
    // Capture the exact rendered HTML of the invoice paper
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Invoice</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; }
  table { width: 100%; border-collapse: collapse; }
  [contenteditable] { outline: none; }
  @media print { @page { margin: 8mm; } }
</style>
</head>
<body>${el.innerHTML}</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'width=1100,height=800');
    if (!win) { toast.error('Popup blocked. Allow popups to print invoice.'); URL.revokeObjectURL(url); return; }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!inv) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Arial', fontSize: 16, color: '#6b7280' }}>
      No invoice found. Open this page from the Invoices list.
    </div>
  );

  // Determine max cols for full-width rows
  const maxCols = Math.max(...rows.map(r => r.length));

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb', fontFamily: 'Arial, sans-serif' }}>
      {/* Toolbar — hidden on print */}
      <div className="no-print">
        <Toolbar
          sel={sel}
          onStyle={applyStyle}
          onAddRow={addRow} onAddCol={addCol}
          onDelRow={delRow} onDelCol={delCol}
          onPrint={handlePrint}
          onUndo={undo} onRedo={redo}
          canUndo={undoStack.current.length > 0}
          canRedo={redoStack.current.length > 0}
        />
        {/* Help bar + Bank selector */}
        <div style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe', padding: '5px 14px', fontSize: 11, color: '#1d4ed8', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>💡 Click any cell to select &amp; edit</span>
          <span>📐 Select a table cell first before adding/deleting rows or columns</span>
          <span>Ctrl+Z / Ctrl+Y to undo / redo</span>
          {banks.length > 0 && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>🏦 Bank:</span>
              <select value={selectedBankId} onChange={e => setSelectedBankId(e.target.value)}
                style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#fff', color: '#1e40af', cursor: 'pointer' }}>
                {banks.map(b => (
                  <option key={b.id} value={b.id}>{b.bank_name}{b.is_default ? ' ★' : ''}</option>
                ))}
              </select>
            </span>
          )}
        </div>
      </div>

      {/* Invoice paper */}
      <div id="invoice-paper" style={{
        maxWidth: 1050, margin: '24px auto', background: '#fff',
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)', padding: '24px 28px',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {rows.map((row, ri) => {
              const isSingleCell = row.length === 1;
              const isTwoCol     = row.length === 2;
              const isHeaderRow  = ri <= 7;   // company header rows
              const isDataRow    = ri >= 11 && ri < rows.length - 3; // AWB data rows
              const isTableHead  = ri === 10;
              const isGrandTotal = isDataRow && ri === rows.length - 4;
              const isBankRow    = ri === rows.length - 3;
              const isAxisRow    = ri === rows.length - 2;
              const isNotesRow   = ri === rows.length - 1;

              if (isSingleCell) {
                const cell = row[0];
                return (
                  <tr key={ri}>
                    <td
                      colSpan={maxCols}
                      onClick={() => setSel({ row: ri, col: 0 })}
                      style={{
                        border: (isHeaderRow && ri < 7) ? 'none' : '1px solid #000',
                        padding: isHeaderRow ? '2px 4px' : '5px 8px',
                        background: sel?.row === ri && sel?.col === 0 ? '#eff6ff' : (cell.style.bg || 'transparent'),
                        outline: sel?.row === ri && sel?.col === 0 ? '2px solid #3b82f6' : 'none',
                        cursor: 'text',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={e => updateCell(ri, 0, e.currentTarget.innerText)}
                        style={{
                          fontWeight: cell.style.bold ? 'bold' : 'normal',
                          fontStyle: cell.style.italic ? 'italic' : 'normal',
                          textDecoration: cell.style.underline ? 'underline' : 'none',
                          fontSize: cell.style.fontSize || 11,
                          textAlign: cell.style.align || 'left',
                          color: cell.style.color || '#000',
                          background: 'transparent',
                          outline: 'none',
                          minHeight: 16,
                          whiteSpace: 'pre-wrap',
                        }}
                      >{cell.value}</div>
                    </td>
                  </tr>
                );
              }

              if (isTwoCol && !isTableHead && !isDataRow) {
                // Two-column layout rows (party info, bank+tax, notes+sig)
                return (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        colSpan={ci === 0 ? Math.ceil(maxCols * 0.58) : Math.floor(maxCols * 0.42)}
                        onClick={() => setSel({ row: ri, col: ci })}
                        style={{
                          border: '1px solid #000', padding: '5px 8px', verticalAlign: 'top',
                          background: sel?.row === ri && sel?.col === ci ? '#eff6ff' : (cell.style.bg || 'transparent'),
                          outline: sel?.row === ri && sel?.col === ci ? '2px solid #3b82f6' : 'none',
                          cursor: 'text',
                        }}
                      >
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={e => updateCell(ri, ci, e.currentTarget.innerText)}
                          style={{
                            fontWeight: cell.style.bold ? 'bold' : 'normal',
                            fontStyle: cell.style.italic ? 'italic' : 'normal',
                            textDecoration: cell.style.underline ? 'underline' : 'none',
                            fontSize: cell.style.fontSize || 10,
                            textAlign: cell.style.align || 'left',
                            outline: 'none', minHeight: 16, whiteSpace: 'pre-wrap',
                          }}
                        >{cell.value}</div>
                      </td>
                    ))}
                  </tr>
                );
              }

              // Normal multi-column rows (table header + data rows)
              return (
                <tr key={ri} style={{ background: isGrandTotal ? '#f8f8f8' : undefined }}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      onClick={() => setSel({ row: ri, col: ci })}
                      style={{
                        border: '1px solid #000', padding: '3px 5px',
                        background: sel?.row === ri && sel?.col === ci ? '#eff6ff' : (cell.style.bg || 'transparent'),
                        outline: sel?.row === ri && sel?.col === ci ? '2px solid #3b82f6' : 'none',
                        cursor: 'text', minWidth: 40,
                      }}
                    >
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={e => updateCell(ri, ci, e.currentTarget.innerText)}
                        style={{
                          fontWeight: cell.style.bold ? 'bold' : 'normal',
                          fontStyle: cell.style.italic ? 'italic' : 'normal',
                          textDecoration: cell.style.underline ? 'underline' : 'none',
                          fontSize: cell.style.fontSize || 10,
                          textAlign: cell.style.align || 'left',
                          outline: 'none', minHeight: 14, whiteSpace: 'pre-wrap',
                        }}
                      >{cell.value}</div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          #invoice-paper { box-shadow: none !important; margin: 0 !important; padding: 12px !important; max-width: 100% !important; }
          [contenteditable] { outline: none !important; }
        }
      `}</style>
    </div>
  );
}

// ── Page export (Suspense wrapper required for useSearchParams) ───────────────
export default function InvoiceEditorPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Arial' }}>Loading editor…</div>}>
      <EditorInner />
    </Suspense>
  );
}
