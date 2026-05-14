type LogLevel = 'info' | 'warn' | 'error';

type AuditLogInput = {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
};

/**
 * Structured server-side logger. Never logs passwords, tokens, or full session data.
 * Only call from server-side code (API routes, server actions, middleware).
 */
export function serverLog(level: LogLevel, event: string, data?: Record<string, unknown>) {
  // Sanitize: never log password, token, secret, hash fields
  const safe = data ? sanitize(data) : {};
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...safe,
  };
  // In production, pipe to your log aggregator. For now, use console.
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

export async function recordAuditLog(input: AuditLogInput) {
  try {
    const { default: prisma } = await import('@/lib/prisma');
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        userEmail: input.userEmail ?? null,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        details: input.details ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (error) {
    serverLog('warn', 'audit.persist_failed', {
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? undefined,
      error: String(error),
    });
  }
}

const REDACTED_KEYS = new Set(['password', 'passwordHash', 'password_hash', 'token', 'secret', 'hash', 'authorization', 'cookie']);

function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitize(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
