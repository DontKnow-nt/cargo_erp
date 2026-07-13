import '@/lib/polyfill';
export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserPermittedPages } from '@/lib/permissions';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ pages: [] }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const pages = await getUserPermittedPages(userId);
  return NextResponse.json({ pages });
}

