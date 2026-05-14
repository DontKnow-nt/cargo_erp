/**
 * Safe print utility - uses a dedicated /print/invoice route instead of
 * document.write with raw HTML interpolation (XSS prevention).
 *
 * The print route is a server-rendered page that fetches invoice data
 * server-side and renders it safely using React (no innerHTML).
 */

/**
 * Open the invoice print preview in a new tab.
 * The actual HTML rendering happens server-side via the /print/invoice route.
 */
export function openInvoicePrint(invoiceId: string) {
  const url = `/print/invoice/${encodeURIComponent(invoiceId)}`;
  const win = window.open(url, '_blank', 'width=1100,height=800');
  if (!win) {
    return false; // Popup blocked
  }
  return true;
}

/**
 * Escape a string for safe use in HTML text content.
 * Use this only when you absolutely must build HTML strings client-side.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
