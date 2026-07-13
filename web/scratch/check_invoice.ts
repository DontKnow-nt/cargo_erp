import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '../lib/prisma';

async function main() {
  const inv = await prisma.invoice.findFirst({
    where: { invoiceNo: 'INV-2026-63049322' },
    include: { lines: true }
  });
  console.log('Invoice:', JSON.stringify(inv, null, 2));

  const dkt = await prisma.docketBooking.findFirst({
    where: { docketNo: 'DKT-9876' }
  });
  console.log('Docket:', JSON.stringify(dkt, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
