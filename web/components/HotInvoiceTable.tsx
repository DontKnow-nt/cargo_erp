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
};

export type FormatKey = 'format1' | 'format2' | 'format3' | 'musashi' | 'custom';

export const FORMAT_COLUMNS: Record<'format1'|'format2'|'format3'|'musashi', HotColDef[]> = {
  format1: [
    { header: 'Sl#', key: 'sl', align: 'center' },
    { header: 'Origin', key: 'origin', align: 'center' },
    { header: 'AWB#/Ref. Number', key: 'awbNo', align: 'center' },
    { header: 'Date', key: 'date', align: 'center' },
    { header: 'Dest#', key: 'dest', align: 'center' },
    { header: 'Boxes', key: 'boxes', numeric: true, align: 'center' },
    { header: 'Charg. Weight', key: 'chgWt', numeric: true, align: 'right' },
    { header: 'Rate', key: 'rate', numeric: true, align: 'right' },
    { header: 'Freight', key: 'freight', numeric: true, computed: true, align: 'right' },
    { header: 'AWB & DO', key: 'awbDo', numeric: true, align: 'right' },
    { header: 'Due Carrier', key: 'carrier', numeric: true, align: 'right' },
    { header: 'Forwrd & Others', key: 'forwrd', numeric: true, align: 'right' },
    { header: 'TSP & Others', key: 'tsp', numeric: true, align: 'right' },
    { header: 'Taxable Amount', key: 'taxable', numeric: true, computed: true, align: 'right' },
  ],
  format2: [
    { header: 'S.No', key: 'sl', align: 'center' },
    { header: 'Date', key: 'date', align: 'center' },
    { header: 'Docket No.', key: 'docketNo', align: 'center' },
    { header: 'Invoice no', key: 'invoiceNo', align: 'center' },
    { header: 'Origin', key: 'origin', align: 'center' },
    { header: 'Origin Airport', key: 'originAirport', align: 'center' },
    { header: 'Dest', key: 'dest', align: 'center' },
    { header: 'Destination Airport', key: 'destAirport', align: 'center' },
    { header: 'Box', key: 'box', numeric: true, align: 'center' },
    { header: 'Weight', key: 'weight', numeric: true, align: 'right' },
    { header: 'Rate', key: 'rate', numeric: true, align: 'right' },
    { header: 'Freight', key: 'freight', numeric: true, computed: true, align: 'right' },
    { header: 'ODA', key: 'oda', numeric: true, align: 'right' },
    { header: 'Docket chg', key: 'docketChg', numeric: true, align: 'right' },
    { header: 'Amount', key: 'amount', numeric: true, computed: true, align: 'right' },
  ],
  format3: [
    { header: 'S.No', key: 'sl', align: 'center' },
    { header: 'Date', key: 'date', align: 'center' },
    { header: 'AWB NO', key: 'awbNo', align: 'center' },
    { header: 'Invoice', key: 'invoice', align: 'center' },
    { header: 'Sector', key: 'sector', align: 'center' },
    { header: 'Pkt', key: 'pkt', numeric: true, align: 'center' },
    { header: 'Wt.', key: 'wt', numeric: true, align: 'right' },
    { header: 'Freight', key: 'freight', numeric: true, align: 'right' },
    { header: 'F/C', key: 'fc', numeric: true, align: 'right' },
    { header: 'GMR', key: 'gmr', numeric: true, align: 'right' },
    { header: 'TSP', key: 'tsp', numeric: true, align: 'right' },
    { header: 'Clearance', key: 'clearance', numeric: true, align: 'right' },
    { header: 'Awb Fees', key: 'awbFees', numeric: true, align: 'right' },
    { header: 'H Chge', key: 'hChge', numeric: true, align: 'right' },
    { header: 'Amount', key: 'amount', numeric: true, computed: true, align: 'right' },
  ],
  musashi: [
    { header: 'S.No', key: 'sl', align: 'center' },
    { header: 'Date', key: 'date', align: 'center' },
    { header: 'Docket No.', key: 'docketNo', align: 'center' },
    { header: 'Invoice No.', key: 'invoiceNo', align: 'center' },
    { header: 'Origin', key: 'origin', align: 'center' },
    { header: 'Destination', key: 'destination', align: 'center' },
    { header: 'Pkt', key: 'pkt', numeric: true, align: 'center' },
    { header: 'Wt.', key: 'wt', numeric: true, align: 'right' },
    { header: 'Rate', key: 'rate', numeric: true, align: 'right' },
    { header: 'Freight', key: 'freight', numeric: true, computed: true, align: 'right' },
    { header: 'AWB', key: 'awb', numeric: true, align: 'right' },
    { header: 'Pickup', key: 'pickup', numeric: true, align: 'right' },
    { header: 'Delivery', key: 'delivery', numeric: true, align: 'right' },
    { header: 'Total Amt', key: 'totalAmt', numeric: true, computed: true, align: 'right' },
  ],
};

export type HotInvoiceHandle = {
  toHtmlTable: () => string;
  getGrandTotal: () => number;
  insertRow: () => void;
  removeRow: () => void;
  insertCol: () => void;
  removeCol: () => void;
  undo: () => void;
  redo: () => void;
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
      if (c.numeric) sum += parseNum(out[c.key]);
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
  const extraCounter = useRef((extraColumns ?? []).length);

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
    if (!inst) return 0;
    const totalCol = columns.find(c => c.computed && ['taxable', 'amount', 'totalAmt'].includes(c.key));
    if (!totalCol) return 0;
    const rc = inst.countRows();
    let sum = 0;
    for (let r = 0; r < rc; r++) {
      sum += parseNum(String(inst.getDataAtRowProp(r, totalCol.key) ?? ''));
    }
    return parseFloat(sum.toFixed(2));
  }

  function afterChange(changes: Handsontable.CellChange[] | null, source: string) {
    if (!changes || source === 'loadData' || source === 'internal') return;
    const inst = hotRef.current?.hotInstance;
    if (!inst) return;
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
    if (!inst) return;
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
      if (!inst) return '';
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
      if (!inst) return;
      const sel = inst.getSelectedLast();
      const atRow = sel ? sel[0] : inst.countRows() - 1;
      inst.alter('insert_row_below', atRow, 1);
    },
    removeRow: () => {
      const inst = hotRef.current?.hotInstance;
      if (!inst) return;
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
      // Seed the new column's value as blank in every existing row via the instance API
      // (setDataAtRowProp is a no-op for rows that don't have the schema yet, so we rely on
      // updateSettings's own column-map rebuild, triggered by the `columns` prop diff below,
      // to add the new property; existing values for other columns are preserved automatically
      // since we never touch `data`).
      setColumns(prev => [...prev, newCol]);
      setTimeout(() => onTotalChange?.(grandTotal()), 0);
    },
    removeCol: () => {
      const extraKeys = columns.filter(c => c.key.startsWith('extra')).map(c => c.key);
      if (extraKeys.length === 0) { alert('No extra columns to remove. Base format columns are fixed.'); return; }
      const removedKey = extraKeys[extraKeys.length - 1];
      setColumns(prev => prev.filter(c => c.key !== removedKey));
      setTimeout(() => onTotalChange?.(grandTotal()), 0);
    },
    undo: () => { hotRef.current?.hotInstance?.getPlugin('undoRedo')?.undo(); },
    redo: () => { hotRef.current?.hotInstance?.getPlugin('undoRedo')?.redo(); },
  }), [columns, formatAttr]);

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
        beforeKeyDown={beforeKeyDown}
        contextMenu={['row_above', 'row_below', 'remove_row', '---------', 'copy', 'cut', 'undo', 'redo']}
        copyPaste={true}
        undo={true}
        minSpareRows={0}
      />
    </div>
  );
});

export default HotInvoiceTable;
