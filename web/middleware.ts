import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/print') ||
    pathname.startsWith('/api/invoices') ||
    pathname.startsWith('/api/parties') ||
    pathname.startsWith('/api/payments') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/data') ||
    pathname.startsWith('/api/banks') ||
    pathname.startsWith('/api/user-name') ||
    pathname.startsWith('/api/user-permissions') ||
    pathname.startsWith('/api/check-permission');

  if (!isProtected) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/print/:path*',
    '/api/invoices/:path*',
    '/api/parties/:path*',
    '/api/payments/:path*',
    '/api/admin/:path*',
    '/api/data/:path*',
    '/api/banks/:path*',
    '/api/user-name/:path*',
    '/api/user-permissions/:path*',
    '/api/check-permission/:path*',
  ],
};
