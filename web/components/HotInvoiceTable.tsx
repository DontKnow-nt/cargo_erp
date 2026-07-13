'use client';
import { forwardRef, useImperativeHandle, useMemo, useRef, useEffect, useState } from 'react';
import Handsontable from 'handsontable';
import { registerAllModules } from 'handsontable/registry';
import { HotTable, type HotTableRef } from '@handsontable/react-wrapper';

registerAllModules();

export type HotColDef = {
  header: string;
  key: string;
  numeric?: boolean;
  computed?: boolean; // auto-calculated column (Freight / Total)
  align?: 'left' | 'center' | 'right';
  /** Canonical field name shared across formats (date, rate, origin, dest, weight, boxes, refNo, sl)
   *  used to carry data between formats when switching. Columns with no canonical tag (format-specific
   *  charge fields like ODA, GMR, Pickup/Delivery) have no equivalent elsewhere and stay blank on switch. */
  canonical?: string;
  /** When true, this column is numeric (for display/editing) but should NOT be included in the
   *  auto-sum for the total column. Use this for physical quantity columns like Boxes/Weight/Pkt/Wt
   *  that are counts/weights, not money amounts. */
  excludeFromTotal?: boolean;
};

export type FormatKey = 'format1' | 'format2' | 'format3' | 'musashi' | 'custom';

export const FORMAT_COLUMNS: Record<'format1'|'format2'|'format3'|'musashi', HotColDef[]> = {
  format1: [
    { header: 'Sl#', key: 'sl', align: 'center', canonical: 'sl' },
    { header: 'Origin', key: 'origin', align: 'center', canonical: 'origin' },
    { header: 'AWB#/Ref. Number', key: 'awbNo', align: 'center', canonical: 'refNo' },
    { header: 'Date', key: 'date', align: 'center', canonical: 'date' },
    { header: 'Dest#', key: 'dest', align: 'center', canonical: 'dest' },
    { header: 'Boxes', key: 'boxes', numeric: true, align: 'center', canonical: 'boxes', excludeFromTotal: true },
    { header: 'Charg. Weight', key: 'chgWt', numeric: true, align: 'right', canonical: 'weight', excludeFromTotal: true },
    { header: 'Rate', key: 'rate', numeric: true, align: 'right', canonical: 'rate', excludeFromTotal: true },
    { header: 'Freight', key: 'freight', numeric: true, computed: true, align: 'right', canonical: 'freight' },
    { header: 'AWB & DO', key: 'awbDo', numeric: true, align: 'right', canonical: 'awbDo' },
    { header: 'Due Carrier', key: 'carrier', numeric: true, align: 'right', canonical: 'carrier' },
    { header: 'Forwrd & Others', key: 'forwrd', numeric: true, align: 'right', canonical: 'forwrd' },
    { header: 'TSP & Others', key: 'tsp', numeric: true, align: 'right', canonical: 'tsp' },
    { header: 'Taxable Amount', key: 'taxable', numeric: true, computed: true, align: 'right' },
  ],
  format2: [
    { header: 'S.No', key: 'sl', align: 'center', canonical: 'sl' },
    { header: 'Date', key: 'date', align: 'center', canonical: 'date' },
    { header: 'Docket No.', key: 'docketNo', align: 'center', canonical: 'refNo' },
    { header: 'Invoice no', key: 'invoiceNo', align: 'center' },
    { header: 'Origin', key: 'origin', align: 'center', canonical: 'origin' },
    { header: 'Origin Airport', key: 'originAirport', align: 'center' },
    { header: 'Dest', key: 'dest', align: 'center', canonical: 'dest' },
    { header: 'Destination Airport', key: 'destAirport', align: 'center' },
    { header: 'Box', key: 'box', numeric: true, align: 'center', canonical: 'boxes', excludeFromTotal: true },
    { header: 'Weight', key: 'weight', numeric: true, align: 'right', canonical: 'weight', excludeFromTotal: true },
    { header: 'Rate', key: 'rate', numeric: true, align: 'right', canonical: 'rate', excludeFromTotal: true },
    { header: 'Freight', key: 'freight', numeric: true, computed: true, align: 'right', canonical: 'freight' },
    { header: 'ODA', key: 'oda', numeric: true, align: 'right', canonical: 'awbDo' },
    { header: 'Docket chg', key: 'docketChg', numeric: true, align: 'right', canonical: 'tsp' },
    { header: 'Amount', key: 'amount', numeric: true, computed: true, align: 'right' },
  ],
  format3: [
    { header: 'S.No', key: 'sl', align: 'center', canonical: 'sl' },
    { header: 'Date', key: 'date', align: 'center', canonical: 'date' },
    { header: 'AWB NO', key: 'awbNo', align: 'center', canonical: 'refNo' },
    { header: 'Invoice', key: 'invoice', align: 'center' },
    { header: 'Sector', key: 'sector', align: 'center' },
    { header: 'Pkt', key: 'pkt', numeric: true, align: 'center', canonical: 'boxes', excludeFromTotal: true },
    { header: 'Wt.', key: 'wt', numeric: true, align: 'right', canonical: 'weight', excludeFromTotal: true },
    { header: 'Freight', key: 'freight', numeric: true, align: 'right', canonical: 'freight' },
    { header: 'F/C', key: 'fc', numeric: true, align: 'right', canonical: 'awbDo' },
    { header: 'GMR', key: 'gmr', numeric: true, align: 'right', canonical: 'carrier' },
    { header: 'TSP', key: 'tsp', numeric: true, align: 'right', canonical: 'tsp' },
    { header: 'Clearance', key: 'clearance', numeric: true, align: 'right', canonical: 'forwrd' },
    { header: 'Awb Fees', key: 'awbFees', numeric: true, align: 'right' },
    { header: 'H Chge', key: 'hChge', numeric: true, align: 'right' },
    { header: 'Amount', key: 'amount', numeric: true, computed: true, align: 'right' },
  ],
  musashi: [
    { header: 'S.No', key: 'sl', align: 'center', canonical: 'sl' },
    { header: 'Date', key: 'date', align: 'center', canonical: 'date' },
    { header: 'Docket No.', key: 'docketNo', align: 'center', canonical: 'refNo' },
    { header: 'Invoice No.', key: 'invoiceNo', align: 'center' },
    { header: 'Origin', key: 'origin', align: 'center', canonical: 'origin' },
    { header: 'Destination', key: 'destination', align: 'center', canonical: 'dest' },
    { header: 'Pkt', key: 'pkt', numeric: true, align: 'center', canonical: 'boxes', excludeFromTotal: true },
    { header: 'Wt.', key: 'wt', numeric: true, align: 'right', canonical: 'weight', excludeFromTotal: true },
    { header: 'Rate', key: 'rate', numeric: true, align: 'right', canonical: 'rate', excludeFromTotal: true },
    { header: 'Freight', key: 'freight', numeric: true, computed: true, align: 'right', canonical: 'freight' },
    { header: 'AWB', key: 'awb', numeric: true, align: 'right', canonical: 'awbDo' },
    { header: 'Pickup', key: 'pickup', numeric: true, align: 'right', canonical: 'carrier' },
    { header: 'Delivery', key: 'delivery', numeric: true, align: 'right', canonical: 'forwrd' },
    { header: 'Total Amt', key: 'totalAmt', numeric: true, computed: true, align: 'right' },
  ],
};

/**
 * Convert row data from one format's columns into another format's columns, mapping by
 * canonical field tags. Any source charge amounts that have no matching canonical column
 * in the target format are consolidated into the last available non-total, non-excluded
 * charge column, so the grand total always matches regardless of format structure.
 */
export function mapRowsBetweenFormats(
  sourceRows: string[][],
  sourceCols: HotColDef[],
  targetCols: HotColDef[],
): string[][] {
  return sourceRows.map(row => {
    const canonMap: Record<string, string> = {};
    sourceCols.forEach((c, i) => { if (c.canonical && row[i]) canonMap[c.canonical] = row[i]; });

    // Build target row with canonical matches
    const result = targetCols.map(tc => (tc.canonical && canonMap[tc.canonical]) ? canonMap[tc.canonical] : '');

    // Find any source charge amounts that have NO canonical match in the target.
    // Read directly from the source row (by index) not from canonMap.
    const targetCanonicals = new Set(targetCols.map(c => c.canonical).filter(Boolean));
    let unmappedSum = 0;
    sourceCols.forEach((sc, si) => {
      if (!sc.canonical) return;                  // no canonical = not transferable
      if (targetCanonicals.has(sc.canonical)) return; // already mapped to a target col
      if (sc.excludeFromTotal || sc.computed) return;  // skip quantity/auto-calc cols
      if (!sc.numeric) return;
      const val = parseFloat((row[si] ?? '').replace(/,/g, ''));
      if (!isNaN(val) && val !== 0) unmappedSum += val;
    });

    // If there are unmapped amounts, add them to the last available editable charge column
    // (numeric, not computed, not excludeFromTotal) so the total is preserved
    if (unmappedSum !== 0) {
      let lastChargeIdx = -1;
      targetCols.forEach((tc, i) => {
        if (tc.numeric && !tc.computed && !tc.excludeFromTotal) lastChargeIdx = i;
      });
      if (lastChargeIdx >= 0) {
        const existing = parseFloat((result[lastChargeIdx] || '0').replace(/,/g, '')) || 0;
        result[lastChargeIdx] = (existing + unmappedSum).toFixed(2);
      }
    }

    return result;
  });
}

export type HotInvoiceHandle = {
  toHtmlTable: () => string;
  getGrandTotal: () => number;
  insertRow: () => void;
  removeRow: () => void;
  insertCol: () => void;
  removeCol: () => void;
  undo: () => void;
  redo: () => void;
  /** Current live grid data as a raw string matrix, in the same column order as `columns` prop. */
  getRowsMatrix: () => string[][];
  /** The current columns (base + any ad-hoc "extra" columns added this session). */
  getColumns: () => HotColDef[];
};

type Props = {
  columns: HotColDef[];
  initialRows: string[][]; // matrix of raw string values, one row per data row (no header/total)
  formatAttr?: string;     // data-attribute name placed on the wrapper for format detection during save/load
  minRows?: number;
  extraColumns?: HotColDef[]; // ad-hoc columns added to THIS invoice only (restored from a previous save)
  onTotalChange?: (grandTotal: number) => void;
};

const parseNum = (s: string) => {
  const clean = (s ?? '').replace(/,/g, '').trim();
  if (!clean) return 0;
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
};

/**
 * Evaluate a BODMAS expression safely. Accepts +, -, *, /, (, ), digits, dots, spaces, %.
 * Returns the computed number formatted to 2 decimal places, or null if input is
 * not a formula (plain number) or is unsafe.
 * Examples:  "8*7" → "56.00",  "100+50*2" → "200.00",  "1000/4" → "250.00"
 */
function evalFormula(input: string): string | null {
  const s = (input ?? '').replace(/,/g, '').trim();
  if (!s) return null;
  // Only evaluate if it contains an operator (otherwise it's a plain number)
  if (!/[+\-*/]/.test(s)) return null;
  // Safety: only allow digits, operators, parens, dot, space, %
  if (!/^[\d\s+\-*/().%]+$/.test(s)) return null;
  try {
    const normalized = s.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + normalized + ')')() as number;
    if (!isFinite(result) || isNaN(result)) return null;
    // Return as plain number string (no trailing zeros for whole numbers, 2dp otherwise)
    return Number.isInteger(result) ? String(result) : result.toFixed(2);
  } catch {
    return null;
  }
}

function computeRow(row: Record<string, string>, columns: HotColDef[]): Record<string, string> {
  const out = { ...row };
  const totalCol = columns.find(c => c.computed && (c.key === 'taxable' || c.key === 'amount' || c.key === 'totalAmt'));
  const freightCol = columns.find(c => c.key === 'freight' && c.computed);

  if (freightCol) {
    const rateCol = columns.find(c => c.key === 'rate');
    const wtCol = columns.find(c => ['chgWt', 'weight', 'wt'].includes(c.key));
    if (rateCol && wtCol) {
      const rate = parseNum(out[rateCol.key]);
      const wt = parseNum(out[wtCol.key]);
      if (rate > 0 && wt > 0) out[freightCol.key] = (rate * wt).toFixed(2);
    }
  }

  if (totalCol) {
    let sum = 0;
    columns.forEach(c => {
      if (c.key === totalCol.key) return;
      if (c.numeric && !c.excludeFromTotal) sum += parseNum(out[c.key]);
    });
    out[totalCol.key] = sum.toFixed(2);
  }
  return out;
}

/** Parse a previously-saved HTML table (from toHtmlTable) back into a data matrix. */
export function parseHtmlTableToRows(tableEl: HTMLTableElement, columns: HotColDef[]): string[][] {
  const rows: string[][] = [];
  const trs = Array.from(tableEl.querySelectorAll('tbody > tr'));
  trs.forEach((tr, i) => {
    if (i === 0) return; // header row
    if (tr.hasAttribute('data-grand-total')) return;
    const cells = Array.from(tr.querySelectorAll('td'));
    const vals = columns.map((_, ci) => cells[ci]?.querySelector('[contenteditable]')?.textContent?.trim() ?? cells[ci]?.textContent?.trim() ?? '');
    rows.push(vals);
  });
  return rows;
}

/**
 * Detect ad-hoc "extra" columns saved beyond the base format (identified by data-col-key="extraN"
 * on the header cell) and extract their header definitions plus per-row values.
 * Returns null if no extra columns are present.
 */
export function parseExtraColumnsFromHtmlTable(
  tableEl: HTMLTableElement, baseColumns: HotColDef[]
): { extraColumns: HotColDef[]; extraValues: string[][] } | null {
  const trs = Array.from(tableEl.querySelectorAll('tbody > tr'));
  const headerTr = trs[0];
  if (!headerTr) return null;
  const headerCells = Array.from(headerTr.querySelectorAll('td'));
  const extraCellIdxs: number[] = [];
  const extraColumns: HotColDef[] = [];
  headerCells.forEach((td, idx) => {
    const key = td.getAttribute('data-col-key');
    if (key && key.startsWith('extra')) {
      extraCellIdxs.push(idx);
      const header = td.querySelector('[contenteditable]')?.textContent?.trim() ?? td.textContent?.trim() ?? key;
      extraColumns.push({ header, key, align: 'center' });
    }
  });
  if (extraCellIdxs.length === 0) return null;

  const dataRows = trs.filter((tr, i) => i !== 0 && !tr.hasAttribute('data-grand-total'));
  const extraValues = dataRows.map(tr => {
    const cells = Array.from(tr.querySelectorAll('td'));
    return extraCellIdxs.map(idx => cells[idx]?.querySelector('[contenteditable]')?.textContent?.trim() ?? cells[idx]?.textContent?.trim() ?? '');
  });

  void baseColumns;
  return { extraColumns, extraValues };
}

const HotInvoiceTable = forwardRef<HotInvoiceHandle, Props>(function HotInvoiceTable(
  { columns: baseColumns, initialRows, formatAttr, minRows = 5, extraColumns, onTotalChange }, ref
) {
  const hotRef = useRef<HotTableRef>(null);
  // `columns`/`colHeaders` are controlled props -- the HotTable wrapper diffs and applies them
  // via its own internal updateSettings call, which is Handsontable's documented pattern for
  // dynamic columns (see: Handsontable "Dynamic column visibility" recipe).
  // `data`, however, MUST stay uncontrolled after mount: Handsontable owns its data internally
  // once initialized. Forcing a new `data` array through props on every edit conflicts with
  // Handsontable's own internal mutations (cell edits, undo/redo, row/col moves) -- this exact
  // conflict is documented by Handsontable's own team and is what caused the
  // "removeChild: node not a child of this node" crash. All row/column/data changes are made
  // through the instance API instead (inst.alter, inst.setDataAtRowProp, undoRedo plugin).
  const [columns, setColumns] = useState<HotColDef[]>(() => [...baseColumns, ...(extraColumns ?? [])]);
  const extraCounter = useRef((extraColumns ?? []).reduce((max, c) => {
    const n = parseInt(c.key.replace('extra', ''), 10);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0));
  // Tracks which column index (physical) the user most recently clicked/interacted with,
  // so removeCol removes that specific column rather than guessing from getSelectedLast().
  const lastClickedColRef = useRef(-1);
  // History stacks for undo/redo of column structure changes (add/remove/rename columns).
  // Cell-level undo/redo is handled by Handsontable's built-in UndoRedo plugin separately.
  const colUndoStack = useRef<HotColDef[][]>([]);
  const colRedoStack = useRef<HotColDef[][]>([]);
  function pushColHistory(prev: HotColDef[]) {
    colUndoStack.current.push([...prev]);
    if (colUndoStack.current.length > 30) colUndoStack.current.shift();
    colRedoStack.current = []; // clear redo on new action
  }

  const colDefs = useMemo(() => columns.map(c => ({
    data: c.key,
    readOnly: !!c.computed,
    className: `hot-col-${c.align ?? 'center'}${c.computed ? ' hot-col-computed' : ''}`,
  })), [columns]);

  const initialData = useMemo(() => {
    const padded = [...initialRows];
    while (padded.length < minRows) padded.push(baseColumns.map(() => ''));
    return padded.map(r => {
      const obj: Record<string, string> = {};
      columns.forEach((c, i) => { obj[c.key] = r[i] ?? ''; });
      return computeRow(obj, columns);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Computed once on mount only -- Handsontable owns `data` afterward, never recomputed.

  function grandTotal(): number {
    const inst = hotRef.current?.hotInstance;
    if (!inst || inst.isDestroyed) return 0;
    const totalCol = columns.find(c => c.computed && ['taxable', 'amount', 'totalAmt'].includes(c.key));
    if (!totalCol) return 0;
    const rc = inst.countRows();
    let sum = 0;
    for (let r = 0; r < rc; r++) {
      sum += parseNum(String(inst.getDataAtRowProp(r, totalCol.key) ?? ''));
    }
    return parseFloat(sum.toFixed(2));
  }

  // Evaluate BODMAS formulas before the value is committed to the cell.
  // e.g. user types "8*7" and presses Enter → cell stores "56" and auto-sum fires.
  // Only applies to numeric (non-computed) columns to avoid mangling text cells.
  function beforeChange(changes: Handsontable.CellChange[], source: string) {
    if (source === 'loadData' || source === 'internal') return;
    changes.forEach((change, i) => {
      const [, prop, , newVal] = change;
      if (typeof newVal !== 'string') return;
      // Find the column definition for this prop key
      const col = columns.find(c => c.key === prop);
      if (!col?.numeric || col.computed) return; // only evaluate numeric, non-computed cells
      const evaluated = evalFormula(newVal);
      if (evaluated !== null) {
        changes[i][3] = evaluated; // replace the value in-place before Handsontable stores it
      }
    });
  }

  function afterChange(changes: Handsontable.CellChange[] | null, source: string) {
    if (!changes || source === 'loadData' || source === 'internal') return;
    const inst = hotRef.current?.hotInstance;
    if (!inst || inst.isDestroyed) return;
    const touched = new Set<number>();
    changes.forEach(([r]) => touched.add(r as number));
    touched.forEach(r => {
      const rowData: Record<string, string> = {};
      columns.forEach(c => { rowData[c.key] = String(inst.getDataAtRowProp(r, c.key) ?? ''); });
      const computed = computeRow(rowData, columns);
      columns.forEach(c => {
        if (c.computed && computed[c.key] !== rowData[c.key]) {
          inst.setDataAtRowProp(r, c.key, computed[c.key], 'internal');
        }
      });
    });
    onTotalChange?.(grandTotal());
  }

  // When the user selects one or more ENTIRE rows/columns via the header gutter (not just cells)
  // and presses Delete/Backspace, remove those rows/columns structurally -- matching Excel's
  // behavior for header-selection deletes (as opposed to a cell-range delete, which only clears
  // content and is already handled natively by Handsontable).
  function beforeKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    const inst = hotRef.current?.hotInstance;
    if (!inst || inst.isDestroyed) return;
    const selected = inst.getSelected();
    if (!selected || selected.length === 0) return;

    const isFullRowSelection = selected.some(([, c1]) => c1 === -1);
    const isFullColSelection = selected.some(([r1]) => r1 === -1);

    if (isFullColSelection) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const colIdxs = new Set<number>();
      selected.forEach(([, c1, , c2]) => { for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) colIdxs.add(c); });
      const removableKeys = [...colIdxs].map(ci => columns[ci]?.key).filter((k): k is string => !!k && k.startsWith('extra'));
      if (removableKeys.length === 0) { alert('No extra columns to remove. Base format columns are fixed.'); return; }
      removeColumnsByKeys(removableKeys);
      return;
    }

    if (isFullRowSelection) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const rowIdxs = new Set<number>();
      selected.forEach(([r1, , r2]) => { for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) rowIdxs.add(r); });
      const rc = inst.countRows();
      if (rc - rowIdxs.size < 1) { alert('At least one row must remain.'); return; }
      const ranges = [...rowIdxs].sort((a, b) => b - a).map(r => [r, 1] as [number, number]);
      ranges.forEach(([r, amount]) => inst.alter('remove_row', r, amount));
      onTotalChange?.(grandTotal());
    }
  }

  // Column structure changes go through `columns` state (a controlled prop) + the instance's
  // own row data, read via getDataAtRowProp/setDataAtRowProp (never a competing `data` prop).
  function removeColumnsByKeys(keys: string[]) {
    setColumns(prev => prev.filter(c => !keys.includes(c.key)));
    onTotalChange?.(grandTotal());
  }

  useEffect(() => { onTotalChange?.(grandTotal()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useImperativeHandle(ref, () => ({
    getGrandTotal: grandTotal,
    toHtmlTable: () => {
      const inst = hotRef.current?.hotInstance;
      if (!inst || inst.isDestroyed) return '';
      const esc = (s: string) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const cellHtml = (val: string, align: string, bold = false) =>
        `<td style="border:1px solid #000;padding:3px 5px;font-size:10px;vertical-align:top;text-align:${align}"><div contenteditable="true" style="outline:none;min-height:14px;font-family:Arial,sans-serif;font-size:10px;white-space:pre-wrap${bold?';font-weight:700':''}">${esc(val)}</div></td>`;

      const headerRow = `<tr style="background:#f0f0f0">${columns.map(c =>
        `<td data-col-key="${esc(c.key)}" style="border:1px solid #000;padding:4px 5px;font-size:9.5px;text-align:center;font-weight:700;white-space:pre-wrap;background:#f0f0f0"><div contenteditable="true" style="outline:none;min-height:14px;font-family:Arial,sans-serif;font-size:9.5px;font-weight:700;text-align:center;white-space:pre-wrap">${esc(c.header)}</div></td>`
      ).join('')}</tr>`;

      const rc = inst.countRows();
      let body = '';
      for (let r = 0; r < rc; r++) {
        body += '<tr>' + columns.map(c => {
          const align = c.align ?? 'center';
          const val = String(inst.getDataAtRowProp(r, c.key) ?? '');
          return cellHtml(val, align, !!c.computed);
        }).join('') + '</tr>';
      }

      const grand = grandTotal();
      const totalColIdx = columns.findIndex(c => c.computed && ['taxable','amount','totalAmt'].includes(c.key));
      const emptyTd = () => `<td style="border:1px solid #000;padding:4px 6px;font-size:10px;background:#f8f8f8"></td>`;
      const gtRow = `<tr style="background:#f8f8f8;font-weight:700" data-grand-total="1">${columns.map((c, i) => {
        if (i === totalColIdx) return cellHtml(grand.toFixed(2), c.align ?? 'right', true).replace('<td style="', '<td style="background:#f8f8f8;');
        return emptyTd();
      }).join('')}</tr>`;

      const attr = formatAttr ? ` ${formatAttr}="1"` : '';
      return `<table id="awb-body"${attr} data-hot="1" style="border-collapse:collapse;width:100%;table-layout:fixed"><tbody>${headerRow}${body}${gtRow}</tbody></table>`;
    },
    insertRow: () => {
      const inst = hotRef.current?.hotInstance;
      if (!inst || inst.isDestroyed) return;
      const sel = inst.getSelectedLast();
      const atRow = sel ? sel[0] : inst.countRows() - 1;
      inst.alter('insert_row_below', atRow, 1);
    },
    removeRow: () => {
      const inst = hotRef.current?.hotInstance;
      if (!inst || inst.isDestroyed) return;
      if (inst.countRows() <= 1) return;
      const sel = inst.getSelectedLast();
      const atRow = sel ? sel[0] : inst.countRows() - 1;
      inst.alter('remove_row', atRow, 1);
    },
    insertCol: () => {
      const inst = hotRef.current?.hotInstance;
      if (!inst) return;
      extraCounter.current += 1;
      const newKey = `extra${extraCounter.current}`;
      const newCol: HotColDef = { header: `Extra ${extraCounter.current}`, key: newKey, numeric: false, align: 'center' };
      setColumns(prev => { pushColHistory(prev); return [...prev, newCol]; });
      setTimeout(() => onTotalChange?.(grandTotal()), 0);
    },
    removeCol: () => {
      if (columns.length <= 1) { alert('Must keep at least one column.'); return; }
      const inst = hotRef.current?.hotInstance;
      let colIdx = lastClickedColRef.current;
      if (colIdx < 0) {
        const sel = inst?.getSelectedLast();
        if (sel) {
          const visualCol = Math.min(sel[1], sel[3]);
          colIdx = visualCol >= 0 ? (inst?.toPhysicalColumn(visualCol) ?? visualCol) : columns.length - 1;
        } else {
          colIdx = columns.length - 1;
        }
      }
      colIdx = Math.max(0, Math.min(colIdx, columns.length - 1));
      const targetCol = columns[colIdx];
      if (!targetCol) return;
      const isBase = !targetCol.key.startsWith('extra');
      const confirmed = isBase
        ? window.confirm(`Remove the "${targetCol.header}" column? This is a base format column — removing it may affect calculations. Continue?`)
        : true;
      if (!confirmed) return;
      lastClickedColRef.current = -1;
      setColumns(prev => { pushColHistory(prev); return prev.filter((_, i) => i !== colIdx); });
      setTimeout(() => onTotalChange?.(grandTotal()), 0);
    },
    undo: () => {
      // Undo column structure changes first (add/remove/rename); if none, undo cell changes.
      if (colUndoStack.current.length > 0) {
        const prev = colUndoStack.current.pop()!;
        colRedoStack.current.push([...columns]);
        setColumns(prev);
        setTimeout(() => onTotalChange?.(grandTotal()), 0);
      } else {
        const i = hotRef.current?.hotInstance;
        if (i && !i.isDestroyed) i.getPlugin('undoRedo')?.undo();
      }
    },
    redo: () => {
      // Redo column structure changes first; if none, redo cell changes.
      if (colRedoStack.current.length > 0) {
        const next = colRedoStack.current.pop()!;
        colUndoStack.current.push([...columns]);
        setColumns(next);
        setTimeout(() => onTotalChange?.(grandTotal()), 0);
      } else {
        const i = hotRef.current?.hotInstance;
        if (i && !i.isDestroyed) i.getPlugin('undoRedo')?.redo();
      }
    },
    getRowsMatrix: () => {
      const inst = hotRef.current?.hotInstance;
      if (!inst || inst.isDestroyed) return [];
      const rc = inst.countRows();
      const out: string[][] = [];
      for (let r = 0; r < rc; r++) {
        out.push(columns.map(c => String(inst.getDataAtRowProp(r, c.key) ?? '')));
      }
      return out;
    },
    getColumns: () => columns,
  }), [columns, formatAttr]);

  // SINGLE CLICK on column header → edit the header title (like clicking a cell to edit it).
  //   The column is NOT selected, and the cell below the header is NOT activated.
  // DOUBLE CLICK on column header → select the whole column (standard Handsontable behavior).
  function afterGetColHeader(col: number, th: HTMLTableCellElement) {
    if (col < 0) return;
    if ((th as HTMLElement & { __hdrBound?: boolean }).__hdrBound) return;
    (th as HTMLElement & { __hdrBound?: boolean }).__hdrBound = true;

    th.addEventListener('mousedown', (e) => {
      // On single click: intercept and start header editing instead of column selection.
      // On double click: let it through so Handsontable selects the whole column.
      if (e.detail >= 2) {
        // Double click — track column index and let Handsontable handle it normally
        lastClickedColRef.current = col;
        return;
      }
      // Single click — prevent Handsontable from selecting the column / activating cell below
      e.preventDefault();
      e.stopImmediatePropagation();
      lastClickedColRef.current = col; // track for -Col button

      if ((th as HTMLElement).querySelector('[contenteditable="true"]')) return;
      const current = columns[col]?.header ?? '';
      const div = (th as HTMLElement).querySelector<HTMLElement>('.colHeader') ?? th as unknown as HTMLElement;
      div.setAttribute('contenteditable', 'true');
      div.style.outline = '2px solid #2563eb';
      div.style.minWidth = '30px';
      div.style.cursor = 'text';
      // Put focus inside the div after a tick so the mousedown doesn't instantly blur it
      requestAnimationFrame(() => {
        div.focus();
        const range = document.createRange();
        range.selectNodeContents(div);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      });

      const commit = () => {
        const newHeader = div.innerText.trim() || current;
        div.removeAttribute('contenteditable');
        div.style.outline = '';
        div.style.cursor = '';
        if (newHeader !== current) {
          setColumns(prev => { pushColHistory(prev); return prev.map((c, i) => i === col ? { ...c, header: newHeader } : c); });
        }
      };
      div.addEventListener('blur', commit, { once: true });
      div.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') { ke.preventDefault(); div.blur(); }
        if (ke.key === 'Escape') { div.innerText = current; div.blur(); }
        ke.stopPropagation(); // don't let Handsontable swallow keystrokes while editing header
      });
    });
  }

  // Track which column the user last clicked a cell in, so -Col removes the right column.
  function afterSelectionEnd(row: number, col: number) {
    if (row >= 0 && col >= 0) {
      const inst = hotRef.current?.hotInstance;
      lastClickedColRef.current = inst ? (inst.toPhysicalColumn(col) ?? col) : col;
    }
  }

  return (
    <div className="hot-invoice-wrap">
      <HotTable
        ref={hotRef}
        data={initialData}
        columns={colDefs}
        colHeaders={columns.map(c => c.header)}
        rowHeaders={true}
        manualRowMove={true}
        manualColumnMove={true}
        licenseKey="non-commercial-and-evaluation"
        width="100%"
        height="auto"
        stretchH="all"
        afterChange={afterChange}
        beforeChange={beforeChange}
        beforeKeyDown={beforeKeyDown}
        afterGetColHeader={afterGetColHeader}
        afterSelectionEnd={afterSelectionEnd}
        contextMenu={['row_above', 'row_below', 'remove_row', '---------', 'copy', 'cut', 'undo', 'redo']}
        copyPaste={true}
        undo={true}
        minSpareRows={0}
      />
    </div>
  );
});

export default HotInvoiceTable;
