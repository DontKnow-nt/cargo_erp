import { notFound, redirect } from 'next/navigation';
import { AutoPrint } from '@/components/AutoPrint';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

type BankRecord = Awaited<ReturnType<typeof prisma.bankDetail.findMany>>[number];
type BankView = {
  account_name: string;
  bank_name: string;
  branch: string;
  account_number: string;
  ifsc: string;
};

interface InvoiceLine {
  id: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
}

interface Invoice {
  id: string;
  invoice_no: string;
  party_name: string;
  booking_type: string;
  booking_ref: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  gst_total: number;
  grand_total: number;
  paid_total: number;
  outstanding_total: number;
  status: string;
  lines: InvoiceLine[];
}

function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberToWords(num: number): string {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (num === 0) return 'Zero';
  function convert(n: number): string {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '');
    if (n < 1000) return ones[Math.floor(n/100)]+' Hundred'+(n%100 ? ' '+convert(n%100) : '');
    if (n < 100000) return convert(Math.floor(n/1000))+' Thousand'+(n%1000 ? ' '+convert(n%1000) : '');
    if (n < 10000000) return convert(Math.floor(n/100000))+' Lakh'+(n%100000 ? ' '+convert(n%100000) : '');
    return convert(Math.floor(n/10000000))+' Crore'+(n%10000000 ? ' '+convert(n%10000000) : '');
  }
  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);
  let result = convert(intPart);
  if (decPart > 0) result += ' and Paise ' + convert(decPart);
  return result + ' Only';
}

export default async function InvoicePrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ data?: string }> }) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const { data: encodedData } = await searchParams;

  // Try DB first
  const dbInvoice = await prisma.invoice.findUnique({ where: { id }, include: { lines: true } });
  let inv = dbInvoice as unknown as Invoice | undefined;

  // Fallback: invoice data passed as base64 JSON (for Zustand-backed invoices not yet in DB)
  if (!inv && encodedData) {
    try {
      inv = JSON.parse(Buffer.from(decodeURIComponent(encodedData), 'base64').toString('utf8')) as Invoice;
    } catch { /* ignore */ }
  }

  if (!inv) notFound();

  // Normalize: Zustand invoices use camelCase, DB uses snake_case
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = inv as any;
  if (!inv.invoice_date && raw.invoiceDate) {
    inv.invoice_date = raw.invoiceDate;
    inv.due_date = raw.dueDate;
    inv.grand_total = raw.grandTotal;
    inv.gst_total = raw.gstTotal;
    inv.paid_total = raw.paidTotal;
    inv.outstanding_total = raw.outstandingTotal;
    inv.booking_ref = raw.bookingRef;
    inv.booking_type = raw.bookingType;
    inv.invoice_no = raw.invoiceNo;
    inv.party_name = raw.partyName;
    if (raw.lines) {
      inv.lines = raw.lines.map((l: any) => ({
        ...l,
        tax_rate: l.taxRate ?? l.tax_rate,
        tax_amount: l.taxAmount ?? l.tax_amount,
        line_total: l.lineTotal ?? l.line_total,
      }));
    }
  }

  // Fetch lines from DB only if not already present
  if (!inv.lines || inv.lines.length === 0) {
    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId: id }, orderBy: { id: 'asc' } });
    inv.lines = lines as unknown as InvoiceLine[];
  }

  // Fetch banks for print
  const banks = await prisma.bankDetail.findMany({ orderBy: [{ isDefault: 'desc' }] });
  const defaultBank: BankView | undefined = banks[0] ? { account_name: banks[0].accountName, bank_name: banks[0].bankName, branch: banks[0].branch, account_number: banks[0].accountNumber, ifsc: banks[0].ifsc } : undefined;
  const allBanks: BankView[] = banks.map((b: BankRecord) => ({ account_name: b.accountName, bank_name: b.bankName, branch: b.branch, account_number: b.accountNumber, ifsc: b.ifsc }));

  const billDate = inv.invoice_date.split('-').reverse().join('.');
  const amtWords = numberToWords(Math.round(inv.grand_total));
  const igstRate = inv.lines[0]?.tax_rate ?? 18;

  return (
    <html lang="en">
      <head>
        <title>Tax Invoice - {inv.invoice_no}</title>
        <meta charSet="utf-8" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 10.5px; color: #000; padding: 18px; }
          .co-name { font-size: 20px; font-weight: bold; text-align: center; }
          .co-sub { font-size: 10px; text-align: center; margin: 1px 0; }
          .title { text-align: center; font-size: 12px; font-weight: bold; text-decoration: underline; margin: 6px 0 5px; }
          table { width: 100%; border-collapse: collapse; }
          th { border: 1px solid #000; padding: 4px 5px; background: #f0f0f0; font-size: 9.5px; text-align: center; font-weight: bold; }
          td { font-size: 10px; vertical-align: middle; }
          .cell { border: 1px solid #000; padding: 4px 6px; }
          @media print { body { padding: 10px; } @page { size: A4 landscape; margin: 10mm; } }
        `}</style>
      </head>
      <body>
        {/* Header */}
        <table style={{ marginBottom: 4, border: 'none' }}>
          <tbody>
            <tr>
              <td style={{ width: '15%', border: 'none', textAlign: 'center', verticalAlign: 'middle' }}>
                <img src="/logo.png" alt="Triveni Logo" style={{ width: 90, height: 90, objectFit: 'contain' }} />
              </td>
              <td style={{ border: 'none', verticalAlign: 'middle', textAlign: 'center' }}>
                <div className="co-name">TRIVENI ENTERPRISES</div>
                <div className="co-sub">Domestic Air Cargo &amp; Rail Agent</div>
                <div className="co-sub">Plot No 480, Flat No 301, 2nd Floor, L-Block, Gali No 15, Mahipalpur Extension, New Delhi 110037</div>
                <div className="co-sub">Web: www.tceipl.com  |  Email: info@tceipl.com</div>
              </td>
              <td style={{ width: '15%', border: 'none', textAlign: 'center', verticalAlign: 'middle' }}>
                <img src="/iata.png" alt="IATA Logo" style={{ width: 130, height: 90, objectFit: 'contain' }} />
              </td>
            </tr>
          </tbody>
        </table>

        <div className="title" style={{ textAlign: 'center' }}>TAX INVOICE</div>

        {/* Party + Bill Info */}
        <table style={{ marginBottom: 5 }}>
          <tbody>
            <tr>
              <td style={{ width: '58%', border: '1px solid #000', padding: '5px 7px', verticalAlign: 'top' }}>
                <div><strong>M/s :</strong> &nbsp;<strong>{inv.party_name}</strong></div>
              </td>
              <td style={{ width: '42%', border: '1px solid #000', padding: '5px 7px', verticalAlign: 'top' }}>
                <table style={{ width: '100%', border: 'none' }}>
                  <tbody>
                    <tr><td style={{ border: 'none', padding: '1px 0', width: '50%' }}><strong>Bill No. :</strong></td><td style={{ border: 'none', padding: '1px 0' }}>{inv.invoice_no}</td></tr>
                    <tr><td style={{ border: 'none', padding: '1px 0' }}><strong>Bill Date :</strong></td><td style={{ border: 'none', padding: '1px 0' }}>{billDate}</td></tr>
                    <tr><td style={{ border: 'none', padding: '1px 0' }}><strong>Booking Ref :</strong></td><td style={{ border: 'none', padding: '1px 0' }}>{inv.booking_ref}</td></tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Line Items */}
        <table style={{ marginBottom: 5 }}>
          <thead>
            <tr>
              <th style={{ width: '4%' }}>Sl#</th>
              <th>Description</th>
              <th style={{ width: '8%' }}>Qty</th>
              <th style={{ width: '10%' }}>Rate</th>
              <th style={{ width: '12%' }}>Amount</th>
              <th style={{ width: '8%' }}>GST%</th>
              <th style={{ width: '12%' }}>GST Amt</th>
              <th style={{ width: '12%' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((line, i) => (
              <tr key={line.id}>
                <td className="cell" style={{ textAlign: 'center' }}>{i + 1}</td>
                <td className="cell">{line.description}</td>
                <td className="cell" style={{ textAlign: 'right' }}>{line.qty}</td>
                <td className="cell" style={{ textAlign: 'right' }}>{fmt(line.rate)}</td>
                <td className="cell" style={{ textAlign: 'right' }}>{fmt(line.amount)}</td>
                <td className="cell" style={{ textAlign: 'center' }}>{line.tax_rate}%</td>
                <td className="cell" style={{ textAlign: 'right' }}>{fmt(line.tax_amount)}</td>
                <td className="cell" style={{ textAlign: 'right' }}>{fmt(line.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <table style={{ marginBottom: 5 }}>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #000', padding: '4px 7px', width: '60%', verticalAlign: 'top' }}>
                <div><strong>Amount in Words:</strong></div>
                <div style={{ marginTop: 4 }}>{amtWords}</div>
              </td>
              <td style={{ border: '1px solid #000', padding: '4px 7px', verticalAlign: 'top' }}>
                <table style={{ width: '100%', border: 'none' }}>
                  <tbody>
                    <tr><td style={{ border: 'none', padding: '2px 0' }}>Taxable Amount</td><td style={{ border: 'none', padding: '2px 0', textAlign: 'right' }}>₹{fmt(inv.subtotal)}</td></tr>
                    <tr><td style={{ border: 'none', padding: '2px 0' }}>IGST @ {igstRate}%</td><td style={{ border: 'none', padding: '2px 0', textAlign: 'right' }}>₹{fmt(inv.gst_total)}</td></tr>
                    <tr style={{ fontWeight: 'bold', borderTop: '1px solid #000' }}><td style={{ border: 'none', padding: '4px 0' }}>Grand Total</td><td style={{ border: 'none', padding: '4px 0', textAlign: 'right' }}>₹{fmt(inv.grand_total)}</td></tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 16, border: '1px solid #000', padding: '8px 10px' }}>
          <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 6 }}>Payment / Bank Details:</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {allBanks.map((b: BankView, i) => (
              <div key={i} style={{ fontSize: 10, lineHeight: 1.8 }}>
                <div><strong>{b.bank_name}</strong>{i === 0 && allBanks[0]?.account_name === defaultBank?.account_name ? ' (Default)' : ''}</div>
                <div>A/c Name: {b.account_name}</div>
                <div>A/c No: <strong>{b.account_number}</strong></div>
                <div>IFSC: {b.ifsc} | Branch: {b.branch}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 10, color: '#555' }}>
          This is a computer-generated invoice. No signature required.
        </div>

        <AutoPrint />
      </body>
    </html>
  );
}
