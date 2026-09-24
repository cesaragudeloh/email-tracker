import type {
  ActivationRequest,
  ActivationResponse,
} from '@email-tracker/shared';
import { ActivationError, ConcurrentActivationError } from './errors.js';
import { assertUsableLicense, hashActivationCode } from './license.js';
import type { LicenseRepository } from './repository.js';
import { signToken } from './token.js';

export interface ActivationDependencies {
  repository: LicenseRepository;
  signingKey: () => Promise<Uint8Array>;
  ttlSeconds: number;
  now?: () => number;
}

export function createActivationService(deps: ActivationDependencies) {
  if (
    !Number.isInteger(deps.ttlSeconds) ||
    deps.ttlSeconds < 1 ||
    deps.ttlSeconds > 86400
  ) {
    throw new Error('Token TTL must be between 1 and 86400 seconds');
  }
  return async (request: ActivationRequest): Promise<ActivationResponse> => {
    const hash = hashActivationCode(request.activationCode);
    for (let attempt = 0; attempt < 3; attempt++) {
      const clock = () => deps.now?.() ?? Math.floor(Date.now() / 1000);
      let now = clock();
      const license = await deps.repository.findByHash(hash);
      assertUsableLicense(license, now);
      const installation = await deps.repository.findInstallation(
        license.licenseId,
        request.installationId,
      );
      if (installation?.status === 'REVOKED')
        throw new ActivationError('INSTALLATION_REVOKED');
      if (!installation && license.activeDevices >= license.maxDevices)
        throw new ActivationError('DEVICE_LIMIT_REACHED');
      const key = await deps.signingKey();
      now = clock();
      assertUsableLicense(license, now);
      const expiresIn = Math.min(
        deps.ttlSeconds,
        (license.expiresAt ?? now + deps.ttlSeconds) - now,
      );
      // Preparar la firma antes de consumir un cupo; no se entrega hasta confirmar la transacción.
      const accessToken = await signToken(
        {
          licenseId: license.licenseId,
          installationId: request.installationId,
          iat: now,
          exp: now + expiresIn,
        },
        key,
      );
      try {
        await deps.repository.register(
          license,
          request.installationId,
          Boolean(installation),
          clock(),
        );
      } catch (error) {
        if (error instanceof ConcurrentActivationError && attempt < 2) continue;
        throw error;
      }
      return {
        status: 'ACTIVATED',
        accessToken,
        expiresIn,
        licenseId: license.licenseId,
        installationId: request.installationId,
      };
    }
    throw new Error('Activation attempts exhausted');
  };
}
