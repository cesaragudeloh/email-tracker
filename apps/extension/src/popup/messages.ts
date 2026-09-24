import { ActivationClientError } from '../api/client.js';
import type { ActivationErrorCode } from '@email-tracker/shared';

const messages: Record<ActivationErrorCode, string> = {
  INVALID_REQUEST: 'Enter a valid activation code',
  INVALID_CODE: 'Invalid activation code',
  LICENSE_REVOKED: 'License revoked',
  LICENSE_EXPIRED: 'License expired',
  DEVICE_LIMIT_REACHED: 'Device limit reached',
  INSTALLATION_REVOKED: 'Installation revoked',
  SERVICE_UNAVAILABLE: 'Activation service unavailable',
};

export function activationErrorMessage(error: unknown): string {
  return error instanceof ActivationClientError
    ? messages[error.code]
    : messages.SERVICE_UNAVAILABLE;
}
