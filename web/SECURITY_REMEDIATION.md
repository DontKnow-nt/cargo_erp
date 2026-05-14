# Security Remediation Summary
**Project:** Cargo Domestic ERP (Next.js)  
**Date:** 2026-05-11  
**Status:** Production-grade hardening complete

---

## What Was Fixed

### 1. Authentication & Session Security
**Before:** No authentication. All dashboard routes were publicly accessible.  
**After:** NextAuth.js v4 with credentials provider. bcrypt-hashed passwords (cost 12). JWT sessions with 8-hour expiry. HTTP-only, SameSite=Lax, Secure cookies. Login/logout/session expiry all handled. Unauthenticated users redirected to `/login`.

Files: `app/api/auth/[...nextauth]/route.ts`, `lib/auth.ts`, `app/login/page.tsx`, `components/AuthProvider.tsx`, `types/next-auth.d.ts`

### 2. Authorization & RBAC
**Before:** Admin page was pure client-side React state with hardcoded users. Any user could access any route.  
**After:** Four server-enforced roles: `SUPER_ADMIN`, `OPERATIONS_MANAGER`, `ACCOUNTS_EXECUTIVE`, `VIEWER`. Every server action calls `requireRole()` before executing. Middleware enforces role at the route level. Admin/settings require SUPER_ADMIN; rates/import require OPERATIONS_MANAGER; invoices/payments require ACCOUNTS_EXECUTIVE.

Files: `middleware.ts`, `lib/auth.ts`, `lib/actions/admin.ts`

### 3. Database & Backend Layer
**Before:** All data in client-side Zustand store (in-memory, lost on refresh). No backend.  
**After:** SQLite database via `better-sqlite3`. Full schema for users, parties, bookings, invoices, payments, outstanding, import jobs, audit logs. All CRUD goes through server actions with parameterized queries (no raw string interpolation). Seed script creates initial users with hashed passwords.

Files: `lib/db.ts`, `prisma/schema.prisma`, `scripts/seed.mjs`

### 4. Server Actions with Zod Validation
**Before:** No server-side validation. Client could send any data.  
**After:** Every mutation validated with Zod before touching the database. Schemas enforce: GSTIN format, date format (YYYY-MM-DD), positive amounts, GST 0–28%, airport codes (3 chars), password complexity, credit limit bounds, array size limits.

Files: `lib/validations.ts`, `lib/actions/parties.ts`, `lib/actions/invoices.ts`, `lib/actions/payments.ts`, `lib/actions/bookings.ts`

### 5. XSS Prevention
**Before:** Invoice print used `window.open` + `document.write(html)` with user data interpolated directly into HTML strings. `exportToPDF` did the same. CSV export had no formula injection protection.  
**After:** Invoice print replaced with a server-rendered `/print/invoice/[id]` route — data fetched server-side, rendered with React (no innerHTML). `exportToPDF` uses `escapeHtml()` on all values and a Blob URL instead of `document.write`. CSV export uses `sanitizeCsvCell()` which prefixes `=`, `+`, `-`, `@` with a single quote.

Files: `app/print/invoice/[id]/page.tsx`, `lib/exportUtils.tsx`, `lib/printUtils.ts`

### 6. CSRF Protection
**Before:** No protection.  
**After:** Next.js server actions use `POST` with the `Next-Action` header, which browsers cannot forge cross-origin. Combined with `SameSite=Lax` cookies, standard CSRF attacks are blocked without needing explicit tokens.

### 7. Security Headers
**Before:** `next.config.ts` was empty.  
**After:** Global headers on all routes:
- `Content-Security-Policy` (default-src 'self', frame-ancestors 'self', object-src 'none')
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (max-age 2 years, includeSubDomains)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera, mic, geolocation, payment all off)
- `poweredByHeader: false`, `productionBrowserSourceMaps: false`

File: `next.config.ts`

### 8. Weak ID Generation
**Before:** `Math.random().toString(36)` used for all IDs.  
**After:** `crypto.randomUUID()` used in all server actions. `store.ts` also updated.

### 9. Environment Variable Exposure
**Before:** No `.env` file. No separation of server vs public vars.  
**After:** `DATABASE_URL` and `NEXTAUTH_SECRET` are server-only (no `NEXT_PUBLIC_` prefix). `.gitignore` covers `.env*` and `prisma/*.db`. `.env.example` provided without secrets.

### 10. File Import Hardening
**Before:** CSV import had no file validation, no size limit, no content validation, no formula injection protection.  
**After:** 5MB size limit, `.csv`-only extension whitelist, 10,000 row limit, Zod validation on every row, formula injection stripping on all string values, parameterized DB inserts, role check (OPERATIONS_MANAGER required), audit logging.

File: `lib/actions/import.ts`

### 11. Structured Logging
**Before:** No server-side logging.  
**After:** `lib/logger.ts` with structured JSON output. Auto-redacts `password`, `token`, `hash`, `secret` fields. 28 log points covering: auth failures, login success, forbidden access, all CRUD mutations, import jobs.

### 12. Security Tests
32 tests passing covering: auth bypass, all RBAC role combinations, input validation (GSTIN, dates, amounts, GST bounds, airport codes, password complexity), XSS (HTML escaping, CSV formula injection, event handler injection), CSRF (server actions require session), sensitive field redaction in logs, import role enforcement.

File: `__tests__/security.test.ts`

---

## Residual Risks & Recommended Next Steps

| Risk | Severity | Notes |
|------|----------|-------|
| `xlsx` package (v0.18.5) is unmaintained | Medium | Replace with `exceljs` for XLSX export. Currently only used for TSV export which is low-risk. |
| CSP uses `unsafe-inline` for scripts/styles | Medium | Required by Next.js dev mode and Tailwind inline styles. Tighten with nonces in production. |
| SQLite is single-file, no replication | Low | Acceptable for single-server deployment. Migrate to PostgreSQL for multi-instance. |
| Zustand store still holds in-memory data | Low | The store is now a UI cache only. Sensitive operations go through server actions. Consider removing mock data from `lib/mockData.ts` in production. |
| No rate limiting on login endpoint | Medium | Add rate limiting (e.g., `next-rate-limit`) to `/api/auth/callback/credentials` to prevent brute force. |
| Session secret is a static string in `.env` | Low | Rotate `NEXTAUTH_SECRET` before production deployment. Use a 32-byte random value: `openssl rand -base64 32`. |
| Print route (`/print/invoice/[id]`) is auth-checked but not role-checked | Low | Any authenticated user can print any invoice by ID. Add ownership/role check if needed. |

---

## Getting Started

```bash
# Install dependencies
npm install --legacy-peer-deps

# Seed the database (creates users + sample data)
node scripts/seed.mjs

# Run dev server
npm run dev

# Run security tests
npm test
```

Default credentials (change before production):
- `admin@cargo.in` / `Admin@1234` — Super Admin
- `ravi@cargo.in` / `Ravi@1234` — Operations Manager  
- `sunita@cargo.in` / `Sunita@1234` — Accounts Executive
- `pradeep@cargo.in` / `Pradeep@1234` — Viewer
