
import { NextRequest, NextResponse } from 'next/server';
import { serverLog } from '@/lib/logger';

const OC_PASSWORD = process.env.OFFICECONTROL_PASSWORD ?? 'OfficeControl@2024';
const OC_TOKEN = btoa(process.env.NEXTAUTH_SECRET ?? '').slice(0, 32);
const COOKIE_NAME = 'oc_session';

// Rate limiting: 5 attempts per IP per 15 min
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX = 5;
const WINDOW = 15 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > MAX;
}

// Timing-safe comparison — prevents timing attacks
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let result = 0;
  for (let i = 0; i < a.byteLength; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

async function sha256(text: string): Promise<Uint8Array> {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  return new Uint8Array(hashBuffer);
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';

  if (isRateLimited(ip)) {
    serverLog('warn', 'officecontrol.rate_limited', { ip });
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  }

  const { password } = await req.json().catch(() => ({ password: '' }));

  // Timing-safe comparison — prevents timing attacks
  let valid = false;
  try {
    const a = await sha256(password ?? '');
    const b = await sha256(OC_PASSWORD);
    valid = timingSafeEqual(a, b);
  } catch { valid = false; }

  if (!valid) {
    serverLog('warn', 'officecontrol.login_failed', { ip });
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  serverLog('info', 'officecontrol.login_success', { ip });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, OC_TOKEN, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/officecontrol',
    maxAge: 4 * 60 * 60,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
