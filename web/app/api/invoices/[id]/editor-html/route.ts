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
  const { html } = await req.json();
  const totals = typeof html === 'string' ? extractEditorInvoiceTotals(html) : null;

  await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({
      where: { id },
      select: { paidTotal: true },
    });
    if (!inv) throw new Error('Invoice not found');

    if (!totals) {
      await tx.invoice.update({ where: { id }, data: { editorHtml: html } });
      return;
    }

    const outstandingTotal = Math.max(0, totals.grandTotal - inv.paidTotal);
    await tx.invoice.update({
      where: { id },
      data: {
        editorHtml: html,
        subtotal: totals.subtotal,
        gstTotal: totals.gstTotal,
        grandTotal: totals.grandTotal,
        outstandingTotal,
      },
    });
    await tx.outstandingEntry.updateMany({
      where: { invoiceId: id },
      data: {
        originalAmount: totals.grandTotal,
        paidAmount: inv.paidTotal,
        outstandingAmount: outstandingTotal,
      },
    });
  });

  return NextResponse.json({ ok: true, totals });
}
