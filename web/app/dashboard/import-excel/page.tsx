'use client';
import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';

type Result = { outstanding: number; skipped: number; errors: string[] };

export default function ExcelImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file) { toast.error('Select a file first'); return; }
    setLoading(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/import-excel', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      setResult(data);
      if (data.dockets + data.awbs > 0) toast.success(`Import complete!`);
      else toast('No new records found — all may already exist', { icon: 'ℹ️' });
    } catch (e) {
      toast.error('Upload failed: ' + String(e));
    } finally { setLoading(false); }
  }

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileSpreadsheet size={20} color="var(--accent-dark)" /> Import Old Data (Excel)
          </h1>
          <p className="page-subtitle">Upload .xlsx files to import outstanding balances from old data.</p>
        </div>
      </div>

      <div className="card" style={{ padding: 32, maxWidth: 600 }}>
        <div style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: 32, textAlign: 'center', background: 'var(--surface-sunken)', cursor: 'pointer' }}
          onClick={() => ref.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}>
          <Upload size={32} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          {file ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-dark)' }}>{file.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{(file.size / 1024).toFixed(0)} KB · click to change</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Click to select or drag & drop</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Supports .xlsx files with AWB, Docket, Invoice sheets</div>
            </div>
          )}
          <input ref={ref} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); }} />
        </div>

        <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--info-bg)', border: '1px solid var(--info-border)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          <strong>What it does:</strong>
          <ul style={{ margin: '6px 0 0 16px', lineHeight: 1.8 }}>
            <li>Reads each row from all sheets</li>
            <li>Matches each row's AWB/Docket number against existing AWB/Docket bookings</li>
            <li>On a match with a <strong>BOOKED</strong> booking: uses that booking's Party name, adds Total Amount to Outstanding, and marks the booking <strong>IMPORTED</strong></li>
            <li>On a match with an <strong>INVOICED</strong> booking: skipped — that booking already has a real invoice + outstanding entry, adding again would double-count it</li>
            <li>No match: still adds the row's Total Amount to Outstanding using the Excel row's own party name</li>
            <li>Rows sorted by date — oldest first</li>
            <li>Re-uploading the same file won&apos;t double-count — bookings already marked IMPORTED are skipped</li>
            <li><strong>Does NOT create new AWB bookings or Docket bookings</strong></li>
          </ul>
        </div>

        <button className="btn btn-primary" style={{ marginTop: 20, width: '100%', justifyContent: 'center', height: 44 }}
          onClick={handleUpload} disabled={!file || loading}>
          {loading ? '⏳ Importing...' : <><Upload size={15} /> Import Data</>}
        </button>

        {result && (
          <div style={{ marginTop: 20, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: result.errors.length ? 'var(--warning-bg)' : 'var(--success-bg)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {result.errors.length ? <AlertTriangle size={16} color="var(--warning)" /> : <CheckCircle size={16} color="var(--success)" />}
              <strong style={{ fontSize: 13 }}>Import Complete</strong>
            </div>
            <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {[
                
                
                { label: 'Outstanding Added', val: result.outstanding, color: '#059669' },
                { label: 'Skipped', val: result.skipped, color: '#64748b' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--surface-sunken)', borderRadius: 8 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{s.label}</div>
                </div>
              ))}
            </div>
            {result.errors.length > 0 && (
              <div style={{ padding: '0 16px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>Warnings ({result.errors.length}):</div>
                {result.errors.slice(0, 10).map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 0' }}>• {e}</div>
                ))}
                {result.errors.length > 10 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>...and {result.errors.length - 10} more</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
