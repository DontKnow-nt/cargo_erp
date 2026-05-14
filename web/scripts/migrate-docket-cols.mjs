import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'prisma', 'dev.db'));

// Add new columns to docket_bookings (ALTER TABLE ignores if column exists via try/catch)
const cols = [
  "ALTER TABLE docket_bookings ADD COLUMN way_bill_no TEXT",
  "ALTER TABLE docket_bookings ADD COLUMN consignee TEXT",
  "ALTER TABLE docket_bookings ADD COLUMN value REAL DEFAULT 0",
  "ALTER TABLE docket_bookings ADD COLUMN method_of_packing TEXT",
];

for (const sql of cols) {
  try { db.exec(sql); console.log('✅', sql); }
  catch { console.log('⏭ already exists:', sql.split('ADD COLUMN')[1]?.trim()); }
}

console.log('Done.');
db.close();
