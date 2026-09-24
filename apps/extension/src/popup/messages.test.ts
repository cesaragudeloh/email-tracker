import { expect, it } from 'vitest';
import { ActivationClientError } from '../api/client.js';
import { activationErrorMessage } from './messages.js';

it.each([
  ['INVALID_REQUEST', 'Enter a valid activation code'],
  ['INVALID_CODE', 'Invalid activation code'],
  ['LICENSE_REVOKED', 'License revoked'],
  ['LICENSE_EXPIRED', 'License expired'],
  ['DEVICE_LIMIT_REACHED', 'Device limit reached'],
  ['INSTALLATION_REVOKED', 'Installation revoked'],
  ['SERVICE_UNAVAILABLE', 'Activation service unavailable'],
] as const)('maps %s to a UI message', (code, message) => {
  expect(activationErrorMessage(new ActivationClientError(code))).toBe(message);
});
it('never renders an arbitrary technical error', () => {
  expect(activationErrorMessage(new Error('AWS secret detail'))).toBe(
    'Activation service unavailable',
  );
});
