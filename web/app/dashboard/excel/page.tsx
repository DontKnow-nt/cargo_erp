'use client';

import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";

import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import {
  Clipboard,
  Copy,
  Eraser,
  Plus,
  Printer,
  Redo2,
  Rows3,
  Table2,
  Trash2,
  Undo2,
} from 'lucide-react';
import Handsontable from 'handsontable';
import { registerAllModules } from 'handsontable/registry';
import { HotTable, type HotTableRef } from '@handsontable/react-wrapper';

registerAllModules();

type FormatKey = 'format1' | 'format2' | 'format3' | 'musashi' | 'custom';

type ColumnDef = {
  key: string;
  label: string;
  width: number;
  numeric?: boolean;
  computed?: boolean;
  align?: 'left' | 'center' | 'right';
};

type FormatDef = {
  label: string;
  amountKey: string;
  columns: ColumnDef[];
};

type GridRow = Record<string, string>;
type ActiveCell = { row: number; col: number };
type Snapshot = { columns: ColumnDef[]; rows: GridRow[] };

const FORMATS: Record<FormatKey, FormatDef> = {
  format1: {
    label: 'Format 1',
    amountKey: 'taxableAmount',
    columns: [
      { key: 'slNo', label: 'Sl#', width: 58, computed: true, align: 'center' },
      { key: 'origin', label: 'Origin', width: 110, align: 'center' },
      { key: 'awbRef', label: 'AWB#/Ref. Number', width: 170, align: 'center' },
      { key: 'date', label: 'Date', width: 110, align: 'center' },
      { key: 'dest', label: 'Dest#', width: 110, align: 'center' },
      { key: 'boxes', label: 'Boxes', width: 90, numeric: true, align: 'center' },
      { key: 'chargedWeight', label: 'Charg. Weight', width: 130, numeric: true, align: 'right' },
      { key: 'rate', label: 'Rate', width: 105, numeric: true, align: 'right' },
      { key: 'freight', label: 'Freight', width: 120, numeric: true, computed: true, align: 'right' },
      { key: 'awbDo', label: 'AWB & DO', width: 110, numeric: true, align: 'right' },
      { key: 'dueCarrier', label: 'Due Carrier', width: 120, numeric: true, align: 'right' },
      { key: 'forwardOthers', label: 'Forwrd & Others', width: 145, numeric: true, align: 'right' },
      { key: 'tspOthers', label: 'TSP & Others', width: 130, numeric: true, align: 'right' },
      { key: 'taxableAmount', label: 'Taxable Amount', width: 145, numeric: true, computed: true, align: 'right' },
    ],
  },
  format2: {
    label: 'Format 2',
    amountKey: 'amount',
    columns: [
      { key: 'sNo', label: 'S.No', width: 58, computed: true, align: 'center' },
      { key: 'date', label: 'Date', width: 110, align: 'center' },
      { key: 'docketNo', label: 'Docket No.', width: 150, align: 'center' },
      { key: 'invoiceNo', label: 'Invoice no', width: 150, align: 'center' },
      { key: 'origin', label: 'Origin', width: 110, align: 'center' },
      { key: 'originAirport', label: 'Origin Airport', width: 150, align: 'center' },
      { key: 'dest', label: 'Dest', width: 110, align: 'center' },
      { key: 'destinationAirport', label: 'Destination Airport', width: 170, align: 'center' },
      { key: 'box', label: 'Box', width: 90, numeric: true, align: 'center' },
      { key: 'weight', label: 'Weight', width: 115, numeric: true, align: 'right' },
      { key: 'rate', label: 'Rate', width: 105, numeric: true, align: 'right' },
      { key: 'freight', label: 'Freight', width: 120, numeric: true, computed: true, align: 'right' },
      { key: 'oda', label: 'ODA', width: 105, numeric: true, align: 'right' },
      { key: 'docketChg', label: 'Docket chg', width: 125, numeric: true, align: 'right' },
      { key: 'amount', label: 'Amount', width: 130, numeric: true, computed: true, align: 'right' },
    ],
  },
  format3: {
    label: 'Format 3',
    amountKey: 'amount',
    columns: [
      { key: 'sNo', label: 'S.No', width: 58, computed: true, align: 'center' },
      { key: 'date', label: 'Date', width: 110, align: 'center' },
      { key: 'awbNo', label: 'AWB NO', width: 155, align: 'center' },
      { key: 'invoice', label: 'Invoice', width: 150, align: 'center' },
      { key: 'sector', label: 'Sector', width: 130, align: 'center' },
      { key: 'pkt', label: 'Pkt', width: 80, numeric: true, align: 'center' },
      { key: 'wt', label: 'Wt.', width: 100, numeric: true, align: 'right' },
      { key: 'freight', label: 'Freight', width: 115, numeric: true, align: 'right' },
      { key: 'fc', label: 'F/C', width: 95, numeric: true, align: 'right' },
      { key: 'gmr', label: 'GMR', width: 95, numeric: true, align: 'right' },
      { key: 'tsp', label: 'TSP', width: 95, numeric: true, align: 'right' },
      { key: 'clearance', label: 'Clearance', width: 120, numeric: true, align: 'right' },
      { key: 'awbFees', label: 'Awb Fees', width: 115, numeric: true, align: 'right' },
      { key: 'hChge', label: 'H Chge', width: 105, numeric: true, align: 'right' },
      { key: 'amount', label: 'Amount', width: 130, numeric: true, computed: true, align: 'right' },
    ],
  },
  musashi: {
    label: 'Musashi',
    amountKey: 'totalAmt',
    columns: [
      { key: 'sNo', label: 'S.No', width: 58, computed: true, align: 'center' },
      { key: 'date', label: 'Date', width: 110, align: 'center' },
      { key: 'docketNo', label: 'Docket No.', width: 150, align: 'center' },
      { key: 'invoiceNo', label: 'Invoice No.', width: 150, align: 'center' },
      { key: 'origin', label: 'Origin', width: 120, align: 'center' },
      { key: 'destination', label: 'Destination', width: 140, align: 'center' },
      { key: 'pkt', label: 'Pkt', width: 80, numeric: true, align: 'center' },
      { key: 'wt', label: 'Wt.', width: 100, numeric: true, align: 'right' },
      { key: 'rate', label: 'Rate', width: 105, numeric: true, align: 'right' },
      { key: 'freight', label: 'Freight', width: 120, numeric: true, computed: true, align: 'right' },
      { key: 'awb', label: 'AWB', width: 95, numeric: true, align: 'right' },
      { key: 'pickup', label: 'Pickup', width: 105, numeric: true, align: 'right' },
      { key: 'delivery', label: 'Delivery', width: 110, numeric: true, align: 'right' },
      { key: 'totalAmt', label: 'Total Amt', width: 130, numeric: true, computed: true, align: 'right' },
    ],
  },
  custom: {
    label: 'Custom',
    amountKey: 'netAmount',
    columns: [
      { key: 'line', label: 'Line', width: 58, computed: true, align: 'center' },
      { key: 'date', label: 'Date', width: 110, align: 'center' },
      { key: 'refNo', label: 'Ref No', width: 155, align: 'center' },
      { key: 'partyCode', label: 'Party Code', width: 125, align: 'center' },
      { key: 'origin', label: 'Origin', width: 110, align: 'center' },
      { key: 'destination', label: 'Destination', width: 140, align: 'center' },
      { key: 'pieces', label: 'Pieces', width: 90, numeric: true, align: 'center' },
      { key: 'weight', label: 'Weight', width: 110, numeric: true, align: 'right' },
      { key: 'rate', label: 'Rate', width: 105, numeric: true, align: 'right' },
      { key: 'freight', label: 'Freight', width: 120, numeric: true, computed: true, align: 'right' },
      { key: 'other', label: 'Other', width: 105, numeric: true, align: 'right' },
      { key: 'netAmount', label: 'Net Amount', width: 130, numeric: true, computed: true, align: 'right' },
    ],
  },
};

const DEFAULT_ROWS = 30;
const MAX_HISTORY = 60;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const COMPANY = {
  name: 'TRIVENI CARGO EXPRESS INDIA PVT LTD',
  line1: 'Domestic Air Cargo & Rail Agent',
  address: 'Plot no-319/2/2, Badam Singh Market, NH-8 Rangpuri, New Delhi-110037',
  phone: 'Tel. : 011-65809456, 9311389456',
  gst: 'GSTIN: 07AAGCT2294N2ZR , CIN: U74999DL2017PTC316659',
  registered: 'Regd. Office: Plot no 480, Flat no 301, First Floor, Gali no 15, L Block Mahipalpur Extn. New Delhi 110037',
  email: 'Email : info@tceipl.com',
};

function cloneColumns(columns: ColumnDef[]): ColumnDef[] {
  return columns.map(col => ({ ...col }));
}

function cloneRows(rows: GridRow[]): GridRow[] {
  return rows.map(row => ({ ...row }));
}

function colLetter(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    const rem = (value - 1) % 26;
    label = LETTERS[rem] + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function colIndexFromLetter(label: string): number {
  return label.toUpperCase().split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function newColumnKey(columns: ColumnDef[]): string {
  let index = 1;
  let key = `extra${index}`;
  const existing = new Set(columns.map(col => col.key));
  while (existing.has(key)) {
    index += 1;
    key = `extra${index}`;
  }
  return key;
}

function isSerialColumn(col: ColumnDef): boolean {
  return ['slNo', 'sNo', 'line'].includes(col.key) || /^(sl|s)\.? ?no\.?$/i.test(col.label) || /^line$/i.test(col.label);
}

function parseBaseAmount(value: string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const cleaned = value.replace(/,/g, '').replace(/INR/gi, '').replace(/[₹]/g, '').trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return '';
  return value.toFixed(2);
}

function displayMoney(value: number): string {
  return `INR ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hasBusinessValue(columns: ColumnDef[], row: GridRow): boolean {
  return columns.some(col => !isSerialColumn(col) && String(row[col.key] ?? '').trim() !== '');
}

function evaluateFormulaValue(raw: string, rows: GridRow[], columns: ColumnDef[], rowIndex: number, stack = new Set<string>()): number {
  if (!raw.trim().startsWith('=')) return parseBaseAmount(raw);
  const formula = raw.trim().slice(1);
  const cellValue = (ref: string): number => {
    const match = ref.match(/^([A-Z]+)(\d+)$/i);
    if (!match) return 0;
    const colIndex = colIndexFromLetter(match[1]);
    const rowNo = Number.parseInt(match[2], 10) - 1;
    const col = columns[colIndex];
    const row = rows[rowNo];
    if (!col || !row) return 0;
    const key = `${rowNo}:${col.key}`;
    if (stack.has(key)) return 0;
    stack.add(key);
    const value = evaluateFormulaValue(String(row[col.key] ?? ''), rows, columns, rowNo, stack);
    stack.delete(key);
    return value;
  };
  const rangeSum = (start: string, end: string): number => {
    const s = start.match(/^([A-Z]+)(\d+)$/i);
    const e = end.match(/^([A-Z]+)(\d+)$/i);
    if (!s || !e) return 0;
    const startCol = Math.min(colIndexFromLetter(s[1]), colIndexFromLetter(e[1]));
    const endCol = Math.max(colIndexFromLetter(s[1]), colIndexFromLetter(e[1]));
    const startRow = Math.min(Number.parseInt(s[2], 10), Number.parseInt(e[2], 10)) - 1;
    const endRow = Math.max(Number.parseInt(s[2], 10), Number.parseInt(e[2], 10)) - 1;
    let sum = 0;
    for (let r = startRow; r <= endRow; r += 1) {
      for (let c = startCol; c <= endCol; c += 1) {
        sum += cellValue(`${colLetter(c)}${r + 1}`);
      }
    }
    return sum;
  };
  let expression = formula.replace(/SUM\(([A-Z]+\d+):([A-Z]+\d+)\)/gi, (_, start, end) => String(rangeSum(start, end)));
  expression = expression.replace(/([A-Z]+\d+)/gi, ref => String(cellValue(ref)));
  if (!/^[\d+\-*/().\s%]+$/.test(expression)) return 0;
  try {
    const result = Function(`"use strict"; return (${expression.replace(/%/g, '/100')});`)() as unknown;
    return typeof result === 'number' && Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

function cellNumber(row: GridRow, key: string, rows: GridRow[], columns: ColumnDef[], rowIndex: number): number {
  return evaluateFormulaValue(String(row[key] ?? ''), rows, columns, rowIndex);
}

function displayCellValue(raw: string, rows: GridRow[], columns: ColumnDef[], rowIndex: number, focused: boolean): string {
  if (focused || !raw.trim().startsWith('=')) return raw;
  return money(evaluateFormulaValue(raw, rows, columns, rowIndex));
}

function recalcRows(format: FormatKey, rows: GridRow[], columns: ColumnDef[]): GridRow[] {
  const serialCol = columns.find(isSerialColumn);
  const nextRows = rows.map((row, index) => {
    const next = { ...row };
    if (serialCol) next[serialCol.key] = String(index + 1);
    if (!hasBusinessValue(columns, next)) {
      columns.filter(col => col.computed && !isSerialColumn(col)).forEach(col => { next[col.key] = ''; });
      return next;
    }

    if (format === 'format1') {
      const chargedWeight = cellNumber(next, 'chargedWeight', rows, columns, index);
      const rate = cellNumber(next, 'rate', rows, columns, index);
      const freight = chargedWeight > 0 && rate > 0 ? chargedWeight * rate : cellNumber(next, 'freight', rows, columns, index);
      const taxable = freight + cellNumber(next, 'awbDo', rows, columns, index) + cellNumber(next, 'dueCarrier', rows, columns, index)
        + cellNumber(next, 'forwardOthers', rows, columns, index) + cellNumber(next, 'tspOthers', rows, columns, index);
      if ('freight' in next) next.freight = money(freight);
      if ('taxableAmount' in next) next.taxableAmount = money(taxable);
    }

    if (format === 'format2') {
      const weight = cellNumber(next, 'weight', rows, columns, index);
      const rate = cellNumber(next, 'rate', rows, columns, index);
      const freight = weight > 0 && rate > 0 ? weight * rate : cellNumber(next, 'freight', rows, columns, index);
      const amount = freight + cellNumber(next, 'oda', rows, columns, index) + cellNumber(next, 'docketChg', rows, columns, index);
      if ('freight' in next) next.freight = money(freight);
      if ('amount' in next) next.amount = money(amount);
    }

    if (format === 'format3') {
      const amount = cellNumber(next, 'freight', rows, columns, index) + cellNumber(next, 'fc', rows, columns, index)
        + cellNumber(next, 'gmr', rows, columns, index) + cellNumber(next, 'tsp', rows, columns, index)
        + cellNumber(next, 'clearance', rows, columns, index) + cellNumber(next, 'awbFees', rows, columns, index)
        + cellNumber(next, 'hChge', rows, columns, index);
      if ('amount' in next) next.amount = money(amount);
    }

    if (format === 'musashi') {
      const wt = cellNumber(next, 'wt', rows, columns, index);
      const rate = cellNumber(next, 'rate', rows, columns, index);
      const freight = wt > 0 && rate > 0 ? wt * rate : cellNumber(next, 'freight', rows, columns, index);
      const totalAmt = freight + cellNumber(next, 'awb', rows, columns, index) + cellNumber(next, 'pickup', rows, columns, index) + cellNumber(next, 'delivery', rows, columns, index);
      if ('freight' in next) next.freight = money(freight);
      if ('totalAmt' in next) next.totalAmt = money(totalAmt);
    }

    if (format === 'custom') {
      const weight = cellNumber(next, 'weight', rows, columns, index);
      const rate = cellNumber(next, 'rate', rows, columns, index);
      const freight = weight > 0 && rate > 0 ? weight * rate : cellNumber(next, 'freight', rows, columns, index);
      if ('freight' in next) next.freight = money(freight);
      if ('netAmount' in next) next.netAmount = money(freight + cellNumber(next, 'other', rows, columns, index));
    }

    return next;
  });
  return nextRows;
}

function blankRows(format: FormatKey, columns: ColumnDef[], count = DEFAULT_ROWS): GridRow[] {
  const rows = Array.from({ length: count }, (_, rowIndex) => {
    const row: GridRow = {};
    columns.forEach(col => {
      row[col.key] = isSerialColumn(col) ? String(rowIndex + 1) : '';
    });
    return row;
  });
  return recalcRows(format, rows, columns);
}

function parsePastedGrid(text: string): string[][] {
  const normalized = text.replace(/\r/g, '');
  const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n');
  return lines.map(line => line.split('\t'));
}

const numberWordsUnderTwenty = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const numberWordsTens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function smallNumberToWords(value: number): string {
  if (value < 20) return numberWordsUnderTwenty[value];
  if (value < 100) return `${numberWordsTens[Math.floor(value / 10)]} ${numberWordsUnderTwenty[value % 10]}`.trim();
  return `${numberWordsUnderTwenty[Math.floor(value / 100)]} Hundred ${smallNumberToWords(value % 100)}`.trim();
}

function integerToIndianWords(value: number): string {
  if (value === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(value / 10000000);
  value %= 10000000;
  const lakh = Math.floor(value / 100000);
  value %= 100000;
  const thousand = Math.floor(value / 1000);
  value %= 1000;
  if (crore) parts.push(`${smallNumberToWords(crore)} Crore`);
  if (lakh) parts.push(`${smallNumberToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${smallNumberToWords(thousand)} Thousand`);
  if (value) parts.push(smallNumberToWords(value));
  return parts.join(' ');
}

function amountWords(value: number): string {
  const whole = Math.floor(Math.abs(value));
  const paise = Math.round((Math.abs(value) - whole) * 100);
  const rupees = `Rupees ${integerToIndianWords(whole)}`;
  return paise > 0 ? `${rupees} and Paise ${integerToIndianWords(paise)} Only` : `${rupees} Only`;
}

const panelStyle: CSSProperties = {
  background: 'var(--surface-base)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  boxShadow: 'var(--shadow-sm)',
};

const printCell: CSSProperties = {
  border: '1px solid #000',
  padding: '4px 5px',
  fontSize: 9.5,
  fontFamily: 'Arial, sans-serif',
  verticalAlign: 'top',
  whiteSpace: 'pre-wrap',
};

export default function ExcelPage() {
  const [format, setFormat] = useState<FormatKey>('format1');
  const [columns, setColumns] = useState<ColumnDef[]>(() => cloneColumns(FORMATS.format1.columns));
  const [rows, setRows] = useState<GridRow[]>(() => blankRows('format1', FORMATS.format1.columns));
  const [activeCell, setActiveCell] = useState<ActiveCell>({ row: 0, col: 1 });
  const [taxMode, setTaxMode] = useState<'igst' | 'split'>('split');
  const [igstRate, setIgstRate] = useState(18);
  const [cgstRate, setCgstRate] = useState(9);
  const [sgstRate, setSgstRate] = useState(9);
  const [paidAmount, setPaidAmount] = useState('');
  const [roundNet, setRoundNet] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const hotRef = useRef<HotTableRef>(null);

  const amountKey = columns.some(col => col.key === FORMATS[format].amountKey)
    ? FORMATS[format].amountKey
    : columns.find(col => col.numeric)?.key ?? columns[columns.length - 1]?.key ?? '';
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const filledRows = useMemo(() => rows.filter(row => hasBusinessValue(columns, row)), [rows, columns]);
  const printRows = filledRows.length > 0 ? filledRows : rows.slice(0, 5);

  const totals = useMemo(() => {
    const taxable = rows.reduce((sum, row, rowIndex) => sum + cellNumber(row, amountKey, rows, columns, rowIndex), 0);
    const sgst = taxMode === 'split' ? taxable * sgstRate / 100 : 0;
    const cgst = taxMode === 'split' ? taxable * cgstRate / 100 : 0;
    const igst = taxMode === 'igst' ? taxable * igstRate / 100 : 0;
    const exactNet = taxable + sgst + cgst + igst;
    const netPayable = roundNet ? Math.round(exactNet) : exactNet;
    const outstanding = netPayable - parseBaseAmount(paidAmount);
    return { taxable, sgst, cgst, igst, exactNet, netPayable, outstanding };
  }, [amountKey, columns, rows, taxMode, sgstRate, cgstRate, igstRate, paidAmount, roundNet]);

  const hotColumns = useMemo(() => columns.map(col => ({
    data: col.key,
    type: 'text',
    width: col.width,
    className: [
      col.align === 'center' ? 'htCenter' : col.align === 'right' || col.numeric ? 'htRight' : 'htLeft',
      col.computed ? 'excel-computed-cell' : '',
    ].filter(Boolean).join(' '),
    renderer(instance: Handsontable.Core, td: HTMLTableCellElement, row: number, colIndex: number, prop: string | number, value: Handsontable.CellValue, cellProperties: Handsontable.CellProperties) {
      const rawValue = String(value ?? '');
      const displayValue = rawValue.trim().startsWith('=')
        ? money(evaluateFormulaValue(rawValue, rows, columns, row))
        : rawValue;
      Handsontable.renderers.TextRenderer(instance, td, row, colIndex, prop, displayValue, cellProperties);
      if (columns[colIndex]?.computed) td.classList.add('excel-computed-cell');
      if (rawValue.trim().startsWith('=')) td.title = rawValue;
    },
  })), [columns, rows]);

  function snapshot(): Snapshot {
    return { columns: cloneColumns(columns), rows: cloneRows(rows) };
  }

  function commit(nextColumns: ColumnDef[], nextRows: GridRow[], message: string) {
    setPast(current => [...current.slice(-MAX_HISTORY + 1), snapshot()]);
    setFuture([]);
    setColumns(cloneColumns(nextColumns));
    setRows(recalcRows(format, cloneRows(nextRows), nextColumns));
    setStatus(message);
  }

  function resetFormat(nextFormat: FormatKey) {
    const nextColumns = cloneColumns(FORMATS[nextFormat].columns);
    const nextRows = blankRows(nextFormat, nextColumns);
    setPast(current => [...current.slice(-MAX_HISTORY + 1), snapshot()]);
    setFuture([]);
    setFormat(nextFormat);
    setColumns(nextColumns);
    setRows(nextRows);
    setActiveCell({ row: 0, col: Math.min(1, nextColumns.length - 1) });
    setStatus(`${FORMATS[nextFormat].label} loaded`);
  }

  function undo() {
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast(current => current.slice(0, -1));
    setFuture(current => [snapshot(), ...current]);
    setColumns(cloneColumns(previous.columns));
    setRows(recalcRows(format, cloneRows(previous.rows), previous.columns));
    setActiveCell({ row: 0, col: Math.min(activeCell.col, previous.columns.length - 1) });
    setStatus('Undo');
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture(current => current.slice(1));
    setPast(current => [...current.slice(-MAX_HISTORY + 1), snapshot()]);
    setColumns(cloneColumns(next.columns));
    setRows(recalcRows(format, cloneRows(next.rows), next.columns));
    setActiveCell({ row: 0, col: Math.min(activeCell.col, next.columns.length - 1) });
    setStatus('Redo');
  }

  function focusCell(row: number, col: number) {
    inputRefs.current[`${row}:${col}`]?.focus();
    inputRefs.current[`${row}:${col}`]?.select();
  }

  function updateCell(rowIndex: number, colKey: string, value: string) {
    const nextRows = rows.map((row, index) => index === rowIndex ? { ...row, [colKey]: value } : { ...row });
    commit(columns, nextRows, 'Cell updated');
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    const pasted = parsePastedGrid(text);
    const nextRows = cloneRows(rows);
    const neededRows = rowIndex + pasted.length;
    while (nextRows.length < neededRows) {
      const row: GridRow = {};
      columns.forEach(col => { row[col.key] = isSerialColumn(col) ? String(nextRows.length + 1) : ''; });
      nextRows.push(row);
    }
    pasted.forEach((pastedRow, rOffset) => {
      pastedRow.forEach((value, cOffset) => {
        const targetCol = columns[colIndex + cOffset];
        if (targetCol) nextRows[rowIndex + rOffset][targetCol.key] = value.trim();
      });
    });
    commit(columns, nextRows, `${pasted.length} row${pasted.length === 1 ? '' : 's'} pasted`);
    const nextRow = Math.min(rowIndex + pasted.length - 1, nextRows.length - 1);
    const nextCol = Math.min(colIndex + Math.max(...pasted.map(row => row.length)) - 1, columns.length - 1);
    setActiveCell({ row: nextRow, col: nextCol });
    window.setTimeout(() => focusCell(nextRow, nextCol), 0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    let nextRow = rowIndex;
    let nextCol = colIndex;
    if (event.key === 'Enter') {
      event.preventDefault();
      nextRow = event.shiftKey ? Math.max(0, rowIndex - 1) : Math.min(rows.length - 1, rowIndex + 1);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      nextCol = event.shiftKey ? Math.max(0, colIndex - 1) : Math.min(columns.length - 1, colIndex + 1);
    } else {
      return;
    }
    setActiveCell({ row: nextRow, col: nextCol });
    focusCell(nextRow, nextCol);
  }

  function addRows(count: number) {
    const nextRows = [...cloneRows(rows), ...blankRows(format, columns, count)];
    commit(columns, nextRows, `${count} rows added`);
  }

  function deleteActiveRow() {
    if (rows.length <= 1) return;
    const nextRows = rows.filter((_, index) => index !== activeCell.row);
    commit(columns, nextRows, `Row ${activeCell.row + 1} deleted`);
    setActiveCell(current => ({ row: Math.max(0, Math.min(current.row, nextRows.length - 1)), col: current.col }));
  }

  function addColumn() {
    const key = newColumnKey(columns);
    const label = `Extra ${columns.filter(col => col.key.startsWith('extra')).length + 1}`;
    const insertAt = activeCell.col + 1;
    const nextColumns = [
      ...columns.slice(0, insertAt),
      { key, label, width: 120, numeric: true, align: 'right' as const },
      ...columns.slice(insertAt),
    ];
    const nextRows = rows.map(row => ({ ...row, [key]: '' }));
    commit(nextColumns, nextRows, `${label} column added`);
    setActiveCell({ row: activeCell.row, col: insertAt });
  }

  function deleteActiveColumn() {
    if (columns.length <= 2) return;
    const target = columns[activeCell.col];
    if (!target) return;
    const nextColumns = columns.filter((_, index) => index !== activeCell.col);
    const nextRows = rows.map(row => {
      const next = { ...row };
      delete next[target.key];
      return next;
    });
    commit(nextColumns, nextRows, `${target.label} column deleted`);
    setActiveCell(current => ({ row: current.row, col: Math.max(0, Math.min(current.col, nextColumns.length - 1)) }));
  }

  function clearGrid() {
    commit(columns, blankRows(format, columns), 'Grid cleared');
    setActiveCell({ row: 0, col: Math.min(1, columns.length - 1) });
  }

  async function copyGrid() {
    const sourceRows = filledRows.length > 0 ? filledRows : rows;
    const text = [
      columns.map(col => col.label).join('\t'),
      ...sourceRows.map((row, rowIndex) => columns.map(col => displayCellValue(row[col.key] ?? '', sourceRows, columns, rowIndex, false)).join('\t')),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${sourceRows.length} rows copied`);
    } catch {
      setStatus('Copy blocked by browser');
    }
  }

  function printSheet() {
    window.print();
  }

  function cellText(row: GridRow, col: ColumnDef, rowIndex: number): string {
    const value = row[col.key] ?? '';
    return value.trim().startsWith('=') ? money(evaluateFormulaValue(value, rows, columns, rowIndex)) : value;
  }

  function handleHotChange(changes: Handsontable.CellChange[] | null, source: Handsontable.ChangeSource) {
    if (!changes || source === 'loadData') return;
    const nextRows = cloneRows(rows);
    changes.forEach(([rowIndex, prop, , newValue]) => {
      if (typeof prop !== 'string') return;
      while (nextRows.length <= rowIndex) {
        const row: GridRow = {};
        columns.forEach(col => { row[col.key] = isSerialColumn(col) ? String(nextRows.length + 1) : ''; });
        nextRows.push(row);
      }
      nextRows[rowIndex][prop] = String(newValue ?? '');
    });
    commit(columns, nextRows, source === 'CopyPaste.paste' ? `${changes.length} cells pasted` : 'Cell updated');
  }

  function handleHotSelection(row: number, col: number) {
    setActiveCell({ row: Math.max(0, row), col: Math.max(0, col) });
  }

  return (
    <div className="excel-workspace" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .excel-print, .excel-print * { visibility: visible !important; }
          .excel-print { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important; box-shadow: none !important; }
          @page { size: A4 landscape; margin: 8mm; }
        }
      `}</style>

      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title"><Table2 size={19} color="var(--accent-dark)" /> Excel</h1>
          <p className="page-subtitle">Invoice format spreadsheet workspace</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={undo} disabled={!past.length}><Undo2 size={13} /> Undo</button>
          <button className="btn btn-secondary btn-sm" onClick={redo} disabled={!future.length}><Redo2 size={13} /> Redo</button>
          <button className="btn btn-secondary btn-sm" onClick={() => addRows(10)}><Plus size={13} /> Rows</button>
          <button className="btn btn-secondary btn-sm" onClick={addColumn}><Plus size={13} /> Column</button>
          <button className="btn btn-secondary btn-sm" onClick={copyGrid}><Copy size={13} /> Copy</button>
          <button className="btn btn-primary btn-sm" onClick={printSheet}><Printer size={13} /> Print</button>
          <button className="btn btn-danger btn-sm" onClick={clearGrid}><Eraser size={13} /> Clear</button>
        </div>
      </div>

      <div style={{ ...panelStyle, padding: 12, display: 'grid', gridTemplateColumns: 'minmax(180px, 260px) repeat(5, minmax(110px, 1fr))', gap: 10, alignItems: 'end' }}>
        <label>
          <span className="label">Format</span>
          <select className="input" value={format} onChange={event => resetFormat(event.target.value as FormatKey)}>
            {(Object.keys(FORMATS) as FormatKey[]).map(key => <option key={key} value={key}>{FORMATS[key].label}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Tax Mode</span>
          <select className="input" value={taxMode} onChange={event => setTaxMode(event.target.value as 'igst' | 'split')}>
            <option value="split">SGST + CGST</option>
            <option value="igst">IGST</option>
          </select>
        </label>
        <label>
          <span className="label">IGST %</span>
          <input className="input" type="number" value={igstRate} onChange={event => setIgstRate(Number(event.target.value))} />
        </label>
        <label>
          <span className="label">CGST %</span>
          <input className="input" type="number" value={cgstRate} onChange={event => setCgstRate(Number(event.target.value))} disabled={taxMode !== 'split'} />
        </label>
        <label>
          <span className="label">SGST %</span>
          <input className="input" type="number" value={sgstRate} onChange={event => setSgstRate(Number(event.target.value))} disabled={taxMode !== 'split'} />
        </label>
        <label>
          <span className="label">Paid</span>
          <input className="input" value={paidAmount} onChange={event => setPaidAmount(event.target.value)} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: 10 }}>
        {[
          ['Taxable', totals.taxable],
          ['GST', totals.sgst + totals.cgst + totals.igst],
          ['Net Payable', totals.netPayable],
          ['Paid', parseBaseAmount(paidAmount)],
          ['Outstanding', totals.outstanding],
        ].map(([label, value]) => (
          <div key={label as string} className="amount-box" style={{ borderRadius: 8 }}>
            <div className="amount-label">{label as string}</div>
            <div className="amount-value" style={{ fontSize: 18, color: label === 'Outstanding' ? 'var(--danger)' : 'var(--accent-dark)' }}>
              {displayMoney(value as number)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...panelStyle, overflow: 'hidden' }}>
        <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Clipboard size={14} color="var(--accent-dark)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{FORMATS[format].label}</span>
            <span className="badge badge-gray">{status}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-danger btn-sm" onClick={deleteActiveRow}><Rows3 size={13} /> Delete Row</button>
            <button className="btn btn-danger btn-sm" onClick={deleteActiveColumn}><Trash2 size={13} /> Delete Column</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={roundNet} onChange={event => setRoundNet(event.target.checked)} />
              Round net payable
            </label>
          </div>
        </div>

        <div style={{ minHeight: 380 }}>
          <HotTable
            ref={hotRef}
            data={rows}
            columns={hotColumns}
            colHeaders={columns.map((col, index) => `${col.label} (${colLetter(index)})`)}
            rowHeaders
            width="100%"
            height={420}
            stretchH="none"
            manualColumnResize
            manualRowResize
            autoWrapRow
            autoWrapCol
            copyPaste
            fillHandle={{ autoInsertRow: true }}
            contextMenu={['row_above', 'row_below', 'remove_row', 'col_left', 'col_right', 'remove_col', '---------', 'undo', 'redo', 'copy', 'cut']}
            dropdownMenu
            filters
            columnSorting
            fixedRowsBottom={1}
            minSpareRows={1}
            licenseKey="non-commercial-and-evaluation"
            className="ht-theme-main excel-hot-table"
            afterChange={handleHotChange}
            afterSelectionEnd={handleHotSelection}
            afterCreateRow={(index: number, amount: number) => {
              const nextRows = cloneRows(rows);
              const blank = blankRows(format, columns, amount);
              nextRows.splice(index, 0, ...blank);
              commit(columns, nextRows, `${amount} row${amount === 1 ? '' : 's'} added`);
            }}
            afterRemoveRow={(index: number, amount: number) => {
              const nextRows = rows.filter((_, rowIndex) => rowIndex < index || rowIndex >= index + amount);
              commit(columns, nextRows.length > 0 ? nextRows : blankRows(format, columns, 1), `${amount} row${amount === 1 ? '' : 's'} deleted`);
            }}
            afterCreateCol={(index: number, amount: number) => {
              let nextColumns = cloneColumns(columns);
              let nextRows = cloneRows(rows);
              for (let offset = 0; offset < amount; offset += 1) {
                const key = newColumnKey(nextColumns);
                const label = `Extra ${nextColumns.filter(col => col.key.startsWith('extra')).length + 1}`;
                nextColumns = [
                  ...nextColumns.slice(0, index + offset),
                  { key, label, width: 120, numeric: true, align: 'right' },
                  ...nextColumns.slice(index + offset),
                ];
                nextRows = nextRows.map(row => ({ ...row, [key]: '' }));
              }
              commit(nextColumns, nextRows, `${amount} column${amount === 1 ? '' : 's'} added`);
            }}
            afterRemoveCol={(index: number, amount: number) => {
              const removed = columns.slice(index, index + amount);
              const nextColumns = columns.filter((_, colIndex) => colIndex < index || colIndex >= index + amount);
              const nextRows = rows.map(row => {
                const next = { ...row };
                removed.forEach(col => { delete next[col.key]; });
                return next;
              });
              commit(nextColumns.length > 0 ? nextColumns : cloneColumns(FORMATS[format].columns), nextRows, `${amount} column${amount === 1 ? '' : 's'} deleted`);
            }}
          />
          <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
            <table style={{ width: totalWidth, minWidth: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
              <tbody>
                <tr>
                  {columns.map((col, colIndex) => {
                    const total = col.numeric ? rows.reduce((sum, row, rowIndex) => sum + cellNumber(row, col.key, rows, columns, rowIndex), 0) : 0;
                    return (
                      <td key={col.key} style={{
                        width: col.width,
                        background: activeCell.col === colIndex ? '#fffbeb' : '#f8fafc',
                        borderRight: '1px solid var(--border)',
                        padding: '7px 8px',
                        fontFamily: col.numeric ? 'var(--font-mono)' : 'var(--font-body)',
                        fontSize: 12,
                        fontWeight: 800,
                        textAlign: col.align ?? (col.numeric ? 'right' : 'left'),
                      }}>
                        {colIndex === 0 ? 'Grand Total' : col.numeric ? (total > 0 ? total.toFixed(2) : '') : ''}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ ...panelStyle, padding: 12, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Amount in Words</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{amountWords(totals.netPayable)}</div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', textAlign: 'right' }}>
          {`Total Taxable Amount : ${displayMoney(totals.taxable)}
SGST                 : ${displayMoney(totals.sgst)}
CGST                 : ${displayMoney(totals.cgst)}
IGST                 : ${displayMoney(totals.igst)}
Net Payable Amount   : ${displayMoney(totals.netPayable)}`}
        </div>
      </div>

      <div className="excel-print" style={{ background: '#fff', maxWidth: 1120, margin: '4px auto 24px', padding: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', width: '100%' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
          <tbody>
            <tr>
              <td colSpan={columns.length} style={{ ...printCell, padding: '6px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 130, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    <img src="/logo.png" alt="Triveni" style={{ width: 90, height: 90, objectFit: 'contain' }} />
                  </div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.5 }}>{COMPANY.name}</div>
                    <div style={{ fontSize: 10, fontWeight: 700 }}>{COMPANY.line1}</div>
                    <div style={{ fontSize: 10, fontWeight: 700 }}>{COMPANY.address}</div>
                    <div style={{ fontSize: 10, fontWeight: 700 }}>{COMPANY.phone}</div>
                    <div style={{ fontSize: 10, fontWeight: 700 }}>{COMPANY.gst}</div>
                    <div style={{ fontSize: 9, color: '#c00', fontWeight: 700 }}>{COMPANY.registered}</div>
                    <div style={{ fontSize: 10, fontWeight: 700 }}>{COMPANY.email}</div>
                  </div>
                  <div style={{ width: 130, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    <img src="/iata.png" alt="IATA" style={{ width: 130, height: 90, objectFit: 'contain' }} />
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={columns.length} style={{ ...printCell, textAlign: 'center', fontWeight: 700, fontSize: 13, textDecoration: 'underline' }}>TAX INVOICE</td>
            </tr>
            <tr>
              <td colSpan={Math.max(1, columns.length - 5)} style={{ ...printCell, minHeight: 60 }}>
                {`M/s :\nGSTIN :\nAddress :`}
              </td>
              <td colSpan={Math.min(5, columns.length)} style={{ ...printCell, minHeight: 60 }}>
                {`Bill No. :\nBill Date :\nPOS : DELHI\nBilling Period From :`}
              </td>
            </tr>
            <tr>
              <td colSpan={columns.length} style={{ ...printCell, textAlign: 'center', fontWeight: 700 }}>SAC Code : 996531</td>
            </tr>
            <tr>
              {columns.map(col => (
                <td key={col.key} style={{ ...printCell, textAlign: 'center', fontWeight: 700, background: '#f0f0f0' }}>{col.label}</td>
              ))}
            </tr>
            {printRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map(col => (
                  <td key={col.key} style={{ ...printCell, textAlign: col.align ?? (col.numeric ? 'right' : 'center') }}>
                    {cellText(row, col, rowIndex)}
                  </td>
                ))}
              </tr>
            ))}
            <tr style={{ background: '#f8f8f8', fontWeight: 700 }}>
              {columns.map((col, colIndex) => {
                const total = col.numeric ? rows.reduce((sum, row, rowIndex) => sum + cellNumber(row, col.key, rows, columns, rowIndex), 0) : 0;
                return (
                  <td key={col.key} style={{ ...printCell, textAlign: col.numeric ? 'right' : 'center', background: '#f8f8f8', fontWeight: 700 }}>
                    {colIndex === 0 ? 'Grand Total' : col.numeric ? (total > 0 ? total.toFixed(2) : '') : ''}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td colSpan={Math.max(1, columns.length - 5)} style={{ ...printCell, minHeight: 70 }}>
                <div><strong>Amount in Words :</strong> {amountWords(totals.netPayable)}</div>
                <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                  {`Bank           :
A/c Name       :
Account No.    :
IFSC Code      :
Branch         :`}
                </div>
              </td>
              <td colSpan={Math.min(5, columns.length)} style={{ ...printCell, minHeight: 70, whiteSpace: 'pre-wrap' }}>
                {`Total Taxable Amount : ${totals.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
SGST @ ${taxMode === 'split' ? sgstRate : 0}%              : ${totals.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
CGST @ ${taxMode === 'split' ? cgstRate : 0}%              : ${totals.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
IGST @ ${taxMode === 'igst' ? igstRate : 0}%              : ${totals.igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Net Payable Amount  : ${totals.netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </td>
            </tr>
            <tr>
              <td colSpan={columns.length} style={{ ...printCell, textAlign: 'center', fontSize: 9 }}>
                Bank details will appear here after this draft Excel feature is connected to saved invoice data.
              </td>
            </tr>
            <tr>
              <td colSpan={Math.max(1, columns.length - 5)} style={{ ...printCell, minHeight: 54, fontSize: 9, whiteSpace: 'pre-wrap' }}>
                {`NOTES :
1. Subject to Delhi Jurisdiction.
2. Any discrepancy should be reported within 7 days.`}
              </td>
              <td colSpan={Math.min(5, columns.length)} style={{ ...printCell, minHeight: 54, textAlign: 'center', fontWeight: 700 }}>
                For TRIVENI CARGO EXPRESS INDIA PVT LTD
                <div style={{ height: 30 }} />
                Authorised Signatory
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
