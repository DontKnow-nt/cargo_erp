import NextAuth, { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { serverLog } from '@/lib/logger';

// ── In-memory rate limiter: 5 attempts per email per 15 minutes ───────────────
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

function clearAttempts(email: string) {
  loginAttempts.delete(email);
}

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

        // Rate limit check
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
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
  jwt: {
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? 'VIEWER';
        token.id = user.id;
      }
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
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
