import { activationRequestSchema } from '@email-tracker/shared';
import { ActivationClientError, type createApiClient } from '../api/client.js';
import type { ActivationStorage } from './storage.js';

export function createActivationService(
  storage: ActivationStorage,
  api: ReturnType<typeof createApiClient>,
) {
  return {
    async getState() {
      const installationId = await storage.getInstallationId();
      const authorization = await storage.readAuthorization(installationId);
      return { installationId, activated: Boolean(authorization) };
    },
    async activate(activationCode: string) {
      const installationId = await storage.getInstallationId();
      const parsed = activationRequestSchema.safeParse({
        activationCode,
        installationId,
      });
      if (!parsed.success) throw new ActivationClientError('INVALID_REQUEST');
      const response = await api.activate(parsed.data);
      await storage.saveAuthorization(response, installationId);
      return { installationId, activated: true };
    },
  };
}
