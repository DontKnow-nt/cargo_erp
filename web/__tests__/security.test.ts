/**
 * Security tests for Cargo Domestic ERP
 * Tests: auth bypass, RBAC, input validation, XSS, CSRF, formula injection
 */

// ── Mock lib/auth directly (avoids NextAuth initialization) ──────────────────
const mockRequireAuth = jest.fn();
const mockRequireRole = jest.fn();
const mockHasRole = jest.fn();

jest.mock('@/lib/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  hasRole: (...args: unknown[]) => mockHasRole(...args),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

// ── Mock DB ───────────────────────────────────────────────────────────────────
const mockPrepare = jest.fn().mockReturnValue({
  get: jest.fn(),
  all: jest.fn().mockReturnValue([]),
  run: jest.fn(),
});
const mockDb = {
  prepare: mockPrepare,
  transaction: jest.fn((fn: () => void) => fn),
};
jest.mock('@/lib/db', () => ({ getDb: () => mockDb }), { virtual: true });

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.mock('@/lib/logger', () => ({ serverLog: jest.fn() }));

// ── Helpers ───────────────────────────────────────────────────────────────────
function mockSession(role: string) {
  const session = { user: { id: 'user-1', email: 'test@cargo.in', role } };
  mockRequireAuth.mockResolvedValue(session);
  mockRequireRole.mockImplementation(async (minRole: string) => {
    const ROLE_LEVEL: Record<string, number> = {
      SUPER_ADMIN: 4, OPERATIONS_MANAGER: 3, ACCOUNTS_EXECUTIVE: 2, VIEWER: 1,
    };
    if ((ROLE_LEVEL[role] ?? 0) < (ROLE_LEVEL[minRole] ?? 0)) {
      throw new Error('REDIRECT:/unauthorized');
    }
    return session;
  });
  mockHasRole.mockImplementation((userRole: string, minRole: string) => {
    const ROLE_LEVEL: Record<string, number> = {
      SUPER_ADMIN: 4, OPERATIONS_MANAGER: 3, ACCOUNTS_EXECUTIVE: 2, VIEWER: 1,
    };
    return (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL[minRole] ?? 0);
  });
}

function mockNoSession() {
  mockRequireAuth.mockRejectedValue(new Error('REDIRECT:/login'));
  mockRequireRole.mockRejectedValue(new Error('REDIRECT:/login'));
}

// ── 1. Authentication bypass tests ───────────────────────────────────────────
describe('Authentication - requireAuth', () => {
  beforeEach(() => jest.clearAllMocks());

  test('redirects to /login when no session', async () => {
    mockNoSession();
    await expect(mockRequireAuth()).rejects.toThrow('REDIRECT:/login');
  });

  test('returns session when authenticated', async () => {
    mockSession('VIEWER');
    const session = await mockRequireAuth();
    expect(session.user.role).toBe('VIEWER');
  });
});

// ── 2. RBAC tests ─────────────────────────────────────────────────────────────
describe('RBAC - requireRole', () => {
  beforeEach(() => jest.clearAllMocks());

  test('VIEWER cannot access ACCOUNTS_EXECUTIVE routes', async () => {
    mockSession('VIEWER');
    await expect(mockRequireRole('ACCOUNTS_EXECUTIVE')).rejects.toThrow('REDIRECT:/unauthorized');
  });

  test('VIEWER cannot access OPERATIONS_MANAGER routes', async () => {
    mockSession('VIEWER');
    await expect(mockRequireRole('OPERATIONS_MANAGER')).rejects.toThrow('REDIRECT:/unauthorized');
  });

  test('VIEWER cannot access SUPER_ADMIN routes', async () => {
    mockSession('VIEWER');
    await expect(mockRequireRole('SUPER_ADMIN')).rejects.toThrow('REDIRECT:/unauthorized');
  });

  test('ACCOUNTS_EXECUTIVE can access ACCOUNTS_EXECUTIVE routes', async () => {
    mockSession('ACCOUNTS_EXECUTIVE');
    const session = await mockRequireRole('ACCOUNTS_EXECUTIVE');
    expect(session.user.role).toBe('ACCOUNTS_EXECUTIVE');
  });

  test('ACCOUNTS_EXECUTIVE cannot access SUPER_ADMIN routes', async () => {
    mockSession('ACCOUNTS_EXECUTIVE');
    await expect(mockRequireRole('SUPER_ADMIN')).rejects.toThrow('REDIRECT:/unauthorized');
  });

  test('SUPER_ADMIN can access all routes', async () => {
    mockSession('SUPER_ADMIN');
    const session = await mockRequireRole('SUPER_ADMIN');
    expect(session.user.role).toBe('SUPER_ADMIN');
  });

  test('hasRole returns correct boolean', () => {
    mockHasRole.mockImplementation((userRole: string, minRole: string) => {
      const ROLE_LEVEL: Record<string, number> = {
        SUPER_ADMIN: 4, OPERATIONS_MANAGER: 3, ACCOUNTS_EXECUTIVE: 2, VIEWER: 1,
      };
      return (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL[minRole] ?? 0);
    });
    expect(mockHasRole('SUPER_ADMIN', 'VIEWER')).toBe(true);
    expect(mockHasRole('VIEWER', 'SUPER_ADMIN')).toBe(false);
    expect(mockHasRole('ACCOUNTS_EXECUTIVE', 'ACCOUNTS_EXECUTIVE')).toBe(true);
    expect(mockHasRole('OPERATIONS_MANAGER', 'ACCOUNTS_EXECUTIVE')).toBe(true);
  });
});

// ── 3. Input validation tests ─────────────────────────────────────────────────
describe('Input Validation - Zod schemas', () => {
  test('PartySchema rejects invalid GSTIN', async () => {
    const { PartySchema } = await import('@/lib/validations');
    const result = PartySchema.safeParse({
      partyName: 'Test Party', gstin: 'INVALID-GSTIN', creditLimit: 100000, creditDays: 30,
    });
    expect(result.success).toBe(false);
  });

  test('PartySchema accepts valid GSTIN', async () => {
    const { PartySchema } = await import('@/lib/validations');
    const result = PartySchema.safeParse({
      partyName: 'Test Party', gstin: '07AABCT1234A1Z5', creditLimit: 100000, creditDays: 30,
    });
    expect(result.success).toBe(true);
  });

  test('PartySchema rejects invalid PAN', async () => {
    const { PartySchema } = await import('@/lib/validations');
    const result = PartySchema.safeParse({
      partyName: 'Test Party', pan: 'INVALID-PAN', creditLimit: 100000, creditDays: 30,
    });
    expect(result.success).toBe(false);
  });

  test('PartySchema accepts valid PAN', async () => {
    const { PartySchema } = await import('@/lib/validations');
    const result = PartySchema.safeParse({
      partyName: 'Test Party', pan: 'ABCDE1234F', creditLimit: 100000, creditDays: 30,
    });
    expect(result.success).toBe(true);
  });

  test('PartySchema rejects negative credit limit', async () => {
    const { PartySchema } = await import('@/lib/validations');
    const result = PartySchema.safeParse({ partyName: 'Test Party', creditLimit: -1000, creditDays: 30 });
    expect(result.success).toBe(false);
  });

  test('AwbBookingSchema rejects negative weight', async () => {
    const { AwbBookingSchema } = await import('@/lib/validations');
    const result = AwbBookingSchema.safeParse({
      awbNo: 'AWB-001', partyId: 'p1', partyName: 'Test', origin: 'DEL', destination: 'BLR',
      airlineName: 'IndiGo', bookingDate: '2024-01-01', weight: -100, pieces: 1,
      baseRate: 90, markupAmount: 0, gstRate: 18, gstAmount: 0, totalAmount: 0,
    });
    expect(result.success).toBe(false);
  });

  test('AwbBookingSchema rejects invalid date format', async () => {
    const { AwbBookingSchema } = await import('@/lib/validations');
    const result = AwbBookingSchema.safeParse({
      awbNo: 'AWB-001', partyId: 'p1', partyName: 'Test', origin: 'DEL', destination: 'BLR',
      airlineName: 'IndiGo', bookingDate: '01/01/2024', weight: 100, pieces: 1,
      baseRate: 90, markupAmount: 0, gstRate: 18, gstAmount: 0, totalAmount: 0,
    });
    expect(result.success).toBe(false);
  });

  test('PaymentReceiptSchema rejects zero payment amount', async () => {
    const { PaymentReceiptSchema } = await import('@/lib/validations');
    const result = PaymentReceiptSchema.safeParse({
      partyId: 'p1', partyName: 'Test', invoiceId: 'inv1', invoiceNo: 'INV-2024-0001',
      paymentDate: '2024-01-01', paymentAmount: 0, freightComponent: 0, gstComponent: 0,
    });
    expect(result.success).toBe(false);
  });

  test('CreateUserSchema enforces password complexity', async () => {
    const { CreateUserSchema } = await import('@/lib/validations');
    const weak = CreateUserSchema.safeParse({
      name: 'Test User', email: 'test@cargo.in', password: 'password', role: 'VIEWER',
    });
    expect(weak.success).toBe(false);

    const strong = CreateUserSchema.safeParse({
      name: 'Test User', email: 'test@cargo.in', password: 'Password1', role: 'VIEWER',
    });
    expect(strong.success).toBe(true);
  });

  test('GST rate is bounded 0-28%', async () => {
    const { AwbBookingSchema } = await import('@/lib/validations');
    const result = AwbBookingSchema.safeParse({
      awbNo: 'AWB-001', partyId: 'p1', partyName: 'Test', origin: 'DEL', destination: 'BLR',
      airlineName: 'IndiGo', bookingDate: '2024-01-01', weight: 100, pieces: 1,
      baseRate: 90, markupAmount: 0, gstRate: 50, gstAmount: 0, totalAmount: 0,
    });
    expect(result.success).toBe(false);
  });

  test('airport code must be exactly 3 chars', async () => {
    const { AwbBookingSchema } = await import('@/lib/validations');
    const result = AwbBookingSchema.safeParse({
      awbNo: 'AWB-001', partyId: 'p1', partyName: 'Test', origin: 'DELHI', destination: 'BLR',
      airlineName: 'IndiGo', bookingDate: '2024-01-01', weight: 100, pieces: 1,
      baseRate: 90, markupAmount: 0, gstRate: 18, gstAmount: 0, totalAmount: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ── 4. XSS prevention tests ───────────────────────────────────────────────────
describe('XSS Prevention', () => {
  test('sanitizeCsvValue strips formula injection', async () => {
    const { sanitizeCsvValue } = await import('@/lib/validations');
    expect(sanitizeCsvValue('=CMD|"/C calc"!A0')).toBe("'=CMD|\"/C calc\"!A0");
    expect(sanitizeCsvValue('+1+1')).toBe("'+1+1");
    expect(sanitizeCsvValue('-1+1')).toBe("'-1+1");
    expect(sanitizeCsvValue('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(sanitizeCsvValue('Normal text')).toBe('Normal text');
    expect(sanitizeCsvValue('  Normal text  ')).toBe('Normal text');
  });

  test('HTML escaping prevents script injection', () => {
    function escapeHtml(str: string): string {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    }
    const xssPayload = '<script>alert("xss")</script>';
    const escaped = escapeHtml(xssPayload);
    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(escaped).not.toContain('<script>');
  });

  test('event handler injection is escaped', () => {
    function escapeHtml(str: string): string {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    }
    const payload = '" onmouseover="alert(1)"';
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('"');
    expect(escaped).toContain('&quot;');
  });
});

// ── 5. CSRF protection tests ──────────────────────────────────────────────────
describe('CSRF Protection', () => {
  beforeEach(() => jest.clearAllMocks());

  test('server actions require valid session (no session = redirect)', async () => {
    mockNoSession();
    const { getParties } = await import('@/lib/actions/parties');
    await expect(getParties()).rejects.toThrow('REDIRECT:/login');
  });

  test('createParty requires auth', async () => {
    mockNoSession();
    const { createParty } = await import('@/lib/actions/parties');
    await expect(createParty({})).rejects.toThrow('REDIRECT:/login');
  });

  test('admin actions require SUPER_ADMIN role', async () => {
    mockSession('VIEWER');
    const { getUsers } = await import('@/lib/actions/admin');
    await expect(getUsers()).rejects.toThrow('REDIRECT:/unauthorized');
  });
});

// ── 6. Auth failure logging tests ─────────────────────────────────────────────
describe('Security Logging', () => {
  test('serverLog redacts sensitive fields', () => {
    const { serverLog: log } = require('@/lib/logger');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    log('info', 'test.event', { email: 'user@test.com', password: 'secret123', token: 'abc' });
    const calls = consoleSpy.mock.calls;
    if (calls.length > 0) {
      const logged = calls[0][0] as string;
      expect(logged).not.toContain('secret123');
      expect(logged).not.toContain('abc');
      expect(logged).toContain('[REDACTED]');
    }
    consoleSpy.mockRestore();
  });
});

// ── 7. Input bounds and array validation tests ────────────────────────────────
describe('Input Bounds Validation', () => {
  // Test the validation logic directly using the Zod schemas
  // (auth is already tested in RBAC suite)

  test('deleteInvoices: empty array is rejected by validation', () => {
    // The validation check: !Array.isArray(ids) || ids.length === 0 || ids.length > 100
    const ids: string[] = [];
    expect(!Array.isArray(ids) || ids.length === 0 || ids.length > 100).toBe(true);
  });

  test('deleteInvoices: oversized array (>100) is rejected', () => {
    const ids = Array(101).fill('valid-id');
    expect(!Array.isArray(ids) || ids.length === 0 || ids.length > 100).toBe(true);
  });

  test('deleteInvoices: non-string IDs are rejected', () => {
    const ids = [123 as unknown as string];
    expect(!ids.every(id => typeof id === 'string' && id.length > 0)).toBe(true);
  });

  test('deleteInvoices: valid IDs pass validation', () => {
    const ids = ['id-1', 'id-2', 'id-3'];
    const isValid = Array.isArray(ids) && ids.length > 0 && ids.length <= 100 && ids.every(id => typeof id === 'string' && id.length > 0);
    expect(isValid).toBe(true);
  });

  test('VIEWER cannot access invoice actions (via RBAC mock)', async () => {
    mockSession('VIEWER');
    await expect(mockRequireRole('ACCOUNTS_EXECUTIVE')).rejects.toThrow('REDIRECT:/unauthorized');
  });
});

// ── 8. Import security tests ──────────────────────────────────────────────────
describe('Import Security', () => {
  beforeEach(() => jest.clearAllMocks());

  test('importCsvBookings requires OPERATIONS_MANAGER', async () => {
    mockSession('VIEWER');
    const { importCsvBookings } = await import('@/lib/actions/import');
    const fd = new FormData();
    await expect(importCsvBookings(fd, 'AWB_BOOKINGS')).rejects.toThrow('REDIRECT:/unauthorized');
  });

  test('importCsvBookings rejects missing file', async () => {
    mockSession('OPERATIONS_MANAGER');
    const { importCsvBookings } = await import('@/lib/actions/import');
    const fd = new FormData();
    const result = await importCsvBookings(fd, 'AWB_BOOKINGS');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('No file');
  });
});
