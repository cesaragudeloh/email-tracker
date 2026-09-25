import { afterEach, expect, it, vi } from 'vitest';
import {
  createTrackingMessageListener,
  requestTracking,
} from './trackingMessages.js';
import { createTrackingClient } from './trackingClient.js';
const request = { recipient: 'first@example.com', subject: '' };
const tracking = {
  trackingId: crypto.randomUUID(),
  trackingUrl: 'https://tracking.example.test/o/test',
  createdAt: '2026-09-25T10:00:00.000Z',
};
const message = { type: 'email-tracker:create-tracking', request };
const sender = {
  id: 'extension-id',
  tab: { id: 1 },
  frameId: 0,
  url: 'https://mail.google.com/mail/u/0/',
} as chrome.runtime.MessageSender;
async function flush() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
}
afterEach(() => vi.unstubAllGlobals());
it('content script sends only validated metadata and receives tracking, not authorization', async () => {
  const sendMessage = vi.fn().mockResolvedValue({ ok: true, tracking });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  expect(await requestTracking(request)).toEqual(tracking);
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith(message);
});
it.each([
  { ok: false },
  { ok: true, tracking: {} },
  { ok: true, tracking, accessToken: 'must-not-cross' },
])('rejects failure or malformed worker replies', async (reply) => {
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn().mockResolvedValue(reply) },
  });
  await expect(requestTracking(request)).rejects.toThrow();
});
it('worker bridge delegates to the existing client with storage and fetch, returning no token', async () => {
  const storage = {
    getInstallationId: vi.fn().mockResolvedValue('installation'),
    readAuthorization: vi
      .fn()
      .mockResolvedValue({ accessToken: 'private-token' }),
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(tracking, { status: 201 }));
  const client = createTrackingClient(
    storage,
    'https://api.example.test',
    fetcher,
  );
  const reply = new Promise<unknown>((resolve) => {
    expect(
      createTrackingMessageListener(client.createTracking, 'extension-id')(
        message,
        sender,
        resolve,
      ),
    ).toBe(true);
  });
  expect(await reply).toEqual({ ok: true, tracking });
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    'https://api.example.test/api/tracking',
    expect.objectContaining({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer private-token',
      },
      body: JSON.stringify(request),
    }),
  );
});
it.each([
  { ...sender, id: 'foreign-extension' },
  { ...sender, url: 'https://outlook.live.com/' },
  { ...sender, url: 'https://mail.google.com.evil.test/' },
  { ...sender, url: 'http://mail.google.com/' },
  { ...sender, url: undefined },
  { ...sender, tab: undefined },
  { ...sender, frameId: 1 },
])('rejects unauthorized sender %j', async (invalidSender) => {
  const create = vi.fn();
  const respond = vi.fn();
  expect(
    createTrackingMessageListener(create, 'extension-id')(
      message,
      invalidSender,
      respond,
    ),
  ).toBe(false);
  await flush();
  expect(create).not.toHaveBeenCalled();
  expect(respond).not.toHaveBeenCalled();
});
it.each([
  {},
  { ...message, request: { ...request, body: 'private' } },
  { ...message, request: { ...request, recipient: 'invalid' } },
])('rejects invalid messages without calling client', async (invalid) => {
  const create = vi.fn();
  expect(
    createTrackingMessageListener(create, 'extension-id')(
      invalid,
      sender,
      vi.fn(),
    ),
  ).toBe(false);
  await flush();
  expect(create).not.toHaveBeenCalled();
});
it.each([401, 'network failure', 'missing token'])(
  'sanitizes client failure %s without retry',
  async (reason) => {
    const create = vi.fn().mockRejectedValue(new Error(String(reason)));
    const response = new Promise((resolve) =>
      createTrackingMessageListener(create, 'extension-id')(
        message,
        sender,
        resolve,
      ),
    );
    expect(await response).toEqual({ ok: false });
    expect(create).toHaveBeenCalledOnce();
  },
);
it('handles runtime channel rejection', async () => {
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn().mockRejectedValue(new Error('context invalidated')),
    },
  });
  await expect(requestTracking(request)).rejects.toThrow();
});
