'use client';
import { Suspense, useRef, useCallback, useEffect, useState, useTransition } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Printer } from 'lucide-react';
import { useSharedData } from '@/lib/useSharedData';
import { createCreditNote, updateCreditNoteAmount } from '@/lib/actions/invoices';
import toast from 'react-hot-toast';

function Toolbar({ paperRef }: { paperRef: React.RefObject<HTMLDivElement | null> }) {
  const [fontSize, setFontSize] = useState('3');
  const savedRange = useRef<Range | null>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const [activeCmds, setActiveCmds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const h = () => { try { setActiveCmds(new Set(['bold','italic','underline','justifyLeft','justifyCenter','justifyRight'].filter(c=>document.queryCommandState(c)))); } catch {} };
    document.addEventListener('selectionchange', h);
    return () => document.removeEventListener('selectionchange', h);
  }, []);
  function saveSelection() { const sel = window.getSelection(); if (sel && sel.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange(); }
  function restoreSelection() { const sel = window.getSelection(); if (sel && savedRange.current) { try { sel.removeAllRanges(); sel.addRange(savedRange.current); } catch {} } }
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  function exec(cmd: string, value?: string) { restoreSelection(); document.execCommand(cmd, false, value); }
  function snapshot() { if (!paperRef.current) return; undoStack.current.push(paperRef.current.innerHTML); if (undoStack.current.length > 50) undoStack.current.shift(); redoStack.current = []; }
  function undo() { if (!paperRef.current || !undoStack.current.length) return; redoStack.current.push(paperRef.current.innerHTML); paperRef.current.innerHTML = undoStack.current.pop()!; }
  function redo() { if (!paperRef.current || !redoStack.current.length) return; undoStack.current.push(paperRef.current.innerHTML); paperRef.current.innerHTML = redoStack.current.pop()!; }
  function getDataBody() { return paperRef.current?.querySelector<HTMLTableSectionElement>('#cn-data-body') ?? null; }
  function getSelectedTd() { const sel = window.getSelection(); const node = sel?.anchorNode; if (!node) return null; const el = (node.nodeType === 3 ? node.parentElement : node) as Element; return el?.closest?.('td') ?? null; }
  function addRow() { const tbody = getDataBody(); if (!tbody) return; const td = getSelectedTd(); const tr = td?.closest('tr'); if (!tr || !tbody.contains(tr)) { alert('Click inside a data row first.'); return; } snapshot(); const nr = tr.cloneNode(true) as HTMLTableRowElement; nr.querySelectorAll('[contenteditable]').forEach(el => { (el as HTMLElement).innerText = ''; }); tr.after(nr); }
  function delRow() { const tbody = getDataBody(); if (!tbody) return; const td = getSelectedTd(); const tr = td?.closest('tr'); if (!tr || !tbody.contains(tr)) { alert('Click inside a data row first.'); return; } if (tbody.querySelectorAll('tr').length <= 1) return; snapshot(); tr.remove(); }
  const btn = (label: string, title: string, onClick: () => void, color?: string, cmd?: string) => {
    const isActive = cmd ? activeCmds.has(cmd) : false;
    return (
      <button key={label} title={title} onMouseDown={e => { e.preventDefault(); onClick(); }}
        style={{ padding: '3px 8px', border: isActive ? '2px solid #059669' : '1px solid #d1d5db', borderRadius: 5, background: isActive ? '#ecfdf5' : '#fff', cursor: 'pointer', fontSize: 12, fontWeight: label === 'B' ? 700 : 500, fontStyle: label === 'I' ? 'italic' : 'normal', color: color || '#374151', minWidth: 28 }}>
        {label}
      </button>
    );
  };
  const sep = <div style={{ width: 1, background: '#e5e7eb', margin: '0 4px', alignSelf: 'stretch' }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '6px 12px', background: '#f0f4ff', borderBottom: '1px solid #e5e7eb' }}>
      {btn('↩', 'Undo', undo)} {btn('↪', 'Redo', redo)} {sep}
      {btn('B', 'Bold', () => exec('bold'), '#111', 'bold')} {btn('I', 'Italic', () => exec('italic'), '#111', 'italic')} {btn('U̲', 'Underline', () => exec('underline'), '#111', 'underline')} {sep}
      <span style={{ fontSize: 11, color: '#6b7280' }}>Size:</span>
      <select value={fontSize} onMouseDown={() => saveSelection()} onChange={e => { const v = e.target.value; setFontSize(v); restoreSelection(); exec('fontSize', v); }}
        style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 12, width: 70 }}>
        {[['1','8px'],['2','10px'],['3','12px'],['4','14px'],['5','18px'],['6','24px'],['7','32px']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
      </select> {sep}
      {btn('⬅', 'Align Left', () => exec('justifyLeft'))} {btn('≡', 'Align Center', () => exec('justifyCenter'))} {btn('➡', 'Align Right', () => exec('justifyRight'))} {sep}
      {btn('+ Row', 'Add row below', addRow, '#059669')} {btn('− Row', 'Delete row', delRow, '#dc2626')}
    </div>
  );
}

function CE({ children, style }: { children?: string; style?: React.CSSProperties }) {
  return (
    <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontFamily: 'Arial, sans-serif', fontSize: 10, whiteSpace: 'pre-wrap', ...style }}>
      {children ?? ''}
    </div>
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

const B = '1px solid #000';
const td = (style?: React.CSSProperties): React.CSSProperties => ({ border: B, padding: '3px 7px', fontSize: 10, verticalAlign: 'top', fontFamily: 'Arial, sans-serif', ...style });

function CreditNoteTemplate({ inv, party, bank, today, amtWords }: {
  inv: { invoiceNo: string; partyName: string; invoiceDate: string; dueDate: string; bookingRef: string; subtotal: number; gstTotal: number; grandTotal: number; lines: { description: string; amount: number; taxRate?: number }[] };
  party?: { gstin?: string | null; billingAddress?: string | null };
  bank?: { bank_name: string; account_number: string; ifsc: string; branch: string };
  today: string; amtWords: string;
}) {
  const igstRate = (inv.lines[0] as any)?.taxRate ?? 18;
  const bankText = bank ? `${bank.bank_name}` : 'HDFC BANK LIMITED';
  const acctNo = bank?.account_number ?? '50200039767955';
  const ifsc = bank?.ifsc ?? 'HDFC0000106';
  const branch = bank?.branch ?? 'Plot No 480, Flat No 301, 2nd Floor,\nL-Block, Gali No 15, Mahipalpur Extension,\nNew Delhi, Delhi 110037';

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: 'Arial, sans-serif' }}>
      <colgroup>
        <col style={{ width: '3%' }}/><col style={{ width: '10%' }}/><col style={{ width: '50%' }}/><col style={{ width: '10%' }}/><col style={{ width: '10%' }}/><col style={{ width: '17%' }}/>
      </colgroup>
      <tbody>

        {/* ── Company Header ── */}
        <tr>
          <td colSpan={6} style={{ border: B, padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img src="/logo.png" alt="Triveni" style={{ width: 90, height: 90, objectFit: 'contain', flexShrink: 0 }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 0.5 }}>TRIVENI CARGO EXPRESS INDIA PVT LTD</div>
                <div style={{ fontSize: 9 }}>Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15, Mahipalpur Extension, New Delhi, Delhi 110037</div>
                <div style={{ fontSize: 9 }}>Tel. : 011-65809456, 9311389456</div>
                <div style={{ fontSize: 10, fontWeight: 700 }}>GSTIN : 07AAGCT2294N2ZR , CIN: U74999DL2017PTC316659</div>
                <div style={{ fontSize: 8, color: '#c00' }}>Regd. Office: Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15, Mahipalpur Extension, New Delhi 110037, near Hotel City Centre</div>
                <div style={{ fontSize: 9 }}>Email : info@tceipl.com</div>
              </div>
              <img src="/iata.png" alt="IATA" style={{ width: 130, height: 90, objectFit: 'contain', flexShrink: 0 }} />
            </div>
          </td>
        </tr>

        {/* ── CREDIT NOTE title ── */}
        <tr>
          <td colSpan={6} style={{ border: B, padding: '4px', textAlign: 'center', fontWeight: 700, fontSize: 14, textDecoration: 'underline' }}>
            CREDIT NOTE
          </td>
        </tr>

        {/* ── Party info (left) + Credit Note info (right) ── */}
        <tr>
          <td colSpan={3} style={{ border: B, padding: '6px 10px', verticalAlign: 'top' }}>
            <CE style={{ fontSize: 10, lineHeight: 1.7 }}>
              {`M/s :      ${inv.partyName}\nGSTIN :   ${party?.gstin || '07AAGCT2294N2ZR'}\nAddress : ${party?.billingAddress || 'Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15,\n             Mahipalpur Extension, New Delhi, Delhi 110037'}`}
            </CE>
          </td>
          <td colSpan={3} style={{ border: B, padding: '6px 10px', verticalAlign: 'top' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {[
                  ['Credit Note No.', `TCN/CCU/25-26/${inv.invoiceNo}`],
                  ['Credit Note Date', today],
                  ['POS', 'DELHI'],
                  ['CreditNote Period From', `${inv.invoiceDate} to ${inv.dueDate}`],
                  ['Reference No#', inv.bookingRef],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ fontSize: 10, fontWeight: 600, padding: '2px 0', whiteSpace: 'nowrap', width: '52%', verticalAlign: 'top' }}>
                      <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{label}</span>
                    </td>
                    <td style={{ fontSize: 10, padding: '2px 4px', width: '4%', verticalAlign: 'top' }}>:</td>
                    <td style={{ fontSize: 10, padding: '2px 0', verticalAlign: 'top' }}>
                      <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{value}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>

        {/* ── Data table header ── */}
        <tr style={{ background: '#f0f0f0' }}>
          <td style={{ ...td({ textAlign: 'center', fontWeight: 700, background: '#f0f0f0' }) }}><div contentEditable suppressContentEditableWarning style={{ outline: 'none', textAlign: 'center', fontWeight: 700, fontFamily: 'Arial', fontSize: 10 }}>Sl#</div></td>
          <td style={{ ...td({ textAlign: 'center', fontWeight: 700, background: '#f0f0f0' }) }}><div contentEditable suppressContentEditableWarning style={{ outline: 'none', textAlign: 'center', fontWeight: 700, fontFamily: 'Arial', fontSize: 10 }}>SAC Code</div></td>
          <td colSpan={3} style={{ ...td({ textAlign: 'left', fontWeight: 700, background: '#f0f0f0' }) }}><div contentEditable suppressContentEditableWarning style={{ outline: 'none', fontWeight: 700, fontFamily: 'Arial', fontSize: 10 }}>Description</div></td>
          <td style={{ ...td({ textAlign: 'right', fontWeight: 700, background: '#f0f0f0' }) }}><div contentEditable suppressContentEditableWarning style={{ outline: 'none', textAlign: 'right', fontWeight: 700, fontFamily: 'Arial', fontSize: 10 }}>Taxable Amount</div></td>
        </tr>
      </tbody>

      {/* ── Data rows (separate tbody for + Row / - Row) ── */}
      <tbody id="cn-data-body">
        {inv.lines.length > 0 ? inv.lines.map((line, i) => (
          <tr key={i}>
            <td style={td({ textAlign: 'center' })}><div contentEditable suppressContentEditableWarning style={{ outline: 'none', fontFamily: 'Arial', fontSize: 10, textAlign: 'center' }}>{i + 1}</div></td>
            <td style={td({ textAlign: 'center' })}><div contentEditable suppressContentEditableWarning style={{ outline: 'none', fontFamily: 'Arial', fontSize: 10, textAlign: 'center' }}>996531</div></td>
            <td colSpan={3} style={td({ lineHeight: 1.5 })}><div contentEditable suppressContentEditableWarning style={{ outline: 'none', fontFamily: 'Arial', fontSize: 10, lineHeight: 1.5 }}>{line.description}</div></td>
            <td style={td({ textAlign: 'right' })}><div contentEditable suppressContentEditableWarning style={{ outline: 'none', fontFamily: 'Arial', fontSize: 10, textAlign: 'right' }}>{fmt(line.amount)}</div></td>
          </tr>
        )) : (
          <tr>
            <td style={td({ textAlign: 'center' })}><div contentEditable suppressContentEditableWarning style={{ outline: 'none', fontFamily: 'Arial', fontSize: 10, textAlign: 'center' }}>1</div></td>
            <td style={td({ textAlign: 'center' })}><div contentEditable suppressContentEditableWarning style={{ outline: 'none', fontFamily: 'Arial', fontSize: 10, textAlign: 'center' }}>996531</div></td>
            <td colSpan={3} style={td({ lineHeight: 1.5 })}><div contentEditable suppressContentEditableWarning style={{ outline: 'none', fontFamily: 'Arial', fontSize: 10, lineHeight: 1.5 }}>CREDIT NOTE ISSUED AGAINST INVOICE NO  AWB  , FOR CHARGED ON BILL</div></td>
            <td style={td({ textAlign: 'right' })}><div contentEditable suppressContentEditableWarning style={{ outline: 'none', fontFamily: 'Arial', fontSize: 10, textAlign: 'right' }}>0.00</div></td>
          </tr>
        )}
      </tbody>

      <tbody>
        {/* ── Bank (left) + Tax Summary (right) ── */}
        <tr>
          <td colSpan={3} style={{ border: B, padding: '6px 10px', verticalAlign: 'top' }}>
            <div style={{ fontSize: 10, marginBottom: 6 }}>
              <strong>Amount in Words</strong> : <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{amtWords}</span>
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {([
                  ['Bank', bankText, 'cn-bank-name'],
                  ['Account No.', acctNo, 'cn-bank-acct'],
                  ['IFSC Code', ifsc, 'cn-bank-ifsc'],
                  ['Branch', branch, 'cn-bank-branch'],
                ] as [string,string,string][]).map(([label, value, key]) => (
                  <tr key={label}>
                    <td style={{ fontSize: 10, fontWeight: 600, padding: '2px 0', width: '30%', verticalAlign: 'top' }}><span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{label}</span></td>
                    <td style={{ fontSize: 10, padding: '2px 4px', width: '4%' }}>:</td>
                    <td style={{ fontSize: 10, padding: '2px 0', verticalAlign: 'top' }}><span data-cn-key={key} contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{value}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
          <td colSpan={3} style={{ border: B, padding: '6px 10px', verticalAlign: 'top' }}>
            <table id="cn-tax-summary" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {[
                  ['Total Taxable Amount', fmt(inv.subtotal), 'cn-taxable', ''],
                  [`SGST @ 0%`, '0.00', 'cn-sgst', 'cn-sgst-label'],
                  [`CGST @ 0%`, '0.00', 'cn-cgst', 'cn-cgst-label'],
                  [`IGST @ ${igstRate}%`, fmt(inv.gstTotal), 'cn-igst', 'cn-igst-label'],
                  ['Net Payable Amount', fmt(inv.grandTotal), 'cn-net', ''],
                ].map(([label, value, dataKey, labelKey]) => (
                  <tr key={label}>
                    <td style={{ fontSize: 10, fontWeight: ['Total Taxable Amount','Net Payable Amount'].includes(label) ? 700 : 400, padding: '2px 0', width: '60%' }}><span {...(labelKey ? { 'data-cn-key': labelKey } : {})} contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{label}</span></td>
                    <td style={{ fontSize: 10, padding: '2px 4px', textAlign: 'center' }}>:</td>
                    <td style={{ fontSize: 10, fontWeight: ['Total Taxable Amount','Net Payable Amount'].includes(label) ? 700 : 400, padding: '2px 0', textAlign: 'right' }}>
                      <span {...(dataKey ? { 'data-cn-key': dataKey } : {})} contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>{value}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>

        {/* ── Notes (left) + Signatory (right) ── */}
        <tr>
          <td colSpan={4} style={{ border: B, padding: '5px 10px', verticalAlign: 'top' }}>
            <div contentEditable suppressContentEditableWarning style={{ outline: 'none', fontSize: 9, fontFamily: 'Arial, sans-serif', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {`NOTES :\n1.  DIFFERENCE, IF ANY, MAY BE NOTIFIED WITHIN 3 DAYS OF RECEIPT.\n2.  PLEASE PAY YOUR BILL AMOUNT WITHIN 15 DAYS OF RECEIPT.\n3.  INTEREST AT 24% P.A. WILL BE CHARGED IF THE BILL IS NOT PAID WITHIN THE STIPULATED TIME.\n4.  PAYMENT SHOULD BE MADE BY A/C PAYEE CHEQUE OR DD IN FAVOUR OF TRIVENI CARGO EXPRESS INDIA PVT LTD.\n5.  JURISDICTION: ALL DISPUTES ARISING UNDER THIS BILL SHALL BE SUBJECT TO BE UNDER NEW DELHI JURISDICTION.\n6.  PAN          AAGCT2294N\n7.  Tan NO   DELT14067E\n8.  S. Tax.      AAGCT2294NSD001`}
            </div>
          </td>
          <td colSpan={2} style={{ border: B, padding: '5px 10px', verticalAlign: 'bottom', textAlign: 'right' }}>
            <div contentEditable suppressContentEditableWarning style={{ outline: 'none', fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap', textAlign: 'right', minHeight: 60 }}>
              {`For TRIVENI CARGO EXPRESS INDIA PVT LTD\n\n\n\nAccts. Manager/Auth. Signatory`}
            </div>
          </td>
        </tr>

        {/* ── Footer ── */}
        <tr>
          <td colSpan={6} style={{ border: B, padding: '3px 8px', textAlign: 'center', fontSize: 8 }}>
            Registered Office: Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15, Mahipalpur Extension, New Delhi 110037, near Hotel City Centre
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function CreditNoteEditorInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const { invoices, parties } = useSharedData();
  const paperRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [banks, setBanks] = useState<{ id: string; bank_name: string; account_name: string; account_number: string; ifsc: string; branch: string; is_default: number }[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [igstRate, setIgstRate] = useState(18);
  const [cgstRate, setCgstRate] = useState(9);
  const [sgstRate, setSgstRate] = useState(5);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function applyBankToPaperCN(b: typeof banks[number] | undefined, paper: HTMLElement) {
    if (!b) return;
    // Try data-cn-key first (new saved HTML), fall back to row-label scanning (old saved HTML)
    const setByKey = (key: string, val: string) => {
      const el = paper.querySelector(`[data-cn-key="${key}"]`) as HTMLElement | null;
      if (el) { el.textContent = val; return true; }
      return false;
    };
    const bankUpdated = setByKey('cn-bank-name', b.bank_name);
    setByKey('cn-bank-acct', b.account_number);
    setByKey('cn-bank-ifsc', b.ifsc);
    setByKey('cn-bank-branch', b.branch);
    if (!bankUpdated) {
      // Fallback: scan all rows for label text and update value cell
      const patterns: [RegExp, string][] = [
        [/^bank$/i, b.bank_name],
        [/account\s*no/i, b.account_number],
        [/ifsc/i, b.ifsc],
        [/branch/i, b.branch],
      ];
      paper.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) return;
        const labelText = cells[0].textContent?.trim() ?? '';
        for (const [pat, val] of patterns) {
          if (pat.test(labelText)) {
            const valCell = cells[cells.length - 1];
            const span = valCell.querySelector('[contenteditable]') as HTMLElement | null;
            if (span) span.textContent = val; else valCell.textContent = val;
            break;
          }
        }
      });
    }
  }

  function applyGstRatesCN(ig: number, cg: number, sg: number, paper?: HTMLElement | null) {
    const p = paper ?? paperRef.current; if (!p) return;
    const fmtN = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const setKey = (key: string, val: string) => { const el = p.querySelector(`[data-cn-key="${key}"]`) as HTMLElement | null; if (el) { el.textContent = val; return true; } return false; };

    // Get taxable: prefer data-cn-key, fallback to data rows sum
    let taxable = 0;
    const taxableEl = p.querySelector('[data-cn-key="cn-taxable"]') as HTMLElement | null;
    if (taxableEl) {
      taxable = parseFloat(taxableEl.textContent?.replace(/,/g,'') || '0') || 0;
    } else {
      p.querySelectorAll('#cn-data-body tr').forEach(row => {
        const cells = row.querySelectorAll('[contenteditable]');
        if (cells.length >= 2) taxable += parseFloat((cells[cells.length-1] as HTMLElement).textContent?.replace(/,/g,'') || '0') || 0;
      });
    }

    const igstAmt = parseFloat((taxable * ig / 100).toFixed(2));
    const cgstAmt = parseFloat((taxable * cg / 100).toFixed(2));
    const sgstAmt = parseFloat((taxable * sg / 100).toFixed(2));
    const net = parseFloat((taxable + igstAmt + cgstAmt + sgstAmt).toFixed(2));

    // Primary: use data-cn-key attributes (always present in rendered template)
    if (setKey('cn-igst-label', `IGST @ ${ig}%`) || setKey('cn-igst', fmtN(igstAmt))) {
      setKey('cn-igst-label', `IGST @ ${ig}%`);
      setKey('cn-cgst-label', `CGST @ ${cg}%`);
      setKey('cn-sgst-label', `SGST @ ${sg}%`);
      setKey('cn-igst', fmtN(igstAmt));
      setKey('cn-cgst', fmtN(cgstAmt));
      setKey('cn-sgst', fmtN(sgstAmt));
      setKey('cn-taxable', fmtN(taxable));
      setKey('cn-net', fmtN(net));
      return;
    }

    // Row order: 0=Total Taxable, 1=SGST, 2=CGST, 3=IGST, 4=Net Payable
    const updates = [
      { val: fmtN(taxable), label: '' },
      { val: fmtN(sgstAmt), label: `SGST @ ${sg}%` },
      { val: fmtN(cgstAmt), label: `CGST @ ${cg}%` },
      { val: fmtN(igstAmt), label: `IGST @ ${ig}%` },
      { val: fmtN(net),     label: '' },
    ];

    // Try #cn-tax-summary by row index first (works for new HTML or loaded HTML with id preserved)
    const taxTable = p.querySelector<HTMLTableElement>('#cn-tax-summary');
    if (taxTable) {
      const trs = taxTable.querySelectorAll('tr');
      trs.forEach((tr, i) => {
        if (i >= updates.length) return;
        const tds = tr.querySelectorAll('td');
        // Value is in last td
        const valTd = tds[tds.length - 1];
        const valSpan = valTd?.querySelector('[contenteditable]') as HTMLElement | null;
        if (valSpan) valSpan.textContent = updates[i].val;
        else if (valTd) (valTd as HTMLElement).textContent = updates[i].val;
        // Label is in first td (skip empty label)
        if (updates[i].label) {
          const labelSpan = tds[0]?.querySelector('[contenteditable]') as HTMLElement | null;
          if (labelSpan) labelSpan.textContent = updates[i].label;
          else if (tds[0]) (tds[0] as HTMLElement).textContent = updates[i].label;
        }
      });
      return;
    }

    // Fallback: scan all rows by text pattern (for very old saved HTML without id)
    const patterns: [RegExp, string, string][] = [
      [/total\s*taxable/i, fmtN(taxable), ''],
      [/sgst/i, fmtN(sgstAmt), `SGST @ ${sg}%`],
      [/cgst/i, fmtN(cgstAmt), `CGST @ ${cg}%`],
      [/igst/i, fmtN(igstAmt), `IGST @ ${ig}%`],
      [/net\s*payable/i, fmtN(net), ''],
    ];
    const matched = new Set<number>();
    p.querySelectorAll('tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) return;
      const labelText = cells[0].textContent?.trim() ?? '';
      patterns.forEach(([pat, val, newLabel], idx) => {
        if (matched.has(idx) || !pat.test(labelText)) return;
        matched.add(idx);
        const valCell = cells[cells.length - 1];
        const valSpan = valCell.querySelector('[contenteditable]') as HTMLElement | null;
        if (valSpan) valSpan.textContent = val; else (valCell as HTMLElement).textContent = val;
        if (newLabel) {
          const labelSpan = cells[0].querySelector('[contenteditable]') as HTMLElement | null;
          if (labelSpan) labelSpan.textContent = newLabel; else (cells[0] as HTMLElement).textContent = newLabel;
        }
      });
    });
  }

  useEffect(() => {
    fetch('/api/banks').then(r => r.json()).then(d => {
      setBanks(d);
      const def = d.find((b: { is_default: number }) => b.is_default === 1);
      const chosen = def ?? d[0];
      if (chosen) {
        setSelectedBankId(chosen.id);
        // Apply immediately since HTML may already be in DOM
        if (paperRef.current) applyBankToPaperCN(chosen, paperRef.current);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch(`/api/invoices/${id}/editor-html`).then(r => r.json()).then(data => {
      if (data.html && paperRef.current) {
        paperRef.current.innerHTML = data.html;
        // Re-apply current bank and GST rates after HTML restore
        const currentBank = banks.find(b => b.id === selectedBankId) ?? banks[0];
        if (currentBank) applyBankToPaperCN(currentBank, paperRef.current);
        applyGstRatesCN(igstRate, cgstRate, sgstRate, paperRef.current);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Keep rate refs fresh so recalcCN always uses current rates
  const ratesRef = useRef({ ig: igstRate, cg: cgstRate, sg: sgstRate });
  useEffect(() => { ratesRef.current = { ig: igstRate, cg: cgstRate, sg: sgstRate }; }, [igstRate, cgstRate, sgstRate]);

  // Auto-recalc tax summary when data rows change — use event delegation on paper so it survives innerHTML replacement
  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;
    function recalcCN(e: Event) {
      if (!(e.target as HTMLElement)?.closest?.('#cn-data-body')) return;
      const { ig, cg, sg } = ratesRef.current;
      applyGstRatesCN(ig, cg, sg, paper);
    }
    paper.addEventListener('input', recalcCN);
    return () => paper.removeEventListener('input', recalcCN);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inv = invoices.find(i => i.id === id);
  const party = inv ? parties.find(p => p.id === inv.partyId) : undefined;
  const bank = banks.find(b => b.id === selectedBankId) ?? banks[0];

  // Apply bank to paper whenever bank selection changes
  useEffect(() => {
    const paper = paperRef.current;
    if (!paper || !bank) return;
    applyBankToPaperCN(bank, paper);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBankId, bank]);

  const handlePrint = useCallback(async () => {
    const el = paperRef.current; if (!el) return;
    const clone = el.cloneNode(true) as HTMLElement;
    try {
      const [resp1, resp2] = await Promise.all([fetch('/logo.png'), fetch('/iata.png')]);
      const [blob1, blob2] = await Promise.all([resp1.blob(), resp2.blob()]);
      const [b64_triveni, b64_iata] = await Promise.all([
        new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob1); }),
        new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob2); }),
      ]);
      clone.querySelectorAll('img').forEach(img => {
        const htmlImg = img as HTMLImageElement;
        if (htmlImg.alt.toLowerCase().includes('iata') || htmlImg.src.includes('iata.png')) {
          htmlImg.src = b64_iata;
        } else {
          htmlImg.src = b64_triveni;
        }
      });
    } catch {}
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Credit Note - ${inv?.invoiceNo ?? ''}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:8px}table{border-collapse:collapse;width:100%}td{font-size:10px;vertical-align:top}[contenteditable],[contenteditable] span{outline:none;min-height:10px;white-space:pre-wrap}img{max-width:100%;object-fit:contain}@media print{@page{margin:6mm}body{padding:4px}}</style></head><body>${clone.innerHTML}<script>window.onload=function(){window.print();};<\/script></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' }); const url = URL.createObjectURL(blob); const win = window.open(url, '_blank', 'width=1200,height=800'); if (win) setTimeout(() => URL.revokeObjectURL(url), 15000);
  }, [inv]);

  async function handleSave() {
    if (!paperRef.current || !inv) return;
    setSaving(true);
    // Extract amount and description from editor DOM
    const paper = paperRef.current;
    const dataRows = paper.querySelectorAll('#cn-data-body tr');
    let totalAmt = 0; const descs: string[] = [];
    dataRows.forEach(row => {
      const cells = row.querySelectorAll('[contenteditable]');
      if (cells.length >= 3) {
        const desc = (cells[1] as HTMLElement).textContent?.trim() || '';
        const amtText = (cells[cells.length-1] as HTMLElement).textContent?.replace(/,/g,'').trim() || '0';
        const amt = parseFloat(amtText) || 0;
        if (desc) descs.push(desc);
        totalAmt += amt;
      }
    });
    await Promise.all([
      fetch(`/api/invoices/${inv.id}/editor-html`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: paper.innerHTML }) }),
      totalAmt > 0 ? updateCreditNoteAmount(inv.id, totalAmt, descs.join('; ')) : Promise.resolve(),
    ]);
    setSaving(false);
    toast.success('Credit note saved');
  }

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Blank mode
  if (!id) {
    const blankInv = { invoiceNo: '', partyName: 'TRIVENI CARGO EXPRESS INDIA PRIVATE LIMITED', invoiceDate: '', dueDate: '', bookingRef: '', subtotal: 0, gstTotal: 0, grandTotal: 0, lines: [] };

    async function handleBlankSave() {
      if (!paperRef.current) return;
      setSaving(true);
      try {
        // Extract key fields from the editable content
        const paper = paperRef.current;
        const getCE = (sel: string) => paper.querySelector(sel)?.textContent?.trim() ?? '';
        // Get all contenteditable spans for the credit note fields
        const allSpans = paper.querySelectorAll('[contenteditable]');
        const creditNoteNo = (allSpans[3] as HTMLElement)?.textContent?.trim() || '';
        const desc = (paper.querySelector('#cn-data-body td:nth-child(3) [contenteditable]') as HTMLElement)?.textContent?.trim() || 'Credit Note';
        const amtText = (paper.querySelector('#cn-data-body td:last-child [contenteditable]') as HTMLElement)?.textContent?.trim() || '0';
        const amount = parseFloat(amtText.replace(/,/g, '')) || 0;

        const res = await createCreditNote({ partyId: '', partyName: 'TRIVENI CARGO EXPRESS INDIA PRIVATE LIMITED', creditNoteNo, description: desc, amount });
        if (res && 'id' in res) {
          // Save HTML then redirect
          await fetch(`/api/invoices/${res.id}/editor-html`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: paper.innerHTML }) });
          router.push(`/dashboard/credit-note/editor?id=${res.id}`);
        }
      } finally { setSaving(false); }
    }

    return (
      <div style={{ minHeight: '100vh', background: '#e5e7eb', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Credit Note Editor</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {banks.length > 0 && <select value={selectedBankId} onChange={e => setSelectedBankId(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>{banks.map(b => <option key={b.id} value={b.id}>{b.bank_name}{b.is_default ? '★' : ''}</option>)}</select>}
            {[{label:'IGST',val:igstRate,set:(v:number)=>{setIgstRate(v);applyGstRatesCN(v,cgstRate,sgstRate);}},{label:'CGST',val:cgstRate,set:(v:number)=>{setCgstRate(v);applyGstRatesCN(igstRate,v,sgstRate);}},{label:'SGST',val:sgstRate,set:(v:number)=>{setSgstRate(v);applyGstRatesCN(igstRate,cgstRate,v);}}].map(({label,val,set})=>(
              <span key={label} style={{display:'flex',alignItems:'center',gap:3,fontSize:11}}>
                <span style={{fontWeight:600,color:'#374151'}}>{label}:</span>
                <select value={val} onChange={e=>set(parseFloat(e.target.value))} style={{fontSize:11,padding:'3px 5px',borderRadius:5,border:'1px solid #d1d5db',background:'#fff',width:55}}>
                  {[0,5,9,10,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}
                </select>
              </span>
            ))}
            <span style={{ fontSize: 11, color: '#6b7280' }}>💡 Click any field to edit</span>
            <button onClick={handleBlankSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: saving ? '#6b7280' : '#059669', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? '⏳ Saving…' : '💾 Save'}</button>
            <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}><Printer size={14} /> Print / Download</button>
          </div>
        </div>
        <Toolbar paperRef={paperRef} />
        <div ref={paperRef} style={{ background: '#fff', maxWidth: 1050, margin: '24px auto', padding: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
          <CreditNoteTemplate inv={blankInv} party={undefined} bank={bank} today={today} amtWords="Zero Only" />
        </div>
      </div>
    );
  }

  if (!inv) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Arial', fontSize: 16, color: '#6b7280' }}>Credit note not found.</div>;

  const amtWords = numberToWords(Math.round(inv.grandTotal));

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Credit Note — <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{inv.invoiceNo}</span></span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{inv.partyName}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {banks.length > 0 && <select value={selectedBankId} onChange={e => setSelectedBankId(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>{banks.map(b => <option key={b.id} value={b.id}>{b.bank_name}{b.is_default ? '★' : ''}</option>)}</select>}
          {[{label:'IGST',val:igstRate,set:(v:number)=>{setIgstRate(v);applyGstRatesCN(v,cgstRate,sgstRate);}},{label:'CGST',val:cgstRate,set:(v:number)=>{setCgstRate(v);applyGstRatesCN(igstRate,v,sgstRate);}},{label:'SGST',val:sgstRate,set:(v:number)=>{setSgstRate(v);applyGstRatesCN(igstRate,cgstRate,v);}}].map(({label,val,set})=>(
            <span key={label} style={{display:'flex',alignItems:'center',gap:3,fontSize:11}}>
              <span style={{fontWeight:600,color:'#374151'}}>{label}:</span>
              <select value={val} onChange={e=>set(parseFloat(e.target.value))} style={{fontSize:11,padding:'3px 5px',borderRadius:5,border:'1px solid #d1d5db',background:'#fff',width:55}}>
                {[0,5,9,10,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}
              </select>
            </span>
          ))}
          <span style={{ fontSize: 11, color: '#6b7280' }}>💡 Click any field to edit</span>
          <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: saving ? '#6b7280' : '#059669', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? '⏳ Saving…' : '💾 Save'}</button>
          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}><Printer size={14} /> Print / Download</button>
        </div>
      </div>
      <Toolbar paperRef={paperRef} />
      <div ref={paperRef} style={{ background: '#fff', maxWidth: 1050, margin: '24px auto', padding: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
        <CreditNoteTemplate inv={inv} party={party} bank={bank} today={today} amtWords={amtWords} />
      </div>
    </div>
  );
}

export default function CreditNoteEditorPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Arial' }}>Loading…</div>}>
      <CreditNoteEditorInner />
    </Suspense>
  );
}
