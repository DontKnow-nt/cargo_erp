import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { extractEditorInvoiceTotals } from '@/lib/invoiceAmounts';

/**
 * POST /api/admin/repair-invoice-totals
 * Re-parses editorHtml for all invoices and updates grandTotal/subtotal/gstTotal
 * in the DB for any invoice where the current DB value differs from the HTML.
 * Safe to run multiple times (idempotent).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const invoices = await prisma.invoice.findMany({
    select: { id: true, invoiceNo: true, grandTotal: true, gstTotal: true, subtotal: true, paidTotal: true, editorHtml: true },
  });

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const inv of invoices) {
    if (!inv.editorHtml) { skipped++; continue; }
    const parsed = extractEditorInvoiceTotals(inv.editorHtml);
    if (!parsed) { skipped++; continue; }

    const { grandTotal, subtotal, gstTotal } = parsed;
    // Only update if the parsed value meaningfully differs from DB (allows 1 rupee rounding)
    if (Math.abs(grandTotal - inv.grandTotal) < 1) { skipped++; continue; }

    try {
      const outstandingTotal = Math.max(0, grandTotal - inv.paidTotal);
      await prisma.$transaction([
        prisma.invoice.update({
          where: { id: inv.id },
          data: { grandTotal, subtotal, gstTotal, outstandingTotal },
        }),
        prisma.outstandingEntry.updateMany({
          where: { invoiceId: inv.id },
          data: { originalAmount: grandTotal, outstandingAmount: outstandingTotal, paidAmount: inv.paidTotal },
        }),
      ]);
      updated++;
    } catch (e) {
      errors.push(`${inv.invoiceNo}: ${String(e).slice(0, 80)}`);
    }
  }

  return NextResponse.json({ updated, skipped, total: invoices.length, errors });
}
