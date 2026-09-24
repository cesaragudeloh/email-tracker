import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { normalizeActivationCode } from '@email-tracker/shared';
import { z } from 'zod';
import { ActivationError } from './errors.js';

export const licenseSchema = z.object({
  licenseId: z.string().min(1),
  activationCodeHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['ACTIVE', 'REVOKED']),
  maxDevices: z.number().int().positive(),
  activeDevices: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  expiresAt: z.number().int().positive().optional(),
});
export type License = z.infer<typeof licenseSchema>;
export const installationSchema = z.object({
  installationId: z.uuid(),
  status: z.enum(['ACTIVE', 'REVOKED']),
  activatedAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
});
export type Installation = z.infer<typeof installationSchema>;

export function hashActivationCode(code: string): string {
  return createHash('sha256')
    .update(normalizeActivationCode(code), 'utf8')
    .digest('hex');
}

export function assertUsableLicense(
  license: License | undefined,
  now: number,
): asserts license is License {
  if (!license) throw new ActivationError('INVALID_CODE');
  if (license.status !== 'ACTIVE') throw new ActivationError('LICENSE_REVOKED');
  if (license.expiresAt !== undefined && license.expiresAt <= now) {
    throw new ActivationError('LICENSE_EXPIRED');
  }
}

export function createLicense(
  maxDevices: number,
  expiresAt?: number,
  now = new Date(),
) {
  const activationCode = randomBytes(24)
    .toString('hex')
    .toUpperCase()
    .match(/.{1,8}/g)!
    .join('-');
  const license = licenseSchema.parse({
    licenseId: `lic_${randomUUID()}`,
    activationCodeHash: hashActivationCode(activationCode),
    status: 'ACTIVE',
    maxDevices,
    activeDevices: 0,
    createdAt: now.toISOString(),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  });
  if (
    expiresAt !== undefined &&
    expiresAt <= Math.floor(now.getTime() / 1000)
  ) {
    throw new Error('Expiration must be in the future');
  }
  return { activationCode, license };
}

export function licenseItems(license: License) {
  return [
    {
      PK: `CODE#${license.activationCodeHash}`,
      SK: 'LOOKUP',
      licenseId: license.licenseId,
    },
    { PK: `LICENSE#${license.licenseId}`, SK: 'LICENSE', ...license },
  ];
}
