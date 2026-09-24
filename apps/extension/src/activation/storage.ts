import { decodeJwt } from 'jose';
import {
  activationResponseSchema,
  tokenClaimsSchema,
  TOKEN_AUDIENCE,
  TOKEN_ISSUER,
  type ActivationResponse,
} from '@email-tracker/shared';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createActivationStorage(
  area = chrome.storage.local,
  locks = navigator.locks,
) {
  async function secureStorage() {
    await area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  }

  async function getInstallationId(): Promise<string> {
    await secureStorage();
    // Web Locks serializa popup y service worker, incluso en el primer arranque.
    return locks.request('email-tracker-installation-id', async () => {
      const stored = await area.get('installationId');
      if (
        typeof stored.installationId === 'string' &&
        UUID.test(stored.installationId)
      )
        return stored.installationId;
      const installationId = crypto.randomUUID();
      await area.remove('authorization');
      await area.set({ installationId });
      return installationId;
    });
  }

  function validAuthorization(
    value: unknown,
    installationId: string,
  ): ActivationResponse | undefined {
    try {
      const authorization = activationResponseSchema.parse(value);
      const payload = decodeJwt(authorization.accessToken);
      const claims = tokenClaimsSchema.parse(payload);
      if (
        claims.installationId !== installationId ||
        authorization.installationId !== installationId ||
        claims.licenseId !== authorization.licenseId ||
        claims.exp <= Math.floor(Date.now() / 1000) ||
        claims.iat > Math.floor(Date.now() / 1000) + 60 ||
        claims.exp <= claims.iat ||
        payload.iss !== TOKEN_ISSUER ||
        payload.aud !== TOKEN_AUDIENCE
      )
        return undefined;
      // Solo determina el estado visual. La firma se verifica exclusivamente en backend.
      return authorization;
    } catch {
      return undefined;
    }
  }

  return {
    getInstallationId,
    async readAuthorization(installationId: string) {
      await secureStorage();
      const stored = await area.get('authorization');
      return validAuthorization(stored.authorization, installationId);
    },
    async saveAuthorization(
      authorization: ActivationResponse,
      installationId: string,
    ) {
      if (!validAuthorization(authorization, installationId))
        throw new Error('Invalid authorization response');
      await secureStorage();
      await area.set({ authorization });
    },
    async clearAuthorization() {
      await area.remove('authorization');
    },
  };
}

export type ActivationStorage = ReturnType<typeof createActivationStorage>;
