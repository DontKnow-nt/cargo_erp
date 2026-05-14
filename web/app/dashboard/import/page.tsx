'use client';
import { useState, useRef, useTransition } from 'react';
import { Upload, CheckCircle, Download, X, ArrowRight, FileText, Edit2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import toast from 'react-hot-toast';
import type { AwbBooking, DocketBooking } from '@/lib/mockData';
import { importCsvBookings } from '@/lib/actions/import';

type JobModule = 'RATE_SHEET'|'AWB_BOOKINGS'|'DOCKET_BOOKINGS'|'CUSTOMERS'|'PAYMENTS';
type ImportMode = 'CSV' | 'DOCUMENT';

// ── Full AWB data structure ────────────────────────────────────────────────
type ParsedAwbFull = {
  // Core booking fields (map to AwbBooking)
  awbNo: string;
  origin: string;
  destination: string;
  airlineName: string;
  flightNo: string;
  flightDate: string;
  bookingDate: string;
  weight: number;
  chargeableWeight: number;
  pieces: number;
  baseRate: number;
  freightAmount: number;
  totalAmount: number;
  gstRate: number;
  status: 'BOOKED';
  // Shipper / Consignee
  shipperName: string;
  shipperAddress: string;
  shipperPhone: string;
  shipperAccountNo: string;
  consigneeName: string;
  consigneeAddress: string;
  consigneePhone: string;
  consigneeAccountNo: string;
  // Agent / Carrier
  issuingAgent: string;
  carrierCode: string;
  // Commodity
  commodity: string;
  commodityCode: string;
  dimensions: string;
  // Charges breakdown
  otherCharges: Record<string, number>;
  totalOtherChargesDueAgent: number;
  totalOtherChargesDueCarrier: number;
  totalPrepaid: number;
  currency: string;
  // Execution
  executedAt: string;
  executedBy: string;
  executedPlace: string;
};

function parseAwbDocument(text: string): ParsedAwbFull {
  // Normalise whitespace but keep newlines for multi-line patterns
  const t = text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ');
  const flat = t.replace(/\n/g, ' '); // single-line version for most patterns

  const r: ParsedAwbFull = {
    awbNo:'', origin:'', destination:'', airlineName:'', flightNo:'', flightDate:'',
    bookingDate:'', weight:0, chargeableWeight:0, pieces:0, baseRate:0,
    freightAmount:0, totalAmount:0, gstRate:18, status:'BOOKED',
    shipperName:'', shipperAddress:'', shipperPhone:'', shipperAccountNo:'',
    consigneeName:'', consigneeAddress:'', consigneePhone:'', consigneeAccountNo:'',
    issuingAgent:'', carrierCode:'', commodity:'', commodityCode:'', dimensions:'',
    otherCharges:{}, totalOtherChargesDueAgent:0, totalOtherChargesDueCarrier:0,
    totalPrepaid:0, currency:'INR', executedAt:'', executedBy:'', executedPlace:'',
  };

  // ── AWB Number  e.g. "312-27497061"
  const awbM = flat.match(/\b(\d{3}-\d{8})\b/);
  if (awbM) r.awbNo = awbM[1];

  // ── Airport codes  e.g. "BLR-BENGALURU" "AMD-AHMEDABAD"
  const airportMap: Record<string,string> = {
    'BLR':'BLR','BENGALURU':'BLR','BANGALORE':'BLR',
    'AMD':'AMD','AHMEDABAD':'AMD',
    'DEL':'DEL','DELHI':'DEL',
    'BOM':'BOM','MUMBAI':'BOM',
    'HYD':'HYD','HYDERABAD':'HYD',
    'MAA':'MAA','CHENNAI':'MAA',
    'CCU':'CCU','KOLKATA':'CCU',
    'COK':'COK','KOCHI':'COK',
    'JAI':'JAI','JAIPUR':'JAI',
    'PNQ':'PNQ','PUNE':'PNQ',
  };
  // Origin from "Airport of Departure ... BLR-BENGALURU"
  const originM = flat.match(/Airport of Departure[^A-Z]{0,30}([A-Z]{3})-([A-Z]+)/i);
  if (originM) r.origin = airportMap[originM[1]] || originM[1];
  // Destination from "Airport of Destination ... AMD-AHMEDABAD"
  const destM = flat.match(/Airport of Destination\s+([A-Z]{3})-([A-Z]+)/i);
  if (destM) r.destination = airportMap[destM[1]] || destM[1];
  // Fallback: scan all "XXX-CITYNAME" patterns
  if (!r.origin || !r.destination) {
    const allAirports = [...flat.matchAll(/\b([A-Z]{3})-(BENGALURU|AHMEDABAD|DELHI|MUMBAI|HYDERABAD|CHENNAI|KOLKATA|KOCHI|JAIPUR|PUNE)\b/g)];
    if (allAirports.length >= 1 && !r.origin) r.origin = allAirports[0][1];
    if (allAirports.length >= 2 && !r.destination) r.destination = allAirports[1][1];
  }

  // ── Airline
  if (flat.includes('IndiGo') || flat.includes('InterGlobe') || /\b6E\b/.test(flat)) r.airlineName = 'IndiGo';
  else if (flat.includes('Air India') || /\bAI\b/.test(flat)) r.airlineName = 'Air India';
  else if (flat.includes('SpiceJet') || /\bSG\b/.test(flat)) r.airlineName = 'SpiceJet';
  else if (flat.includes('GoAir') || /\bG8\b/.test(flat)) r.airlineName = 'GoAir';
  else if (flat.includes('Akasa') || /\bQP\b/.test(flat)) r.airlineName = 'Akasa Air';
  else if (flat.includes('Vistara') || /\bUK\b/.test(flat)) r.airlineName = 'Vistara';

  // ── Flight number  e.g. "6E6779"
  const flightM = flat.match(/\b(6E|AI|SG|G8|QP|UK)(\d{3,5})\b/);
  if (flightM) r.flightNo = flightM[1] + flightM[2];

  // ── Flight date  e.g. "07/05/2026"
  const flightDateM = flat.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (flightDateM) {
    r.flightDate = `${flightDateM[3]}-${flightDateM[2]}-${flightDateM[1]}`;
    r.bookingDate = r.flightDate;
  }

  // ── Execution date/time  e.g. "06/05/2026 23:09"
  const execDateM = flat.match(/EXECUTED ON.*?(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/i)
    || flat.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+([A-Z]{3})/);
  if (execDateM) {
    const [d,m,y] = execDateM[1].split('/');
    r.executedAt = `${y}-${m}-${d} ${execDateM[2]}`;
    if (execDateM[3]) r.executedPlace = execDateM[3];
    // Use execution date as booking date if flight date not found
    if (!r.bookingDate) r.bookingDate = `${y}-${m}-${d}`;
  }

  // ── Executed by (agent name after time+place)
  const execByM = flat.match(/(\d{2}:\d{2})\s+[A-Z]{3}\s+([A-Za-z\s]+?)(?:\s+EXECUTED|$)/);
  if (execByM) r.executedBy = execByM[2].trim();

  // ── Pieces, Weight, Rate, Chargeable Weight
  // Pattern: "40 587.00 K Q AUP 587.00 39.00 22,893.00"
  const shipLineM = flat.match(/(\d+)\s+([\d,]+\.?\d*)\s+K\s+Q\s+(\w+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/);
  if (shipLineM) {
    r.pieces           = parseInt(shipLineM[1]);
    r.weight           = parseFloat(shipLineM[2].replace(/,/g,''));
    r.commodityCode    = shipLineM[3];
    r.chargeableWeight = parseFloat(shipLineM[4].replace(/,/g,''));
    r.baseRate         = parseFloat(shipLineM[5].replace(/,/g,''));
    r.freightAmount    = parseFloat(shipLineM[6].replace(/,/g,''));
  }
  // Fallback weight
  if (!r.weight) {
    const wM = flat.match(/([\d,]+\.?\d*)\s+K(?:G|b)?\b/i);
    if (wM) r.weight = parseFloat(wM[1].replace(/,/g,''));
  }

  // ── Commodity description  e.g. "AUTO PARTS"
  const commM = flat.match(/AUTO PARTS|ELECTRONICS|GARMENTS|PHARMA|DOCUMENTS|MACHINERY|CHEMICALS|PERISHABLES/i);
  if (commM) r.commodity = commM[0].toUpperCase();
  // Also from "SHC:AUP:Auto Parts"
  const shcM = flat.match(/SHC:[A-Z]+:([A-Za-z\s]+)/i);
  if (shcM && !r.commodity) r.commodity = shcM[1].trim();

  // ── Dimensions  e.g. "56.00 * 30.00 * 10.00 * 40 * Cms"
  const dimM = flat.match(/([\d.]+\s*\*\s*[\d.]+\s*\*\s*[\d.]+\s*\*\s*[\d.]+\s*\*?\s*Cms?)/i);
  if (dimM) r.dimensions = dimM[1].replace(/\s+/g,' ').trim();

  // ── Shipper block
  const shipperBlockM = t.match(/Shipper.s Name and Address\s*\n([\s\S]{0,300}?)(?:Shipper.s Account|Consignee)/i);
  if (shipperBlockM) {
    const block = shipperBlockM[1].replace(/\n/g,' ').trim();
    const lines = block.split(/\s{2,}/).map(s=>s.trim()).filter(Boolean);
    r.shipperName    = lines[0] || '';
    r.shipperAddress = lines.slice(1).join(', ');
    const phoneM = block.match(/\b(\d{10})\b/);
    if (phoneM) r.shipperPhone = phoneM[1];
  }
  // Fallback: first CAPS word cluster after "Shipper"
  if (!r.shipperName) {
    const sM = flat.match(/Shipper.s Name and Address\s+([A-Z][A-Za-z\s]{2,40}?)(?:\s+[A-Z][a-z]|\s+\d{6}|\s+INDIA)/);
    if (sM) r.shipperName = sM[1].trim();
  }

  // ── Consignee block
  const consigneeBlockM = t.match(/Consignee.s Name and Address\s*\n([\s\S]{0,300}?)(?:Consignee.s Account|Byfirst|Carrier|By first)/i);
  if (consigneeBlockM) {
    const block = consigneeBlockM[1].replace(/\n/g,' ').trim();
    const lines = block.split(/\s{2,}/).map(s=>s.trim()).filter(Boolean);
    r.consigneeName    = lines[0] || '';
    r.consigneeAddress = lines.slice(1).join(', ');
    const phoneM = block.match(/\b(\d{10})\b/);
    if (phoneM) r.consigneePhone = phoneM[1];
  }
  if (!r.consigneeName) {
    const cM = flat.match(/Consignee.s Name and Address\s+([A-Za-z][A-Za-z\s]{2,50}?)(?:\s+[A-Z][a-z]|\s+\d{6}|\s+INDIA|\s+00)/);
    if (cM) r.consigneeName = cM[1].trim();
  }

  // ── Shipper / Consignee account numbers
  const shipAccM = flat.match(/Shipper.s Account Number\s+(\d+)/i);
  if (shipAccM) r.shipperAccountNo = shipAccM[1];
  const consAccM = flat.match(/Consignee.s Account Number\s+(\d+)/i);
  if (consAccM) r.consigneeAccountNo = consAccM[1];

  // ── Issuing agent
  const agentM = flat.match(/Issuing Carrier.s Agent Name and City\s+([A-Z][A-Z\s&]+?)(?:\s+Agent|\s+IATA|\s+Account)/i)
    || flat.match(/PRADEEP CARGO[A-Z\s&]+/i);
  if (agentM) r.issuingAgent = agentM[0].replace(/Issuing Carrier.s Agent Name and City\s*/i,'').trim();

  // ── Carrier code
  const carrierM = flat.match(/\bSCI\b|\bByfirst\b/i);
  if (carrierM) r.carrierCode = carrierM[0];

  // ── Other charges (all standard IATA charge codes)
  const chargePatterns: [string, RegExp][] = [
    ['AWB Fees (Agent)',       /AA\/AWB FEES DUE AGENT\s*:\s*([\d,]+\.?\d*)/i],
    ['AWB Fees (Carrier)',     /AC\/AWB FEES DUE CARRIER\s*:\s*([\d,]+\.?\d*)/i],
    ['Admin Charges',          /AD\/ADMINISTRATIVE CHARGES\s*:\s*([\d,]+\.?\d*)/i],
    ['Delivery Order',         /DO\/DELIVERY ORDER CHARGES\s*:\s*([\d,]+\.?\d*)/i],
    ['Deunitization',          /DT\/DEUNITIZATION CHARGES\s*:\s*([\d,]+\.?\d*)/i],
    ['Fuel Surcharge',         /FS\/Fuel\s*Surcharge\s*:\s*([\d,]+\.?\d*)/i],
    ['Outbound Unitization',   /UT\/OUTBOUND UNITIZATION[^:]*:\s*([\d,]+\.?\d*)/i],
    ['X-Ray Screening',        /XS\/X-RAY\s*SCREENING CHARGES\s*:\s*([\d,]+\.?\d*)/i],
    ['Security Surcharge',     /SS\/SECURITY SURCHARGE\s*:\s*([\d,]+\.?\d*)/i],
    ['Misc Charges',           /MC\/MISC(?:ELLANEOUS)? CHARGES\s*:\s*([\d,]+\.?\d*)/i],
    ['Handling Charges',       /HC\/HANDLING CHARGES\s*:\s*([\d,]+\.?\d*)/i],
    ['Dangerous Goods',        /DG\/DANGEROUS GOODS\s*:\s*([\d,]+\.?\d*)/i],
  ];
  chargePatterns.forEach(([key, regex]) => {
    const m = flat.match(regex);
    if (m) r.otherCharges[key] = parseFloat(m[1].replace(/,/g,''));
  });

  // ── Total other charges due agent / carrier
  const agentTotalM = flat.match(/Total other Charges Due Agent\s*([\d,]+\.?\d*)/i)
    || flat.match(/AA\/AWB FEES DUE AGENT\s*:\s*([\d,]+\.?\d*)/i);
  if (agentTotalM) r.totalOtherChargesDueAgent = parseFloat(agentTotalM[1].replace(/,/g,''));

  const carrierTotalM = flat.match(/Total other Charges Due Carrier\s*([\d,]+\.?\d*)/i);
  if (carrierTotalM) r.totalOtherChargesDueCarrier = parseFloat(carrierTotalM[1].replace(/,/g,''));

  // ── Total prepaid  e.g. "34,207.74 INR" or "Total Prepaid ... 34,207.74"
  const prepaidM = flat.match(/Total Prepaid\s+([\d,]+\.?\d*)/i)
    || flat.match(/([\d]{2},[\d]{3}\.\d{2})\s*INR/i)
    || flat.match(/([\d]{2},[\d]{3}\.\d{2})\s*$/m);
  if (prepaidM) r.totalPrepaid = parseFloat(prepaidM[1].replace(/,/g,''));

  // ── Currency
  const currM = flat.match(/\b(INR|USD|EUR|GBP)\b/);
  if (currM) r.currency = currM[1];

  // ── Derive totalAmount from prepaid or freight + charges
  r.totalAmount = r.totalPrepaid || r.freightAmount + Object.values(r.otherCharges).reduce((s,v)=>s+v,0);

  return r;
}

type ParsedInvoiceRow = { date:string; awbNo:string; origin:string; destination:string; pieces:number; weight:number; freight:number; delivery:number; tsp:number; amount:number; };
type ParsedInvoice = { billNo:string; date:string; partyName:string; partyGstin:string; issuerName:string; issuerGstin:string; sacCode:string; rows:ParsedInvoiceRow[]; totalWeight:number; totalFreight:number; totalDelivery:number; totalTsp:number; subtotal:number; cgst:number; sgst:number; igst:number; igstRate:number; grandTotal:number; amountInWords:string; };

function parseInvoiceDocument(text: string): ParsedInvoice | null {
  const t = text.replace(/\r/g, ' ').replace(/\s+/g, ' ');
  const billNoMatch = t.match(/Bill\s*No\s*[:\-]\s*([\w\-\/]+)/i);
  const dateMatch = t.match(/Date[:\-]\s*(\d{2}\.\d{2}\.\d{2,4})/i);
  const partyMatch = t.match(/M\/s\s+([A-Z][A-Z\s\(\)]+?)(?:\s+\d{2}\s+[A-Z]|\s+GSTIN|\s+29\s+A)/i);
  const issuerGstinMatch = t.match(/GSTIN[:\s]+(\w{15})/i);
  const partyGstinMatch = t.match(/GSTIN\s*:\s*(\w{15})/gi);
  const sacMatch = t.match(/SAC[:\s]+(\d+)/i);
  const igstMatch = t.match(/IGST@(\d+)%[:\s]+([\d.]+)/i);
  const totalMatch = t.match(/Net Amount[^0-9]*([\d,]+\.\d{2})/i);
  const wordsMatch = t.match(/In Words[:\s]+(.+?)(?:Remark|$)/i);
  const rowRegex = /(\d{2}\.\d{2}\.\d{2,4})\s+(\d{7,10})\s+([A-Z]{3})\s+([A-Z]+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/g;
  const rows: ParsedInvoiceRow[] = [];
  let m;
  while ((m = rowRegex.exec(t)) !== null) {
    rows.push({ date:m[1], awbNo:m[2], origin:m[3], destination:m[4], pieces:parseInt(m[5]), weight:parseFloat(m[6]), freight:parseFloat(m[7]), delivery:parseFloat(m[8]), tsp:parseFloat(m[9]), amount:parseFloat(m[10]) });
  }
  const totalsMatch = t.match(/TOTAL\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  const igstRate = igstMatch ? parseFloat(igstMatch[1]) : 18;
  const igstAmt = igstMatch ? parseFloat(igstMatch[2]) : 0;
  const subtotal = totalsMatch ? parseFloat(totalsMatch[5]) : rows.reduce((s,r)=>s+r.amount,0);
  const grandTotal = totalMatch ? parseFloat(totalMatch[1].replace(/,/g,'')) : subtotal + igstAmt;
  const partyGstins = partyGstinMatch || [];
  return {
    billNo: billNoMatch?.[1]||'', date: dateMatch?.[1]||'',
    partyName: partyMatch?.[1]?.trim()||'', partyGstin: partyGstins[1]?.replace(/GSTIN\s*:\s*/i,'')||'',
    issuerName: 'TRIVENI CARGO EXPRESS INDIA PVT LTD', issuerGstin: issuerGstinMatch?.[1]||'',
    sacCode: sacMatch?.[1]||'996531', rows,
    totalWeight: totalsMatch?parseFloat(totalsMatch[1]):rows.reduce((s,r)=>s+r.weight,0),
    totalFreight: totalsMatch?parseFloat(totalsMatch[2]):rows.reduce((s,r)=>s+r.freight,0),
    totalDelivery: totalsMatch?parseFloat(totalsMatch[3]):rows.reduce((s,r)=>s+r.delivery,0),
    totalTsp: totalsMatch?parseFloat(totalsMatch[4]):rows.reduce((s,r)=>s+r.tsp,0),
    subtotal, cgst:0, sgst:0, igst:igstAmt, igstRate, grandTotal,
    amountInWords: wordsMatch?.[1]?.trim()||'',
  };
}

const MODULES: {value:JobModule;label:string;desc:string;columns:string[]}[] = [
  { value:'RATE_SHEET', label:'Freight Rate Sheet', desc:'Import carrier route rates', columns:['carrier','origin','destination','baseRate','uom'] },
  { value:'AWB_BOOKINGS', label:'AWB Bookings', desc:'Bulk import air waybill bookings', columns:['awbNo','partyName','origin','destination','airlineName','bookingDate','weight','pieces','baseRate','markupAmount','gstRate'] },
  { value:'DOCKET_BOOKINGS', label:'Docket Bookings', desc:'Bulk import house-level docket/LR bookings', columns:['docketNo','partyName','bookingDate','origin','destination','description','rateFittedAmount','markupAmount','gstRate'] },
  { value:'CUSTOMERS', label:'Customer / Parties', desc:'Import customer master with GSTIN and credit info', columns:['partyName','gstin','contactPerson','phone','email','creditLimit','creditDays'] },
  { value:'PAYMENTS', label:'Payment Statements', desc:'Import bank statements for payment reconciliation', columns:['invoiceNo','paymentDate','paymentAmount','paymentMode','referenceNo'] },
];

function parseCSV(text: string): Record<string,string>[] {
  const lines = text.trim().split('\n').map(l => l.replace(/\r/g,''));
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''));
    return Object.fromEntries(headers.map((h,i) => [h, vals[i]||'']));
  });
}

function generateSampleCSV(mod: JobModule): string {
  const samples: Record<JobModule,string> = {
    RATE_SHEET: 'carrier,origin,destination,baseRate,uom\nIndiGo Cargo,DEL,BOM,85,KG',
    AWB_BOOKINGS: 'awbNo,partyName,origin,destination,airlineName,bookingDate,weight,pieces,baseRate,markupAmount,gstRate\n6E-220001,Uflex Limited,DEL,BOM,IndiGo,2026-05-09,150,3,85,450,18',
    DOCKET_BOOKINGS: 'docketNo,partyName,bookingDate,origin,destination,description,rateFittedAmount,markupAmount,gstRate\nDKT-2026-0010,Uflex Limited,2026-05-09,DEL,BLR,Packaging material,12000,500,18',
    CUSTOMERS: 'partyName,gstin,contactPerson,phone,email,creditLimit,creditDays\nTata Motors,27AAACT2727Q1ZW,Ramesh Iyer,9876540001,ramesh@tata.com,600000,30',
    PAYMENTS: 'invoiceNo,paymentDate,paymentAmount,paymentMode,referenceNo\nINV-2026-0001,2026-05-09,27435,NEFT,NEFT20260509001',
  };
  return samples[mod];
}

function downloadSample(mod: JobModule) {
  const csv = generateSampleCSV(mod);
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `sample_${mod.toLowerCase()}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function emptyAwb(): ParsedAwbFull {
  return {
    awbNo:'', origin:'', destination:'', airlineName:'', flightNo:'', flightDate:'',
    bookingDate:'', weight:0, chargeableWeight:0, pieces:0, baseRate:0,
    freightAmount:0, totalAmount:0, gstRate:18, status:'BOOKED',
    shipperName:'', shipperAddress:'', shipperPhone:'', shipperAccountNo:'',
    consigneeName:'', consigneeAddress:'', consigneePhone:'', consigneeAccountNo:'',
    issuingAgent:'', carrierCode:'', commodity:'', commodityCode:'', dimensions:'',
    otherCharges:{}, totalOtherChargesDueAgent:0, totalOtherChargesDueCarrier:0,
    totalPrepaid:0, currency:'INR', executedAt:'', executedBy:'', executedPlace:'',
  };
}

export default function ImportPage() {
  const addAwbBooking = useStore(s => s.addAwbBooking);
  const addDocketBooking = useStore(s => s.addDocketBooking);
  const addParty = useStore(s => s.addParty);
  const addRateVersion = useStore(s => s.addRateVersion);
  const importJobs = useStore(s => s.importJobs);
  const [isPending, startTransition] = useTransition();

  const fileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1|2|3>(1);
  const [module, setModule] = useState<JobModule>('AWB_BOOKINGS');
  const [importMode, setImportMode] = useState<ImportMode>('CSV');
  const [dragOver, setDragOver] = useState(false);
  const [rawRows, setRawRows] = useState<Record<string,string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState<{row:number;msg:string}[]>([]);
  const [goodRows, setGoodRows] = useState<Record<string,string>[]>([]);

  const [docStep, setDocStep] = useState<1|2|3>(1);
  const [docType, setDocType] = useState<'AWB'|'INVOICE'>('AWB');
  const [docDragOver, setDocDragOver] = useState(false);
  const [docFileName, setDocFileName] = useState('');
  const [docFileType, setDocFileType] = useState<'text'|'pdf'|'image'>('text');
  const [docImagePreview, setDocImagePreview] = useState<string|null>(null);
  const [parsedAwb, setParsedAwb] = useState<ParsedAwbFull|null>(null);
  const [parsedInvoice, setParsedInvoice] = useState<ReturnType<typeof parseInvoiceDocument>|null>(null);
  const [editingAwb, setEditingAwb] = useState<ParsedAwbFull>(emptyAwb());

  const selMod = MODULES.find(m => m.value === module)!;

  function validateRows(rows: Record<string,string>[], mod: JobModule) {
    const errs: {row:number;msg:string}[] = [];
    const good: Record<string,string>[] = [];
    rows.forEach((row, i) => {
      const n = i + 2; let err = '';
      if (mod === 'AWB_BOOKINGS') {
        if (!row.awbNo) err = 'Missing awbNo';
        else if (!row.partyName) err = 'Missing partyName';
        else if (!row.origin || !row.destination) err = 'Missing origin/destination';
        else if (isNaN(parseFloat(row.weight))) err = 'Invalid weight';
        else if (isNaN(parseFloat(row.baseRate))) err = 'Invalid baseRate';
      } else if (mod === 'DOCKET_BOOKINGS') {
        if (!row.docketNo) err = 'Missing docketNo';
        else if (!row.partyName) err = 'Missing partyName';
        else if (isNaN(parseFloat(row.rateFittedAmount))) err = 'Invalid rateFittedAmount';
      } else if (mod === 'CUSTOMERS') {
        if (!row.partyName) err = 'Missing partyName';
      } else if (mod === 'RATE_SHEET') {
        if (!row.origin || !row.destination) err = 'Missing origin/destination';
        else if (isNaN(parseFloat(row.baseRate))) err = 'Invalid baseRate';
      } else if (mod === 'PAYMENTS') {
        if (!row.invoiceNo) err = 'Missing invoiceNo';
        else if (isNaN(parseFloat(row.paymentAmount))) err = 'Invalid paymentAmount';
      }
      if (err) errs.push({ row: n, msg: `Row ${n}: ${err}` });
      else good.push(row);
    });
    return { errs, good };
  }

  function loadFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (!rows.length) { toast.error('Empty or invalid CSV file'); return; }
      const { errs, good } = validateRows(rows, module);
      setRawRows(rows); setErrors(errs); setGoodRows(good); setStep(2);
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) loadFile(f);
  }

  async function loadDocumentFile(file: File) {
    setDocFileName(file.name);
    setDocImagePreview(null);

    const mime = file.type.toLowerCase();
    const isImage = mime.startsWith('image/');
    const isPdf   = mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    // ── IMAGE ──────────────────────────────────────────────────────────────
    if (isImage) {
      setDocFileType('image');
      const reader = new FileReader();
      reader.onload = e => {
        setDocImagePreview(e.target?.result as string);
        if (docType === 'AWB') {
          setParsedAwb(emptyAwb());
          setEditingAwb(emptyAwb());
        } else {
          setParsedInvoice({ billNo:'', date:'', partyName:'', partyGstin:'', issuerName:'', issuerGstin:'', sacCode:'996531', rows:[], totalWeight:0, totalFreight:0, totalDelivery:0, totalTsp:0, subtotal:0, cgst:0, sgst:0, igst:0, igstRate:18, grandTotal:0, amountInWords:'' });
        }
        setDocStep(2);
        toast('Image uploaded — fill in the fields while viewing the preview.', { icon: '🖼️' });
      };
      reader.readAsDataURL(file);
      return;
    }

    // ── PDF — use PDF.js for proper text extraction ────────────────────────
    if (isPdf) {
      setDocFileType('pdf');
      toast.loading('Reading PDF…', { id: 'pdf-load' });
      try {
        const { extractTextFromPdf } = await import('@/lib/pdfExtract');
        const arrayBuffer = await file.arrayBuffer();
        const extractedText = await extractTextFromPdf(arrayBuffer);

        toast.dismiss('pdf-load');

        if (docType === 'AWB') {
          const parsed = parseAwbDocument(extractedText);
          setParsedAwb(parsed);
          setEditingAwb({ ...parsed });
          setDocStep(2);

          // Count how many fields were actually filled
          const filled = [parsed.awbNo, parsed.origin, parsed.destination,
            parsed.weight, parsed.pieces, parsed.baseRate, parsed.shipperName]
            .filter(v => v && v !== 0).length;

          if (filled >= 3) {
            toast.success(`PDF parsed — ${filled} fields extracted automatically`);
          } else {
            toast('PDF read but few fields detected — check and fill manually.', { icon: '⚠️' });
          }
        } else {
          const parsed = parseInvoiceDocument(extractedText);
          if (parsed && parsed.rows.length > 0) {
            setParsedInvoice(parsed);
            setDocStep(2);
            toast.success(`Invoice parsed — ${parsed.rows.length} rows extracted`);
          } else {
            setParsedInvoice({ billNo:'', date:'', partyName:'', partyGstin:'', issuerName:'', issuerGstin:'', sacCode:'996531', rows:[], totalWeight:0, totalFreight:0, totalDelivery:0, totalTsp:0, subtotal:0, cgst:0, sgst:0, igst:0, igstRate:18, grandTotal:0, amountInWords:'' });
            setDocStep(2);
            toast('Invoice PDF read — fill in the fields manually.', { icon: '📄' });
          }
        }
      } catch (err) {
        toast.dismiss('pdf-load');
        toast.error('Could not read PDF. Try a text-based PDF or use an image.');
        console.error('PDF extraction error:', err);
        // Still open the blank form so user can fill manually
        if (docType === 'AWB') { setParsedAwb(emptyAwb()); setEditingAwb(emptyAwb()); }
        else setParsedInvoice({ billNo:'', date:'', partyName:'', partyGstin:'', issuerName:'', issuerGstin:'', sacCode:'996531', rows:[], totalWeight:0, totalFreight:0, totalDelivery:0, totalTsp:0, subtotal:0, cgst:0, sgst:0, igst:0, igstRate:18, grandTotal:0, amountInWords:'' });
        setDocStep(2);
      }
      return;
    }

    // ── PLAIN TEXT ─────────────────────────────────────────────────────────
    setDocFileType('text');
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      if (docType === 'AWB') {
        const parsed = parseAwbDocument(text);
        setParsedAwb(parsed); setEditingAwb({ ...parsed }); setDocStep(2);
        toast.success('Text parsed — review extracted fields');
      } else {
        const parsed = parseInvoiceDocument(text);
        if (!parsed) { toast.error('Could not parse document'); return; }
        setParsedInvoice(parsed); setDocStep(2);
      }
    };
    reader.readAsText(file);
  }

  function handleDocDrop(e: React.DragEvent) {
    e.preventDefault(); setDocDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) loadDocumentFile(f);
  }

  function commitDocumentImport() {
    const today = new Date().toISOString().split('T')[0];
    if (docType === 'AWB') {
      const e = editingAwb;
      const w = e.weight || 0;
      const rate = e.baseRate || 0;
      const markup = 0; // AWB docs don't have markup — user can add after import
      const gst = e.gstRate || 18;
      const gstAmt = (w * rate + markup) * gst / 100;
      addAwbBooking({
        awbNo: e.awbNo || '', partyId: 'p-imported',
        partyName: e.shipperName || 'Imported Party',
        origin: e.origin || '', destination: e.destination || '',
        airlineName: e.airlineName || 'Unknown',
        bookingDate: e.bookingDate || today,
        weight: w, pieces: e.pieces || 1,
        baseRate: rate, markupAmount: markup,
        gstRate: gst, gstAmount: gstAmt,
        totalAmount: e.totalAmount || e.totalPrepaid || (w * rate + gstAmt),
        status: 'BOOKED',
        notes: [
          e.flightNo ? `Flight: ${e.flightNo} on ${e.flightDate}` : '',
          e.commodity ? `Commodity: ${e.commodity}` : '',
          e.dimensions ? `Dims: ${e.dimensions}` : '',
          e.consigneeName ? `Consignee: ${e.consigneeName}` : '',
          e.issuingAgent ? `Agent: ${e.issuingAgent}` : '',
        ].filter(Boolean).join(' | '),
      });
      toast.success(`AWB ${e.awbNo} imported successfully`);
      setDocStep(3);
    } else if (docType === 'INVOICE' && parsedInvoice) {
      parsedInvoice.rows.forEach(row => {
        const dateStr = row.date.split('.').reverse().join('-');
        addDocketBooking({
          docketNo: row.awbNo, partyId: 'p-imported',
          partyName: parsedInvoice.partyName || 'Imported Party',
          bookingDate: dateStr, origin: row.origin, destination: row.destination,
          description: `Air cargo ${row.origin}→${row.destination}`,
          rateFittedAmount: row.freight, markupAmount: row.tsp,
          gstRate: parsedInvoice.igstRate,
          gstAmount: (row.freight + row.tsp) * parsedInvoice.igstRate / 100,
          totalAmount: row.amount, dueDatePolicy: 30, status: 'BOOKED',
        });
      });
      toast.success(`Invoice imported: ${parsedInvoice.rows.length} bookings created`);
      setDocStep(3);
    }
  }

  function resetDoc() { setDocStep(1); setParsedAwb(null); setParsedInvoice(null); setEditingAwb(emptyAwb()); setDocFileName(''); setDocFileType('text'); setDocImagePreview(null); }

  function commitImport() {
    // Use the secure server action for CSV imports (AWB_BOOKINGS, DOCKET_BOOKINGS, CUSTOMERS)
    const csvModule = module === 'AWB_BOOKINGS' || module === 'DOCKET_BOOKINGS' || module === 'CUSTOMERS'
      ? module as 'AWB_BOOKINGS' | 'DOCKET_BOOKINGS' | 'CUSTOMERS'
      : null;

    if (csvModule && fileRef.current?.files?.[0]) {
      const fd = new FormData();
      fd.append('file', fileRef.current.files[0]);
      startTransition(async () => {
        const res = await importCsvBookings(fd, csvModule);
        if ('error' in res) { toast.error(res.error); return; }
        toast.success(`Import done: ${res.importedRows} of ${res.totalRows} rows imported`);
        if (res.errors.length > 0) toast(`${res.errorRows} rows had errors`, { icon: '⚠️' });
        setStep(3);
      });
      return;
    }

    // Fallback for RATE_SHEET / PAYMENTS (still client-side, no sensitive server data)
    const today = new Date().toISOString().split('T')[0];
    let successRows = 0;
    if (module === 'RATE_SHEET') {
      const byCarrier: Record<string,{origin:string;destination:string;baseRate:number;uom:string}[]> = {};
      goodRows.forEach(row => { const c = row.carrier||'IndiGo Cargo'; if (!byCarrier[c]) byCarrier[c]=[]; byCarrier[c].push({ origin:row.origin, destination:row.destination, baseRate:parseFloat(row.baseRate)||0, uom:row.uom||'KG' }); successRows++; });
      Object.entries(byCarrier).forEach(([carrier, rates]) => { addRateVersion({ carrierName:carrier, validFrom:today, status:'ACTIVE', notes:`Imported from ${fileName}` }, rates.map(r=>({...r,activeFlag:true}))); });
    } else { successRows = goodRows.length; }
    toast.success(`Import done: ${successRows} of ${rawRows.length} rows imported`);
    setStep(3);
  }

  function reset() { setStep(1); setRawRows([]); setErrors([]); setGoodRows([]); setFileName(''); }

  const fmtNum = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="animate-fadeIn">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{display:'flex',alignItems:'center',gap:8}}><Upload size={20} color="var(--accent-dark)"/> Import Wizard</h1>
          <p className="page-subtitle">Import AWB/Invoice documents or bulk-upload CSV data.</p>
        </div>
      </div>

      {/* Mode Toggle */}
      <div style={{display:'flex',gap:0,marginBottom:20,background:'var(--surface-base)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden',width:'fit-content'}}>
        {(['CSV','DOCUMENT'] as ImportMode[]).map(mode => (
          <button key={mode} onClick={()=>{setImportMode(mode);setStep(1);setDocStep(1);}} style={{padding:'9px 22px',fontSize:12,fontWeight:importMode===mode?700:500,background:importMode===mode?'var(--accent)':'transparent',color:importMode===mode?'#fff':'var(--text-secondary)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:6,transition:'all 120ms'}}>
            {mode==='CSV'?<Upload size={13}/>:<FileText size={13}/>}
            {mode==='CSV'?'CSV Bulk Import':'Document Import (AWB / Invoice)'}
          </button>
        ))}
      </div>

      {/* ── CSV MODE ── */}
      {importMode === 'CSV' && (
        <>
          <div style={{display:'flex',alignItems:'center',gap:0,marginBottom:20,background:'var(--surface-base)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 18px',width:'fit-content'}}>
            {['Select & Upload','Validate Preview','Confirm & Import'].map((label,i)=>{
              const n=i+1; const done=step>n; const active=step===n;
              return (
                <div key={label} style={{display:'flex',alignItems:'center',gap:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:26,height:26,borderRadius:'50%',background:done?'#059669':active?'var(--accent)':'var(--surface-sunken)',border:`2px solid ${done?'#059669':active?'var(--accent)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:done||active?'#fff':'var(--text-muted)',flexShrink:0}}>{done?'✓':n}</div>
                    <span style={{fontSize:12,fontWeight:active?700:400,color:active?'var(--text-primary)':done?'#059669':'var(--text-muted)',whiteSpace:'nowrap'}}>{label}</span>
                  </div>
                  {i<2&&<div style={{width:36,height:1,background:step>n+1?'#059669':step>n?'var(--accent)':'var(--border)',margin:'0 10px'}}/>}
                </div>
              );
            })}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr',gap:20}}>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {step===1 && (
                <div className="card" style={{padding:20}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>1. Choose Data Type</div>
                  {MODULES.map(m=>(
                    <div key={m.value} onClick={()=>setModule(m.value)} style={{padding:'10px 13px',borderRadius:9,border:`1.5px solid ${module===m.value?'var(--accent)':'var(--border)'}`,background:module===m.value?'var(--accent-subtle)':'transparent',cursor:'pointer',marginBottom:6,transition:'all 130ms'}}>
                      <div style={{fontSize:12,fontWeight:600,color:module===m.value?'var(--accent-dark)':'var(--text-primary)'}}>{m.label}</div>
                      <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{m.desc}</div>
                    </div>
                  ))}
                  <div style={{marginTop:14,marginBottom:16}}>
                    <button className="btn btn-secondary btn-sm" style={{width:'100%',justifyContent:'center'}} onClick={()=>downloadSample(module)}><Download size={12}/> Download sample CSV</button>
                  </div>
                  <div className={`drop-zone${dragOver?' drag-over':''}`} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} onClick={()=>fileRef.current?.click()} style={{marginTop:4}}>
                    <Upload size={28} style={{margin:'0 auto 10px',color:'var(--text-muted)'}}/>
                    <div style={{fontSize:13,fontWeight:600}}>Drag & drop CSV file here</div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>or <span style={{color:'var(--accent-dark)',fontWeight:600}}>click to browse</span></div>
                    <div style={{fontSize:10,color:'var(--text-muted)',marginTop:8}}>Supports: .csv · UTF-8 · Max 5 MB</div>
                    <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)loadFile(f);}}/>
                  </div>
                </div>
              )}
              {step===2 && (
                <div className="card" style={{padding:20}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>2. Validation Results</div>
                  <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:12,padding:'8px 12px',background:'var(--surface-sunken)',borderRadius:8,fontFamily:'var(--font-mono)'}}>{fileName}</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
                    <div style={{padding:'12px',background:'var(--success-bg)',border:'1px solid var(--success-border)',borderRadius:9,textAlign:'center'}}>
                      <div style={{fontSize:22,fontWeight:800,color:'#059669',fontFamily:'var(--font-mono)'}}>{goodRows.length}</div>
                      <div style={{fontSize:11,color:'#059669',fontWeight:600}}>Valid rows</div>
                    </div>
                    <div style={{padding:'12px',background:errors.length>0?'var(--danger-bg)':'var(--surface-sunken)',border:`1px solid ${errors.length>0?'var(--danger-border)':'var(--border)'}`,borderRadius:9,textAlign:'center'}}>
                      <div style={{fontSize:22,fontWeight:800,color:errors.length>0?'#dc2626':'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{errors.length}</div>
                      <div style={{fontSize:11,color:errors.length>0?'#dc2626':'var(--text-muted)',fontWeight:600}}>Errors</div>
                    </div>
                  </div>
                  {errors.length>0&&<div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:'#dc2626',marginBottom:6}}>Row errors:</div><div style={{maxHeight:100,overflowY:'auto',display:'flex',flexDirection:'column',gap:3}}>{errors.map(e=><div key={e.row} style={{fontSize:10,color:'#dc2626',padding:'3px 8px',background:'#fef2f2',borderRadius:5,fontFamily:'var(--font-mono)'}}>{e.msg}</div>)}</div></div>}
                  {goodRows.length===0&&<div className="alert alert-danger" style={{marginBottom:12,fontSize:12}}>No valid rows to import.</div>}
                  <div style={{background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:8,padding:'10px 13px',marginBottom:14,fontSize:12,color:'var(--info)'}}>ℹ️ <strong>{goodRows.length} rows</strong> will be imported into <strong>{selMod.label}</strong>.</div>
                  <div style={{display:'flex',gap:8}}>
                    <button className="btn btn-secondary btn-sm" style={{flex:1}} onClick={reset}>← Back</button>
                    <button className="btn btn-primary btn-sm" style={{flex:2,justifyContent:'center'}} disabled={goodRows.length===0} onClick={commitImport}><CheckCircle size={13}/> Import {goodRows.length} rows <ArrowRight size={13}/></button>
                  </div>
                </div>
              )}
              {step===3 && (
                <div className="card" style={{padding:30,textAlign:'center'}}>
                  <CheckCircle size={48} color="#059669" style={{margin:'0 auto 14px'}}/>
                  <div style={{fontSize:18,fontWeight:800,color:'#059669',marginBottom:6}}>Import Complete!</div>
                  <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:14}}>{goodRows.length} of {rawRows.length} rows imported into <strong>{selMod.label}</strong></div>
                  <button className="btn btn-primary" onClick={reset}><Upload size={13}/> New Import</button>
                </div>
              )}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              {step===1&&<div className="card" style={{padding:18}}><div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Required CSV Columns for <span style={{color:'var(--accent-dark)'}}>{selMod.label}</span></div><div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:10}}>{selMod.columns.map(col=><span key={col} style={{fontSize:11,fontFamily:'var(--font-mono)',background:'var(--surface-sunken)',border:'1px solid var(--border)',padding:'3px 9px',borderRadius:6,color:'var(--text-secondary)'}}>{col}</span>)}</div><div style={{fontSize:11,color:'var(--text-muted)',fontStyle:'italic'}}>Column headers must match exactly. Download sample CSV for reference.</div></div>}
              {step===2&&rawRows.length>0&&<div className="card" style={{overflow:'hidden'}}><div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',fontSize:12,fontWeight:700}}>Preview — First 5 rows</div><div className="table-wrap"><table><thead><tr>{Object.keys(rawRows[0]).map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{rawRows.slice(0,5).map((row,i)=>{const hasErr=errors.some(e=>e.row===i+2);return(<tr key={i} style={{background:hasErr?'#fef2f2':'transparent'}}>{Object.values(row).map((v,j)=><td key={j} style={{fontFamily:'var(--font-mono)',fontSize:11,color:hasErr?'#dc2626':'var(--text-primary)'}}>{v||'—'}</td>)}</tr>);})}</tbody></table></div></div>}
              <div className="card" style={{overflow:'hidden'}}>
                <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}><div style={{fontSize:13,fontWeight:700}}>Import History</div><span style={{fontSize:11,color:'var(--text-muted)'}}>{importJobs.length} jobs</span></div>
                <div className="table-wrap"><table><thead><tr><th>File</th><th>Module</th><th>Date</th><th style={{textAlign:'right'}}>Total</th><th style={{textAlign:'right'}}>OK</th><th style={{textAlign:'right'}}>Err</th><th>Status</th></tr></thead><tbody>
                  {importJobs.length===0&&<tr><td colSpan={7} style={{textAlign:'center',padding:'24px 0',color:'var(--text-muted)',fontSize:12}}>No imports yet</td></tr>}
                  {importJobs.map(j=>{const sc:Record<string,[string,string]>={COMPLETED:['#059669','#ecfdf5'],FAILED:['#dc2626','#fef2f2'],PARTIAL:['#d97706','#fffbeb'],PROCESSING:['#2563eb','#eff6ff'],PENDING:['#94a3b8','#f8fafc']};const[c,bg]=sc[j.status]||['#64748b','#f8fafc'];return(<tr key={j.id}><td style={{fontSize:11,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={j.fileName}>{j.fileName}</td><td style={{fontSize:10,color:'var(--text-muted)',whiteSpace:'nowrap'}}>{j.sourceModule.replace('_',' ')}</td><td style={{fontSize:11,color:'var(--text-muted)'}}>{j.createdAt}</td><td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12}}>{j.totalRows}</td><td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'#059669',fontWeight:600}}>{j.successRows}</td><td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:j.errorRows>0?'#dc2626':'var(--text-muted)'}}>{j.errorRows}</td><td><span style={{fontSize:9,fontWeight:700,color:c,background:bg,padding:'2px 7px',borderRadius:99,border:`1px solid ${c}30`,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{j.status}</span></td></tr>);})}</tbody></table></div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── DOCUMENT MODE ── */}
      {importMode === 'DOCUMENT' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr',gap:20}}>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {docStep===1 && (
              <div className="card" style={{padding:20}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Document Type</div>
                <div style={{display:'flex',gap:8,marginBottom:16}}>
                  {(['AWB','INVOICE'] as const).map(t=>(
                    <button key={t} type="button" className={`btn ${docType===t?'btn-primary':'btn-secondary'}`} style={{flex:1,justifyContent:'center'}} onClick={()=>setDocType(t)}>
                      {t==='AWB'?<FileText size={13}/>:<FileText size={13}/>} {t==='AWB'?'Air Waybill (AWB)':'Tax Invoice'}
                    </button>
                  ))}
                </div>
                <div style={{background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:8,padding:'10px 13px',marginBottom:14,fontSize:12,color:'var(--info)'}}>
                  {docType==='AWB'
                    ? 'ℹ️ Upload an AWB document. Text/PDF files are auto-parsed. For images (JPG/PNG), fill in the fields while viewing the preview.'
                    : 'ℹ️ Upload a tax invoice. Text/PDF files are auto-parsed. For images, fill in the fields manually.'}
                </div>
                <div className={`drop-zone${docDragOver?' drag-over':''}`} onDragOver={e=>{e.preventDefault();setDocDragOver(true);}} onDragLeave={()=>setDocDragOver(false)} onDrop={handleDocDrop} onClick={()=>docFileRef.current?.click()}>
                  <Upload size={28} style={{margin:'0 auto 10px',color:'var(--text-muted)'}}/>
                  <div style={{fontSize:13,fontWeight:600}}>Drop {docType==='AWB'?'AWB':'Invoice'} document here</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>or <span style={{color:'var(--accent-dark)',fontWeight:600}}>click to browse</span></div>
                  <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:10,flexWrap:'wrap'}}>
                    {[{ext:'PDF',icon:'📄'},{ext:'TXT',icon:'📝'},{ext:'JPG',icon:'🖼️'},{ext:'PNG',icon:'🖼️'}].map(f=>(
                      <span key={f.ext} style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:'var(--surface-sunken)',border:'1px solid var(--border)',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{f.icon} {f.ext}</span>
                    ))}
                  </div>
                  <input ref={docFileRef} type="file" accept=".txt,.pdf,.csv,.jpg,.jpeg,.png,.webp" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)loadDocumentFile(f);e.target.value='';}}/>
                </div>
              </div>
            )}

            {docStep===2 && docType==='AWB' && (
              <div className="card" style={{padding:20,overflowY:'auto',maxHeight:'calc(100vh - 200px)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:700}}>
                    {docFileType==='image' ? '🖼️ Image Uploaded' : docFileType==='pdf' ? '📄 PDF Loaded' : '📝 AWB Data'}
                  </div>
                  <span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{docFileName}</span>
                </div>

                {docFileType==='image' ? (
                  <div style={{background:'var(--warning-bg)',border:'1px solid var(--warning-border)',borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:12,color:'var(--warning)'}}>
                    🖼️ Image uploaded — view the preview on the right and fill in the fields below.
                  </div>
                ) : (
                  <div style={{background:'var(--success-bg)',border:'1px solid var(--success-border)',borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:12,color:'#059669'}}>
                    ✓ {editingAwb.awbNo ? `AWB ${editingAwb.awbNo} extracted — review all fields before importing.` : 'File loaded — fill in the fields below.'}
                  </div>
                )}

                {/* Section: AWB Core */}
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,marginTop:4}}>AWB Details</div>
                <div className="form-row form-row-2" style={{marginBottom:10}}>
                  <div className="form-group"><label className="label">AWB Number *</label><input className="input" style={{fontSize:12,fontFamily:'var(--font-mono)',fontWeight:700}} value={editingAwb.awbNo} onChange={e=>setEditingAwb(v=>({...v,awbNo:e.target.value}))}/></div>
                  <div className="form-group"><label className="label">Airline *</label><input className="input" style={{fontSize:12}} value={editingAwb.airlineName} onChange={e=>setEditingAwb(v=>({...v,airlineName:e.target.value}))}/></div>
                </div>
                <div className="form-row form-row-3" style={{marginBottom:10}}>
                  <div className="form-group"><label className="label">Origin *</label><input className="input" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.origin} onChange={e=>setEditingAwb(v=>({...v,origin:e.target.value.toUpperCase()}))}/></div>
                  <div className="form-group"><label className="label">Destination *</label><input className="input" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.destination} onChange={e=>setEditingAwb(v=>({...v,destination:e.target.value.toUpperCase()}))}/></div>
                  <div className="form-group"><label className="label">Carrier Code</label><input className="input" style={{fontSize:12}} value={editingAwb.carrierCode} onChange={e=>setEditingAwb(v=>({...v,carrierCode:e.target.value}))}/></div>
                </div>
                <div className="form-row form-row-3" style={{marginBottom:10}}>
                  <div className="form-group"><label className="label">Flight No.</label><input className="input" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.flightNo} onChange={e=>setEditingAwb(v=>({...v,flightNo:e.target.value}))}/></div>
                  <div className="form-group"><label className="label">Flight Date</label><input className="input" type="date" style={{fontSize:12}} value={editingAwb.flightDate} onChange={e=>setEditingAwb(v=>({...v,flightDate:e.target.value,bookingDate:e.target.value}))}/></div>
                  <div className="form-group"><label className="label">Booking Date</label><input className="input" type="date" style={{fontSize:12}} value={editingAwb.bookingDate} onChange={e=>setEditingAwb(v=>({...v,bookingDate:e.target.value}))}/></div>
                </div>

                {/* Section: Shipment */}
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,marginTop:12}}>Shipment</div>
                <div className="form-row form-row-3" style={{marginBottom:10}}>
                  <div className="form-group"><label className="label">Pieces *</label><input className="input" type="number" style={{fontSize:12}} value={editingAwb.pieces||''} onChange={e=>setEditingAwb(v=>({...v,pieces:parseInt(e.target.value)||0}))}/></div>
                  <div className="form-group"><label className="label">Gross Weight (kg) *</label><input className="input" type="number" step="0.01" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.weight||''} onChange={e=>setEditingAwb(v=>({...v,weight:parseFloat(e.target.value)||0}))}/></div>
                  <div className="form-group"><label className="label">Chargeable Wt (kg)</label><input className="input" type="number" step="0.01" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.chargeableWeight||''} onChange={e=>setEditingAwb(v=>({...v,chargeableWeight:parseFloat(e.target.value)||0}))}/></div>
                </div>
                <div className="form-row form-row-3" style={{marginBottom:10}}>
                  <div className="form-group"><label className="label">Commodity</label><input className="input" style={{fontSize:12}} value={editingAwb.commodity} onChange={e=>setEditingAwb(v=>({...v,commodity:e.target.value}))}/></div>
                  <div className="form-group"><label className="label">Commodity Code</label><input className="input" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.commodityCode} onChange={e=>setEditingAwb(v=>({...v,commodityCode:e.target.value}))}/></div>
                  <div className="form-group"><label className="label">Dimensions (cm)</label><input className="input" style={{fontSize:12}} value={editingAwb.dimensions} onChange={e=>setEditingAwb(v=>({...v,dimensions:e.target.value}))}/></div>
                </div>

                {/* Section: Rates */}
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,marginTop:12}}>Rates & Charges</div>
                <div className="form-row form-row-3" style={{marginBottom:10}}>
                  <div className="form-group"><label className="label">Base Rate (₹/kg) *</label><input className="input" type="number" step="0.01" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.baseRate||''} onChange={e=>setEditingAwb(v=>({...v,baseRate:parseFloat(e.target.value)||0}))}/></div>
                  <div className="form-group"><label className="label">Freight Amount (₹)</label><input className="input" type="number" step="0.01" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.freightAmount||''} onChange={e=>setEditingAwb(v=>({...v,freightAmount:parseFloat(e.target.value)||0}))}/></div>
                  <div className="form-group"><label className="label">Currency</label><input className="input" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.currency} onChange={e=>setEditingAwb(v=>({...v,currency:e.target.value}))}/></div>
                </div>
                <div className="form-row form-row-3" style={{marginBottom:10}}>
                  <div className="form-group"><label className="label">Other Charges (Agent)</label><input className="input" type="number" step="0.01" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.totalOtherChargesDueAgent||''} onChange={e=>setEditingAwb(v=>({...v,totalOtherChargesDueAgent:parseFloat(e.target.value)||0}))}/></div>
                  <div className="form-group"><label className="label">Other Charges (Carrier)</label><input className="input" type="number" step="0.01" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.totalOtherChargesDueCarrier||''} onChange={e=>setEditingAwb(v=>({...v,totalOtherChargesDueCarrier:parseFloat(e.target.value)||0}))}/></div>
                  <div className="form-group"><label className="label">Total Prepaid (₹) *</label><input className="input" type="number" step="0.01" style={{fontSize:12,fontFamily:'var(--font-mono)',fontWeight:700}} value={editingAwb.totalPrepaid||''} onChange={e=>setEditingAwb(v=>({...v,totalPrepaid:parseFloat(e.target.value)||0,totalAmount:parseFloat(e.target.value)||0}))}/></div>
                </div>

                {/* Section: Shipper */}
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,marginTop:12}}>Shipper</div>
                <div className="form-row form-row-2" style={{marginBottom:10}}>
                  <div className="form-group"><label className="label">Shipper Name *</label><input className="input" style={{fontSize:12}} value={editingAwb.shipperName} onChange={e=>setEditingAwb(v=>({...v,shipperName:e.target.value}))}/></div>
                  <div className="form-group"><label className="label">Shipper Phone</label><input className="input" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.shipperPhone} onChange={e=>setEditingAwb(v=>({...v,shipperPhone:e.target.value}))}/></div>
                </div>
                <div className="form-group" style={{marginBottom:10}}>
                  <label className="label">Shipper Address</label>
                  <input className="input" style={{fontSize:12}} value={editingAwb.shipperAddress} onChange={e=>setEditingAwb(v=>({...v,shipperAddress:e.target.value}))}/>
                </div>

                {/* Section: Consignee */}
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,marginTop:12}}>Consignee</div>
                <div className="form-row form-row-2" style={{marginBottom:10}}>
                  <div className="form-group"><label className="label">Consignee Name</label><input className="input" style={{fontSize:12}} value={editingAwb.consigneeName} onChange={e=>setEditingAwb(v=>({...v,consigneeName:e.target.value}))}/></div>
                  <div className="form-group"><label className="label">Consignee Phone</label><input className="input" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.consigneePhone} onChange={e=>setEditingAwb(v=>({...v,consigneePhone:e.target.value}))}/></div>
                </div>
                <div className="form-group" style={{marginBottom:10}}>
                  <label className="label">Consignee Address</label>
                  <input className="input" style={{fontSize:12}} value={editingAwb.consigneeAddress} onChange={e=>setEditingAwb(v=>({...v,consigneeAddress:e.target.value}))}/>
                </div>

                {/* Section: Agent */}
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,marginTop:12}}>Agent & Execution</div>
                <div className="form-row form-row-2" style={{marginBottom:10}}>
                  <div className="form-group"><label className="label">Issuing Agent</label><input className="input" style={{fontSize:12}} value={editingAwb.issuingAgent} onChange={e=>setEditingAwb(v=>({...v,issuingAgent:e.target.value}))}/></div>
                  <div className="form-group"><label className="label">Executed By</label><input className="input" style={{fontSize:12}} value={editingAwb.executedBy} onChange={e=>setEditingAwb(v=>({...v,executedBy:e.target.value}))}/></div>
                </div>
                <div className="form-row form-row-2" style={{marginBottom:16}}>
                  <div className="form-group"><label className="label">Executed At (datetime)</label><input className="input" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.executedAt} onChange={e=>setEditingAwb(v=>({...v,executedAt:e.target.value}))}/></div>
                  <div className="form-group"><label className="label">Executed Place</label><input className="input" style={{fontSize:12,fontFamily:'var(--font-mono)'}} value={editingAwb.executedPlace} onChange={e=>setEditingAwb(v=>({...v,executedPlace:e.target.value}))}/></div>
                </div>

                {/* Summary strip */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16,padding:'12px',background:'var(--surface-sunken)',borderRadius:10,border:'1px solid var(--border)'}}>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>Freight</div>
                    <div style={{fontSize:15,fontWeight:800,fontFamily:'var(--font-mono)',color:'var(--text-primary)'}}>₹{(editingAwb.freightAmount||0).toLocaleString('en-IN')}</div>
                  </div>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em'}}>Other Charges</div>
                    <div style={{fontSize:15,fontWeight:800,fontFamily:'var(--font-mono)',color:'var(--text-primary)'}}>₹{((editingAwb.totalOtherChargesDueAgent||0)+(editingAwb.totalOtherChargesDueCarrier||0)).toLocaleString('en-IN')}</div>
                  </div>
                  <div style={{textAlign:'center',background:'var(--accent-subtle)',borderRadius:8,padding:'4px 0'}}>
                    <div style={{fontSize:10,color:'var(--accent-dark)',textTransform:'uppercase',letterSpacing:'0.07em'}}>Total Prepaid</div>
                    <div style={{fontSize:15,fontWeight:800,fontFamily:'var(--font-mono)',color:'var(--accent-dark)'}}>₹{(editingAwb.totalPrepaid||0).toLocaleString('en-IN')}</div>
                  </div>
                </div>

                <div style={{display:'flex',gap:8}}>
                  <button className="btn btn-secondary btn-sm" style={{flex:1}} onClick={resetDoc}>← Back</button>
                  <button className="btn btn-primary btn-sm" style={{flex:2,justifyContent:'center'}} disabled={!editingAwb.awbNo} onClick={commitDocumentImport}><CheckCircle size={13}/> Import AWB</button>
                </div>
              </div>
            )}

            {docStep===2 && docType==='INVOICE' && parsedInvoice && (
              <div className="card" style={{padding:20}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:700}}>
                    {docFileType==='image' ? '🖼️ Invoice Image' : '📄 Extracted Invoice Data'}
                  </div>
                  <span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{docFileName}</span>
                </div>
                {docFileType==='image' ? (
                  <div style={{background:'var(--warning-bg)',border:'1px solid var(--warning-border)',borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:12,color:'var(--warning)'}}>
                    🖼️ Image uploaded. View the preview on the right. Manual import will create a placeholder booking.
                  </div>
                ) : (
                  <div style={{background:'var(--success-bg)',border:'1px solid var(--success-border)',borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:12,color:'#059669'}}>
                    ✓ {parsedInvoice.rows.length > 0 ? `${parsedInvoice.rows.length} AWB rows extracted from invoice ${parsedInvoice.billNo}` : 'File loaded — no rows auto-detected.'}
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
                  <div style={{fontSize:12}}><span style={{color:'var(--text-muted)'}}>Bill No: </span><strong>{parsedInvoice.billNo||'—'}</strong></div>
                  <div style={{fontSize:12}}><span style={{color:'var(--text-muted)'}}>Date: </span><strong>{parsedInvoice.date||'—'}</strong></div>
                  <div style={{fontSize:12}}><span style={{color:'var(--text-muted)'}}>Party: </span><strong>{parsedInvoice.partyName||'—'}</strong></div>
                  <div style={{fontSize:12}}><span style={{color:'var(--text-muted)'}}>IGST: </span><strong>{parsedInvoice.igstRate}% = ₹{fmtNum(parsedInvoice.igst)}</strong></div>
                  <div style={{fontSize:12}}><span style={{color:'var(--text-muted)'}}>Subtotal: </span><strong>₹{fmtNum(parsedInvoice.subtotal)}</strong></div>
                  <div style={{fontSize:12}}><span style={{color:'var(--text-muted)'}}>Grand Total: </span><strong style={{color:'var(--accent-dark)'}}>₹{fmtNum(parsedInvoice.grandTotal)}</strong></div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button className="btn btn-secondary btn-sm" style={{flex:1}} onClick={resetDoc}>← Back</button>
                  <button className="btn btn-primary btn-sm" style={{flex:2,justifyContent:'center'}} onClick={commitDocumentImport} disabled={parsedInvoice.rows.length===0&&docFileType!=='image'}>
                    <CheckCircle size={13}/> {parsedInvoice.rows.length > 0 ? `Import ${parsedInvoice.rows.length} Bookings` : 'Import'}
                  </button>
                </div>
              </div>
            )}

            {docStep===3 && (
              <div className="card" style={{padding:30,textAlign:'center'}}>
                <CheckCircle size={48} color="#059669" style={{margin:'0 auto 14px'}}/>
                <div style={{fontSize:18,fontWeight:800,color:'#059669',marginBottom:6}}>Document Imported!</div>
                <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:14}}>Data from <strong>{docFileName}</strong> has been imported successfully.</div>
                <button className="btn btn-primary" onClick={resetDoc}><Upload size={13}/> Import Another</button>
              </div>
            )}
          </div>

          {/* Right panel — preview */}
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {docStep===2 && docType==='INVOICE' && parsedInvoice && parsedInvoice.rows.length>0 && (
              <div className="card" style={{overflow:'hidden'}}>
                <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',fontSize:12,fontWeight:700}}>Invoice Rows Preview</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>AWB No.</th><th>Route</th><th style={{textAlign:'right'}}>Pcs</th><th style={{textAlign:'right'}}>Wt</th><th style={{textAlign:'right'}}>Freight</th><th style={{textAlign:'right'}}>TSP</th><th style={{textAlign:'right'}}>Amount</th></tr></thead>
                    <tbody>
                      {parsedInvoice.rows.map((row,i)=>(
                        <tr key={i}>
                          <td style={{fontSize:11}}>{row.date}</td>
                          <td style={{fontFamily:'var(--font-mono)',fontSize:11,fontWeight:700}}>{row.awbNo}</td>
                          <td><span style={{fontFamily:'var(--font-mono)',fontSize:10,background:'var(--surface-sunken)',padding:'2px 6px',borderRadius:4}}>{row.origin}→{row.destination}</span></td>
                          <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:11}}>{row.pieces}</td>
                          <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:11}}>{row.weight}</td>
                          <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:11}}>₹{fmtNum(row.freight)}</td>
                          <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:11}}>₹{fmtNum(row.tsp)}</td>
                          <td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:11,fontWeight:700}}>₹{fmtNum(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Image preview panel — shown when a JPG/PNG was uploaded */}
            {docStep===2 && docImagePreview && (
              <div className="card" style={{overflow:'hidden'}}>
                <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{fontSize:12,fontWeight:700}}>📎 Document Preview</div>
                  <span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{docFileName}</span>
                </div>
                <div style={{padding:12,background:'var(--surface-sunken)'}}>
                  <img
                    src={docImagePreview}
                    alt="Uploaded document"
                    style={{width:'100%',borderRadius:8,border:'1px solid var(--border)',objectFit:'contain',maxHeight:480,background:'#fff'}}
                  />
                  <div style={{marginTop:8,fontSize:11,color:'var(--text-muted)',textAlign:'center'}}>
                    Refer to this image while filling in the fields on the left
                  </div>
                </div>
              </div>
            )}

            {docStep===2 && docType==='AWB' && Object.keys(editingAwb.otherCharges).length>0 && (
              <div className="card" style={{padding:18}}>
                <div style={{fontSize:12,fontWeight:700,marginBottom:10}}>Other Charges Breakdown</div>
                {Object.entries(editingAwb.otherCharges).map(([key,val])=>(
                  <div key={key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
                    <span style={{color:'var(--text-secondary)'}}>{key}</span>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <input
                        type="number" step="0.01"
                        style={{width:90,textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,background:'var(--surface-sunken)',border:'1px solid var(--border)',borderRadius:6,padding:'2px 6px'}}
                        value={val}
                        onChange={e=>setEditingAwb(v=>({...v,otherCharges:{...v.otherCharges,[key]:parseFloat(e.target.value)||0}}))}
                      />
                    </div>
                  </div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',fontSize:13,fontWeight:700}}>
                  <span>Total Other Charges</span>
                  <span style={{fontFamily:'var(--font-mono)',color:'var(--accent-dark)'}}>₹{fmtNum(Object.values(editingAwb.otherCharges).reduce((s,v)=>s+v,0))}</span>
                </div>
              </div>
            )}

            <div className="card" style={{overflow:'hidden'}}>
              <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}><div style={{fontSize:13,fontWeight:700}}>Import History</div><span style={{fontSize:11,color:'var(--text-muted)'}}>{importJobs.length} jobs</span></div>
              <div className="table-wrap"><table><thead><tr><th>File</th><th>Module</th><th>Type</th><th>Date</th><th style={{textAlign:'right'}}>OK</th><th>Status</th></tr></thead><tbody>
                {importJobs.length===0&&<tr><td colSpan={6} style={{textAlign:'center',padding:'24px 0',color:'var(--text-muted)',fontSize:12}}>No imports yet</td></tr>}
                {importJobs.map(j=>{const sc:Record<string,[string,string]>={COMPLETED:['#059669','#ecfdf5'],FAILED:['#dc2626','#fef2f2'],PARTIAL:['#d97706','#fffbeb'],PROCESSING:['#2563eb','#eff6ff'],PENDING:['#94a3b8','#f8fafc']};const[c,bg]=sc[j.status]||['#64748b','#f8fafc'];return(<tr key={j.id}><td style={{fontSize:11,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={j.fileName}>{j.fileName}</td><td style={{fontSize:10,color:'var(--text-muted)'}}>{j.sourceModule.replace('_',' ')}</td><td style={{fontSize:10,color:'var(--text-muted)'}}>{j.fileType}</td><td style={{fontSize:11,color:'var(--text-muted)'}}>{j.createdAt}</td><td style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'#059669',fontWeight:600}}>{j.successRows}</td><td><span style={{fontSize:9,fontWeight:700,color:c,background:bg,padding:'2px 7px',borderRadius:99,border:`1px solid ${c}30`,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{j.status}</span></td></tr>);})}</tbody></table></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
