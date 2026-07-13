export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { DEFAULT_PAGES } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret');
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { searchParams } = req.nextUrl;
  const userId = searchParams.get('userId');
  const page = searchParams.get('page');
  if (!userId || !page) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  if ((DEFAULT_PAGES as readonly string[]).includes(page)) return NextResponse.json({ allowed: true });
  const perm = await prisma.userPermission.findUnique({ where: { userId_page: { userId, page } } });
  if (!perm) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  return NextResponse.json({ allowed: true });
}
