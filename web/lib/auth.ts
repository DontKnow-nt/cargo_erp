import { getServerSession, type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { serverLog } from '@/lib/logger';

// ── Rate limiter ──────────────────────────────────────────────────────────────
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(email: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(email);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(email, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

function clearAttempts(email: string) { loginAttempts.delete(email); }

// ── Auth options ──────────────────────────────────────────────────────────────
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const ip = req?.headers?.['x-forwarded-for'] ?? 'unknown';
        const email = credentials.email.toLowerCase();
        if (isRateLimited(email)) {
          serverLog('warn', 'auth.rate_limited', { email, ip });
          return null;
        }
        try {
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user || user.status !== 'ACTIVE') {
            serverLog('warn', 'auth.login_failed', { email, reason: 'user_not_found_or_inactive', ip });
            return null;
          }
          const valid = await bcrypt.compare(credentials.password, user.passwordHash);
          if (!valid) {
            serverLog('warn', 'auth.login_failed', { email, reason: 'invalid_password', ip });
            return null;
          }
          clearAttempts(email);
          serverLog('info', 'auth.login_success', { userId: user.id, email: user.email, ip });
          return { id: user.id, name: user.name, email: user.email, role: user.role };
        } catch (err) {
          serverLog('error', 'auth.login_error', { email, error: String(err) });
          return null;
        }
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 }, // 30 days
  jwt: { maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.role = (user as { role?: string }).role ?? 'VIEWER'; token.id = user.id; }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string; id?: string }).role = token.role as string;
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
  pages: { signIn: '/login', error: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
export type UserRole = 'SUPER_ADMIN' | 'OPERATIONS_MANAGER' | 'ACCOUNTS_EXECUTIVE' | 'VIEWER';

const ROLE_HIERARCHY: Record<string, number> = {
  SUPER_ADMIN: 4, OPERATIONS_MANAGER: 3, ACCOUNTS_EXECUTIVE: 2, VIEWER: 1,
};

export async function getSession() { return getServerSession(authOptions); }

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  return session;
}

export async function requireRole(minRole: UserRole) {
  const session = await requireAuth();
  const userRole = (session.user as { role?: string }).role ?? 'VIEWER';
  if ((ROLE_HIERARCHY[userRole] ?? 0) < (ROLE_HIERARCHY[minRole] ?? 0)) redirect('/unauthorized');
  return session;
}

export function hasRole(userRole: string, minRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0);
}
