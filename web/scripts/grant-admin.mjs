import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'prisma', 'dev.db'));

const PAGES = ['bookings/awb','bookings/dockets','invoices','payments','outstanding','parties','rates','import','reports','analytics','audit','notifications','settings'];

// Grant all pages to SUPER_ADMIN users by default
const admins = db.prepare("SELECT id, email FROM users WHERE role = 'SUPER_ADMIN'").all();
const insert = db.prepare('INSERT OR IGNORE INTO user_permissions (id, user_id, page, granted_by) VALUES (?, ?, ?, ?)');

for (const admin of admins) {
  for (const page of PAGES) {
    insert.run(randomUUID(), admin.id, page, 'system-init');
  }
  console.log(`✅ Granted all pages to ${admin.email}`);
}

console.log('Done.');
db.close();
