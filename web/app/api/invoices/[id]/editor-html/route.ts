import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { extractEditorInvoiceTotals } from '@/lib/invoiceAmounts';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const inv = await prisma.invoice.findUnique({ where: { id }, select: { editorHtml: true } });
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ html: inv.editorHtml ?? null });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { html, grandTotalHint } = await req.json();
  const parsed = typeof html === 'string' ? extractEditorInvoiceTotals(html) : null;
  // grandTotalHint is the Handsontable grid's live computed total (hotGrandTotal).
  // Always prefer it over HTML text parsing when available -- the HTML may contain stale
  // values from old saves, while hotGrandTotal is always the correct live computation.
  // Use HTML-parsed GST breakdown (sgst/cgst/igst) since that comes from the user's
  // GST rate selectors, but override the grandTotal with the authoritative hint.
  let effectiveTotals: { subtotal: number; gstTotal: number; grandTotal: number } | null = null;
  if (typeof grandTotalHint === 'number' && grandTotalHint > 0) {
    const gstTotal = parsed ? parsed.gstTotal : 0;
    effectiveTotals = { subtotal: grandTotalHint, gstTotal, grandTotal: grandTotalHint + gstTotal };
  } else if (parsed) {
    effectiveTotals = parsed;
  }

  await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({
      where: { id },
      select: { paidTotal: true },
    });
    if (!inv) throw new Error('Invoice not found');

    if (!effectiveTotals) {
      await tx.invoice.update({ where: { id }, data: { editorHtml: html } });
      return;
    }

    const outstandingTotal = Math.max(0, effectiveTotals.grandTotal - inv.paidTotal);
    await tx.invoice.update({
      where: { id },
      data: {
        editorHtml: html,
        subtotal: effectiveTotals.subtotal,
        gstTotal: effectiveTotals.gstTotal,
        grandTotal: effectiveTotals.grandTotal,
        outstandingTotal,
      },
    });
    await tx.outstandingEntry.updateMany({
      where: { invoiceId: id },
      data: {
        originalAmount: effectiveTotals.grandTotal,
        paidAmount: inv.paidTotal,
        outstandingAmount: outstandingTotal,
      },
    });
  });

  return NextResponse.json({ ok: true, totals: effectiveTotals });
}
