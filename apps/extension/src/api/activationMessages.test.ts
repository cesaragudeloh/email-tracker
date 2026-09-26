import { afterEach, expect, it, vi } from 'vitest';
import {
  activationBridge,
  createActivationMessageListener,
} from './activationMessages.js';
import { ActivationClientError } from './client.js';
const state = { installationId: crypto.randomUUID(), activated: true };
const sender = { id: 'id', url: 'chrome-extension://id/popup.html' };
afterEach(() => vi.unstubAllGlobals());
it('moves activation and authorization state to background without sending a JWT', async () => {
  const service = {
    getState: vi.fn().mockResolvedValue(state),
    activate: vi.fn().mockResolvedValue(state),
  };
  const listener = createActivationMessageListener(service, 'id');
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: (message: unknown) =>
        new Promise((resolve) => listener(message, sender, resolve)),
    },
  });
  expect(await activationBridge.getState()).toEqual(state);
  expect(await activationBridge.activate('activation-code')).toEqual(state);
  expect(service.activate).toHaveBeenCalledExactlyOnceWith('activation-code');
});
it('passes only safe activation errors to the popup', async () => {
  const listener = createActivationMessageListener(
    {
      getState: vi.fn(),
      activate: vi
        .fn()
        .mockRejectedValue(new ActivationClientError('INVALID_CODE')),
    },
    'id',
  );
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: (message: unknown) =>
        new Promise((resolve) => listener(message, sender, resolve)),
    },
  });
  await expect(activationBridge.activate('bad')).rejects.toMatchObject({
    code: 'INVALID_CODE',
  });
});
it('rejects content script activation and state requests', () => {
  const service = { getState: vi.fn(), activate: vi.fn() };
  const listener = createActivationMessageListener(service, 'id');
  expect(
    listener(
      { type: 'email-tracker:activation-state' },
      { id: 'id', url: 'https://mail.google.com/' },
      vi.fn(),
    ),
  ).toBe(false);
  expect(service.getState).not.toHaveBeenCalled();
});
it('rejects a reply containing an authorization token', async () => {
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({
        ok: true,
        state: { ...state, accessToken: 'private' },
      }),
    },
  });
  await expect(activationBridge.getState()).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  });
});
