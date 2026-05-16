import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

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
  await prisma.invoice.update({ where: { id }, data: { editorHtml: html } });
  return NextResponse.json({ ok: true });
}
