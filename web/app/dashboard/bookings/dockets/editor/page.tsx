'use client';
import { Suspense, useRef, useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer, Save, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Plus, Minus, Undo, Redo } from 'lucide-react';
import { useSharedData } from '@/lib/useSharedData';
import { updateDocketBooking } from '@/lib/actions/bookings';
import toast from 'react-hot-toast';

function EC({ children, style, colSpan, dataField }: { children?: string; style?: React.CSSProperties; colSpan?: number; dataField?: string }) {
  return (
    <td colSpan={colSpan} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 10, verticalAlign: 'top', ...style }}>
      <div contentEditable suppressContentEditableWarning data-field={dataField} style={{ outline: 'none', minHeight: 14, fontFamily: 'Arial, sans-serif', fontSize: 10, whiteSpace: 'pre-wrap' }}>
        {children ?? ''}
      </div>
    </td>
  );
}

function DocketEditorInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const { docketBookings, parties, refresh } = useSharedData();
  const paperRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  const d = docketBookings.find(b => b.id === id);
  const party = d ? parties.find(p => p.id === d.partyId) : undefined;

  const getField = (field: string) =>
    paperRef.current?.querySelector(`[data-field="${field}"]`)?.textContent?.trim() ?? '';

  const handleSave = useCallback(async () => {
    if (!d || !id) return;
    setSaving(true);
    try {
      await updateDocketBooking(id, {
        origin: getField('origin') || d.origin || '',
        destination: getField('destination') || d.destination || '',
        wayBillNo: getField('wayBillNo') || d.wayBillNo || '',
        description: getField('description') || d.description || '',
        consignee: getField('consignee') || d.consignee || '',
        methodOfPacking: getField('methodOfPacking') || d.methodOfPacking || '',
      });
      toast.success('Docket saved');
      refresh();
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  }, [d, id, refresh]);

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
      clone.querySelectorAll('img').forEach(img => { img.src = b64; });
    } catch { /* logo missing, skip */ }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cargo Way Bill - ${d?.docketNo ?? ''}</title>
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
    if (win) setTimeout(() => URL.revokeObjectURL(url), 15000);
  }, [d]);

  if (!d) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Arial', fontSize: 16, color: '#6b7280' }}>
      No docket found. Open this page from the Docket Bookings list.
    </div>
  );

  const shipperText = [d.partyName, party?.billingAddress].filter(Boolean).join('\n');

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb', fontFamily: 'Arial, sans-serif' }}>
      {/* Main Toolbar */}
      <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Docket Editor — <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{d.docketNo}</span></span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{d.partyName}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>💡 Click any field to edit</span>
          <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Printer size={14} /> Print / Download
          </button>
        </div>
      </div>

      {/* Formatting Toolbar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 4, position: 'sticky', top: 53, zIndex: 9, flexWrap: 'wrap' }}>
        {[
          { icon: <Bold size={13}/>, cmd: 'bold', title: 'Bold (Ctrl+B)' },
          { icon: <Italic size={13}/>, cmd: 'italic', title: 'Italic (Ctrl+I)' },
          { icon: <Underline size={13}/>, cmd: 'underline', title: 'Underline (Ctrl+U)' },
        ].map(({ icon, cmd, title }) => (
          <button key={cmd} title={title}
            onMouseDown={e => { e.preventDefault(); document.execCommand(cmd, false); }}
            style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 5, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151' }}>
            {icon}
          </button>
        ))}
        <div style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 4px' }} />
        {[
          { icon: <AlignLeft size={13}/>, cmd: 'justifyLeft', title: 'Align Left' },
          { icon: <AlignCenter size={13}/>, cmd: 'justifyCenter', title: 'Align Center' },
          { icon: <AlignRight size={13}/>, cmd: 'justifyRight', title: 'Align Right' },
        ].map(({ icon, cmd, title }) => (
          <button key={cmd} title={title}
            onMouseDown={e => { e.preventDefault(); document.execCommand(cmd, false); }}
            style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 5, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151' }}>
            {icon}
          </button>
        ))}
        <div style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 4px' }} />
        <button title="Decrease font size" onMouseDown={e => { e.preventDefault();
          const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0); if (range.collapsed) return;
          const parent = range.commonAncestorContainer.parentElement;
          const cur = parent ? parseFloat(getComputedStyle(parent).fontSize) : 10;
          const span = document.createElement('span'); span.style.fontSize = `${Math.max(7, cur - 1)}px`;
          range.surroundContents(span);
        }} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 5, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151' }}>
          <Minus size={13}/>
        </button>
        <span style={{ fontSize: 11, color: '#94a3b8', padding: '0 2px' }}>Size</span>
        <button title="Increase font size" onMouseDown={e => { e.preventDefault();
          const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0); if (range.collapsed) return;
          const parent = range.commonAncestorContainer.parentElement;
          const cur = parent ? parseFloat(getComputedStyle(parent).fontSize) : 10;
          const span = document.createElement('span'); span.style.fontSize = `${Math.min(36, cur + 1)}px`;
          range.surroundContents(span);
        }} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 5, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151' }}>
          <Plus size={13}/>
        </button>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 4px' }} />
        <button title="Undo (Ctrl+Z)" onMouseDown={e => { e.preventDefault(); document.execCommand('undo', false); }}
          style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 5, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151' }}>
          <Undo size={13}/>
        </button>
        <button title="Redo (Ctrl+Y)" onMouseDown={e => { e.preventDefault(); document.execCommand('redo', false); }}
          style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 5, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151' }}>
          <Redo size={13}/>
        </button>
      </div>

      {/* Way Bill Paper — exact same template as way-bill/page.tsx */}
      <div ref={paperRef} style={{ background: '#fff', maxWidth: 960, margin: '24px auto', padding: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
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
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, width: '11%' }}>
                Origin
                <div contentEditable suppressContentEditableWarning data-field="origin" style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif' }}>{d.origin ?? ''}</div>
              </td>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, width: '13%' }}>
                Destination
                <div contentEditable suppressContentEditableWarning data-field="destination" style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif' }}>{d.destination ?? ''}</div>
              </td>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9 }}>
                Way Bill No. :
                <div contentEditable suppressContentEditableWarning data-field="wayBillNo" style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif' }}>{d.wayBillNo ?? ''}</div>
              </td>
            </tr>

            {/* ROW 3: Shipper + column headers */}
            <tr>
              <td rowSpan={3} colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', width: '26%' }}>
                <div style={{ fontSize: 9, color: '#555' }}>Shipper :</div>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 50, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}>{shipperText}</div>
              </td>
              <td rowSpan={3} style={{ border: '1px solid #000', padding: '3px 5px', width: '13%' }}>
                <div style={{ fontSize: 9, color: '#555' }}>Description of Goods</div>
                <div contentEditable suppressContentEditableWarning data-field="description" style={{ outline: 'none', minHeight: 50, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}>{d.description ?? ''}</div>
              </td>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, textAlign: 'center', width: '9%' }}>No. Pieces /<br />Packages</td>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, textAlign: 'center', width: '9%' }}>Actual Weight<br />in Kgs.</td>
              <td colSpan={3} style={{ border: '1px solid #000', textAlign: 'center', fontSize: 9 }}>Chargeable Dimensions in Cms</td>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, textAlign: 'center', width: '9%' }}>Weight in Kgs.</td>
            </tr>
            <tr>
              <EC style={{ textAlign: 'center' }} />
              <EC style={{ textAlign: 'center' }}>{(d as any).weight ? String((d as any).weight) : ''}</EC>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, textAlign: 'center' }}>
                Lx<div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontFamily: 'Arial, sans-serif', fontSize: 10 }}></div>
              </td>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, textAlign: 'center' }}>
                Bx<div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontFamily: 'Arial, sans-serif', fontSize: 10 }}></div>
              </td>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, textAlign: 'center' }}>
                H<div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontFamily: 'Arial, sans-serif', fontSize: 10 }}></div>
              </td>
              <EC style={{ textAlign: 'center' }} />
            </tr>
            <tr>
              <td colSpan={5} style={{ border: 'none' }}></td>
            </tr>

            {/* Shipper Phone */}
            <tr>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9 }}>
                Phone :
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif' }}>{party?.phone ?? ''}</div>
              </td>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, color: '#333' }}>Mode of Dispatch</td>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif', fontWeight: 'bold', textAlign: 'center' }}>AIR</div>
              </td>
              <EC colSpan={4} />
            </tr>

            {/* Consignee */}
            <tr>
              <td rowSpan={2} colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px' }}>
                <div style={{ fontSize: 9, color: '#555' }}>Consignee :</div>
                <div contentEditable suppressContentEditableWarning data-field="consignee" style={{ outline: 'none', minHeight: 40, fontSize: 10, fontFamily: 'Arial, sans-serif', whiteSpace: 'pre-wrap' }}>{d.consignee ?? ''}</div>
              </td>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, color: '#333' }}>Date of Delivery :<br />Details</td>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif', fontWeight: 'bold', textAlign: 'center' }}>AWB No.</div>
              </td>
              <EC colSpan={4} />
            </tr>
            <tr>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, color: '#333' }}>R/R No.</td>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif', fontWeight: 'bold', textAlign: 'center' }}>RAIL</div>
              </td>
              <EC colSpan={4} />
            </tr>

            {/* Consignee Phone + Invoice No */}
            <tr>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9 }}>
                Phone :
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif' }}></div>
              </td>
              <td colSpan={3} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9 }}>
                Invoice No.
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif' }}></div>
              </td>
              <td colSpan={4} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, textAlign: 'right' }}>
                Weight in Kgs.
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif', textAlign: 'right' }}>{(d as any).weight ? String((d as any).weight) : ''}</div>
              </td>
            </tr>

            {/* Value + Method of Packing */}
            <tr>
              <td colSpan={2} style={{ border: 'none' }}></td>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, color: '#333' }}>Value</td>
              <EC colSpan={2}>{d.value ? String(d.value) : ''}</EC>
              <td colSpan={4} style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9 }}>
                Method of Packing
                <div contentEditable suppressContentEditableWarning data-field="methodOfPacking" style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif' }}>{d.methodOfPacking ?? ''}</div>
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
                {[0,1,2].map(i => <div key={i} contentEditable suppressContentEditableWarning style={{ border: '1px solid #ccc', minHeight: 20, marginBottom: 3, outline: 'none', fontSize: 10, fontFamily: 'Arial, sans-serif' }}></div>)}
              </td>
              <td rowSpan={5} colSpan={2} style={{ border: '1px solid #000', padding: '4px 6px', fontSize: 9 }}>
                {(['Invoice', 'Modvat Copy', 'Any Other'] as const).map(label => (
                  <div key={label} style={{ marginBottom: 6 }}>
                    <div>{label}</div>
                    {[0,1].map(i => (
                      <div key={i} contentEditable suppressContentEditableWarning style={{ border: '1px solid #ccc', minHeight: 18, marginBottom: 2, outline: 'none', fontSize: 10, fontFamily: 'Arial, sans-serif' }}></div>
                    ))}
                  </div>
                ))}
              </td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, color: '#333' }}>Receiver&apos;s Name :</td>
              <EC colSpan={2} />
            </tr>
            <tr>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, color: '#333' }}>Date :</td>
              <EC colSpan={2}>{d.bookingDate}</EC>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, color: '#333' }}>Time :</td>
              <EC colSpan={2} />
            </tr>
            <tr>
              <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: 9, color: '#333' }}>Signature</td>
              <EC colSpan={2} style={{ minHeight: 28 }} />
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
                ENCLOSURE
                <div contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 14, fontSize: 10, fontFamily: 'Arial, sans-serif', display: 'inline-block', minWidth: 200 }}></div>
              </td>
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DocketEditorPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Arial' }}>Loading…</div>}>
      <DocketEditorInner />
    </Suspense>
  );
}
