export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function integerToIndianWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (num === 0) return 'Zero';
  if (num < 20) return ones[num];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
  if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + integerToIndianWords(num % 100) : '');
  if (num < 100000) return integerToIndianWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + integerToIndianWords(num % 1000) : '');
  if (num < 10000000) return integerToIndianWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + integerToIndianWords(num % 100000) : '');
  return integerToIndianWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + integerToIndianWords(num % 10000000) : '');
}

export function amountToWords(value: number): string {
  const rounded = roundCurrency(Math.abs(value));
  let rupees = Math.floor(rounded);
  let paise = Math.round((rounded - rupees) * 100);
  if (paise === 100) {
    rupees += 1;
    paise = 0;
  }

  const sign = value < 0 ? 'Minus ' : '';
  const rupeeWords = `${sign}Rupees ${integerToIndianWords(rupees)}`;
  const paiseWords = paise > 0 ? ` and Paise ${integerToIndianWords(paise)}` : '';
  return `${rupeeWords}${paiseWords} Only`;
}

function decodeHtmlText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|td|tr|li|span)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#8377;|&rupee;/gi, '₹')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function parseAmount(raw: string | undefined) {
  if (!raw) return null;
  const cleaned = raw.replace(/[₹,\s]/g, '');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

function amountAfter(text: string, pattern: RegExp) {
  const line = text.split('\n').find((entry) => pattern.test(entry));
  if (!line) return null;
  const matches = [...line.matchAll(/[+-]?\s*₹?\s*\d[\d,]*(?:\.\d+)?/g)];
  return parseAmount(matches[matches.length - 1]?.[0]);
}

export function extractEditorInvoiceTotals(html: string) {
  const text = decodeHtmlText(html);
  const subtotal = amountAfter(text, /Total\s+Taxable\s+Amount/i);
  const netPayable = amountAfter(text, /Net\s+Payable\s+Amount/i);
  if (subtotal == null || netPayable == null) return null;

  const sgst = amountAfter(text, /SGST\s*@/i) ?? 0;
  const cgst = amountAfter(text, /CGST\s*@/i) ?? 0;
  const igst = amountAfter(text, /IGST\s*@/i) ?? 0;
  const explicitGst = roundCurrency(sgst + cgst + igst);
  const inferredGst = roundCurrency(netPayable - subtotal);

  return {
    subtotal: roundCurrency(subtotal),
    gstTotal: explicitGst > 0 ? explicitGst : inferredGst,
    grandTotal: roundCurrency(netPayable),
  };
}
