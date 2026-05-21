'use server';
import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { FreightRateVersionSchema, FreightRateSchema } from '@/lib/validations';
import { recordAuditLog, serverLog } from '@/lib/logger';
import { z } from 'zod';

export async function createRateVersion(versionData: unknown, rates: unknown[]) {
  const session = await requireAuth();
  const parsedV = FreightRateVersionSchema.safeParse(versionData);
  if (!parsedV.success) return { error: parsedV.error.flatten().fieldErrors };
  if (!Array.isArray(rates) || rates.length === 0) return { error: 'At least one rate row required' };
  if (rates.length > 500) return { error: 'Too many rate rows (max 500)' };
  const parsedRates = z.array(FreightRateSchema).safeParse(rates);
  if (!parsedRates.success) return { error: parsedRates.error.flatten().fieldErrors };

  // Supersede existing active versions for same carrier
  await prisma.freightRateVersion.updateMany({
    where: { carrierName: parsedV.data.carrierName, status: 'ACTIVE' },
    data: { status: 'SUPERSEDED' },
  });

  const version = await prisma.freightRateVersion.create({
    data: {
      carrierName: parsedV.data.carrierName, validFrom: parsedV.data.validFrom,
      validTo: parsedV.data.validTo ?? null, status: parsedV.data.status, notes: parsedV.data.notes ?? null,
      rates: { create: parsedRates.data.map(r => ({ origin: r.origin, destination: r.destination, baseRate: r.baseRate, uom: r.uom, activeFlag: r.activeFlag })) },
    },
  });

  serverLog('info', 'rates.version_created', { userId: session.user.id, versionId: version.id, carrier: parsedV.data.carrierName });
  await recordAuditLog({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: 'RATE_VERSION_CREATED',
    resource: 'FREIGHT_RATE_VERSION',
    resourceId: version.id,
    details: `${parsedV.data.carrierName} rate version published`,
  });
  revalidatePath('/dashboard/rates');
  return { versionId: version.id };
}
