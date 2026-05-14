#!/usr/bin/env node
/**
 * Seed PostgreSQL/Neon
 * Run: node scripts/seed-postgres.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
const path = require('path');
const { fileURLToPath } = require('url');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl || dbUrl.includes('<PLACEHOLDER>')) {
  console.error('❌ DATABASE_URL not set in .env'); process.exit(1);
}

const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log('✅ Connected to Neon PostgreSQL');

if (!process.env.SEED_ADMIN_PASSWORD) console.warn('⚠️  Using default passwords');

const users = [
  { name: 'Admin User',   email: 'admin@cargo.in',   password: process.env.SEED_ADMIN_PASSWORD    || 'Admin@1234',   role: 'SUPER_ADMIN' },
  { name: 'Ravi Sharma',  email: 'ravi@cargo.in',    password: process.env.SEED_OPS_PASSWORD      || 'Ravi@1234',    role: 'OPERATIONS_MANAGER' },
  { name: 'Sunita Gupta', email: 'sunita@cargo.in',  password: process.env.SEED_ACCOUNTS_PASSWORD || 'Sunita@1234',  role: 'ACCOUNTS_EXECUTIVE' },
  { name: 'Pradeep K',    email: 'pradeep@cargo.in', password: process.env.SEED_VIEWER_PASSWORD   || 'Pradeep@1234', role: 'VIEWER' },
];

for (const u of users) {
  const hash = bcrypt.hashSync(u.password, 12);
  await client.query(`
    INSERT INTO users (id, name, email, password_hash, role, status, updated_at)
    VALUES ($1,$2,$3,$4,$5,'ACTIVE',NOW())
    ON CONFLICT (email) DO NOTHING
  `, [randomUUID(), u.name, u.email, hash, u.role]);
  console.log(`✓ User: ${u.email} (${u.role})`);
}

// Grant all pages to admin
const { rows: [admin] } = await client.query(`SELECT id FROM users WHERE email='admin@cargo.in'`);
const PAGES = ['bookings/awb','bookings/dockets','invoices','payments','outstanding','parties','rates','import','reports','analytics','audit','notifications','settings'];
for (const page of PAGES) {
  await client.query(`
    INSERT INTO user_permissions (id, user_id, page, granted_by)
    VALUES ($1,$2,$3,'system-init')
    ON CONFLICT (user_id, page) DO NOTHING
  `, [randomUUID(), admin.id, page]);
}
console.log('✓ Granted all pages to admin');

// Parties
const parties = [
  ['Triveni Enterprises',     '07AABCT1234A1Z5', 500000, 30],
  ['Bharat Cargo Pvt Ltd',    '27AABCB5678B1Z3', 200000, 45],
  ['Delhi Freight Solutions', '07AABCD9012C1Z1', 100000, 15],
];
for (const [name, gstin, limit, days] of parties) {
  await client.query(`
    INSERT INTO parties (id, party_name, gstin, credit_limit, credit_days, status, updated_at)
    VALUES ($1,$2,$3,$4,$5,'ACTIVE',NOW())
    ON CONFLICT DO NOTHING
  `, [randomUUID(), name, gstin, limit, days]);
  console.log(`✓ Party: ${name}`);
}

// Banks
await client.query(`
  INSERT INTO bank_details (id, account_name, bank_name, branch, account_number, ifsc, is_default)
  VALUES ($1,'TRIVENI CARGO EXPRESS INDIA PVT LTD','YES BANK Ltd.','Vasant Kunj, New Delhi','008463700000641','YESB0000283',true),
         ($2,'TRIVENI CARGO EXPRESS INDIA PVT LTD','Punjab National Bank','Nangal Dewat','3080002100012528','PUNB0308000',false)
  ON CONFLICT DO NOTHING
`, [randomUUID(), randomUUID()]);
console.log('✓ Bank details seeded');

await client.end();
console.log('\n✅ Seeded successfully! Login: admin@cargo.in / Admin@1234');
