import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'prisma', 'dev.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS bank_details (
    id TEXT PRIMARY KEY,
    account_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    branch TEXT NOT NULL,
    account_number TEXT NOT NULL,
    ifsc TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const insert = db.prepare(`
  INSERT OR IGNORE INTO bank_details (id, account_name, bank_name, branch, account_number, ifsc, is_default)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

insert.run(randomUUID(), 'TRIVENI CARGO EXPRESS INDIA PVT LTD', 'YES BANK Ltd.', 'Vasant Kunj, New Delhi', '008463700000641', 'YESB0000283', 1);
insert.run(randomUUID(), 'TRIVENI CARGO EXPRESS INDIA PVT LTD', 'Punjab National Bank', 'Nangal Dewat', '3080002100012528', 'PUNB0308000', 0);

console.log('✅ bank_details table created and seeded');
db.close();
