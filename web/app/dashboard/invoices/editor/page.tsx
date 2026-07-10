'use client';
import { Suspense, useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { useSharedData } from '@/lib/useSharedData';
import { listCustomFormats, saveCustomFormat, deleteCustomFormat, type CustomFormatCol } from '@/lib/actions/customFormats';
import { amountToWords } from '@/lib/invoiceAmounts';
import HotInvoiceTable, { FORMAT_COLUMNS, parseHtmlTableToRows, parseExtraColumnsFromHtmlTable, mapRowsBetweenFormats, type HotColDef, type HotInvoiceHandle } from '@/components/HotInvoiceTable';
import { renameInvoiceNo } from '@/lib/actions/invoices';

type FormatKey = 'format1' | 'format2' | 'format3' | 'musashi' | 'custom';

// Build a HotColDef[] for a user-defined custom format. Column keys are sanitized from the
// header text (falls back to a positional key if the header is blank/duplicate). The column
// marked isTotal becomes the computed "grand total" column, matching the same computeRow()
// convention used by the built-in formats (its key must be one of taxable/amount/totalAmt for
// computeRow to recognize it as the auto-summed total -- we use "amount" for all custom formats).
function buildCustomColumns(cols: CustomFormatCol[]): HotColDef[] {
  const seen = new Set<string>();
  return cols.map((c, i) => {
    let key = c.header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `col${i}`;
    while (seen.has(key)) key = `${key}_${i}`;
    seen.add(key);
    if (c.isTotal) key = 'amount'; // computeRow looks for this exact key to auto-sum
    return { header: c.header || `Column ${i + 1}`, key, numeric: c.isNumeric, computed: c.isTotal, align: c.isNumeric ? 'right' : 'center' } as HotColDef;
  });
}

const CANON_FIELDS: HotColDef[] = [
  { header: '', key: 'sl', canonical: 'sl' },
  { header: '', key: 'origin', canonical: 'origin' },
  { header: '', key: 'awbNo', canonical: 'refNo' },
  { header: '', key: 'date', canonical: 'date' },
  { header: '', key: 'dest', canonical: 'dest' },
  { header: '', key: 'boxes', canonical: 'boxes' },
  { header: '', key: 'chgWt', canonical: 'weight' },
  { header: '', key: 'rate', canonical: 'rate' },
  // Charge amount fields -- these carry between formats so ODA→F/C, carrier→GMR etc.
  { header: '', key: 'freight', canonical: 'freight' },
  { header: '', key: 'awbDo', canonical: 'awbDo' },
  { header: '', key: 'carrier', canonical: 'carrier' },
  { header: '', key: 'forwrd', canonical: 'forwrd' },
  { header: '', key: 'tsp', canonical: 'tsp' },
];

// ── Toolbar ───────────────────────────────────────────────────────────────────
function Toolbar({ hotRef }: { hotRef: React.RefObject<HotInvoiceHandle | null> }) {
  const [fontSize, setFontSize] = useState('3');
  const savedRange = useRef<Range | null>(null);

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

  useEffect(() => {
    document.addEventListener('selectionchange', updateActiveState);
    return () => document.removeEventListener('selectionchange', updateActiveState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '6px 12px', background: '#f0f4ff', borderBottom: '1px solid #e5e7eb' }}>
      {btn('↩ Undo', 'Undo grid changes', () => hotRef.current?.undo())}
      {btn('↪ Redo', 'Redo grid changes', () => hotRef.current?.redo())}
      {sep}
      {btn('B', 'Bold (header/notes text)', () => exec('bold'), '#111', 'bold')}
      {btn('I', 'Italic (header/notes text)', () => exec('italic'), '#111', 'italic')}
      {btn('U̲', 'Underline (header/notes text)', () => exec('underline'), '#111', 'underline')}
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
      {btn('+ Row', 'Add grid row', () => hotRef.current?.insertRow(), '#059669')}
      {btn('− Row', 'Delete grid row', () => hotRef.current?.removeRow(), '#dc2626')}
      {btn('+ Col', 'Add ad-hoc column to this invoice', () => hotRef.current?.insertCol(), '#059669')}
      {btn('− Col', 'Delete last ad-hoc column', () => hotRef.current?.removeCol(), '#dc2626')}
    </div>
  );
}

// ── Number to words ───────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Inner editor ──────────────────────────────────────────────────────────────
function InvoiceEditorInner() {
  const searchParams = useSearchParams();
  const invId = searchParams.get('id');
  const { invoices, parties, awbBookings, docketBookings } = useSharedData();
  const paperRef = useRef<HTMLDivElement>(null);
  const hotRef = useRef<HotInvoiceHandle>(null);

  const [saving, setSaving] = useState(false);
  const [invoiceFormat, setInvoiceFormat] = useState<FormatKey>('format1');
  const [hotGrandTotal, setHotGrandTotal] = useState(0);

  const [banks, setBanks] = useState<{id:string;bank_name:string;account_name:string;account_number:string;ifsc:string;branch:string;is_default:number}[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [igstRate, setIgstRate] = useState(18);
  const [cgstRate, setCgstRate] = useState(9);
  const [sgstRate, setSgstRate] = useState(5);
  const [isRounded, setIsRounded] = useState(false);
  const isRoundedRef = useRef(isRounded);
  useEffect(() => { isRoundedRef.current = isRounded; }, [isRounded]);

  // ── Computed tax summary (React state, not imperative DOM writes) ─────────
  // Drives both the tax summary panel AND Amount in Words consistently.
  const taxSummary = useMemo(() => {
    const totalTaxable = hotGrandTotal;
    const sgstAmt = parseFloat((totalTaxable * sgstRate / 100).toFixed(2));
    const cgstAmt = parseFloat((totalTaxable * cgstRate / 100).toFixed(2));
    const igstAmt = parseFloat((totalTaxable * igstRate / 100).toFixed(2));
    const exactNet = totalTaxable + sgstAmt + cgstAmt + igstAmt;
    const roundedNet = isRounded ? Math.round(exactNet) : exactNet;
    const roundOff = isRounded ? parseFloat((roundedNet - exactNet).toFixed(2)) : 0;
    const fmtN = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let roundOffText = '';
    if (isRounded) roundOffText = `Round Off              : ${roundOff >= 0 ? '+' : ''}${roundOff.toFixed(2)}\n`;
    return {
      text: `Total Taxable Amount : ${fmtN(totalTaxable)}\nSGST @ ${sgstRate}%              : ${fmtN(sgstAmt)}\nCGST @ ${cgstRate}%              : ${fmtN(cgstAmt)}\nIGST @ ${igstRate}%             : ${fmtN(igstAmt)}\n${roundOffText}Net Payable Amount  : ${fmtN(roundedNet)}`,
      words: totalTaxable > 0 ? amountToWords(roundedNet) : '',
    };
  }, [hotGrandTotal, igstRate, cgstRate, sgstRate, isRounded]);

  // ── Custom Formats ──────────────────────────────────────────────────────────
  type SavedCustomFmt = { id: string; name: string; columns: CustomFormatCol[] };
  const [customFormats, setCustomFormats]   = useState<SavedCustomFmt[]>([]);
  const [showCfModal, setShowCfModal]       = useState(false);
  const [cfEditId, setCfEditId]             = useState<string | null>(null);
  const [cfName, setCfName]                 = useState('');
  const [cfCols, setCfCols]                 = useState<CustomFormatCol[]>([
    { header: 'S.No',    isNumeric: false, isTotal: false },
    { header: 'Date',    isNumeric: false, isTotal: false },
    { header: 'AWB No',  isNumeric: false, isTotal: false },
    { header: 'Freight', isNumeric: true,  isTotal: false },
    { header: 'Total',   isNumeric: true,  isTotal: true  },
  ]);
  const [activeCfId, setActiveCfId] = useState<string | null>(null);

  useEffect(() => {
    listCustomFormats().then(rows => {
      setCustomFormats(rows.map(r => ({ id: r.id, name: r.name, columns: JSON.parse(r.columns) as CustomFormatCol[] })));
    });
  }, []);

  async function handleSaveCf() {
    if (!cfName.trim() || cfCols.length < 2) return;
    const saved = await saveCustomFormat(cfEditId, cfName.trim(), cfCols);
    const parsed = { id: saved.id, name: saved.name, columns: JSON.parse(saved.columns) as CustomFormatCol[] };
    setCustomFormats(prev => cfEditId ? prev.map(f => f.id === cfEditId ? parsed : f) : [...prev, parsed]);
    setShowCfModal(false);
    setCfEditId(null); setCfName(''); setCfCols([
      { header: 'S.No', isNumeric: false, isTotal: false },
      { header: 'Date', isNumeric: false, isTotal: false },
      { header: 'AWB No', isNumeric: false, isTotal: false },
      { header: 'Freight', isNumeric: true, isTotal: false },
      { header: 'Total', isNumeric: true, isTotal: true },
    ]);
  }
  async function handleDeleteCf(id: string) {
    await deleteCustomFormat(id);
    setCustomFormats(prev => prev.filter(f => f.id !== id));
    if (activeCfId === id) { setActiveCfId(null); switchFormat('format1'); }
  }
  function openNewCf() { setCfEditId(null); setCfName(''); setCfCols([
    { header: 'S.No', isNumeric: false, isTotal: false },
    { header: 'Date', isNumeric: false, isTotal: false },
    { header: 'AWB No', isNumeric: false, isTotal: false },
    { header: 'Freight', isNumeric: true, isTotal: false },
    { header: 'Total', isNumeric: true, isTotal: true },
  ]); setShowCfModal(true); }
  function openEditCf(f: SavedCustomFmt) { setCfEditId(f.id); setCfName(f.name); setCfCols([...f.columns]); setShowCfModal(true); }

  useEffect(() => {
    fetch('/api/banks').then(r => r.json()).then(data => {
      setBanks(data);
      const def = data.find((b: {is_default:number}) => b.is_default === 1);
      if (def) setSelectedBankId(def.id);
    }).catch(() => {});
  }, []);

  const inv = invoices.find(i => i.id === invId);
  const party = inv ? parties.find(p => p.id === inv.partyId) : undefined;
  useEffect(() => { if (inv?.lines?.[0]?.taxRate) setIgstRate(inv.lines[0].taxRate); }, [inv?.id]);
  const bank = banks.find(b => b.id === selectedBankId) ?? banks[0];

  // ── Invoice number: tracks live edits to Bill No. in the editor ──────────
  const [liveInvoiceNo, setLiveInvoiceNo] = useState(inv?.invoiceNo ?? '');
  useEffect(() => { if (inv?.invoiceNo) setLiveInvoiceNo(inv.invoiceNo); }, [inv?.invoiceNo]);

  const applyBankToPaper = useCallback((b: typeof banks[number] | undefined, paper: HTMLElement) => {
    if (!b) return;
    const bankText = `Bank           : ${b.bank_name}\nA/c Name     : ${b.account_name}\nAccount No.  : ${b.account_number}\nIFSC Code    : ${b.ifsc}\nBranch         : ${b.branch}`;
    const bankFooter = `${b.bank_name}, A/c Name: ${b.account_name}, A/C No. - ${b.account_number}, IFSC Code - ${b.ifsc}, Branch - ${b.branch}`;
    const bankDiv = paper.querySelector<HTMLElement>('[data-bank-detail]');
    const footerDiv = paper.querySelector<HTMLElement>('[data-bank-footer]');
    if (bankDiv) bankDiv.innerText = bankText;
    if (footerDiv) footerDiv.innerText = bankFooter;
  }, []);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper || !bank) return;
    applyBankToPaper(bank, paper);
  }, [selectedBankId, bank, applyBankToPaper]);

  function applyGstRates(ig: number, cg: number, sg: number) {
    setIgstRate(ig); setCgstRate(cg); setSgstRate(sg);
  }

  // ── Column set for whichever format is currently active ──────────────────
  const activeColumns: HotColDef[] = useMemo(() => {
    if (invoiceFormat === 'custom') {
      const cf = customFormats.find(f => f.id === activeCfId);
      return cf ? buildCustomColumns(cf.columns) : [];
    }
    return FORMAT_COLUMNS[invoiceFormat];
  }, [invoiceFormat, activeCfId, customFormats]);

  // ── Build line rows from AWB/docket bookings (used only for a BRAND NEW invoice
  //    that has never been saved before -- once saved, the grid's own data is authoritative) ──
  //
  //  AWB field → Format 1 column mapping (precise):
  //    weightCharge (= weight × baseRate)  → Freight (col: freight, computed)
  //    otherChargesDueAgent               → AWB & DO (col: awbDo)
  //    otherChargesDueCarrier             → Due Carrier (col: carrier)
  //    valuationCharge                    → Forwrd & Others (col: forwrd)
  //    markupAmount                       → TSP & Others (col: tsp)
  //    sum of all above                   → Taxable Amount (col: taxable, computed)
  //    pieces                             → Boxes (col: boxes)
  //    weight                             → Charg. Weight (col: chgWt)
  //    baseRate                           → Rate (col: rate)
  //    origin / destination               → Origin / Dest#
  //    bookingDate                        → Date
  //    awbNo                              → AWB#/Ref. Number
  //
  //  Docket field → Format 1 column mapping:
  //    rateFittedAmount                   → Freight (= base charge for the docket)
  //    markupAmount                       → TSP & Others
  //    sum above                          → Taxable Amount
  //    weight                             → Charg. Weight
  //    pieces                             → Boxes
  //    origin / destination               → Origin / Dest#
  //    bookingDate                        → Date
  //    docketNo                           → AWB#/Ref. Number
  type LineRow = {
    sl: string; origin: string; dest: string; boxes: string; chgWt: string;
    rate: string; freight: string; awbDo: string; carrier: string; forwrd: string;
    tsp: string; taxable: string; awbNo: string; date: string;
  };
  const lineRows: LineRow[] = useMemo(() => {
    if (!inv) return [];
    const refs = inv.bookingRef.split(',').map(r => r.trim()).filter(Boolean);
    const rows: LineRow[] = [];

    refs.forEach((ref, i) => {
      const awbBk = awbBookings.find(a => a.awbNo === ref);
      const dktBk = !awbBk ? docketBookings.find(d => d.docketNo === ref) : undefined;

      const sl = String(i + 1);
      const [ry, rm, rd] = ((awbBk?.bookingDate ?? dktBk?.bookingDate ?? inv.invoiceDate) || inv.invoiceDate).split('-');
      const date = `${rd}/${rm}/${ry.slice(-2)}`;

      if (awbBk) {
        const freight   = awbBk.weightCharge   ?? (awbBk.weight * awbBk.baseRate);
        const awbDo     = awbBk.otherChargesDueAgent   ?? 0;
        const carrier   = awbBk.otherChargesDueCarrier ?? 0;
        const forwrd    = awbBk.valuationCharge ?? 0;
        const tsp       = awbBk.markupAmount ?? 0;
        const taxable   = freight + awbDo + carrier + forwrd + tsp;
        rows.push({
          sl, awbNo: awbBk.awbNo,
          origin: awbBk.origin, dest: awbBk.destination,
          boxes: String(awbBk.pieces), chgWt: String(awbBk.weight), rate: String(awbBk.baseRate),
          freight: fmt(freight), awbDo: fmt(awbDo), carrier: fmt(carrier),
          forwrd: fmt(forwrd), tsp: fmt(tsp), taxable: fmt(taxable), date,
        });
      } else if (dktBk) {
        const freight = dktBk.rateFittedAmount;
        const tsp     = dktBk.markupAmount ?? 0;
        const taxable = freight + tsp;
        rows.push({
          sl, awbNo: dktBk.docketNo,
          origin: dktBk.origin ?? '', dest: dktBk.destination ?? '',
          boxes: String(dktBk.pieces ?? 1), chgWt: String(dktBk.weight ?? 0), rate: '0',
          freight: fmt(freight), awbDo: '0.00', carrier: '0.00', forwrd: '0.00',
          tsp: fmt(tsp), taxable: fmt(taxable), date,
        });
      } else {
        // Fallback: ref exists in inv.bookingRef but no matching booking found
        // Use the invoice line amount as freight if available
        const lineAmt = inv.lines[i]?.amount ?? 0;
        rows.push({
          sl, awbNo: ref, origin: '', dest: '',
          boxes: '1', chgWt: '', rate: '',
          freight: fmt(lineAmt), awbDo: '0.00', carrier: '0.00', forwrd: '0.00',
          tsp: '0.00', taxable: fmt(lineAmt), date,
        });
      }
    });

    return rows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv?.id, awbBookings, docketBookings]);

  // ── Load saved HTML: detect saved format + extract row data for the active grid ──
  const [savedRowsByFormat, setSavedRowsByFormat] = useState<Record<string, string[][]>>({});
  const [extraColsByFormat, setExtraColsByFormat] = useState<Record<string, { extraColumns: HotColDef[]; extraValues: string[][] }>>({});
  const [loadGen, setLoadGen] = useState(0);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  // When lineRows transitions from empty to populated (awbBookings finished loading),
  // bump loadGen so HotInvoiceTable remounts with the correct merged charge data.
  // Without this, the grid would mount with stale saved data before AWB data arrives.
  const hadLineRowsRef = useRef(false);
  useEffect(() => {
    if (!hadLineRowsRef.current && lineRows.length > 0 && hasLoadedOnce) {
      hadLineRowsRef.current = true;
      setLoadGen(g => g + 1);
    }
  }, [lineRows.length, hasLoadedOnce]);

  useEffect(() => {
    if (!inv || !paperRef.current) return;
    fetch(`/api/invoices/${inv.id}/editor-html`)
      .then(r => r.json())
      .then(data => {
        if (!paperRef.current) return;
        if (!data.html) { setHasLoadedOnce(true); setLoadGen(g => g + 1); return; }

        const temp = document.createElement('div');
        temp.innerHTML = data.html;
        const savedTable = temp.querySelector<HTMLTableElement>('#awb-body');

        let detectedFormat: FormatKey = 'format1';
        let detectedCfId: string | null = null;
        if (savedTable) {
          if (savedTable.hasAttribute('data-format2')) detectedFormat = 'format2';
          else if (savedTable.hasAttribute('data-format3')) detectedFormat = 'format3';
          else if (savedTable.hasAttribute('data-musashi-fmt')) detectedFormat = 'musashi';
          else if (savedTable.hasAttribute('data-custom-fmt')) {
            detectedFormat = 'custom';
            detectedCfId = savedTable.getAttribute('data-cf-id');
          }
        }

        if (detectedFormat === 'custom') {
          if (detectedCfId) setActiveCfId(detectedCfId);
          else detectedFormat = 'format1';
        }

        if (savedTable) {
          const cfForCols = detectedCfId ? customFormats.find(f => f.id === detectedCfId) : undefined;
          const cols = detectedFormat === 'custom'
            ? (cfForCols ? buildCustomColumns(cfForCols.columns) : [])
            : FORMAT_COLUMNS[detectedFormat as 'format1'|'format2'|'format3'|'musashi'];
          if (cols.length > 0) {
            const parsedRows = parseHtmlTableToRows(savedTable, cols);
            setSavedRowsByFormat(prev => ({ ...prev, [detectedFormat === 'custom' ? `custom:${detectedCfId}` : detectedFormat]: parsedRows }));
            const extra = parseExtraColumnsFromHtmlTable(savedTable, cols);
            if (extra) {
              const key = detectedFormat === 'custom' ? `custom:${detectedCfId}` : detectedFormat;
              setExtraColsByFormat(prev => ({ ...prev, [key]: extra }));
            }
          }
        }

        setInvoiceFormat(detectedFormat);
        const currentBank = banks.find(b => b.id === selectedBankId) ?? banks[0];
        if (currentBank) applyBankToPaper(currentBank, paperRef.current);
        setHasLoadedOnce(true);
        setLoadGen(g => g + 1);
      })
      .catch(() => { setHasLoadedOnce(true); setLoadGen(g => g + 1); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv?.id]);

  // ── Format switch: capture live canonical data from the CURRENT grid, then remount
  //    with the new format's columns + mapped data ────────────────────────────────
  function switchFormat(next: FormatKey, nextCfId?: string | null) {
    if (next === invoiceFormat && (next !== 'custom' || nextCfId === activeCfId)) return;

    if (hotRef.current) {
      const liveMatrix = hotRef.current.getRowsMatrix();
      const liveCols = hotRef.current.getColumns();

      // 1) Persist the CURRENT format's own full-fidelity data (every column, not just the
      //    shared/canonical ones) into savedRowsByFormat, keyed by the format we're LEAVING --
      //    so its own format-specific columns (ODA, GMR, Pickup/Delivery, etc.) are never lost
      //    when we come back to it later.
      const leavingKey = rowsKey;
      setSavedRowsByFormat(prev => ({ ...prev, [leavingKey]: liveMatrix }));
      const leavingExtraIdxs = liveCols.map((c, i) => c.key.startsWith('extra') ? i : -1).filter(i => i >= 0);
      if (leavingExtraIdxs.length > 0) {
        setExtraColsByFormat(prev => ({ ...prev, [leavingKey]: {
          extraColumns: leavingExtraIdxs.map(i => liveCols[i]),
          extraValues: liveMatrix.map(row => leavingExtraIdxs.map(i => row[i] ?? '')),
        } }));
      }

      // 2) Compute the canonical (shared-field) values from the live grid, then MERGE them into
      //    the TARGET format's own previously-saved data (if any) -- never overwrite the target
      //    format's format-specific columns with blanks. If the target has no saved data yet,
      //    fall back to a fresh canonical-only projection (its format-specific columns will be
      //    blank, which is correct since there's nothing else to seed them from).
      if (liveMatrix.length > 0) {
        const canonRows = mapRowsBetweenFormats(liveMatrix, liveCols, CANON_FIELDS);
        const targetCols = next === 'custom'
          ? (nextCfId ? buildCustomColumns(customFormats.find(f => f.id === nextCfId)?.columns ?? []) : [])
          : FORMAT_COLUMNS[next as 'format1'|'format2'|'format3'|'musashi'];
        if (targetCols.length > 0) {
          const targetKey = next === 'custom' ? `custom:${nextCfId}` : next;
          setSavedRowsByFormat(prev => {
            const existingTarget = prev[targetKey];
            const canonicalOnly = mapRowsBetweenFormats(canonRows, CANON_FIELDS, targetCols);
            if (!existingTarget) return { ...prev, [targetKey]: canonicalOnly };
            // Merge: keep the target's own existing values for as many rows as still exist,
            // overwrite its canonical columns with the freshly-captured live values, and make
            // the row COUNT match the live grid exactly (rows added/removed in the format being
            // left must reflect the same way in every other format's saved data).
            const merged = liveMatrix.map((_, i) => {
              const canonForRow = canonRows[i];
              const base = existingTarget[i] ? [...existingTarget[i]] : [...canonicalOnly[i]];
              if (canonForRow) {
                targetCols.forEach((tc, ci) => {
                  if (tc.canonical) {
                    const canonIdx = CANON_FIELDS.findIndex(cf => cf.canonical === tc.canonical);
                    if (canonIdx >= 0 && canonForRow[canonIdx]) base[ci] = canonForRow[canonIdx];
                  }
                });
              }
              return base;
            });
            return { ...prev, [targetKey]: merged };
          });
        }
      }
    }

    if (next === 'custom') setActiveCfId(nextCfId ?? null);
    setInvoiceFormat(next);
    setLoadGen(g => g + 1);
  }

  const rowsKey = invoiceFormat === 'custom' ? `custom:${activeCfId}` : invoiceFormat;
  const activeExtraCols = extraColsByFormat[rowsKey];
  const gridInitialRows: string[][] = useMemo(() => {
    const saved = savedRowsByFormat[rowsKey];
    if (saved) {
      // Canonical merge: fill in any blank/zero charge cells from fresh AWB booking data.
      // Also detects duplicate charge values (e.g. TSP showing the same value as DueCarrier,
      // which was a past bug where carrier was consolidated into TSP incorrectly) and resets
      // them to the correct fresh value. Applies to ALL formats including Format 1.
      let finalSaved = saved;
      if (invoiceFormat !== 'custom' && lineRows.length > 0) {
        const freshRows = lineRows.map((row, i) => {
          const base: Record<string, string> = {
            sl: row.sl ?? String(i + 1), origin: row.origin, awbNo: row.awbNo, date: row.date, dest: row.dest,
            boxes: row.boxes, chgWt: row.chgWt, rate: row.rate,
            freight: row.freight, awbDo: row.awbDo, carrier: row.carrier, forwrd: row.forwrd, tsp: row.tsp, taxable: row.taxable,
          };
          return FORMAT_COLUMNS.format1.map(c => base[c.key] ?? '');
        });
        const remapped = mapRowsBetweenFormats(freshRows, FORMAT_COLUMNS.format1, activeColumns);
        finalSaved = saved.map((savedRow, rowIdx) => {
          const freshRow = remapped[rowIdx];
          if (!freshRow) return savedRow;
          return savedRow.map((savedVal, colIdx) => {
            const fresh = freshRow[colIdx];
            // Always use fresh value for blank/zero saved cells
            const isBlankOrZero = !savedVal || savedVal === '0' || savedVal === '0.00';
            if (isBlankOrZero && fresh && fresh !== '0' && fresh !== '0.00') return fresh;
            // Detect bug-introduced duplicates: if this charge column's saved value equals
            // another charge column's saved value AND the fresh value differs, use fresh.
            // This fixes e.g. TSP=2128.80 when Due Carrier=2128.80 (carrier was wrongly
            // consolidated into TSP by an old version of the code).
            const tc = activeColumns[colIdx];
            if (tc?.numeric && !tc.computed && !tc.excludeFromTotal && fresh && fresh !== savedVal) {
              const isDuplicate = savedRow.some((otherVal, otherIdx) => {
                if (otherIdx === colIdx) return false;
                const otherCol = activeColumns[otherIdx];
                return otherCol?.numeric && !otherCol.computed && !otherCol.excludeFromTotal
                  && otherVal === savedVal && otherVal !== '0' && otherVal !== '0.00';
              });
              if (isDuplicate) return fresh; // reset to correct fresh value
            }
            return savedVal;
          });
        });
      } // end if (invoiceFormat !== 'custom')
      if (!activeExtraCols) return finalSaved;
      return finalSaved.map((r, i) => [...r, ...(activeExtraCols.extraValues[i] ?? activeExtraCols.extraColumns.map(() => ''))]);
    }
    // No saved data for this format yet -- seed from the original booking rows (only meaningful
    // the very first time a brand-new invoice is opened; once saved, savedRowsByFormat wins).
    return lineRows.map((row, i) => {
      const base: Record<string, string> = {
        sl: row.sl ?? String(i + 1),
        origin: row.origin, awbNo: row.awbNo, date: row.date, dest: row.dest,
        boxes: row.boxes, chgWt: row.chgWt, rate: row.rate,
        freight: row.freight,
        awbDo: row.awbDo, carrier: row.carrier, forwrd: row.forwrd,
        tsp: row.tsp, taxable: row.taxable,
        // Format 2 aliases
        docketNo: row.awbNo, box: row.boxes, weight: row.chgWt,
        oda: row.awbDo, docketChg: row.tsp,
        amount: row.taxable,
        // Format 3 aliases
        pkt: row.boxes, wt: row.chgWt,
        fc: row.awbDo, gmr: row.carrier, clearance: row.forwrd,
        // Musashi aliases
        awb: row.awbDo, pickup: row.carrier, delivery: row.forwrd,
        totalAmt: row.taxable,
        // Shared text aliases
        invoiceNo: '', invoice: '', sector: `${row.origin}-${row.dest}`,
        destination: row.dest, originAirport: row.origin, destAirport: row.dest,
      };
      return activeColumns.map(c => base[c.key] ?? '');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey, savedRowsByFormat, activeExtraCols, lineRows, activeColumns]);

  async function handleSave() {
    if (!paperRef.current || !inv || !hotRef.current) return;
    setSaving(true);
    const html = getSerializedPaperHtml();
    await fetch(`/api/invoices/${inv.id}/editor-html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, grandTotalHint: hotGrandTotal }),
    });

    // Keep in-memory state in sync with what was just written to the DB, for THIS format --
    // otherwise switching away and back re-derives stale/lossy data instead of what was saved.
    const liveMatrix = hotRef.current.getRowsMatrix();
    const liveCols = hotRef.current.getColumns();
    setSavedRowsByFormat(prev => ({ ...prev, [rowsKey]: liveMatrix.map(row => activeColumns.map((c) => {
      const idx = liveCols.findIndex(lc => lc.key === c.key);
      return idx >= 0 ? (row[idx] ?? '') : '';
    })) }));
    const extraColIdxs = liveCols.map((c, i) => c.key.startsWith('extra') ? i : -1).filter(i => i >= 0);
    if (extraColIdxs.length > 0) {
      const extraColumns = extraColIdxs.map(i => liveCols[i]);
      const extraValues = liveMatrix.map(row => extraColIdxs.map(i => row[i] ?? ''));
      setExtraColsByFormat(prev => ({ ...prev, [rowsKey]: { extraColumns, extraValues } }));
    } else {
      setExtraColsByFormat(prev => { const next = { ...prev }; delete next[rowsKey]; return next; });
    }

    setSaving(false);
    alert('Saved to database!');
  }

  function getSerializedPaperHtml(): string {
    const paper = paperRef.current;
    if (!paper) return '';
    const clone = paper.cloneNode(true) as HTMLElement;
    const placeholder = clone.querySelector('.hot-invoice-wrap');
    if (placeholder && hotRef.current) {
      const temp = document.createElement('div');
      temp.innerHTML = hotRef.current.toHtmlTable();
      placeholder.replaceWith(temp.firstElementChild!);
    }
    return clone.innerHTML;
  }

  const handlePrint = useCallback(async () => {
    const el = paperRef.current;
    if (!el) return;
    const serializedHtml = getSerializedPaperHtml();
    const temp = document.createElement('div');
    temp.innerHTML = serializedHtml;
    const clone = temp;

    try {
      const [resp1, resp2] = await Promise.all([fetch('/logo.png'), fetch('/iata.png')]);
      const [blob1, blob2] = await Promise.all([resp1.blob(), resp2.blob()]);
      const [b64_triveni, b64_iata] = await Promise.all([
        new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob1); }),
        new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob2); }),
      ]);
      clone.querySelectorAll('img').forEach(img => {
        const htmlImg = img as HTMLImageElement;
        if (htmlImg.alt.toLowerCase().includes('iata') || htmlImg.src.includes('iata.png')) htmlImg.src = b64_iata;
        else htmlImg.src = b64_triveni;
      });
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
  const amtWords = amountToWords(inv.grandTotal);

  const bankText = bank
    ? `Bank           : ${bank.bank_name}\nA/c Name     : ${bank.account_name}\nAccount No.  : ${bank.account_number}\nIFSC Code    : ${bank.ifsc}\nBranch         : ${bank.branch}`
    : `Bank           : YES BANK Ltd.\nA/c Name     : TRIVENI CARGO EXPRESS INDIA PVT LTD\nAccount No.  : 008463700000641\nIFSC Code    : YESB0000283\nBranch         : Vasant Kunj, New Delhi`;

  const bankFooter = bank
    ? `${bank.bank_name}, A/c Name: ${bank.account_name}, A/C No. - ${bank.account_number}, IFSC Code - ${bank.ifsc}, Branch - ${bank.branch}`
    : `YES BANK Ltd., A/c Name: TRIVENI CARGO EXPRESS INDIA PVT LTD, A/C No. - 008463700000641, IFSC Code - YESB0000283, Branch - Vasant Kunj, New Delhi`;

  const wideFormats = invoiceFormat === 'format2' || invoiceFormat === 'format3';

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb', fontFamily: 'Arial, sans-serif' }}>
      {/* Toolbar */}
      <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Invoice Editor — <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{liveInvoiceNo || inv.invoiceNo}</span></span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{inv.partyName}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ fontWeight: 600, color: '#374151' }}>📋 Format:</span>
            <select value={invoiceFormat === 'custom' ? `custom:${activeCfId}` : invoiceFormat} onChange={e => {
              const val = e.target.value;
              if (val.startsWith('custom:')) switchFormat('custom', val.replace('custom:', ''));
              else switchFormat(val as FormatKey);
            }}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              <option value="format1">Format 1 (Default)</option>
              <option value="format2">Format 2 (Docket)</option>
              <option value="format3">Format 3 (AWB+)</option>
              <option value="musashi">Musashi Format</option>
              {customFormats.length > 0 && <option disabled>── Custom ──</option>}
              {customFormats.map(f => <option key={f.id} value={`custom:${f.id}`}>{f.name}</option>)}
            </select>
            <button onClick={openNewCf} title="Create custom format" style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid #6366f1', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>+ Custom</button>
          </span>
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
              { label: 'IGST', val: igstRate, set: (v: number) => applyGstRates(v, cgstRate, sgstRate) },
              { label: 'CGST', val: cgstRate, set: (v: number) => applyGstRates(igstRate, v, sgstRate) },
              { label: 'SGST', val: sgstRate, set: (v: number) => applyGstRates(igstRate, cgstRate, v) },
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
          <button onClick={() => setIsRounded(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: isRounded ? '#7c3aed' : '#4b5563', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {isRounded ? '🔢 Exact Amount' : '🪙 Round Off'}
          </button>
          <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: saving ? '#6b7280' : '#059669', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? '⏳ Saving…' : '💾 Save'}
          </button>
          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Printer size={14} /> Print / Download
          </button>
        </div>
      </div>

      {/* Editing Toolbar */}
      <Toolbar hotRef={hotRef} />

      {/* Invoice Paper */}
      <div ref={paperRef} style={{ background: '#fff', maxWidth: 1100, margin: '24px auto', padding: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>

            {/* ── HEADER: Logo + Company Info ── */}
            <tr>
              <td colSpan={wideFormats ? 15 : 14} style={{ border: '1px solid #000', padding: '6px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 130, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    <img src="/logo.png" alt="Triveni" style={{ width: 90, height: 90, objectFit: 'contain' }} />
                  </div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 20, fontWeight: 900, letterSpacing: 0.5, fontFamily:'Arial,sans-serif' }}>TRIVENI CARGO EXPRESS INDIA PVT LTD</div>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 10, fontWeight: 700, fontFamily:'Arial,sans-serif' }}>Domestic Air Cargo &amp; Rail Agent</div>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 10, fontWeight: 700, fontFamily:'Arial,sans-serif' }}>Plot no-319/2/2, Badam Singh Market, NH-8 Rangpuri, New Delhi-110037</div>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 10, fontWeight: 700, fontFamily:'Arial,sans-serif' }}>Tel. : 011-65809456, 9311389456</div>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 10, fontWeight: 700, fontFamily:'Arial,sans-serif' }}>GSTIN: 07AAGCT2294N2ZR , CIN: U74999DL2017PTC316659</div>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 9, color: '#c00', fontWeight: 700, fontFamily:'Arial,sans-serif' }}>Regd. Office: Plot no 480, Flat no 301, First Floor, Gali no 15, L Block Mahipalpur Extn. New Delhi 110037</div>
                    <div contentEditable suppressContentEditableWarning style={{ outline:'none', fontSize: 10, fontWeight: 700, fontFamily:'Arial,sans-serif' }}>Email : info@tceipl.com</div>
                  </div>
                  <div style={{ width: 130, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    <img src="/iata.png" alt="IATA" style={{ width: 130, height: 90, objectFit: 'contain' }} />
                  </div>
                </div>
              </td>
            </tr>

            {/* ── TAX INVOICE title ── */}
            <tr>
              <td colSpan={wideFormats ? 15 : 14} style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 700, fontSize: 13, textDecoration: 'underline' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', textAlign: 'center', fontWeight: 700, fontSize: 13, textDecoration: 'underline', fontFamily: 'Arial, sans-serif' }}>TAX INVOICE</div>
              </td>
            </tr>

            {/* ── Party Info (left) + Bill Info (right) ── */}
            <tr>
              <td colSpan={wideFormats ? 10 : 9} style={{ border: '1px solid #000', padding: '5px 7px', verticalAlign: 'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 60, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}>
                  {`M/s : ${inv.partyName}\nGSTIN : ${party?.gstin || '—'}\nAddress : ${party?.billingAddress || '—'}`}
                </div>
              </td>
              <td colSpan={5} style={{ border: '1px solid #000', padding: '5px 7px', verticalAlign: 'top' }}>
                <div
                  contentEditable suppressContentEditableWarning
                  ref={el => {
                    // Set initial content only once (on first mount) -- never update from React
                    // after that, to prevent React reconciliation from resetting the cursor position
                    // every time liveInvoiceNo state changes while the user is still typing.
                    if (el && !el.textContent?.trim()) {
                      el.innerText = `Bill No. : ${liveInvoiceNo || inv.invoiceNo}\nBill Date : ${billDate}\nPOS : DELHI\nBilling Period From : ${inv.invoiceDate} to ${inv.dueDate}`;
                    }
                  }}
                  style={{ outline: 'none', minHeight: 60, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}
                  onInput={e => {
                    const text = (e.currentTarget as HTMLElement).innerText;
                    const m = text.match(/Bill No\.\s*:\s*([^\n]+)/);
                    if (m) setLiveInvoiceNo(m[1].trim());
                  }}
                  onBlur={async e => {
                    const text = e.currentTarget.innerText;
                    const m = text.match(/Bill No\.\s*:\s*([^\n]+)/);
                    const newNo = m?.[1]?.trim();
                    if (!newNo || !inv) return;
                    const result = await renameInvoiceNo(inv.id, newNo);
                    if (result && 'error' in result) {
                      alert(result.error as string);
                      e.currentTarget.innerText = `Bill No. : ${liveInvoiceNo}\nBill Date : ${billDate}\nPOS : DELHI\nBilling Period From : ${inv.invoiceDate} to ${inv.dueDate}`;
                    } else if (result && 'invoiceNo' in result) {
                      setLiveInvoiceNo(result.invoiceNo as string);
                    }
                  }}
                />
              </td>
            </tr>

            {/* ── SAC Code ── */}
            <tr>
              <td colSpan={wideFormats ? 15 : 14} style={{ border: '1px solid #000', padding: '3px 7px', fontSize: 10, fontWeight: 700, textAlign: 'center' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', textAlign: 'center', fontWeight: 700, fontFamily: 'Arial, sans-serif', fontSize: 10 }}>SAC Code : 996531</div>
              </td>
            </tr>

          </tbody>
        </table>

        {/* ── Line-item grid: EVERY format renders through HotInvoiceTable ── */}
        {activeColumns.length > 0 && (
          <HotInvoiceTable
            key={`${invoiceFormat === 'custom' ? `custom-${activeCfId}` : invoiceFormat}-${inv.id}-${loadGen}`}
            ref={hotRef}
            columns={activeColumns}
            formatAttr={
              invoiceFormat === 'format1' ? 'data-format1' :
              invoiceFormat === 'format2' ? 'data-format2' :
              invoiceFormat === 'format3' ? 'data-format3' :
              invoiceFormat === 'musashi' ? 'data-musashi-fmt' :
              'data-custom-fmt'
            }
            extraColumns={activeExtraCols?.extraColumns}
            initialRows={gridInitialRows}
            onTotalChange={setHotGrandTotal}
          />
        )}

        <table style={{ borderCollapse: 'collapse', width: '100%' }}><tbody>

            {/* ── Bank (left) + Tax Summary (right) ── */}
            <tr>
              <td colSpan={wideFormats ? 10 : 9} style={{ border: '1px solid #000', padding: '5px 7px', verticalAlign: 'top' }}>
                <div style={{ fontSize: 10, marginBottom: 4 }}>
                  <strong>Amount in Words :</strong>{' '}
                  <span contentEditable suppressContentEditableWarning style={{ outline: 'none' }}>
                    {taxSummary.words || amtWords}
                  </span>
                </div>
                <div contentEditable suppressContentEditableWarning data-bank-detail style={{ outline: 'none', minHeight: 60, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap', marginTop: 6 }}>
                  {bankText}
                </div>
              </td>
              <td colSpan={5} style={{ border: '1px solid #000', padding: '5px 7px', verticalAlign: 'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 60, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}>
                  {taxSummary.text}
                </div>
              </td>
            </tr>

            {/* ── Bank footer line ── */}
            <tr>
              <td colSpan={wideFormats ? 15 : 14} style={{ border: '1px solid #000', padding: '3px 7px', fontSize: 9, textAlign: 'center' }}>
                <div contentEditable suppressContentEditableWarning data-bank-footer style={{ outline: 'none', fontFamily: 'Arial, sans-serif', fontSize: 9, whiteSpace: 'pre-wrap' }}>
                  {bankFooter}
                </div>
              </td>
            </tr>

            {/* ── Notes (left) + Signature (right) ── */}
            <tr>
              <td colSpan={wideFormats ? 10 : 9} style={{ border: '1px solid #000', padding: '5px 7px', verticalAlign: 'top' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 60, fontSize: 9, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}>
                  <div>NOTES :</div>
                  <div>1. DIFFERENCE, IF ANY, MAY BE NOTIFIED WITHIN 3 DAYS OF RECEIPT.</div>
                  <div>2. PLEASE PAY YOUR BILL AMOUNT WITHIN 15 DAYS OF RECEIPT.</div>
                  <div>3. INTEREST AT 24% P.A. WILL BE CHARGED IF THE BILL IS NOT PAID WITHIN THE STIPULATED TIME.</div>
                  <div>4. PAYMENT SHOULD BE MADE BY A/C PAYEE CHEQUE OR DD IN FAVOUR OF TRIVENI CARGO EXPRESS INDIA PVT LTD.</div>
                  <div>5. JURISDICTION: ALL DISPUTES ARISING UNDER THIS BILL SHALL BE SUBJECT TO BE UNDER NEW DELHI JURISDICTION.</div>
                  <div>6. PAN          AAGCT2294N</div>
                  <div>7. Tan NO   DELT14067E</div>
                  <div>8. S. Tax.      AAGCT2294NSD001</div>
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

      {/* ── Custom Format Builder Modal ─────────────────────────────────── */}
      {showCfModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 620, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{cfEditId ? 'Edit' : 'New'} Custom Format</h3>
              <button onClick={() => setShowCfModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            <label style={{ fontSize: 12, fontWeight: 600 }}>Format Name</label>
            <input value={cfName} onChange={e => setCfName(e.target.value)} placeholder="e.g. My Export Format"
              style={{ display: 'block', width: '100%', marginTop: 4, marginBottom: 14, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />

            {customFormats.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Saved Formats</div>
                {customFormats.map(f => (
                  <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 8px', background: '#f9fafb', borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
                    <span style={{ flex: 1 }}>{f.name} <span style={{ color: '#9ca3af' }}>({f.columns.length} cols)</span></span>
                    <button onClick={() => openEditCf(f)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #6366f1', background: '#fff', color: '#6366f1', cursor: 'pointer' }}>Edit</button>
                    <button onClick={() => handleDeleteCf(f.id)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>Delete</button>
                  </div>
                ))}
                <hr style={{ margin: '12px 0', borderColor: '#e5e7eb' }} />
              </div>
            )}

            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Columns ({cfCols.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 6, alignItems: 'center', marginBottom: 6, fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
              <span>Column Header</span><span>Numeric?</span><span>Total?</span><span></span>
            </div>
            {cfCols.map((col, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <input value={col.header} onChange={e => setCfCols(prev => prev.map((c, j) => j === i ? { ...c, header: e.target.value } : c))}
                  placeholder={`Column ${i + 1}`}
                  style={{ padding: '5px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 12 }} />
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={col.isNumeric} onChange={e => setCfCols(prev => prev.map((c, j) => j === i ? { ...c, isNumeric: e.target.checked, isTotal: e.target.checked ? c.isTotal : false } : c))} />
                  Numeric
                </label>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={col.isTotal} disabled={!col.isNumeric}
                    onChange={e => setCfCols(prev => prev.map((c, j) => j === i ? { ...c, isTotal: e.target.checked } : { ...c, isTotal: false }))} />
                  Total
                </label>
                <button onClick={() => setCfCols(prev => prev.filter((_, j) => j !== i))}
                  style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>−</button>
              </div>
            ))}
            <button onClick={() => setCfCols(prev => [...prev, { header: '', isNumeric: false, isTotal: false }])}
              style={{ marginTop: 4, padding: '5px 14px', borderRadius: 6, border: '1px dashed #6366f1', background: '#f5f3ff', color: '#6366f1', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              + Add Column
            </button>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCfModal(false)} style={{ padding: '7px 18px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={handleSaveCf} disabled={!cfName.trim() || cfCols.length < 1}
                style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: (!cfName.trim() || cfCols.length < 1) ? 0.5 : 1 }}>
                Save Format
              </button>
            </div>
          </div>
        </div>
      )}
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
