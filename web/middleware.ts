import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/api/invoices') ||
    pathname.startsWith('/api/parties') ||
    pathname.startsWith('/api/payments') ||
    pathname.startsWith('/api/admin');

  if (!isProtected) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Per-page permission enforcement is handled server-side in each page/layout
  // (middleware can't access SQLite — Edge runtime limitation)
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/invoices/:path*',
    '/api/parties/:path*',
    '/api/payments/:path*',
    '/api/admin/:path*',
  ],
};
