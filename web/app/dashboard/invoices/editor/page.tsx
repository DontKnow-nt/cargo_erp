'use client';
import { Suspense, useRef, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer } from 'lucide-react';
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
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand(cmd, false, value);
  }

  // Snapshot the paper HTML for undo/redo
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

  // Get the AWB data tbody (id="awb-body") from inside the paper
  function getAwbTbody(): HTMLTableSectionElement | null {
    return paperRef.current?.querySelector<HTMLTableSectionElement>('#awb-body') ?? null;
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
    // Must be inside awb-body
    if (!tr || !tbody.contains(tr)) { alert('Click inside an AWB data row first.'); return; }
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
    if (!tr || !tbody.contains(tr)) { alert('Click inside an AWB data row first.'); return; }
    if (tbody.querySelectorAll('tr').length <= 1) return;
    snapshot();
    tr.remove();
  }

  function addCol() {
    const tbody = getAwbTbody();
    if (!tbody) return;
    const td = getSelectedTd();
    if (!td || !tbody.contains(td)) { alert('Click inside an AWB data cell first.'); return; }
    const tr = td.closest('tr')!;
    const colIdx = Array.from(tr.children).indexOf(td);
    snapshot();
    tbody.querySelectorAll('tr').forEach(row => {
      const refCell = row.children[colIdx] as HTMLTableCellElement | undefined;
      if (!refCell) return;
      const newCell = refCell.cloneNode(true) as HTMLTableCellElement;
      newCell.querySelectorAll('[contenteditable]').forEach(el => { (el as HTMLElement).innerText = ''; });
      refCell.after(newCell);
    });
  }

  function delCol() {
    const tbody = getAwbTbody();
    if (!tbody) return;
    const td = getSelectedTd();
    if (!td || !tbody.contains(td)) { alert('Click inside an AWB data cell first.'); return; }
    const tr = td.closest('tr')!;
    const colIdx = Array.from(tr.children).indexOf(td);
    if (tbody.querySelectorAll('tr')[0]?.children.length <= 1) return;
    snapshot();
    tbody.querySelectorAll('tr').forEach(row => {
      const cell = row.children[colIdx] as HTMLTableCellElement | undefined;
      if (cell) cell.remove();
    });
  }

  const [activeCommands, setActiveCommands] = useState<Set<string>>(new Set());

  function updateActiveState() {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
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

  // Track active formatting on selection change
  useEffect(() => {
    document.addEventListener('selectionchange', updateActiveState);
    return () => document.removeEventListener('selectionchange', updateActiveState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '6px 12px', background: '#f0f4ff', borderBottom: '1px solid #e5e7eb' }}>
      {btn('↩ Undo', 'Undo row/col changes', undo)}
      {btn('↪ Redo', 'Redo row/col changes', redo)}
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
      {btn('+ Row', 'Add AWB row below (click a data row first)', addRow, '#059669')}
      {btn('− Row', 'Delete AWB row (click a data row first)', delRow, '#dc2626')}
      {btn('+ Col', 'Add AWB column right (click a data cell first)', addCol, '#059669')}
      {btn('− Col', 'Delete AWB column (click a data cell first)', delCol, '#dc2626')}
    </div>
  );
}

// ── Editable cell with Excel-formula support ──────────────────────────────────
// Typing "4*8=" or "100+50=" evaluates the math and replaces with result
function evalFormula(text: string): string | null {
  const expr = text.trim();
  if (!expr) return null;
  // Only allow safe math characters (BODMAS + percentage)
  if (!/^[\d\s+\-*/().%]+$/.test(expr)) return null;
  try {
    const normalized = expr.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + normalized + ')')() as number;
    if (!isFinite(result)) return null;
    return Number(result.toFixed(2)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch { return null; }
}

function EC({ children, style, colSpan, rowSpan }: {
  children?: string | number;
  style?: React.CSSProperties;
  colSpan?: number;
  rowSpan?: number;
}) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter') return;
    const el = e.currentTarget;
    const text = el.innerText.trim();
    const result = evalFormula(text);
    if (result !== null) {
      e.preventDefault();
      el.innerText = result;
      // Move caret to end
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // else: let Enter do nothing (prevent newline in table cells)
    else { e.preventDefault(); }
  }

  return (
    <td colSpan={colSpan} rowSpan={rowSpan} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 10, verticalAlign: 'top', ...style }}>
      <div contentEditable suppressContentEditableWarning
        onKeyDown={handleKeyDown}
        style={{ outline: 'none', minHeight: 14, fontFamily: 'Arial, sans-serif', fontSize: 10, whiteSpace: 'pre-wrap' }}>
        {children != null ? String(children) : ''}
      </div>
    </td>
  );
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

function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Inner editor ──────────────────────────────────────────────────────────────
function InvoiceEditorInner() {
  const searchParams = useSearchParams();
  const invId = searchParams.get('id');
  const { invoices, parties, awbBookings, docketBookings } = useSharedData();
  const paperRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);

  const [banks, setBanks] = useState<{id:string;bank_name:string;account_name:string;account_number:string;ifsc:string;branch:string;is_default:number}[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [igstRate, setIgstRate] = useState(18);
  const [cgstRate, setCgstRate] = useState(9);
  const [sgstRate, setSgstRate] = useState(5);

  function applyGstRates(ig: number, cg: number, sg: number) {
    const taxEl = paperRef.current?.querySelector<HTMLElement>('[data-tax-summary]');
    if (!taxEl) return;
    const totalM = (taxEl.innerText || '').match(/Total Taxable Amount\s*:\s*([\d,.]+)/i);
    const taxable = totalM ? parseFloat(totalM[1].replace(/,/g,'')) : 0;
    const fmtN = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const igstAmt = parseFloat((taxable * ig / 100).toFixed(2));
    const cgstAmt = parseFloat((taxable * cg / 100).toFixed(2));
    const sgstAmt = parseFloat((taxable * sg / 100).toFixed(2));
    const net = parseFloat((taxable + igstAmt + cgstAmt + sgstAmt).toFixed(2));
    taxEl.innerText = `Total Taxable Amount : ${fmtN(taxable)}\nSGST @ ${sg}%              : ${fmtN(sgstAmt)}\nCGST @ ${cg}%              : ${fmtN(cgstAmt)}\nIGST @ ${ig}%             : ${fmtN(igstAmt)}\nNet Payable Amount  : ${fmtN(net)}`;
    // Update Amount in Words
    const wordsEl = paperRef.current?.querySelector<HTMLElement>('[data-words]');
    if (wordsEl && net > 0) wordsEl.innerText = `Rupees ${numberToWords(Math.round(net))}`;
  }

  useEffect(() => {
    fetch('/api/banks').then(r => r.json()).then(data => {
      setBanks(data);
      const def = data.find((b: {is_default:number}) => b.is_default === 1);
      if (def) setSelectedBankId(def.id);
    }).catch(() => {});
  }, []);

  const inv = invoices.find(i => i.id === invId);
  const party = inv ? parties.find(p => p.id === inv.partyId) : undefined;
  // Init GST rate from invoice lines
  useEffect(() => { if (inv?.lines?.[0]?.taxRate) setIgstRate(inv.lines[0].taxRate); }, [inv?.id]);
  const bank = banks.find(b => b.id === selectedBankId) ?? banks[0];

  // ── Helper: write bank into paper DOM ────────────────────────────────────
  const applyBankToPaper = useCallback((b: typeof banks[number] | undefined, paper: HTMLElement) => {
    if (!b) return;
    const bankText = `Bank           : ${b.bank_name}\nA/c Name     : ${b.account_name}\nAccount No.  : ${b.account_number}\nIFSC Code    : ${b.ifsc}\nBranch         : ${b.branch}`;
    const bankFooter = `${b.bank_name}, A/c Name: ${b.account_name}, A/C No. - ${b.account_number}, IFSC Code - ${b.ifsc}, Branch - ${b.branch}`;

    // Try data-attribute selectors first (new HTML)
    const bankDiv = paper.querySelector<HTMLElement>('[data-bank-detail]');
    const footerDiv = paper.querySelector<HTMLElement>('[data-bank-footer]');

    if (bankDiv) {
      bankDiv.innerText = bankText;
    } else {
      // Fallback: find the contentEditable div containing "Bank" and "IFSC"
      paper.querySelectorAll<HTMLElement>('[contenteditable]').forEach(el => {
        const t = el.innerText;
        if (t.includes('Bank') && t.includes('IFSC') && !t.includes('A/C No.')) {
          el.innerText = bankText;
        }
      });
    }

    if (footerDiv) {
      footerDiv.innerText = bankFooter;
    } else {
      // Fallback: find the footer line containing "A/C No."
      paper.querySelectorAll<HTMLElement>('[contenteditable]').forEach(el => {
        const t = el.innerText;
        if (t.includes('A/C No.') && t.includes('IFSC Code')) {
          el.innerText = bankFooter;
        }
      });
    }
  }, []);

  // ── Update bank cells whenever bank selection changes ─────────────────────
  useEffect(() => {
    const paper = paperRef.current;
    if (!paper || !bank) return;
    applyBankToPaper(bank, paper);
  }, [selectedBankId, bank, applyBankToPaper]);

  // ── Load saved HTML, then re-apply current bank on top ───────────────────
  useEffect(() => {
    if (!inv || !paperRef.current) return;
    fetch(`/api/invoices/${inv.id}/editor-html`)
      .then(r => r.json())
      .then(data => {
        if (data.html && paperRef.current) {
          paperRef.current.innerHTML = data.html;
          // Re-apply the currently selected bank AFTER html is restored
          const currentBank = banks.find(b => b.id === selectedBankId) ?? banks[0];
          if (currentBank) applyBankToPaper(currentBank, paperRef.current);
          // Trigger recalc so Grand Total & Tax Summary sync with saved data
          paperRef.current.querySelector('#awb-body')?.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv?.id]);

  // Auto-calculate Freight = ChgWeight × Rate, Taxable = Freight + other cols, Grand Total
  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;

    function recalc() {
      const awbBody = paper!.querySelector<HTMLTableSectionElement>('#awb-body tbody');
      if (!awbBody) return;
      const rows = [...awbBody.querySelectorAll<HTMLTableRowElement>('tr')].filter(r => !r.dataset.grandTotal);

      let totalBoxes = 0, totalChgWt = 0, totalFreight = 0, totalAwbDo = 0, totalCarrier = 0, totalForwrd = 0, totalTsp = 0, totalTaxable = 0;

      rows.forEach(row => {
        const cells = row.querySelectorAll<HTMLTableCellElement>('td');
        if (cells.length < 14) return;
        const getCellText = (idx: number) => cells[idx]?.querySelector('[contenteditable]')?.textContent?.trim() ?? cells[idx]?.textContent?.trim() ?? '';
        const parseNum = (s: string) => { const n = parseFloat(s.replace(/,/g,'')); return isNaN(n) ? null : n; };
        const setCellText = (idx: number, val: string) => {
          const ce = cells[idx]?.querySelector('[contenteditable]') as HTMLElement | null;
          if (ce) ce.textContent = val;
        };

        const boxes = parseNum(getCellText(5)) ?? 0;
        const chgWt = parseNum(getCellText(6)) ?? 0;
        const rateRaw = getCellText(7);
        const rateNum = parseNum(rateRaw); // null if 'na' or empty

        // Freight = ChgWeight × Rate (only if rate is numeric)
        let freight = parseNum(getCellText(8)) ?? 0;
        if (rateNum !== null && chgWt > 0) {
          freight = parseFloat((chgWt * rateNum).toFixed(2));
          setCellText(8, freight.toFixed(2));
        }

        const awbDo    = parseNum(getCellText(9))  ?? 0;
        const carrier  = parseNum(getCellText(10)) ?? 0;
        const forwrd   = parseNum(getCellText(11)) ?? 0;
        const tsp      = parseNum(getCellText(12)) ?? 0;

        // Taxable = Freight + AWB&DO + Carrier + Forwrd + TSP
        const taxable = parseFloat((freight + awbDo + carrier + forwrd + tsp).toFixed(2));
        setCellText(13, taxable.toFixed(2));

        totalBoxes    += boxes;
        totalChgWt    += chgWt;
        totalFreight  += freight;
        totalAwbDo    += awbDo;
        totalCarrier  += carrier;
        totalForwrd   += forwrd;
        totalTsp      += tsp;
        totalTaxable  += taxable;
      });

      // Update grand total row
      const gtRow = awbBody.querySelector<HTMLTableRowElement>('[data-grand-total]');
      if (gtRow) {
        const gcells = gtRow.querySelectorAll<HTMLTableCellElement>('td');
        const setGT = (idx: number, val: string) => {
          const ce = gcells[idx]?.querySelector('[contenteditable]') as HTMLElement | null;
          if (ce) ce.textContent = val;
          else if (gcells[idx]) gcells[idx].textContent = val;
        };
        setGT(5, totalBoxes.toString());
        setGT(6, totalChgWt.toFixed(2));
        setGT(8, totalFreight.toFixed(2));
        setGT(9, totalAwbDo.toFixed(2));
        setGT(10, totalCarrier.toFixed(2));
        setGT(11, totalForwrd.toFixed(2));
        setGT(12, totalTsp.toFixed(2));
        setGT(13, totalTaxable.toFixed(2));
      }

      // Update tax summary — detect GST structure from existing content
      const taxSummaryEl = paper!.querySelector<HTMLElement>('[data-tax-summary]');
      if (taxSummaryEl) {
        const currentText = taxSummaryEl.innerText || '';
        // Detect IGST rate (e.g. "IGST @ 18%")
        const igstMatch  = currentText.match(/IGST\s*@\s*(\d+(?:\.\d+)?)/i);
        const sgstMatch  = currentText.match(/SGST\s*@\s*(\d+(?:\.\d+)?)/i);
        const igstRateVal = igstMatch  ? parseFloat(igstMatch[1])  : 18;
        const sgstRate   = sgstMatch  ? parseFloat(sgstMatch[1])  : 0;
        const cgstRate   = sgstRate; // always equal to SGST

        const sgstAmt    = parseFloat((totalTaxable * sgstRate   / 100).toFixed(2));
        const cgstAmt    = parseFloat((totalTaxable * cgstRate   / 100).toFixed(2));
        const igstAmt    = parseFloat((totalTaxable * igstRateVal / 100).toFixed(2));
        const netPayable = parseFloat((totalTaxable + sgstAmt + cgstAmt + igstAmt).toFixed(2));

        const fmtN = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        taxSummaryEl.innerText = `Total Taxable Amount : ${fmtN(totalTaxable)}\nSGST @ ${sgstRate}%              : ${fmtN(sgstAmt)}\nCGST @ ${cgstRate}%              : ${fmtN(cgstAmt)}\nIGST @ ${igstRateVal}%             : ${fmtN(igstAmt)}\nNet Payable Amount  : ${fmtN(netPayable)}`;
        const wordsEl2 = paper!.querySelector<HTMLElement>('[data-words]');
        if (wordsEl2 && netPayable > 0) wordsEl2.innerText = `Rupees ${numberToWords(Math.round(netPayable))}`;
      }
    }

    const awbTable = paper.querySelector('#awb-body');
    if (!awbTable) return;
    awbTable.addEventListener('input', recalc);
    recalc(); // sync on initial load / after HTML restore
    return () => awbTable.removeEventListener('input', recalc);
  }, [inv?.id]); // re-attach when invoice changes

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

    // Convert logo to base64 so it works in blob URL context
    try {
      const resp = await fetch('/logo.png');
      const blob2 = await resp.blob();
      const b64 = await new Promise<string>(res => {
        const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob2);
      });
      clone.querySelectorAll('img').forEach(img => { (img as HTMLImageElement).src = b64; });
    } catch { /* logo missing, skip */ }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tax Invoice - ${inv?.invoiceNo ?? ''}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;padding:8px}
table{border-collapse:collapse;width:100%}
td{border:1px solid #000;padding:3px 5px;font-size:10px;vertical-align:top}
[contenteditable]{outline:none;min-height:14px;white-space:pre-wrap}
img{max-width:100%;object-fit:contain}
@media print{@page{size:A4 landscape;margin:8mm}body{padding:4px}}
</style></head>
<body>${clone.innerHTML}
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'width=1200,height=800');
    if (win) setTimeout(() => URL.revokeObjectURL(url), 15000);
  }, [inv]);

  if (!inv) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Arial', fontSize: 16, color: '#6b7280' }}>
      No invoice found. Open this page from the Invoices list.
    </div>
  );

  const billDate = inv.invoiceDate.split('-').reverse().join('.');
  const invIgstRate = inv.lines[0]?.taxRate ?? 18;
  const amtWords = numberToWords(Math.round(inv.grandTotal));

  // ── Build line rows: pull weight+pieces from actual AWB/docket bookings ──
  type LineRow = { origin:string; dest:string; boxes:string; chgWt:string; rate:string; freight:string; tsp:string; taxable:string; awbNo:string; date:string };
  const lineRows: LineRow[] = [];
  let runningTSP = 0;

  const mainLines = inv.lines.filter(l => !l.description.toLowerCase().includes('handling') && !l.description.toLowerCase().includes('markup'));
  const markupLines = inv.lines.filter(l => l.description.toLowerCase().includes('handling') || l.description.toLowerCase().includes('markup'));
  const useLines = mainLines.length > 0 ? mainLines : inv.lines;

  useLines.forEach((line, i) => {
    const m = line.description.match(/([A-Z]{3})[→\->]([A-Z]{3})/i);
    const rm = line.description.match(/@\s*₹?([\d.]+)/i);
    const awbM = line.description.match(/\b(\d{3}-\d{7,8})\b/);
    const dktM = line.description.match(/Docket\s+([\w\-]+)/i);
    const refs = inv.bookingRef.split(',');
    const ref = (awbM?.[1] ?? dktM?.[1] ?? refs[i]?.trim() ?? refs[0]?.trim() ?? '').trim();

    // Look up actual booking to get weight & pieces
    const awbBk = awbBookings.find(a => a.awbNo === ref || a.awbNo === awbM?.[1]);
    const dktBk = docketBookings.find(d => d.docketNo === ref || d.docketNo === dktM?.[1]);
    const booking = awbBk ?? dktBk;

    const boxes  = booking ? String(awbBk ? awbBk.pieces : 1) : String(Math.round(line.qty));
    const chgWt  = booking
      ? String(awbBk ? awbBk.weight : ((dktBk?.weight ?? 0) > 0 ? dktBk!.weight : (line.description.match(/(\d+(?:\.\d+)?)\s*kg/i)?.[1] ?? String(line.qty))))
      : (line.description.match(/(\d+(?:\.\d+)?)\s*kg/i)?.[1] ?? String(Math.round(line.qty)));
    const rate   = rm?.[1] ?? (dktBk ? String(dktBk.rateFittedAmount) : String(line.rate));

    const myMarkup = markupLines.find(ml => ml.description.includes(ref));
    const tspAmt = myMarkup?.amount ?? 0;
    if (mainLines.length > 0) runningTSP += tspAmt;

    lineRows.push({
      origin: m?.[1] ?? (booking ? (awbBk?.origin ?? dktBk?.origin ?? '') : ''),
      dest:   m?.[2] ?? (booking ? (awbBk?.destination ?? dktBk?.destination ?? '') : ''),
      boxes, chgWt, rate,
      freight: fmt(line.amount),
      awbNo: ref,
      date: (() => { const [y,m,d] = inv.invoiceDate.split('-'); return `${d}/${m}/${y.slice(-2)}`; })(),
      tsp: tspAmt > 0 ? fmt(tspAmt) : '0.00',
      taxable: fmt(line.amount + tspAmt),
    });
  });

  const totalBoxes   = lineRows.reduce((s, r) => s + (parseFloat(r.boxes) || 0), 0);
  const totalChgWt   = lineRows.reduce((s, r) => s + (parseFloat(r.chgWt) || 0), 0);
  const totalFreight = fmt(useLines.reduce((s, l) => s + l.amount, 0));
  const totalTSP     = fmt(runningTSP || markupLines.reduce((s, l) => s + l.amount, 0));

  const bankText = bank
    ? `Bank           : ${bank.bank_name}\nA/c Name     : ${bank.account_name}\nAccount No.  : ${bank.account_number}\nIFSC Code    : ${bank.ifsc}\nBranch         : ${bank.branch}`
    : `Bank           : YES BANK Ltd.\nA/c Name     : TRIVENI CARGO EXPRESS INDIA PVT LTD\nAccount No.  : 008463700000641\nIFSC Code    : YESB0000283\nBranch         : Vasant Kunj, New Delhi`;

  const bankFooter = bank
    ? `${bank.bank_name}, A/c Name: ${bank.account_name}, A/C No. - ${bank.account_number}, IFSC Code - ${bank.ifsc}, Branch - ${bank.branch}`
    : `YES BANK Ltd., A/c Name: TRIVENI CARGO EXPRESS INDIA PVT LTD, A/C No. - 008463700000641, IFSC Code - YESB0000283, Branch - Vasant Kunj, New Delhi`;

  // Determine if IGST or SGST+CGST split based on gstTotal vs igstRate
  const sgstAmt  = parseFloat((inv.subtotal * 9 / 100).toFixed(2));
  const cgstAmt  = sgstAmt;
  const igstAmt  = parseFloat((inv.subtotal * invIgstRate / 100).toFixed(2));
  const useIgst  = Math.abs(inv.gstTotal - igstAmt) < Math.abs(inv.gstTotal - (sgstAmt + cgstAmt));
  const taxSummary = useIgst
    ? `Total Taxable Amount : ${fmt(inv.subtotal)}\nSGST @ 9%              : 0.00\nCGST @ 9%              : 0.00\nIGST @ ${invIgstRate}%             : ${fmt(inv.gstTotal)}\nNet Payable Amount  : ${fmt(inv.grandTotal)}`
    : `Total Taxable Amount : ${fmt(inv.subtotal)}\nSGST @ 9%              : ${fmt(sgstAmt)}\nCGST @ 9%              : ${fmt(cgstAmt)}\nIGST @ 0%             : 0.00\nNet Payable Amount  : ${fmt(inv.grandTotal)}`;

  const notesText = `NOTES :\n1. DIFFERENCE, IF ANY, MAY BE NOTIFIED WITHIN 3 DAYS OF RECEIPT.\n2. PLEASE PAY YOUR BILL AMOUNT WITHIN 15 DAYS OF RECEIPT.\n3. INTEREST AT 24% P.A. WILL BE CHARGED IF THE BILL IS NOT PAID WITHIN THE STIPULATED TIME.\n4. PAYMENT SHOULD BE MADE BY A/C PAYEE CHEQUE OR DD IN FAVOUR OF TRIVENI CARGO EXPRESS INDIA PVT LTD.\n5. JURISDICTION: ALL DISPUTES ARISING UNDER THIS BILL SHALL BE SUBJECT TO BE UNDER NEW DELHI JURISDICTION.`;

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb', fontFamily: 'Arial, sans-serif' }}>
      {/* Toolbar */}
      <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Invoice Editor — <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{inv.invoiceNo}</span></span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{inv.partyName}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {banks.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>🏦 Bank:</span>
              <select value={selectedBankId} onChange={e => setSelectedBankId(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
                {banks.map(b => (
                  <option key={b.id} value={b.id}>{b.bank_name}{b.is_default ? ' ★' : ''}</option>
                ))}
              </select>
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            {[
              { label: 'IGST', val: igstRate, set: (v: number) => { setIgstRate(v); applyGstRates(v, cgstRate, sgstRate); } },
              { label: 'CGST', val: cgstRate, set: (v: number) => { setCgstRate(v); applyGstRates(igstRate, v, sgstRate); } },
              { label: 'SGST', val: sgstRate, set: (v: number) => { setSgstRate(v); applyGstRates(igstRate, cgstRate, v); } },
            ].map(({ label, val, set }) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontWeight: 600, color: '#374151', fontSize: 11 }}>{label}:</span>
                <select value={val} onChange={e => set(parseFloat(e.target.value))}
                  style={{ fontSize: 11, padding: '3px 5px', borderRadius: 5, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', width: 58 }}>
                  {[0,5,9,10,12,18,28].map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </span>
            ))}
          </span>
          <span style={{ fontSize: 11, color: '#6b7280' }}>💡 Click any field to edit</span>
          <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: saving ? '#6b7280' : '#059669', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? '⏳ Saving…' : '💾 Save'}
          </button>
          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Printer size={14} /> Print / Download
          </button>
        </div>
      </div>

      {/* Editing Toolbar */}
      <Toolbar paperRef={paperRef} />

      {/* Invoice Paper */}
      <div ref={paperRef} style={{ background: '#fff', maxWidth: 1100, margin: '24px auto', padding: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>

            {/* ── HEADER: Logo + Company Info ── */}
            <tr>
              <td colSpan={14} style={{ border: '1px solid #000', padding: '6px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src="/logo.png" alt="Triveni" style={{ width: 64, height: 64, objectFit: 'contain', flexShrink: 0 }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 20, fontWeight: 900, letterSpacing: 0.5, fontFamily:'Arial,sans-serif' }}>TRIVENI CARGO EXPRESS INDIA PVT LTD</div>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 10, fontFamily:'Arial,sans-serif' }}>Domestic Air Cargo &amp; Rail Agent</div>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 10, fontFamily:'Arial,sans-serif' }}>Plot no-319/2/2, Badam Singh Market, NH-8 Rangpuri, New Delhi-110037</div>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 10, fontFamily:'Arial,sans-serif' }}>Tel. : 011-65809456, 9311389456</div>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 10, fontWeight: 700, fontFamily:'Arial,sans-serif' }}>GSTIN: 07AAGCT2294N2ZR , CIN: U74999DL2017PTC316659</div>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 9, color: '#c00', fontFamily:'Arial,sans-serif' }}>Regd. Office: Plot no 480, Flat no 301, First Floor, Gali no 15, L Block Mahipalpur Extn. New Delhi 110037</div>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 10, fontFamily:'Arial,sans-serif' }}>Email : info@tceipl.com</div>
                  </div>
                </div>
              </td>
            </tr>

            {/* ── TAX INVOICE title ── */}
            <tr>
              <td colSpan={14} style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 700, fontSize: 13, textDecoration: 'underline' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', textAlign: 'center', fontWeight: 700, fontSize: 13, textDecoration: 'underline', fontFamily: 'Arial, sans-serif' }}>TAX INVOICE</div>
              </td>
            </tr>

            {/* ── Party Info (left) + Bill Info (right) ── */}
            <tr>
              <td colSpan={9} style={{ border: '1px solid #000', padding: '5px 7px', verticalAlign: 'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 60, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}>
                  {`M/s : ${inv.partyName}\nGSTIN : ${party?.gstin || '—'}\nAddress : ${party?.billingAddress || '—'}`}
                </div>
              </td>
              <td colSpan={5} style={{ border: '1px solid #000', padding: '5px 7px', verticalAlign: 'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 60, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}>
                  {`Bill No. : ${inv.invoiceNo}\nBill Date : ${billDate}\nPOS : DELHI\nBilling Period From : ${inv.invoiceDate} to ${inv.dueDate}`}
                </div>
              </td>
            </tr>

            {/* ── SAC Code ── */}
            <tr>
              <td colSpan={14} style={{ border: '1px solid #000', padding: '3px 7px', fontSize: 10, fontWeight: 700, textAlign: 'center' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', textAlign: 'center', fontWeight: 700, fontFamily: 'Arial, sans-serif', fontSize: 10 }}>SAC Code : 996531</div>
              </td>
            </tr>

            {/* ── AWB Table (own full-width table so columns always fill width) ── */}
            </tbody></table>
            <table id="awb-body" style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
              <tbody>
              <tr style={{ background: '#f0f0f0' }}>
                {['Sl#','Origin','AWB#/Ref.\nNumber','Date','Dest#','Boxes','Charg.\nWeight','Rate','Freight','AWB &\nDO','Due\nCarrier','Forwrd &\nOthers','TSP &\nOthers','Taxable\nAmount'].map((h, i) => (
                  <td key={i} style={{ border: '1px solid #000', padding: '4px 5px', fontSize: 9.5, textAlign: 'center', fontWeight: 700, whiteSpace: 'pre-wrap', background: '#f0f0f0' }}>
                    <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontFamily: 'Arial, sans-serif', fontSize: 9.5, fontWeight: 700, textAlign: 'center', whiteSpace: 'pre-wrap' }}>{h}</div>
                  </td>
                ))}
              </tr>
              {lineRows.map((row, i) => (
                <tr key={i}>
                  <EC style={{ textAlign: 'center' }}>{i + 1}</EC>
                  <EC style={{ textAlign: 'center' }}>{row.origin}</EC>
                  <EC style={{ textAlign: 'center' }}>{row.awbNo}</EC>
                  <EC style={{ textAlign: 'center' }}>{row.date}</EC>
                  <EC style={{ textAlign: 'center' }}>{row.dest}</EC>
                  <EC style={{ textAlign: 'center' }}>{row.boxes}</EC>
                  <EC style={{ textAlign: 'center' }}>{row.chgWt}</EC>
                  <EC style={{ textAlign: 'right' }}>{row.rate}</EC>
                  <EC style={{ textAlign: 'right' }}>{row.freight}</EC>
                  <EC style={{ textAlign: 'right' }}>0.00</EC>
                  <EC style={{ textAlign: 'right' }}>0.00</EC>
                  <EC style={{ textAlign: 'right' }}>0</EC>
                  <EC style={{ textAlign: 'right' }}>{row.tsp}</EC>
                  <EC style={{ textAlign: 'right' }}>{row.taxable}</EC>
                </tr>
              ))}
              {/* ── Grand Total Row ── */}
              <tr style={{ background: '#f8f8f8', fontWeight: 700 }} data-grand-total="1">
                <td style={{ border: '1px solid #000', padding: '4px 6px', fontSize: 10, background: '#f8f8f8' }}></td>
                <td style={{ border: '1px solid #000', padding: '4px 6px', fontSize: 10, background: '#f8f8f8' }}></td>
                <td style={{ border: '1px solid #000', padding: '4px 6px', fontSize: 10, background: '#f8f8f8' }}></td>
                <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 700, fontSize: 10, background: '#f8f8f8' }}><div contentEditable suppressContentEditableWarning style={{ outline:'none', fontFamily:'Arial,sans-serif', fontSize:10, fontWeight:700, textAlign:'right' }}>Grand Total</div></td>
                <td style={{ border: '1px solid #000', padding: '4px 6px', fontSize: 10, background: '#f8f8f8' }}></td>
                <EC style={{ textAlign: 'center', background: '#f8f8f8', fontWeight: 700 }}>{totalBoxes}</EC>
                <EC style={{ textAlign: 'center', background: '#f8f8f8', fontWeight: 700 }}>{totalChgWt}</EC>
                <td style={{ border: '1px solid #000', padding: '4px 6px', fontSize: 10, background: '#f8f8f8' }}></td>
                <EC style={{ textAlign: 'right', background: '#f8f8f8', fontWeight: 700 }}>{totalFreight}</EC>
                <EC style={{ textAlign: 'right', background: '#f8f8f8', fontWeight: 700 }}>0.00</EC>
                <EC style={{ textAlign: 'right', background: '#f8f8f8', fontWeight: 700 }}>0.00</EC>
                <EC style={{ textAlign: 'right', background: '#f8f8f8', fontWeight: 700 }}>0</EC>
                <EC style={{ textAlign: 'right', background: '#f8f8f8', fontWeight: 700 }}>{totalTSP}</EC>
                <EC style={{ textAlign: 'right', background: '#f8f8f8', fontWeight: 700 }}>{fmt(inv.subtotal)}</EC>
              </tr>
              </tbody>
            </table>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}><tbody>

            {/* ── Bank (left) + Tax Summary (right) ── */}
            <tr>
              <td colSpan={9} style={{ border: '1px solid #000', padding: '5px 7px', verticalAlign: 'top' }}>
                <div style={{ fontSize: 10, marginBottom: 4 }}><strong>Amount in Words :</strong> <span data-words contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>Rupees {amtWords}</span></div>
                <div contentEditable suppressContentEditableWarning data-bank-detail style={{ outline: 'none', minHeight: 60, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap', marginTop: 6 }}>
                  {bankText}
                </div>
              </td>
              <td colSpan={5} style={{ border: '1px solid #000', padding: '5px 7px', verticalAlign: 'top' }}>
                <div data-tax-summary="1" contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 60, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}>
                  {taxSummary}
                </div>
              </td>
            </tr>

            {/* ── Bank footer line ── */}
            <tr>
              <td colSpan={14} style={{ border: '1px solid #000', padding: '3px 7px', fontSize: 9, textAlign: 'center' }}>
                <div contentEditable suppressContentEditableWarning data-bank-footer style={{ outline: 'none', fontFamily: 'Arial, sans-serif', fontSize: 9, whiteSpace: 'pre-wrap' }}>
                  {bankFooter}
                </div>
              </td>
            </tr>

            {/* ── Notes (left) + Signature (right) ── */}
            <tr>
              <td colSpan={9} style={{ border: '1px solid #000', padding: '5px 7px', verticalAlign: 'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 60, fontSize: 9, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}>
                  {notesText}
                </div>
              </td>
              <td colSpan={5} style={{ border: '1px solid #000', padding: '5px 7px', verticalAlign: 'bottom', textAlign: 'right' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap', textAlign: 'right' }}>
                  {`For TRIVENI CARGO EXPRESS INDIA PVT LTD\n\n\n\nAuthorised Signatory`}
                </div>
              </td>
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function InvoiceEditorPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Arial' }}>Loading editor…</div>}>
      <InvoiceEditorInner />
    </Suspense>
  );
}
