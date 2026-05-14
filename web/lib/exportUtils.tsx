'use client';
// ─── Shared Date Range Filter + Bulk Download Utilities ─────────────────────
// Used across AWB, Docket, Invoice, Outstanding, Payment pages

export type DateRange = '1d'|'7d'|'15d'|'3w'|'1m'|'3m'|'6m'|'1y'|'2y'|'all';

export const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value:'1d',  label:'Today' },
  { value:'7d',  label:'Last 7 Days' },
  { value:'15d', label:'Last 15 Days' },
  { value:'3w',  label:'Last 3 Weeks' },
  { value:'1m',  label:'Last 1 Month' },
  { value:'3m',  label:'Last 3 Months' },
  { value:'6m',  label:'Last 6 Months' },
  { value:'1y',  label:'Last 1 Year' },
  { value:'2y',  label:'Last 2 Years' },
  { value:'all', label:'All Time' },
];

export function getDateRangeStart(range: DateRange): Date | null {
  if (range === 'all') return null;
  const now = new Date();
  const map: Record<Exclude<DateRange,'all'>, number> = {
    '1d':  1, '7d': 7, '15d': 15, '3w': 21, '1m': 30,
    '3m':  90, '6m': 180, '1y': 365, '2y': 730,
  };
  const d = new Date(now);
  d.setDate(d.getDate() - map[range as Exclude<DateRange,'all'>]);
  return d;
}

export function filterByDateRange<T, K extends keyof T>(
  items: T[], dateField: K, range: DateRange
): T[] {
  const start = getDateRangeStart(range);
  if (!start) return items;
  return items.filter(item => {
    const value = item[dateField];
    if (typeof value !== 'string' && !(value instanceof Date)) return false;
    const d = new Date(value);
    return !Number.isNaN(d.getTime()) && d >= start;
  });
}

// ─── Date Range Selector Component ──────────────────────────────────────────
import { Calendar } from 'lucide-react';

export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:0, background:'var(--surface-base)', border:'1px solid var(--border)', borderRadius:9, overflow:'hidden' }}>
      <div style={{ padding:'0 10px', borderRight:'1px solid var(--border)', display:'flex', alignItems:'center', color:'var(--text-muted)' }}>
        <Calendar size={13}/>
      </div>
      {DATE_RANGE_OPTIONS.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding:'6px 11px', fontSize:11, fontWeight:value===opt.value?700:500,
            background: value===opt.value ? 'var(--accent)' : 'transparent',
            color: value===opt.value ? '#fff' : 'var(--text-secondary)',
            border:'none', borderRight: i < DATE_RANGE_OPTIONS.length-1 ? '1px solid var(--border)' : 'none',
            cursor:'pointer', transition:'all 120ms ease', whiteSpace:'nowrap',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── CSV Export ──────────────────────────────────────────────────────────────
function sanitizeCsvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Prevent CSV formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return safe.includes(',') || safe.includes('"') || safe.includes('\n')
    ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function exportToCSV(data: Record<string,unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => sanitizeCsvCell(row[h])).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── XLSX Export (tab-separated, opens in Excel) ────────────────────────────
export function exportToXLSX(data: Record<string,unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => row[h] ?? '').join('\t'));
  const tsv = [headers.join('\t'), ...rows].join('\n');
  const blob = new Blob([tsv], { type:'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.xls`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Print/PDF Export ────────────────────────────────────────────────────────
function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function exportToPDF(title: string, data: Record<string,unknown>[], _filename: string) {
  const headers = Object.keys(data[0] || {});
  // All user data is escaped before insertion into HTML
  const rows = data.map(row =>
    headers.map(h => `<td style="border:1px solid #e2e8f0;padding:6px 10px;font-size:11px">${escapeHtml(row[h])}</td>`).join('')
  );
  const safeTitle = escapeHtml(title);
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${safeTitle}</title><style>
  body{font-family:Inter,sans-serif;margin:20px;color:#0f172a}
  h2{font-size:16px;margin-bottom:4px}
  p{font-size:11px;color:#64748b;margin-bottom:16px}
  table{border-collapse:collapse;width:100%}
  th{background:#f8fafc;border:1px solid #e2e8f0;padding:7px 10px;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:0.07em;color:#64748b}
</style></head>
<body>
  <h2>${safeTitle}</h2>
  <p>Generated: ${escapeHtml(new Date().toLocaleString('en-IN'))} | Records: ${data.length}</p>
  <table><thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r=>`<tr>${r}</tr>`).join('')}</tbody></table>
  <script>window.onload=function(){window.print();}<\/script>
</body></html>`;
  // Use Blob URL instead of document.write to avoid XSS
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) { URL.revokeObjectURL(url); return; }
  // Revoke after a delay to allow the window to load
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ─── Bulk Download Modal Component ───────────────────────────────────────────
import { useState } from 'react';
import { Download, X, FileText, FileSpreadsheet, File } from 'lucide-react';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';
export type ExportModule = 'awb' | 'dockets' | 'invoices' | 'payments' | 'outstanding' | 'parties' | 'rates';

const MODULE_LABELS: Record<ExportModule,string> = {
  awb:'AWB Bookings', dockets:'Docket Bookings', invoices:'Invoices',
  payments:'Payment Receipts', outstanding:'Outstanding & Aging', parties:'Parties', rates:'Freight Rates',
};

interface BulkDownloadProps {
  onClose: () => void;
  onDownload: (modules: ExportModule[], range: DateRange, format: ExportFormat) => void;
}

export function BulkDownloadModal({ onClose, onDownload }: BulkDownloadProps) {
  const [selectedModules, setSelectedModules] = useState<ExportModule[]>(['awb','dockets','invoices','outstanding']);
  const [range, setRange] = useState<DateRange>('1m');
  const [format, setFormat] = useState<ExportFormat>('csv');

  function toggle(m: ExportModule) {
    setSelectedModules(s => s.includes(m) ? s.filter(x=>x!==m) : [...s,m]);
  }

  const FORMAT_ICONS = { csv:<FileText size={14}/>, xlsx:<FileSpreadsheet size={14}/>, pdf:<File size={14}/> };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth:520 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ fontSize:16, fontWeight:800, display:'flex', alignItems:'center', gap:8 }}>
            <Download size={16}/> Bulk Download
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16}/></button>
        </div>

        {/* Modules */}
        <div style={{ marginBottom:16 }}>
          <label className="label">Select Data Modules</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            {(Object.keys(MODULE_LABELS) as ExportModule[]).map(m => (
              <div key={m} onClick={() => toggle(m)} style={{
                padding:'8px 12px', borderRadius:8, border:`1.5px solid ${selectedModules.includes(m)?'var(--accent)':'var(--border)'}`,
                background: selectedModules.includes(m) ? 'var(--accent-subtle)' : 'var(--surface-base)',
                cursor:'pointer', display:'flex', alignItems:'center', gap:8, transition:'all 120ms',
              }}>
                <div style={{ width:14, height:14, borderRadius:3, border:`2px solid ${selectedModules.includes(m)?'var(--accent)':'var(--border)'}`, background:selectedModules.includes(m)?'var(--accent)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {selectedModules.includes(m) && <span style={{ color:'#fff', fontSize:9, fontWeight:700 }}>✓</span>}
                </div>
                <span style={{ fontSize:12, fontWeight:selectedModules.includes(m)?600:400, color:selectedModules.includes(m)?'var(--accent-dark)':'var(--text-primary)' }}>{MODULE_LABELS[m]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Date Range */}
        <div style={{ marginBottom:16 }}>
          <label className="label">Date Range</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {DATE_RANGE_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setRange(opt.value)} style={{
                padding:'5px 12px', borderRadius:99, fontSize:11, fontWeight:range===opt.value?700:500,
                background:range===opt.value?'var(--accent)':'var(--surface-sunken)',
                color:range===opt.value?'#fff':'var(--text-secondary)',
                border:`1px solid ${range===opt.value?'var(--accent)':'var(--border)'}`,
                cursor:'pointer', transition:'all 120ms',
              }}>{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Format */}
        <div style={{ marginBottom:20 }}>
          <label className="label">Export Format</label>
          <div style={{ display:'flex', gap:8 }}>
            {(['csv','xlsx','pdf'] as ExportFormat[]).map(f => (
              <button key={f} onClick={() => setFormat(f)} className={`btn ${format===f?'btn-primary':'btn-secondary'}`} style={{ flex:1, justifyContent:'center', fontSize:12 }}>
                {FORMAT_ICONS[f]} {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={selectedModules.length===0} onClick={() => { onDownload(selectedModules, range, format); onClose(); }}>
            <Download size={13}/> Download {selectedModules.length} Module{selectedModules.length!==1?'s':''}
          </button>
        </div>
      </div>
    </div>
  );
}
