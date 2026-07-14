import '@/lib/polyfill';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { extractEditorInvoiceTotals } from '@/lib/invoiceAmounts';

/**
 * POST /api/admin/repair-invoice-totals
 * Recomputes correct grandTotal/subtotal for invoices by:
 * 1. Summing the actual charge amounts from AWB bookings (weightCharge + otherChargesDueAgent
 *    + otherChargesDueCarrier + valuationCharge + markupAmount) -- ground truth from AWB records.
 * 2. Falling back to re-parsing the saved editorHtml tax summary if no AWB data available.
 * Updates the DB when the recomputed value differs from the stored value.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const invoices = await prisma.invoice.findMany({
    select: { id: true, invoiceNo: true, grandTotal: true, gstTotal: true, subtotal: true, paidTotal: true, editorHtml: true, bookingRef: true, bookingType: true },
  });

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const inv of invoices) {
    try {
      let computedSubtotal: number | null = null;

      // Strategy 1: sum actual AWB charges from booking records
      if (inv.bookingRef) {
        const refs = inv.bookingRef.split(',').map(r => r.trim()).filter(Boolean);
        const awbs = await prisma.awbBooking.findMany({
          where: { awbNo: { in: refs } },
          select: { weightCharge: true, otherChargesDueAgent: true, otherChargesDueCarrier: true, valuationCharge: true, markupAmount: true, totalPrepaid: true },
        });
        const dkts = awbs.length < refs.length
          ? await prisma.docketBooking.findMany({ where: { docketNo: { in: refs } }, select: { rateFittedAmount: true, markupAmount: true } })
          : [];

        if (awbs.length > 0 || dkts.length > 0) {
          let total = 0;
          awbs.forEach(a => {
            const freight = a.weightCharge ?? 0;
            const awbDo = a.otherChargesDueAgent ?? 0;
            const carrier = a.otherChargesDueCarrier ?? 0;
            const forwrd = a.valuationCharge ?? 0;
            const tsp = a.markupAmount ?? 0;
            total += freight + awbDo + carrier + forwrd + tsp;
          });
          dkts.forEach(d => {
            total += d.rateFittedAmount + (d.markupAmount ?? 0);
          });
          if (total > 0) computedSubtotal = parseFloat(total.toFixed(2));
        }
      }

      // Strategy 2: fall back to HTML parsing if AWB data not found
      if (computedSubtotal === null && inv.editorHtml) {
        const parsed = extractEditorInvoiceTotals(inv.editorHtml);
        if (parsed) computedSubtotal = parsed.subtotal;
      }

      if (computedSubtotal === null) { skipped++; continue; }
      if (Math.abs(computedSubtotal - inv.grandTotal) < 0.5) { skipped++; continue; }

      // Re-derive GST from saved HTML since GST rates are set by user in the editor
      let gstTotal = inv.gstTotal;
      if (inv.editorHtml) {
        const parsed = extractEditorInvoiceTotals(inv.editorHtml);
        if (parsed && parsed.gstTotal > 0) gstTotal = parsed.gstTotal;
        else {
          // Re-infer GST from ratio in saved HTML
          const ratio = inv.grandTotal > 0 ? inv.gstTotal / inv.grandTotal : 0;
          gstTotal = parseFloat((computedSubtotal * ratio / (1 - ratio + Number.EPSILON)).toFixed(2));
        }
      }
      const grandTotal = parseFloat((computedSubtotal + gstTotal).toFixed(2));
      const outstandingTotal = Math.max(0, grandTotal - inv.paidTotal);

      await prisma.$transaction([
        prisma.invoice.update({
          where: { id: inv.id },
          data: { grandTotal, subtotal: computedSubtotal, gstTotal, outstandingTotal },
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
