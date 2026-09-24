import { z } from 'zod';

export function normalizeActivationCode(code: string): string {
  return code.trim().toUpperCase();
}

export const activationRequestSchema = z
  .object({
    activationCode: z
      .string()
      .max(256)
      .transform(normalizeActivationCode)
      .pipe(
        z
          .string()
          .min(8)
          .max(128)
          .regex(/^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/),
      ),
    installationId: z.uuid(),
  })
  .strict();

export const activationResponseSchema = z.object({
  status: z.literal('ACTIVATED'),
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  licenseId: z.string().min(1),
  installationId: z.uuid(),
});

export const activationErrorSchema = z.enum([
  'INVALID_REQUEST',
  'INVALID_CODE',
  'LICENSE_REVOKED',
  'LICENSE_EXPIRED',
  'DEVICE_LIMIT_REACHED',
  'INSTALLATION_REVOKED',
  'SERVICE_UNAVAILABLE',
]);

export const tokenClaimsSchema = z.object({
  licenseId: z.string().min(1),
  installationId: z.uuid(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});

export type ActivationRequest = z.infer<typeof activationRequestSchema>;
export type ActivationResponse = z.infer<typeof activationResponseSchema>;
export type ActivationErrorCode = z.infer<typeof activationErrorSchema>;
export type TokenClaims = z.infer<typeof tokenClaimsSchema>;
export const TOKEN_ISSUER = 'email-tracker';
export const TOKEN_AUDIENCE = 'email-tracker-extension';
