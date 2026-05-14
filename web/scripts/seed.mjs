/**
 * Seed script: creates initial admin user and sample data.
 * Run with: node scripts/seed.mjs
 */
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'prisma', 'dev.db');

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema (same as lib/db.ts)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'VIEWER',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY,
    party_name TEXT NOT NULL,
    gstin TEXT,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    billing_address TEXT,
    credit_limit REAL NOT NULL DEFAULT 0,
    credit_days INTEGER NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS freight_rate_versions (
    id TEXT PRIMARY KEY,
    carrier_name TEXT NOT NULL,
    valid_from TEXT NOT NULL,
    valid_to TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS freight_rates (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES freight_rate_versions(id) ON DELETE CASCADE,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    base_rate REAL NOT NULL,
    uom TEXT NOT NULL DEFAULT 'KG',
    active_flag INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS awb_bookings (
    id TEXT PRIMARY KEY,
    awb_no TEXT NOT NULL,
    party_id TEXT NOT NULL,
    party_name TEXT NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    airline_name TEXT NOT NULL,
    booking_date TEXT NOT NULL,
    shipment_date TEXT,
    weight REAL NOT NULL,
    pieces INTEGER NOT NULL,
    base_rate REAL NOT NULL,
    markup_amount REAL NOT NULL DEFAULT 0,
    gst_rate REAL NOT NULL DEFAULT 18,
    gst_amount REAL NOT NULL,
    total_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'BOOKED',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS docket_bookings (
    id TEXT PRIMARY KEY,
    docket_no TEXT NOT NULL,
    party_id TEXT NOT NULL,
    party_name TEXT NOT NULL,
    booking_date TEXT NOT NULL,
    origin TEXT,
    destination TEXT,
    description TEXT,
    rate_fitted_amount REAL NOT NULL,
    markup_amount REAL NOT NULL DEFAULT 0,
    gst_rate REAL NOT NULL DEFAULT 18,
    gst_amount REAL NOT NULL,
    total_amount REAL NOT NULL,
    due_date_policy INTEGER NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'BOOKED',
    notes TEXT,
    linked_awb_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    invoice_no TEXT UNIQUE NOT NULL,
    party_id TEXT NOT NULL,
    party_name TEXT NOT NULL,
    booking_type TEXT NOT NULL,
    booking_ref TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    subtotal REAL NOT NULL,
    gst_total REAL NOT NULL,
    grand_total REAL NOT NULL,
    paid_total REAL NOT NULL DEFAULT 0,
    outstanding_total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS invoice_lines (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    qty REAL NOT NULL,
    rate REAL NOT NULL,
    amount REAL NOT NULL,
    tax_rate REAL NOT NULL,
    tax_amount REAL NOT NULL,
    line_total REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payment_receipts (
    id TEXT PRIMARY KEY,
    receipt_no TEXT UNIQUE NOT NULL,
    party_id TEXT NOT NULL,
    party_name TEXT NOT NULL,
    invoice_id TEXT NOT NULL REFERENCES invoices(id),
    invoice_no TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    payment_amount REAL NOT NULL,
    freight_component REAL NOT NULL DEFAULT 0,
    gst_component REAL NOT NULL DEFAULT 0,
    payment_mode TEXT,
    reference_no TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS outstanding_entries (
    id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    party_name TEXT NOT NULL,
    invoice_id TEXT NOT NULL REFERENCES invoices(id),
    invoice_no TEXT NOT NULL,
    booking_ref TEXT NOT NULL,
    original_amount REAL NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0,
    outstanding_amount REAL NOT NULL,
    invoice_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    aging_bucket TEXT NOT NULL DEFAULT 'CURRENT',
    credit_limit REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS import_jobs (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    error_rows INTEGER NOT NULL DEFAULT 0,
    errors TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    user_email TEXT,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    resource_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_permissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    page TEXT NOT NULL,
    granted_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, page)
  );
`);

// Seed users
const users = [
  { name: 'Admin User', email: 'admin@cargo.in', password: process.env.SEED_ADMIN_PASSWORD || 'Admin@1234', role: 'SUPER_ADMIN' },
  { name: 'Ravi Sharma', email: 'ravi@cargo.in', password: process.env.SEED_OPS_PASSWORD || 'Ravi@1234', role: 'OPERATIONS_MANAGER' },
  { name: 'Sunita Gupta', email: 'sunita@cargo.in', password: process.env.SEED_ACCOUNTS_PASSWORD || 'Sunita@1234', role: 'ACCOUNTS_EXECUTIVE' },
  { name: 'Pradeep K', email: 'pradeep@cargo.in', password: process.env.SEED_VIEWER_PASSWORD || 'Pradeep@1234', role: 'VIEWER' },
];
if (!process.env.SEED_ADMIN_PASSWORD) console.warn('⚠️  Using default passwords — set SEED_*_PASSWORD env vars before production seeding!');

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (id, name, email, password_hash, role, status)
  VALUES (?, ?, ?, ?, ?, 'ACTIVE')
`);

for (const u of users) {
  const hash = bcrypt.hashSync(u.password, 12);
  insertUser.run(randomUUID(), u.name, u.email, hash, u.role);
  console.log(`✓ User: ${u.email} (${u.role})`);
}

// Seed sample parties
const parties = [
  { name: 'Triveni Enterprises', gstin: '07AABCT1234A1Z5', creditLimit: 500000, creditDays: 30 },
  { name: 'Bharat Cargo Pvt Ltd', gstin: '27AABCB5678B1Z3', creditLimit: 200000, creditDays: 45 },
  { name: 'Delhi Freight Solutions', gstin: '07AABCD9012C1Z1', creditLimit: 100000, creditDays: 15 },
];

const insertParty = db.prepare(`
  INSERT OR IGNORE INTO parties (id, party_name, gstin, credit_limit, credit_days, status)
  VALUES (?, ?, ?, ?, ?, 'ACTIVE')
`);

for (const p of parties) {
  insertParty.run(randomUUID(), p.name, p.gstin, p.creditLimit, p.creditDays);
  console.log(`✓ Party: ${p.name}`);
}

console.log('\n✅ Database seeded successfully!');
console.log('\nDefault credentials:');
console.log('  admin@cargo.in / Admin@1234  (Super Admin)');
console.log('  ravi@cargo.in / Ravi@1234    (Operations Manager)');
console.log('  sunita@cargo.in / Sunita@1234 (Accounts Executive)');
console.log('  pradeep@cargo.in / Pradeep@1234 (Viewer)');
console.log('\n⚠️  Change all passwords before deploying to production!');

db.close();
