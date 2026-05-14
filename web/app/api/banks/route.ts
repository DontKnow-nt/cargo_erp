import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { BankDetail } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const banks = await prisma.bankDetail.findMany({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  return NextResponse.json(banks.map((b: BankDetail) => ({ id: b.id, account_name: b.accountName, bank_name: b.bankName, branch: b.branch, account_number: b.accountNumber, ifsc: b.ifsc, is_default: b.isDefault ? 1 : 0 })));
}

