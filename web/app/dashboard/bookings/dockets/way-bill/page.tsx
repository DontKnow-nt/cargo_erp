'use client';
import { useRef, useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Printer, RotateCcw, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Plus, Minus, Save } from 'lucide-react';
import { updateDocketBooking, createDocketBooking } from '@/lib/actions/bookings';
import toast from 'react-hot-toast';

// ── Toolbar ───────────────────────────────────────────────────────────────────
function Toolbar() {
  const exec = (cmd: string, val?: string) => document.execCommand(cmd, false, val);

  function fontSize(delta: number) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const span = document.createElement('span');
    // Get current font size from parent
    const parent = range.commonAncestorContainer.parentElement;
    const current = parent ? parseFloat(getComputedStyle(parent).fontSize) : 11;
    span.style.fontSize = `${Math.max(7, Math.min(36, current + delta))}px`;
    range.surroundContents(span);
  }

  const btn = (onClick: () => void, icon: React.ReactNode, title: string) => (
    <button
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151' }}
    >{icon}</button>
  );

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 12 }}>
      <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 4 }}>Format:</span>
      {btn(() => exec('bold'),      <Bold size={13} />,      'Bold (Ctrl+B)')}
      {btn(() => exec('italic'),    <Italic size={13} />,    'Italic (Ctrl+I)')}
      {btn(() => exec('underline'), <Underline size={13} />, 'Underline (Ctrl+U)')}
      <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />
      {btn(() => exec('justifyLeft'),   <AlignLeft size={13} />,   'Align Left')}
      {btn(() => exec('justifyCenter'), <AlignCenter size={13} />, 'Align Center')}
      {btn(() => exec('justifyRight'),  <AlignRight size={13} />,  'Align Right')}
      <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />
      {btn(() => fontSize(-1), <Minus size={13} />, 'Decrease font size')}
      <span style={{ fontSize: 11, color: '#64748b' }}>Size</span>
      {btn(() => fontSize(+1), <Plus size={13} />,  'Increase font size')}
      <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />
      <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
        Color
        <input type="color" defaultValue="#000000"
          onInput={e => exec('foreColor', (e.target as HTMLInputElement).value)}
          style={{ width: 28, height: 24, border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', padding: 1 }} />
      </label>
      <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />
      <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
        Highlight
        <input type="color" defaultValue="#ffffff"
          onInput={e => exec('hiliteColor', (e.target as HTMLInputElement).value)}
          style={{ width: 28, height: 24, border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', padding: 1 }} />
      </label>
    </div>
  );
}

// ── Editable cell (standalone <td>) ──────────────────────────────────────────
function EditCell({ style, children, multiline, colSpan }: { style?: React.CSSProperties; children?: string; multiline?: boolean; colSpan?: number }) {
  return (
    <td colSpan={colSpan} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 10, verticalAlign: 'top', ...style }}>
      <div
        contentEditable suppressContentEditableWarning suppressHydrationWarning
        style={{ outline: 'none', minHeight: multiline ? 36 : 14, fontFamily: 'Arial, sans-serif', fontSize: 10, whiteSpace: 'pre-wrap' }}
      >{children ?? ''}</div>
    </td>
  );
}

// ── Editable div (inline inside another <td>, avoids nested <td>) ─────────────
function EditDiv({ dataField }: { dataField?: string }) {
  return (
    <div contentEditable suppressContentEditableWarning suppressHydrationWarning
      data-field={dataField}
      style={{ outline: 'none', minHeight: 14, fontFamily: 'Arial, sans-serif', fontSize: 10, whiteSpace: 'pre-wrap' }} />
  );
}

// ── Static label cell ─────────────────────────────────────────────────────────
function LabelCell({ style, children }: { style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, verticalAlign: 'top', color: '#333', ...style }}>
      {children}
    </td>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function CargoWayBillInner() {
  const paperRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const docketId = searchParams.get('id');
  const [saving, setSaving] = useState(false);

  const getField = (field: string) =>
    paperRef.current?.querySelector(`[data-field="${field}"]`)?.textContent?.trim() ?? '';

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const origin = getField('origin');
      const destination = getField('destination');
      const wayBillNo = getField('wayBillNo');
      const description = getField('description');
      const consignee = getField('consignee');
      const methodOfPacking = getField('methodOfPacking');
      const weightRaw = getField('weight');
      const weight = parseFloat(weightRaw) || 0;
      const partyName = getField('shipper').split('\n')[0].trim() || 'Unknown';

      if (docketId) {
        // Update existing docket
        await updateDocketBooking(docketId, { origin, destination, wayBillNo, description, consignee, methodOfPacking });
        toast.success('Docket updated');
      } else {
        // Create new docket from blank way bill
        const docketNo = `DKT-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
        const res = await createDocketBooking({
          docketNo, partyId: 'p-imported', partyName,
          bookingDate: new Date().toISOString().split('T')[0],
          origin, destination, description,
          rateFittedAmount: 0, markupAmount: 0, gstRate: 18, gstAmount: 0, totalAmount: 0,
          dueDatePolicy: 30, status: 'BOOKED',
          wayBillNo: wayBillNo || undefined,
          consignee: consignee || undefined,
          methodOfPacking: methodOfPacking || undefined,
          weight: weight || undefined,
        });
        if (res && 'error' in res) { toast.error('Save failed'); return; }
        toast.success(`New docket ${docketNo} created`);
      }
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  }, [docketId]);

  const handlePrint = useCallback(async () => {
    const el = paperRef.current;
    if (!el) return;
    const clone = el.cloneNode(true) as HTMLElement;
    try {
      const resp = await fetch('/logo.png');
      const blob2 = await resp.blob();
      const b64 = await new Promise<string>(res => {
        const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob2);
      });
      clone.querySelectorAll('img').forEach(img => { img.src = b64; });
    } catch { /* skip */ }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cargo Way Bill</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;padding:8px}
table{border-collapse:collapse;width:100%}
td{border:1px solid #000;padding:3px 5px;font-size:10px;vertical-align:top}
[contenteditable]{outline:none;min-height:14px;white-space:pre-wrap}
img{max-width:100%;object-fit:contain}
@media print{@page{margin:6mm}body{padding:4px}}
</style></head>
<body>${clone.innerHTML}
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'width=1050,height=750');
    if (win) setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, []);

  function handleReset() {
    if (!paperRef.current) return;
    paperRef.current.querySelectorAll('[contenteditable]').forEach(el => {
      (el as HTMLElement).innerHTML = (el as HTMLElement).dataset.default ?? '';
    });
  }

  return (
    <div className="animate-fadeIn">
      {/* Toolbar */}
      <div className="no-print" style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
          <h1 className="page-title" style={{ flex: 1 }}>Cargo Way Bill</h1>
          <button className="btn btn-secondary btn-sm" onClick={handleReset}><RotateCcw size={13} /> Reset</button>
          <button className="btn btn-success btn-sm" onClick={handleSave} disabled={saving} style={{ background: '#059669', color: '#fff', border: 'none' }}><Save size={13} /> {saving ? 'Saving…' : 'Save'}</button>
          <button className="btn btn-primary btn-sm" onClick={handlePrint}><Printer size={13} /> Print</button>
        </div>
        <Toolbar />
        <p style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
          💡 Click any cell to edit. Select text then use toolbar to format. Ctrl+B = Bold, Ctrl+I = Italic.
        </p>
      </div>

      {/* Way Bill Paper */}
      <div ref={paperRef} style={{ background: '#fff', maxWidth: 960, margin: '0 auto', padding: 8 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>

            {/* ROW 1: Header */}
            <tr>
              <td colSpan={6} style={{ border: '1px solid #000', padding: '6px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img src="/logo.png" alt="Triveni" style={{ width: 56, height: 56, objectFit: 'contain', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 0.5 }}>Triveni <span style={{ fontSize: 12, fontWeight: 700 }}>CARGO EXPRESS INDIA PVT. LTD.</span></div>
                    <div style={{ fontSize: 8 }}>(AN IATA ACCREDITED CO. REGD. NO. MCS - 1406)</div>
                    <div style={{ fontSize: 8 }}>Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15, Mahipalpur Extension, New Delhi, Delhi 110037, near Hotel City Centre</div>
                    <div style={{ fontSize: 8 }}>Ph : 080-41754745  Fax : 080-41754746  Email : info@tceipl.com  Web : www.tceipl.com</div>
                  </div>
                </div>
              </td>
              <td colSpan={4} style={{ border: '1px solid #000', textAlign: 'right', verticalAlign: 'middle', padding: '6px 10px' }}>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2 }}>CARGO WAY BILL</div>
              </td>
            </tr>

            {/* ROW 2: Origin / Destination / Way Bill No */}
            <tr>
              <td colSpan={6} style={{ border: 'none', padding: 0 }}></td>
              <LabelCell style={{ width: '11%' }}>Origin<EditDiv dataField="origin" /></LabelCell>
              <LabelCell style={{ width: '13%' }}>Destination<EditDiv dataField="destination" /></LabelCell>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9 }}>
                Way Bill No. :<EditDiv dataField="wayBillNo" />
              </td>
            </tr>

            {/* ROW 3: Shipper + column headers */}
            <tr>
              <td rowSpan={3} colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', width: '26%' }}>
                <div style={{ fontSize: 9, color: '#555' }}>Shipper :</div>
                <div contentEditable suppressContentEditableWarning suppressHydrationWarning data-field="shipper" style={{ outline: 'none', minHeight: 50, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}></div>
              </td>
              <td rowSpan={3} style={{ border: '1px solid #000', padding: '3px 5px', width: '13%' }}>
                <div style={{ fontSize: 9, color: '#555' }}>Description of Goods</div>
                <div contentEditable suppressContentEditableWarning suppressHydrationWarning data-field="description" style={{ outline: 'none', minHeight: 50, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}></div>
              </td>
              <LabelCell style={{ width: '9%', textAlign: 'center' }}>No. Pieces /<br />Packages</LabelCell>
              <LabelCell style={{ width: '9%', textAlign: 'center' }}>Actual Weight<br />in Kgs.</LabelCell>
              <td colSpan={3} style={{ border: '1px solid #000', textAlign: 'center', fontSize: 9 }}>Chargeable Dimensions in Cms</td>
              <LabelCell style={{ width: '9%', textAlign: 'center' }}>Weight in Kgs.</LabelCell>
            </tr>
            <tr>
              <EditCell style={{ textAlign: 'center' }} />
              <EditCell style={{ textAlign: 'center' }} />
              <LabelCell style={{ textAlign: 'center' }}>Lx<EditDiv /></LabelCell>
              <LabelCell style={{ textAlign: 'center' }}>Bx<EditDiv /></LabelCell>
              <LabelCell style={{ textAlign: 'center' }}>H<EditDiv /></LabelCell>
              <EditCell style={{ textAlign: 'center' }} />
            </tr>
            <tr>
              <td colSpan={5} style={{ border: 'none' }}></td>
            </tr>

            {/* Shipper Phone */}
            <tr>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9 }}>
                Phone : <div contentEditable suppressContentEditableWarning suppressHydrationWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif' }}></div>
              </td>
              <LabelCell>Mode of Dispatch</LabelCell>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>
                <div contentEditable suppressContentEditableWarning suppressHydrationWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif', fontWeight: 'bold', textAlign: 'center' }}>AIR</div>
              </td>
              <EditCell colSpan={4} />
            </tr>

            {/* Consignee */}
            <tr>
              <td rowSpan={2} colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px' }}>
                <div style={{ fontSize: 9, color: '#555' }}>Consignee :</div>
                <div contentEditable suppressContentEditableWarning suppressHydrationWarning data-field="consignee" style={{ outline: 'none', minHeight: 40, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}></div>
              </td>
              <LabelCell>Date of Delivery :<br />Details</LabelCell>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>
                <div contentEditable suppressContentEditableWarning suppressHydrationWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif', fontWeight: 'bold', textAlign: 'center' }}>AWB No.</div>
              </td>
              <EditCell colSpan={4} />
            </tr>
            <tr>
              <LabelCell>R/R No.</LabelCell>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>
                <div contentEditable suppressContentEditableWarning suppressHydrationWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif', fontWeight: 'bold', textAlign: 'center' }}>RAIL</div>
              </td>
              <EditCell colSpan={4} />
            </tr>

            {/* Consignee Phone + Invoice No */}
            <tr>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9 }}>
                Phone : <div contentEditable suppressContentEditableWarning suppressHydrationWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif' }}></div>
              </td>
              <td colSpan={3} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9 }}>
                Invoice No. <div contentEditable suppressContentEditableWarning suppressHydrationWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif' }}></div>
              </td>
              <td colSpan={4} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, textAlign: 'left' }}>
                Weight in Kgs. <div contentEditable suppressContentEditableWarning suppressHydrationWarning data-field="weight" style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif' }}></div>
              </td>
            </tr>

            {/* Value + Method of Packing */}
            <tr>
              <td colSpan={2} style={{ border: 'none' }}></td>
              <LabelCell>Value</LabelCell>
              <EditCell colSpan={2} />
              <td colSpan={4} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9 }}>
                Method of Packing <div contentEditable suppressContentEditableWarning suppressHydrationWarning data-field="methodOfPacking" style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif' }}></div>
              </td>
            </tr>

            {/* Conditions + Receiver + Delivery Challan + Invoice copies */}
            <tr>
              <td rowSpan={5} colSpan={2} style={{ border: '1px solid #000', padding: '4px 6px', fontSize: 8, lineHeight: 1.6 }}>
                We agree to the conditions of carriage set forth on the reverse of this way bill and the details given by us on this bill are true &amp; correct.
              </td>
              <td colSpan={3} style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center', fontSize: 9, fontWeight: 600 }}>Received in good condition</td>
              <td rowSpan={5} colSpan={2} style={{ border: '1px solid #000', padding: '4px 6px', fontSize: 9, textAlign: 'center' }}>
                <div style={{ marginBottom: 4 }}>Delivery Challan Copy</div>
                {[0,1,2].map(i => <div key={i} contentEditable suppressContentEditableWarning suppressHydrationWarning style={{ border: '1px solid #ccc', minHeight: 20, marginBottom: 3, outline: 'none', fontSize: 10, fontFamily: 'Arial, sans-serif' }}></div>)}
              </td>
              <td rowSpan={5} colSpan={2} style={{ border: '1px solid #000', padding: '4px 6px', fontSize: 9 }}>
                {[['Invoice', 2], ['Modvat Copy', 2], ['Any Other', 2]].map(([label, count]) => (
                  <div key={label as string} style={{ marginBottom: 6 }}>
                    <div>{label}</div>
                    {Array.from({ length: count as number }).map((_, i) => (
                      <div key={i} contentEditable suppressContentEditableWarning suppressHydrationWarning style={{ border: '1px solid #ccc', minHeight: 18, marginBottom: 2, outline: 'none', fontSize: 10, fontFamily: 'Arial, sans-serif' }}></div>
                    ))}
                  </div>
                ))}
              </td>
            </tr>
            <tr>
              <LabelCell>Receiver's Name :</LabelCell>
              <EditCell colSpan={2} />
            </tr>
            <tr>
              <LabelCell>Date :</LabelCell>
              <EditCell colSpan={2} />
            </tr>
            <tr>
              <LabelCell>Time :</LabelCell>
              <EditCell colSpan={2} />
            </tr>
            <tr>
              <LabelCell>Signature</LabelCell>
              <EditCell colSpan={2} style={{ minHeight: 28 }} />
            </tr>

            {/* Shipper label */}
            <tr>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, fontWeight: 600 }}>Shipper</td>
              <td colSpan={8} style={{ border: 'none' }}></td>
            </tr>

            {/* Accepted + E&OE + Enclosure */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, fontWeight: 600, width: '10%' }}>Accepted</td>
              <td colSpan={3} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9 }}>E. &amp; O.E.</td>
              <td colSpan={6} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9 }}>
                ENCLOSURE <div contentEditable suppressContentEditableWarning suppressHydrationWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif', display: 'inline-block', minWidth: 200 }}></div>
              </td>
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CargoWayBillPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>}>
      <CargoWayBillInner />
    </Suspense>
  );
}



