'use client';
import { useState, useRef, useCallback, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Download, Search, X, Plus, CheckCircle, Edit2, Printer, Trash2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import toast from 'react-hot-toast';
import { finalizeInvoice, cancelInvoice, deleteInvoices, updateInvoiceLine, addInvoiceLine, generateInvoiceFromAwb, generateInvoiceFromDocket } from '@/lib/actions/invoices';
import { shortName, fmtDate } from '@/lib/utils';
import BankDetailsPanel from '@/components/BankDetailsPanel';
import { CreatorAvatar } from '@/components/CreatorAvatar';
import { useSharedData, type DbInvoice } from '@/lib/useSharedData';
import { LiveIndicator } from '@/components/LiveIndicator';

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatBookingRefList(ref: string) {
  if (!ref) return '—';
  const parts = ref.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length <= 3) return ref;
  return `${parts.slice(0, 3).join(', ')} ... (+${parts.length - 3} more)`;
}

// ── Number to words (Indian system) ──────────────────────────────────────────
function numberToWords(num: number): string {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (num === 0) return 'Zero';
  function convert(n: number): string {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10?' '+ones[n%10]:'');
    if (n < 1000) return ones[Math.floor(n/100)]+' Hundred'+(n%100?' '+convert(n%100):'');
    if (n < 100000) return convert(Math.floor(n/1000))+' Thousand'+(n%1000?' '+convert(n%1000):'');
    if (n < 10000000) return convert(Math.floor(n/100000))+' Lakh'+(n%100000?' '+convert(n%100000):'');
    return convert(Math.floor(n/10000000))+' Crore'+(n%10000000?' '+convert(n%10000000):'');
  }
  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart)*100);
  let result = convert(intPart);
  if (decPart > 0) result += ' and Paise '+convert(decPart);
  return result+' Only';
}

// ── Triveni-style Invoice Print ───────────────────────────────────────────────
type CompanyInfo = { name:string; address:string; gstin:string; pan:string; tan:string; stax:string; cin:string; phone:string; email:string; regdOffice:string };
type PartyInfo = { gstin:string; address:string; pos:string; billingPeriod:string };

function printTriveniInvoice(inv: DbInvoice, companyInfo: CompanyInfo, partyInfo?: PartyInfo, bank?: {bank_name:string;account_name:string;account_number:string;ifsc:string;branch:string}) {
  const igstRate = inv.lines[0]?.taxRate || 18;
  const taxableAmt = inv.subtotal;
  const igstAmt = inv.gstTotal;
  const grandTotal = inv.grandTotal;
  const amtWords = numberToWords(Math.round(grandTotal));

  // Parse each line: try to extract AWB-style fields from description
  // description format: "Airfreight DEL→BLR · 250 kg @ ₹90/kg"
  const rowsHtml = inv.lines.map((line, i) => {
    const m = line.description.match(/([A-Z]{3})[→\-]([A-Z]{3}).*?(\d+)\s*kg\s*@\s*₹?([\d.]+)/i);
    const origin  = m ? m[1] : inv.bookingRef.split('-')[0] || 'DEL';
    const dest    = m ? m[2] : '';
    const boxes   = m ? m[3] : String(line.qty);
    const chgWt   = m ? m[3] : String(line.qty);
    const rate    = m ? m[4] : String(line.rate);
    const freight = fmtN(line.amount);
    const awbNo   = i === 0 ? inv.bookingRef : '';
    const date    = i === 0 ? inv.invoiceDate.replace(/\d{4}-/, '').replace('-', '/') : '';
    const tspAmt  = i === 0 ? fmtN(inv.lines.reduce((s,l,idx) => idx > 0 ? s + l.amount : s, 0)) : '0';
    const taxable = i === 0 ? fmtN(taxableAmt) : fmtN(line.amount);
    return `<tr>
      <td style="border:1px solid #000;padding:4px 6px;text-align:center">${i+1}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:center">${origin}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:center">${awbNo}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:center">${date}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:center">${dest}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:center">${boxes}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:center">${chgWt}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:right">${rate}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:right">${freight}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:right">0.00</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:right">0.00</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:right">0</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:right">${tspAmt}</td>
      <td style="border:1px solid #000;padding:4px 6px;text-align:right">${taxable}</td>
    </tr>`;
  }).join('');

  // Totals across all lines
  const totalBoxes  = inv.lines.reduce((s,l) => s + l.qty, 0);
  const totalChgWt  = inv.lines.reduce((s,l) => s + l.qty, 0);
  const totalFreight = inv.lines.reduce((s,l,i) => i===0 ? s+l.amount : s, 0);
  const totalTSP    = inv.lines.reduce((s,l,i) => i>0 ? s+l.amount : s, 0);

  const pInfo = partyInfo || { gstin:'', address:'', pos:'DELHI', billingPeriod:'' };
  const billDate = inv.invoiceDate.split('-').reverse().join('.');

  const logoUrl = `${window.location.origin}/logo.png`;
  const html = `<!DOCTYPE html>
<html>
<head>
  <title> </title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:10.5px;color:#000;padding:18px;position:relative}
    .co-name{font-size:20px;font-weight:bold;text-align:center;letter-spacing:.5px}
    .co-sub{font-size:10px;font-weight:bold;text-align:center;margin:1px 0}
    .co-bold{font-size:10.5px;font-weight:bold;text-align:center;margin:2px 0}
    .title{text-align:center;font-size:12px;font-weight:bold;text-decoration:underline;margin:6px 0 5px}
    table{width:100%;border-collapse:collapse}
    th{border:1px solid #000;padding:4px 5px;background:#f0f0f0;font-size:9.5px;text-align:center;font-weight:bold}
    td{font-size:10px;vertical-align:middle}
    @media print{@page{size:A4 landscape;margin:8mm 8mm 0 8mm}body{padding:0}html{-webkit-print-color-adjust:exact}}
  </style>
</head>
<body>
  <!-- HEADER -->
  <div style="display:flex;align-items:center;margin-bottom:6px">
    <div style="width:130px;display:flex;justify-content:center;flex-shrink:0">
      <img src="${logoUrl}" alt="Triveni" style="width:90px;height:90px;object-fit:contain" />
    </div>
    <div style="flex:1;text-align:center">
      <div class="co-name">${companyInfo.name}</div>
      <div class="co-sub">Domestic Air Cargo &amp; Rail Agent</div>
      <div class="co-sub">${companyInfo.address}</div>
      <div class="co-sub">Tel. : ${companyInfo.phone}</div>
      <div class="co-bold">GSTIN: ${companyInfo.gstin} , CIN: ${companyInfo.cin}</div>
      <div class="co-sub">${companyInfo.regdOffice}</div>
      <div class="co-sub">Email : ${companyInfo.email}</div>
    </div>
    <div style="width:130px;display:flex;justify-content:center;flex-shrink:0">
      <img src="${window.location.origin}/iata.png" alt="IATA" style="width:130px;height:90px;object-fit:contain" />
    </div>
  </div>

  <div class="title" style="text-align:center">TAX INVOICE</div>

  <!-- PARTY + BILL INFO -->
  <table style="margin-bottom:5px">
    <tr>
      <td style="width:58%;border:1px solid #000;padding:5px 7px;vertical-align:top">
        <div><strong>M/s :</strong> &nbsp;<strong>${inv.partyName}</strong></div>
        <div style="margin-top:2px"><strong>GSTIN :</strong> &nbsp;${pInfo.gstin || '—'}</div>
        <div style="margin-top:2px"><strong>Address :</strong> &nbsp;${pInfo.address || '—'}</div>
      </td>
      <td style="width:42%;border:1px solid #000;padding:5px 7px;vertical-align:top">
        <table style="width:100%;border:none">
          <tr><td style="border:none;padding:1px 0;width:50%"><strong>Bill No. :</strong></td><td style="border:none;padding:1px 0">${inv.invoiceNo}</td></tr>
          <tr><td style="border:none;padding:1px 0"><strong>Bill Date :</strong></td><td style="border:none;padding:1px 0">${billDate}</td></tr>
          <tr><td style="border:none;padding:1px 0"><strong>POS :</strong></td><td style="border:none;padding:1px 0">${pInfo.pos}</td></tr>
          <tr><td style="border:none;padding:1px 0"><strong>Billing Period From :</strong></td><td style="border:none;padding:1px 0">${pInfo.billingPeriod || inv.invoiceDate + ' to ' + inv.dueDate}</td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="border:1px solid #000;padding:4px 7px" colspan="2">
        <strong>SAC Code :</strong> &nbsp;996531
      </td>
    </tr>
  </table>

  <!-- AWB TABLE -->
  <table style="margin-bottom:5px">
    <thead>
      <tr>
        <th style="width:3%">Sl#</th>
        <th style="width:5%">Origin</th>
        <th style="width:10%">AWB#/Ref.<br/>Number</th>
        <th style="width:7%">Date</th>
        <th style="width:7%">Dest#</th>
        <th style="width:5%">Boxes</th>
        <th style="width:7%">Charg.<br/>Weight</th>
        <th style="width:5%">Rate</th>
        <th style="width:9%">Freight</th>
        <th style="width:7%">AWB &amp;<br/>DO</th>
        <th style="width:7%">Due<br/>Carrier</th>
        <th style="width:8%">Forwrd &amp;<br/>Others</th>
        <th style="width:7%">TSP &amp;<br/>Others</th>
        <th style="width:9%">Taxable<br/>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr style="font-weight:bold;background:#f8f8f8">
        <td colspan="4" style="border:1px solid #000;padding:4px 6px;text-align:right;font-weight:bold">Grand Total</td>
        <td style="border:1px solid #000;padding:4px 6px;text-align:center"></td>
        <td style="border:1px solid #000;padding:4px 6px;text-align:center">${totalBoxes}</td>
        <td style="border:1px solid #000;padding:4px 6px;text-align:center">${totalChgWt}</td>
        <td style="border:1px solid #000;padding:4px 6px"></td>
        <td style="border:1px solid #000;padding:4px 6px;text-align:right">${fmtN(totalFreight)}</td>
        <td style="border:1px solid #000;padding:4px 6px;text-align:right">0.00</td>
        <td style="border:1px solid #000;padding:4px 6px;text-align:right">0.00</td>
        <td style="border:1px solid #000;padding:4px 6px;text-align:right">0</td>
        <td style="border:1px solid #000;padding:4px 6px;text-align:right">${fmtN(totalTSP)}</td>
        <td style="border:1px solid #000;padding:4px 6px;text-align:right">${fmtN(taxableAmt)}</td>
      </tr>
    </tbody>
  </table>

  <!-- AMOUNT IN WORDS + BANK + TAX SUMMARY -->
  <table style="margin-bottom:5px">
    <tr>
      <td style="width:58%;border:1px solid #000;padding:5px 7px;vertical-align:top">
        <div><strong>Amount in Words :</strong> &nbsp;Rupees ${amtWords}</div>
        <div style="margin-top:8px"><strong>Bank</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: &nbsp;${bank?.bank_name ?? 'YES BANK Ltd.'}</div>
        <div><strong>Account No.</strong> &nbsp;&nbsp;&nbsp;&nbsp;: &nbsp;${bank?.account_number ?? '008463700000641'}</div>
        <div><strong>IFSC Code</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: &nbsp;${bank?.ifsc ?? 'YESB0000283'}</div>
        <div><strong>Branch</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: &nbsp;${bank?.branch ?? 'Vasant Kunj, New Delhi'}</div>
        <div><strong>A/c Name</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: &nbsp;${bank?.account_name ?? 'TRIVENI CARGO EXPRESS INDIA PVT LTD'}</div>
      </td>
      <td style="width:42%;border:1px solid #000;padding:0;vertical-align:top">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="border-bottom:1px solid #000;border-right:1px solid #000;padding:4px 7px"><strong>Total Taxable Amount</strong></td>
            <td style="border-bottom:1px solid #000;padding:4px 7px;text-align:right"><strong>:</strong></td>
            <td style="border-bottom:1px solid #000;padding:4px 7px;text-align:right">${fmtN(taxableAmt)}</td>
          </tr>
          <tr>
            <td style="border-bottom:1px solid #000;border-right:1px solid #000;padding:4px 7px">SGST @ 9%</td>
            <td style="border-bottom:1px solid #000;padding:4px 7px;text-align:right">:</td>
            <td style="border-bottom:1px solid #000;padding:4px 7px;text-align:right">0.00</td>
          </tr>
          <tr>
            <td style="border-bottom:1px solid #000;border-right:1px solid #000;padding:4px 7px">CGST @ 9%</td>
            <td style="border-bottom:1px solid #000;padding:4px 7px;text-align:right">:</td>
            <td style="border-bottom:1px solid #000;padding:4px 7px;text-align:right">0.00</td>
          </tr>
          <tr>
            <td style="border-bottom:1px solid #000;border-right:1px solid #000;padding:4px 7px">IGST @ ${igstRate}%</td>
            <td style="border-bottom:1px solid #000;padding:4px 7px;text-align:right">:</td>
            <td style="border-bottom:1px solid #000;padding:4px 7px;text-align:right">${fmtN(igstAmt)}</td>
          </tr>
          <tr>
            <td style="border-right:1px solid #000;padding:4px 7px"><strong>Net Payable Amount</strong></td>
            <td style="padding:4px 7px;text-align:right"><strong>:</strong></td>
            <td style="padding:4px 7px;text-align:right"><strong>${fmtN(grandTotal)}</strong></td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- BANK DETAILS -->
  <div style="font-size:9.5px;border:1px solid #000;padding:4px 7px;margin-bottom:5px">
    ${bank
      ? `<strong>${bank.bank_name},</strong> A/c Name: ${bank.account_name}, A/C No. - ${bank.account_number}, IFSC Code - ${bank.ifsc}, Branch - ${bank.branch}`
      : `<strong>YES BANK Ltd.,</strong> A/c Name: TRIVENI CARGO EXPRESS INDIA PVT LTD, A/C No. - 008463700000641, IFSC Code - YESB0000283, Branch - Vasant Kunj, New Delhi`
    }
  </div>

  <!-- NOTES + SIGNATURE -->
  <table style="border:none">
    <tr>
      <td style="width:60%;border:none;vertical-align:top;padding-right:10px">
        <div style="font-size:10px"><strong>NOTES :</strong></div>
        <ul style="font-size:9.5px;margin-top:3px;padding-left:16px;line-height:1.6">
          <li>1. DIFFERENCE, IF ANY, MAY BE NOTIFIED WITHIN 3 DAYS OF RECEIPT.</li>
          <li>2. PLEASE PAY YOUR BILL AMOUNT WITHIN 15 DAYS OF RECEIPT.</li>
          <li>3. INTEREST AT 24% P.A. WILL BE CHARGED IF THE BILL IS NOT PAID WITHIN THE STIPULATED TIME.</li>
          <li>4. PAYMENT SHOULD BE MADE BY A/C PAYEE CHEQUE OR DD IN FAVOUR OF <strong>TRIVENI CARGO EXPRESS INDIA PVT LTD.</strong></li>
          <li>5. JURISDICTION: ALL DISPUTES ARISING UNDER THIS BILL SHALL BE SUBJECT TO BE UNDER NEW DELHI JURISDICTION.</li>
          <li>6. PAN          AAGCT2294N</li>
          <li>7. Tan NO   DELT14067E</li>
          <li>8. S. Tax.      AAGCT2294NSD001</li>
        </ul>
      </td>
      <td style="width:40%;border:none;vertical-align:bottom;text-align:right;padding-top:10px">
        <div style="font-size:10px">For <strong>${companyInfo.name}</strong></div>
        <div style="margin-top:40px;font-size:10px">Authorised Signatory</div>
      </td>
    </tr>
  </table>
<script>window.onload=function(){window.print();}<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'width=1100,height=800');
  if (!win) { toast.error('Popup blocked. Allow popups to print invoice.'); URL.revokeObjectURL(url); return; }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const STATUS_COLORS: Record<string, [string, string]> = {
  DRAFT:['#94a3b8','#f8fafc'], REVIEWED:['#7c3aed','#f5f3ff'], FINALIZED:['#2563eb','#eff6ff'],
  SENT:['#0891b2','#ecfeff'], PARTIALLY_PAID:['#d97706','#fffbeb'],
  PAID:['#059669','#ecfdf5'], CANCELLED:['#dc2626','#fef2f2'], OVERDUE:['#ea580c','#fff7ed'],
};

function InvBadge({ status }: { status: string }) {
  const [c,bg] = STATUS_COLORS[status]||['#64748b','#f8fafc'];
  return <span style={{padding:'2px 9px',borderRadius:99,fontSize:10,fontWeight:600,color:c,background:bg,border:`1px solid ${c}30`,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.07em',whiteSpace:'nowrap'}}>{status.replace('_',' ')}</span>;
}

export default function InvoicesPage() {
  const { invoices, parties, awbBookings: awb, docketBookings: dockets, refresh } = useSharedData();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Company info for invoice printing (matches Triveni Cargo format)
  const companyInfo = {
    name: 'TRIVENI CARGO EXPRESS INDIA PVT LTD',
    address: 'Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15, Mahipalpur Extension, New Delhi, Delhi 110037',
    gstin: '07AAGCT2294N2ZR',
    pan: 'AAGCT2294N',
    tan: 'DELT14067E',
    stax: 'AAGCT2294NSD001',
    cin: 'U74999DL2017PTC316659',
    phone: '011-65809456, 9311389456',
    email: 'info@tceipl.com',
    regdOffice: 'Regd. Office: Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15, Mahipalpur Extension, New Delhi, Delhi 110037, near Hotel City Centre',
  };

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [partyFilter, setPartyFilter] = useState('ALL');
  const [viewInvoice, setViewInvoice] = useState<typeof invoices[0]|null>(null);
  const [editingLine, setEditingLine] = useState<string|null>(null);
  const [editVals, setEditVals] = useState<{description:string;qty:number;rate:number;taxRate:number}>({description:'',qty:1,rate:0,taxRate:18});
  const [banks, setBanks] = useState<{id:string;account_name:string;bank_name:string;branch:string;account_number:string;ifsc:string;is_default:number}[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');

  useEffect(() => {
    fetch('/api/banks').then(r=>r.json()).then(data => {
      setBanks(data);
      const def = data.find((b: {is_default:number}) => b.is_default === 1);
      if (def) setSelectedBankId(def.id);
    }).catch(()=>{});
  }, []);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showBulkInv, setShowBulkInv] = useState(false);
  const [genBookingType, setGenBookingType] = useState<'AWB'|'DOCKET'>('AWB');
  const [genBookingId, setGenBookingId] = useState('');

  // ── Multi-select / delete state ──────────────────────────────────────────
  const [selectMode, setSelectMode]         = useState(false);
  const [selected, setSelected]             = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  const enterSelectMode = useCallback(() => { setSelectMode(true); }, []);
  function handleRowPointerDown(id: string) {
    longPressTimer.current = setTimeout(() => { enterSelectMode(); setSelected(new Set([id])); }, 500);
  }
  function handleRowPointerUp() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }
  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSelectAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(i => i.id)));
  }
  function exitSelectMode() { setSelectMode(false); setSelected(new Set()); }
  function confirmDelete() {
    const deletedIds = new Set(selected);
    setShowDeleteConfirm(false);
    startTransition(async () => {
      const res = await deleteInvoices([...deletedIds]);
      if (res && 'error' in res) {
        toast.error(res.error as string);
        // Don't exit select mode so user can adjust selection
      } else {
        exitSelectMode();
        const r = res as { deleted?: number; awbReset?: number; docketReset?: number };
        const bookingsReset = (r.awbReset ?? 0) + (r.docketReset ?? 0);
        if (bookingsReset > 0) {
          toast.success(`${r.deleted ?? deletedIds.size} invoice${(r.deleted ?? deletedIds.size) > 1 ? 's' : ''} deleted · ${bookingsReset} booking${bookingsReset > 1 ? 's' : ''} unlocked for re-invoicing`);
        } else {
          toast.success(`${r.deleted ?? deletedIds.size} invoice${(r.deleted ?? deletedIds.size) > 1 ? 's' : ''} deleted`);
        }
        refresh();
      }
    });
  }

  const filtered = invoices.filter(i =>
    (i.invoiceNo.toLowerCase().includes(search.toLowerCase()) || i.partyName.toLowerCase().includes(search.toLowerCase()) || i.bookingRef.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter==='ALL' || i.status===statusFilter) &&
    (partyFilter==='ALL' || i.partyName===partyFilter) &&
    (!dateFrom || i.invoiceDate >= dateFrom) &&
    (!dateTo   || i.invoiceDate <= dateTo)
  );

  const unbilledAwb = awb.filter(b => b.status==='BOOKED');
  const unbilledDkt = dockets.filter(b => b.status==='BOOKED');

  function startEditLine(line: DbInvoice['lines'][0]) {
    setEditingLine(line.id);
    setEditVals({ description:line.description, qty:line.qty, rate:line.rate, taxRate:line.taxRate });
  }
  function saveEditLine(invoiceId: string, lineId: string) {
    startTransition(async () => {
      await updateInvoiceLine(invoiceId, lineId, editVals);
      setEditingLine(null);
      toast.success('Line updated');
    });
  }

  function handleGenerate() {
    if (!genBookingId) { toast.error('Select a booking'); return; }
    startTransition(async () => {
      const res = genBookingType==='AWB'
        ? await generateInvoiceFromAwb(genBookingId)
        : await generateInvoiceFromDocket(genBookingId);
      if (res && 'error' in res) toast.error(res.error as string);
      else if (res && 'invoiceNo' in res) { toast.success(`Invoice ${res.invoiceNo} generated`); setShowGenerate(false); setGenBookingId(''); refresh(); }
    });
  }

  return (
    <div className="animate-fadeIn">
      <BankDetailsPanel />
      {/* Toolbar */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:9, marginBottom:14, alignItems:'center' }}>
        <LiveIndicator onRefresh={refresh} />
        {selectMode ? (
          <>
            <span style={{fontSize:12,color:'var(--text-secondary)',alignSelf:'center',fontWeight:600}}>{selected.size} selected</span>
            <button className="btn btn-secondary btn-sm" onClick={exitSelectMode}>Cancel</button>
            <button className="btn btn-danger btn-sm" disabled={selected.size===0} onClick={()=>setShowDeleteConfirm(true)}><Trash2 size={12}/> Delete ({selected.size})</button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary btn-sm" onClick={()=>setShowBulkInv(true)}><Download size={12}/> Bulk Download</button>
            <button className="btn btn-primary btn-sm" onClick={()=>setShowGenerate(true)}><Plus size={12}/> Generate Invoice</button>
          </>
        )}
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:16}}>
        {['DRAFT','FINALIZED','PARTIALLY_PAID','PAID','OVERDUE'].map(s=>{
          const [c] = STATUS_COLORS[s]||['#64748b'];
          const count = invoices.filter(i=>i.status===s).length;
          const total = invoices.filter(i=>i.status===s).reduce((a,i)=>a+i.grandTotal,0);
          return (
            <div key={s} style={{background:'var(--surface-base)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 14px'}}>
              <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{s.replace('_',' ')}</div>
              <div style={{fontSize:18,fontWeight:800,fontFamily:'var(--font-mono)',color:c}}>{count}</div>
              <div style={{fontSize:10,color:'var(--text-muted)'}}>{count>0?`₹${(total/1000).toFixed(0)}K total`:''}</div>
            </div>
          );
        })}
      </div>

      <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
        <div style={{position:'relative',flex:1,minWidth:180}}>
          <Search size={12} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
          <input className="input" placeholder="Search invoice, party, booking ref…" style={{paddingLeft:30,height:36,fontSize:12}} value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="input" style={{width:160,height:36,fontSize:12}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="ALL">All Status</option>
          {['DRAFT','REVIEWED','FINALIZED','SENT','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED'].map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
        <select className="input" style={{width:170,height:36,fontSize:12}} value={partyFilter} onChange={e=>setPartyFilter(e.target.value)}>
          <option value="ALL">All Companies</option>
          {[...new Set(invoices.map(i=>i.partyName))].sort().map(n=>(
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:12,color:'var(--text-muted)',whiteSpace:'nowrap'}}>From:</span>
          <input className="input" type="date" style={{height:36,fontSize:12,width:140}} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:12,color:'var(--text-muted)',whiteSpace:'nowrap'}}>To:</span>
          <input className="input" type="date" style={{height:36,fontSize:12,width:140}} value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
        </div>
        {(dateFrom||dateTo) && (
          <button className="btn btn-secondary btn-sm" onClick={()=>{setDateFrom('');setDateTo('');}}>✕ Clear</button>
        )}
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {selectMode && (
                  <th style={{width:36,padding:'9px 10px'}}>
                    <input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={toggleSelectAll}
                      style={{width:15,height:15,cursor:'pointer',accentColor:'var(--accent)'}}/>
                  </th>
                )}
                <th>Invoice No.</th><th>Party</th><th>Booking Ref</th><th>Type</th>
                <th>Date</th><th>Due Date</th>
                <th style={{textAlign:'right'}}>Subtotal</th><th style={{textAlign:'right'}}>GST</th>
                <th style={{textAlign:'right'}}>Total</th><th style={{textAlign:'right'}}>Paid</th>
                <th style={{textAlign:'right'}}>Outstanding</th><th>Status</th><th style={{textAlign:'center'}}>By</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={selectMode?14:13} style={{textAlign:'center',padding:'36px 0',color:'var(--text-muted)'}}>No invoices</td></tr>}
              {filtered.map(inv=>(
                <tr key={inv.id}
                  style={{background: selected.has(inv.id) ? 'rgba(239,68,68,0.06)' : undefined, cursor: selectMode ? 'pointer' : undefined}}
                  onPointerDown={()=>handleRowPointerDown(inv.id)}
                  onPointerUp={handleRowPointerUp}
                  onPointerLeave={handleRowPointerUp}
                  onClick={selectMode ? ()=>toggleSelect(inv.id) : undefined}
                >
                  {selectMode && (
                    <td style={{padding:'0 10px'}} onClick={e=>{e.stopPropagation();toggleSelect(inv.id);}}>
                      <input type="checkbox" checked={selected.has(inv.id)} onChange={()=>toggleSelect(inv.id)}
                        style={{width:15,height:15,cursor:'pointer',accentColor:'var(--accent)'}}/>
                    </td>
                  )}
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700,color:'var(--accent-dark)',cursor:'pointer'}} onClick={()=>setViewInvoice(inv)}>{inv.invoiceNo}</span></td>
                  <td style={{fontWeight:500}} title={inv.partyName}>{shortName(inv.partyName)}</td>
                  <td title={inv.bookingRef} style={{maxWidth:250,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{formatBookingRefList(inv.bookingRef)}</span></td>
                  <td><span className={`badge ${inv.bookingType==='AWB'?'badge-blue':'badge-purple'}`}>{inv.bookingType}</span></td>
                  <td style={{fontSize:12,color:'var(--text-muted)'}}>{fmtDate(inv.invoiceDate)}</td>
                  <td style={{fontSize:12,color:new Date(inv.dueDate)<new Date()&&inv.status!=='PAID'?'#dc2626':'var(--text-muted)'}}>{inv.dueDate}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12}}>{fmt(inv.subtotal)}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text-muted)'}}>{fmt(inv.gstTotal)}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700}}>{fmt(inv.grandTotal)}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'#059669'}}>{fmt(inv.paidTotal)}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700,color:inv.outstandingTotal>0?'#dc2626':'#059669'}}>{fmt(inv.outstandingTotal)}</td>
                  <td><InvBadge status={inv.status}/></td>
                  <td style={{textAlign:'center'}}><CreatorAvatar userId={(inv as {createdBy?:string|null}).createdBy} createdAt={inv.createdAt} /></td>
                  <td style={{display:'flex',gap:4,flexWrap:'nowrap'}}>
                    {!selectMode && <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px'}} onClick={e=>{e.stopPropagation();setViewInvoice(inv);}}>View</button>}
                    {!selectMode && <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px',color:'#7c3aed'}} title="Open full editor in new tab" onClick={e=>{e.stopPropagation();window.open(`/dashboard/invoices/editor?id=${inv.id}`,'_blank');}}>✏️ Edit</button>}
                    {!selectMode && <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px'}} onClick={e=>{e.stopPropagation();router.push(`/dashboard/invoices/editor?id=${inv.id}`);}} title="Open Editor / Print">🖨️</button>}
                    {!selectMode && <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px',color:'#d97706'}} onClick={e=>{e.stopPropagation();router.push(`/dashboard/invoices/musashi?id=${inv.id}`);}} title="Musashi Format">📋 Musashi</button>}
                    {!selectMode && inv.status==='DRAFT'&&<button className="btn btn-success btn-sm" style={{fontSize:11,padding:'3px 8px'}} onClick={e=>{e.stopPropagation();startTransition(async()=>{await finalizeInvoice(inv.id);toast.success('Invoice finalized');});}}>Finalize</button>}
                    {!selectMode && ['DRAFT','REVIEWED'].includes(inv.status)&&<button className="btn btn-danger btn-sm" style={{fontSize:11,padding:'3px 8px'}} onClick={e=>{e.stopPropagation();startTransition(async()=>{await cancelInvoice(inv.id);toast('Invoice cancelled',{icon:'🚫'});});}}>Cancel</button>}
                    {!selectMode && <button className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 6px',color:'#dc2626'}} title="Delete"
                      onClick={e=>{e.stopPropagation();setSelected(new Set([inv.id]));setShowDeleteConfirm(true);}}>
                      <Trash2 size={11}/>
                    </button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Invoice Modal */}
      {showGenerate && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:460}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 style={{fontSize:16,fontWeight:800}}>Generate Invoice</h2>
              <button className="btn btn-ghost btn-icon" onClick={()=>setShowGenerate(false)}><X size={16}/></button>
            </div>
            <div className="form-group" style={{marginBottom:12}}>
              <label className="label">Booking Type</label>
              <div style={{display:'flex',gap:8}}>
                {(['AWB','DOCKET'] as const).map(t=>(
                  <button key={t} type="button" className={`btn ${genBookingType===t?'btn-primary':'btn-secondary'}`} style={{flex:1}} onClick={()=>{setGenBookingType(t);setGenBookingId('');}}>
                    {t} Booking
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group" style={{marginBottom:20}}>
              <label className="label">Select Booking *</label>
              <select className="input" value={genBookingId} onChange={e=>setGenBookingId(e.target.value)}>
                <option value="">Choose un-invoiced booking…</option>
                {genBookingType==='AWB'
                  ? unbilledAwb.map(b=><option key={b.id} value={b.id}>{b.awbNo} · {b.partyName} · ₹{b.totalAmount.toLocaleString('en-IN')}</option>)
                  : unbilledDkt.map(b=><option key={b.id} value={b.id}>{b.docketNo} · {b.partyName} · ₹{b.totalAmount.toLocaleString('en-IN')}</option>)
                }
              </select>
              {genBookingType==='AWB'&&unbilledAwb.length===0&&<div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>No un-invoiced AWB bookings</div>}
              {genBookingType==='DOCKET'&&unbilledDkt.length===0&&<div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>No un-invoiced docket bookings</div>}
            </div>
            <div style={{background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:12,color:'var(--info)'}}>
              ℹ️ Invoice date will be set to <strong>today</strong> ({new Date().toLocaleDateString('en-IN')}) per business rules.
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn btn-secondary" onClick={()=>setShowGenerate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleGenerate}><CheckCircle size={13}/> Generate Invoice</button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Drawer */}
      {viewInvoice && (
        <>
          <div className="drawer-overlay" onClick={()=>setViewInvoice(null)}/>
          <div className="drawer">
            <div style={{padding:'20px 24px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:16,fontWeight:800,fontFamily:'var(--font-mono)'}}>{viewInvoice.invoiceNo}</div>
                <div style={{fontSize:12,color:'var(--text-muted)'}}>{viewInvoice.partyName} · {viewInvoice.invoiceDate}</div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={()=>setViewInvoice(null)}><X size={16}/></button>
            </div>
            <div style={{padding:24}}>
              {/* Status & dates */}
              <div style={{display:'flex',gap:10,marginBottom:16}}>
                <InvBadge status={viewInvoice.status}/>
                <span style={{fontSize:12,color:'var(--text-muted)'}}>Due: {viewInvoice.dueDate}</span>
              </div>

              {/* Line items */}
              <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Line Items</div>
              <div style={{border:'1px solid var(--border)',borderRadius:10,overflow:'hidden',marginBottom:16}}>
                <table style={{width:'100%'}}>
                  <thead>
                    <tr style={{background:'var(--surface-page)',borderBottom:'1px solid var(--border)'}}>
                      <th style={{padding:'8px 12px',textAlign:'left',fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Description</th>
                      <th style={{padding:'8px 12px',textAlign:'right',fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Qty</th>
                      <th style={{padding:'8px 12px',textAlign:'right',fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Rate</th>
                      <th style={{padding:'8px 12px',textAlign:'right',fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em'}}>GST%</th>
                      <th style={{padding:'8px 12px',textAlign:'right',fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Total</th>
                      {['DRAFT','REVIEWED'].includes(viewInvoice.status)&&<th style={{padding:'8px 12px',fontSize:10}}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {viewInvoice.lines.map((line,i)=>(
                      <tr key={line.id} style={{borderBottom: i<viewInvoice.lines.length-1?'1px solid var(--border)':'none'}}>
                        {editingLine===line.id ? (
                          <>
                            <td style={{padding:'6px 8px'}}><input className="input" style={{fontSize:12,height:30}} value={editVals.description} onChange={e=>setEditVals(v=>({...v,description:e.target.value}))}/></td>
                            <td style={{padding:'6px 8px'}}><input className="input" style={{fontSize:12,height:30,textAlign:'right',fontFamily:'var(--font-mono)'}} type="number" value={editVals.qty} onChange={e=>setEditVals(v=>({...v,qty:parseFloat(e.target.value)||0}))}/></td>
                            <td style={{padding:'6px 8px'}}><input className="input" style={{fontSize:12,height:30,textAlign:'right',fontFamily:'var(--font-mono)'}} type="number" value={editVals.rate} onChange={e=>setEditVals(v=>({...v,rate:parseFloat(e.target.value)||0}))}/></td>
                            <td style={{padding:'6px 8px'}}><input className="input" style={{fontSize:12,height:30,textAlign:'right',fontFamily:'var(--font-mono)'}} type="number" value={editVals.taxRate} onChange={e=>setEditVals(v=>({...v,taxRate:parseFloat(e.target.value)||0}))}/></td>
                            <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12}}>₹{((editVals.qty*editVals.rate)*(1+editVals.taxRate/100)).toFixed(0)}</td>
                            <td style={{padding:'6px 8px',display:'flex',gap:4}}>
                              <button className="btn btn-primary btn-sm" style={{fontSize:10}} onClick={()=>saveEditLine(viewInvoice.id,line.id)}>Save</button>
                              <button className="btn btn-ghost btn-sm" style={{fontSize:10}} onClick={()=>setEditingLine(null)}>×</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{padding:'9px 12px',fontSize:12}}>{line.description}</td>
                            <td style={{padding:'9px 12px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12}}>{line.qty}</td>
                            <td style={{padding:'9px 12px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12}}>₹{line.rate}</td>
                            <td style={{padding:'9px 12px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text-muted)'}}>{line.taxRate}%</td>
                            <td style={{padding:'9px 12px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,fontWeight:700}}>{fmt(line.lineTotal)}</td>
                            {['DRAFT','REVIEWED'].includes(viewInvoice.status)&&<td style={{padding:'9px 8px'}}><button className="btn btn-ghost btn-icon" style={{padding:'3px'}} onClick={()=>startEditLine(line)}><Edit2 size={12}/></button></td>}
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div style={{background:'var(--surface-sunken)',borderRadius:10,padding:'14px 16px',marginBottom:16}}>
                {[
                  {label:'Subtotal', val:fmt(viewInvoice.subtotal)},
                  {label:`GST (18%)`, val:fmt(viewInvoice.gstTotal)},
                  {label:'Grand Total', val:fmt(viewInvoice.grandTotal), bold:true, big:true},
                  {label:'Paid', val:fmt(viewInvoice.paidTotal), color:'#059669'},
                  {label:'Outstanding', val:fmt(viewInvoice.outstandingTotal), color:viewInvoice.outstandingTotal>0?'#dc2626':'#059669', bold:true},
                ].map(row=>(
                  <div key={row.label} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid var(--border)'}}>
                    <span style={{fontSize:12,color:'var(--text-secondary)'}}>{row.label}</span>
                    <span style={{fontFamily:'var(--font-mono)',fontWeight:row.bold?800:600,fontSize:row.big?16:13,color:row.color||'var(--text-primary)'}}>{row.val}</span>
                  </div>
                ))}
              </div>

              {/* Bank selector + Actions */}
              {banks.length > 0 && (
                <div style={{marginBottom:10}}>
                  <label style={{fontSize:11,color:'var(--text-muted)',display:'block',marginBottom:4}}>Bank Account for Invoice</label>
                  <select className="input" style={{fontSize:12,height:34}} value={selectedBankId} onChange={e=>setSelectedBankId(e.target.value)}>
                    {banks.map(b=>(
                      <option key={b.id} value={b.id}>{b.bank_name} — {b.account_number}{b.is_default?' (Default)':''}</option>
                    ))}
                  </select>
                  {(() => {
                    const b = banks.find(x => x.id === selectedBankId);
                    if (!b) return null;
                    return (
                      <div style={{marginTop:8,padding:'10px 12px',background:'var(--surface-sunken)',borderRadius:8,border:'1px solid var(--border)',fontSize:11,lineHeight:1.8}}>
                        <div style={{fontWeight:700,fontSize:12,marginBottom:2}}>{b.bank_name}</div>
                        <div><span style={{color:'var(--text-muted)'}}>A/c Name:</span> {b.account_name}</div>
                        <div><span style={{color:'var(--text-muted)'}}>A/c No:</span> <span style={{fontFamily:'var(--font-mono)',fontWeight:600}}>{b.account_number}</span></div>
                        <div><span style={{color:'var(--text-muted)'}}>IFSC:</span> <span style={{fontFamily:'var(--font-mono)'}}>{b.ifsc}</span> &nbsp;|&nbsp; <span style={{color:'var(--text-muted)'}}>Branch:</span> {b.branch}</div>
                      </div>
                    );
                  })()}
                </div>
              )}
              {/* Actions */}
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {viewInvoice.status==='DRAFT'&&<button className="btn btn-primary btn-sm" onClick={()=>{startTransition(async()=>{await finalizeInvoice(viewInvoice.id);setViewInvoice(i=>i?{...i,status:'FINALIZED'}:i);toast.success('Finalized');});}}>Finalize Invoice</button>}
                <button className="btn btn-secondary btn-sm" style={{color:'#7c3aed',borderColor:'#7c3aed'}} onClick={()=>window.open(`/dashboard/invoices/editor?id=${viewInvoice.id}`,'_blank')}>✏️ Open Editor</button>
                <button className="btn btn-secondary btn-sm" onClick={()=>{const p=parties.find(x=>x.id===viewInvoice.partyId);const b=banks.find(x=>x.id===selectedBankId);printTriveniInvoice(viewInvoice, companyInfo, p?{gstin:p.gstin||'',address:p.billingAddress||'',pos:'DELHI',billingPeriod:''}:undefined, b);}}><Download size={12}/> Print / Download PDF</button>
              </div>
            </div>
          </div>
        </>
      )}
      {showBulkInv && <InvoiceBulkDownloadModal invoices={invoices} companyInfo={companyInfo} onClose={()=>setShowBulkInv(false)}/>}

      {showDeleteConfirm && (() => {
        const selectedInvs = invoices.filter(i => selected.has(i.id));
        const paidOrPartial = selectedInvs.filter(i => ['PAID', 'PARTIALLY_PAID'].includes(i.status));
        const hasBookings = selectedInvs.some(i => ['AWB','DOCKET','COMBINED'].includes(i.bookingType));
        return (
          <div className="modal-overlay">
            <div className="modal-box" style={{maxWidth:420}}>
              <div style={{textAlign:'center',padding:'8px 0 20px'}}>
                <div style={{width:52,height:52,borderRadius:'50%',background:'#fef2f2',border:'2px solid #fca5a5',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
                  <Trash2 size={22} color="#dc2626"/>
                </div>
                <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>Delete {selected.size} Invoice{selected.size>1?'s':''}?</div>
                
                {paidOrPartial.length > 0 && (
                  <div style={{fontSize:12,background:'#fffbeb',border:'1px solid #fde047',borderRadius:8,padding:'8px 12px',marginBottom:12,color:'#854d0e',textAlign:'left'}}>
                    ⚠️ <strong>Warning:</strong> Deleting {paidOrPartial.length} paid/partially paid invoice{paidOrPartial.length>1?'s':''} will permanently remove their linked payment receipts and outstanding ledger entries.
                  </div>
                )}
                
                <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:hasBookings?12:20}}>
                  Permanently removes <strong>{selected.size}</strong> invoice{selected.size>1?'s':''} and their ledger records. This action cannot be undone.
                </div>
                
                {hasBookings && (
                  <div style={{fontSize:12,background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:8,padding:'8px 12px',marginBottom:16,color:'var(--info)',textAlign:'left'}}>
                    ✅ Linked AWB / Docket bookings will be <strong>unlocked</strong> and can be re-invoiced.
                  </div>
                )}
                
                <div style={{display:'flex',gap:10,justifyContent:'center'}}>
                  <button className="btn btn-secondary" onClick={()=>{setShowDeleteConfirm(false);if(!selectMode)setSelected(new Set());}}>Cancel</button>
                  <button className="btn btn-danger" onClick={confirmDelete}><Trash2 size={13}/> Delete</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Invoice-only Bulk Download Modal ──────────────────────────────────────────
import { exportToCSV, exportToXLSX, exportToPDF, filterByDateRange, type DateRange, type ExportFormat } from '@/lib/exportUtils';

function InvoiceBulkDownloadModal({ invoices, companyInfo, onClose }: { invoices: DbInvoice[]; companyInfo: any; onClose: ()=>void }) {
  const [range, setRange] = useState<DateRange>('1m');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const DATE_OPTS: {value:DateRange;label:string}[] = [
    {value:'1d',label:'Today'},{value:'7d',label:'7 Days'},{value:'1m',label:'1 Month'},
    {value:'3m',label:'3 Months'},{value:'6m',label:'6 Months'},{value:'1y',label:'1 Year'},{value:'all',label:'All Time'},
  ];

  function doDownload() {
    let data = filterByDateRange(invoices,'invoiceDate',range);
    if (statusFilter !== 'ALL') data = data.filter(i => i.status === statusFilter);
    const rows = data.map(i => ({ 'Invoice No':i.invoiceNo, Party:i.partyName, 'Booking Ref':i.bookingRef, Type:i.bookingType, Date:fmtDate(i.invoiceDate), 'Due Date':fmtDate(i.dueDate), 'Subtotal(₹)':i.subtotal.toFixed(2), 'GST(₹)':i.gstTotal.toFixed(2), 'Total(₹)':i.grandTotal.toFixed(2), 'Paid(₹)':i.paidTotal.toFixed(2), 'Outstanding(₹)':i.outstandingTotal.toFixed(2), Status:i.status }));
    const fname = `invoices_${range}`;
    if(format==='csv') exportToCSV(rows,fname);
    else if(format==='xlsx') exportToXLSX(rows,fname);
    else exportToPDF('Invoices Report',rows,fname);
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{maxWidth:440}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h2 style={{fontSize:16,fontWeight:800,display:'flex',alignItems:'center',gap:8}}><Download size={16}/> Invoice Bulk Download</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{marginBottom:14}}>
          <label className="label">Status Filter</label>
          <select className="input" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="ALL">All Status</option>
            {['DRAFT','REVIEWED','FINALIZED','SENT','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED'].map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
        </div>
        <div style={{marginBottom:14}}>
          <label className="label">Date Range</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {DATE_OPTS.map(opt=>(
              <button key={opt.value} onClick={()=>setRange(opt.value)} style={{padding:'5px 12px',borderRadius:99,fontSize:11,fontWeight:range===opt.value?700:500,background:range===opt.value?'var(--accent)':'var(--surface-sunken)',color:range===opt.value?'#fff':'var(--text-secondary)',border:`1px solid ${range===opt.value?'var(--accent)':'var(--border)'}`,cursor:'pointer',transition:'all 120ms'}}>{opt.label}</button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:20}}>
          <label className="label">Export Format</label>
          <div style={{display:'flex',gap:8}}>
            {(['csv','xlsx','pdf'] as ExportFormat[]).map(f=>(
              <button key={f} onClick={()=>setFormat(f)} className={`btn ${format===f?'btn-primary':'btn-secondary'}`} style={{flex:1,justifyContent:'center',fontSize:12}}>{f.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={doDownload}><Download size={13}/> Download Invoice Data</button>
        </div>
      </div>
    </div>
  );
}
