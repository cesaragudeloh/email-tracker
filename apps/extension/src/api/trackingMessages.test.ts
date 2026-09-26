import { afterEach, expect, it, vi } from 'vitest';
import {
  createTrackingQueryListener,
  requestTrackingDetail,
  requestTrackingList,
  createTrackingMessageListener,
  requestTracking,
} from './trackingMessages.js';
import { TrackingClientError, createTrackingClient } from './trackingClient.js';
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

const popupSender = {
  id: 'extension-id',
  url: 'chrome-extension://extension-id/popup.html',
};
const detail = {
  ...request,
  trackingId: tracking.trackingId,
  createdAt: tracking.createdAt,
  status: 'CREATED' as const,
  openCount: 0,
  firstOpenedAt: null,
  lastOpenedAt: null,
  events: [],
};
const local = {
  ...request,
  trackingId: tracking.trackingId,
  createdAt: tracking.createdAt,
};
const getMessage = {
  type: 'email-tracker:get-tracking',
  trackingId: tracking.trackingId,
};
it('popup sends GET and validates success without receiving authorization', async () => {
  const sendMessage = vi.fn().mockResolvedValue({ ok: true, tracking: detail });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  expect(await requestTrackingDetail(tracking.trackingId)).toEqual(detail);
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith(getMessage);
});
it('worker delegates GET to the client after checking activation', async () => {
  const get = vi.fn().mockResolvedValue(detail);
  const reply = await new Promise((resolve) =>
    createTrackingQueryListener(
      get,
      vi.fn(),
      async () => true,
      'extension-id',
    )(getMessage, popupSender, resolve),
  );
  expect(reply).toEqual({ ok: true, tracking: detail });
  expect(get).toHaveBeenCalledExactlyOnceWith(tracking.trackingId);
});
it.each(['UNAUTHORIZED', 'NOT_FOUND', 'SERVICE_UNAVAILABLE'] as const)(
  'maps safe GET error %s both directions',
  async (code) => {
    const error = new TrackingClientError(code);
    const reply = await new Promise((resolve) =>
      createTrackingQueryListener(
        vi.fn().mockRejectedValue(error),
        vi.fn(),
        async () => true,
        'extension-id',
      )(getMessage, popupSender, resolve),
    );
    expect(reply).toEqual({ ok: false, error: code });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue(reply) },
    });
    await expect(
      requestTrackingDetail(tracking.trackingId),
    ).rejects.toMatchObject({ code });
  },
);
it('sanitizes network errors without returning raw errors', async () => {
  const reply = await new Promise((resolve) =>
    createTrackingQueryListener(
      vi.fn().mockRejectedValue(new Error('secret')),
      vi.fn(),
      async () => true,
      'extension-id',
    )(getMessage, popupSender, resolve),
  );
  expect(reply).toEqual({ ok: false, error: 'SERVICE_UNAVAILABLE' });
});
it.each([
  sender,
  { ...popupSender, id: 'foreign' },
  { ...popupSender, url: 'chrome-extension://extension-id/other.html' },
  { ...popupSender, tab: { id: 2 } },
])('rejects non-popup query senders', (invalid) => {
  const get = vi.fn();
  expect(
    createTrackingQueryListener(
      get,
      vi.fn(),
      async () => true,
      'extension-id',
    )(getMessage, invalid as chrome.runtime.MessageSender, vi.fn()),
  ).toBe(false);
  expect(get).not.toHaveBeenCalled();
});
it('rejects malformed GET request before API call', () => {
  const get = vi.fn();
  const listener = createTrackingQueryListener(
    get,
    vi.fn(),
    async () => true,
    'extension-id',
  );
  expect(
    listener({ ...getMessage, trackingId: 'bad' }, popupSender, vi.fn()),
  ).toBe(false);
  expect(
    listener(
      { ...getMessage, accessToken: 'unexpected' },
      popupSender,
      vi.fn(),
    ),
  ).toBe(false);
  expect(get).not.toHaveBeenCalled();
});
it('does not list or query protected history when inactive', async () => {
  const get = vi.fn();
  const list = vi.fn();
  const listener = createTrackingQueryListener(
    get,
    list,
    async () => false,
    'extension-id',
  );
  for (const message of [
    getMessage,
    { type: 'email-tracker:list-trackings' },
  ]) {
    expect(
      await new Promise((resolve) => listener(message, popupSender, resolve)),
    ).toEqual({ ok: false, error: 'UNAUTHORIZED' });
  }
  expect(get).not.toHaveBeenCalled();
  expect(list).not.toHaveBeenCalled();
});
it('lists validated minimal local records through the worker', async () => {
  const message = { type: 'email-tracker:list-trackings' };
  const list = vi.fn().mockResolvedValue([local]);
  const reply = await new Promise((resolve) =>
    createTrackingQueryListener(
      vi.fn(),
      list,
      async () => true,
      'extension-id',
    )(message, popupSender, resolve),
  );
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn().mockResolvedValue(reply) },
  });
  expect(await requestTrackingList()).toEqual([local]);
  expect(chrome.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(message);
});
it.each([
  { ok: true, tracking: { ...detail, trackingId: crypto.randomUUID() } },
  { ok: true, tracking: detail, accessToken: 'secret' },
  {},
])('rejects mismatched or malformed detail replies', async (reply) => {
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn().mockResolvedValue(reply) },
  });
  await expect(
    requestTrackingDetail(tracking.trackingId),
  ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
});
it('handles a lost popup channel safely', async () => {
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn().mockRejectedValue(new Error('closed')) },
  });
  await expect(requestTrackingList()).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  });
  await expect(
    requestTrackingDetail(tracking.trackingId),
  ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
});

it('bounds an unresponsive worker and returns a retryable error', async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: () => new Promise(() => {}) },
    });
    const result = expect(
      requestTrackingDetail(tracking.trackingId),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    await vi.advanceTimersByTimeAsync(20000);
    await result;
  } finally {
    vi.useRealTimers();
  }
});
