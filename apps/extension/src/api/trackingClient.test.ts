import { expect, it, vi } from 'vitest';
import { createTrackingClient } from './trackingClient.js';
const installationId = crypto.randomUUID();
const request = { recipient: 'client@example.com', subject: '' };
const response = {
  trackingId: crypto.randomUUID(),
  trackingUrl: 'https://tracking.example.test/o/id',
  createdAt: new Date().toISOString(),
};
function setup() {
  const storage = {
    getInstallationId: vi.fn().mockResolvedValue(installationId),
    readAuthorization: vi
      .fn()
      .mockResolvedValue({ accessToken: 'stored-token' }),
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(response, { status: 201 }));
  return {
    storage,
    fetcher,
    client: createTrackingClient(storage, 'https://api.example.test', fetcher),
  };
}
it('reads storage, sends Bearer and exact JSON, and parses the result', async () => {
  const { storage, fetcher, client } = setup();
  expect(await client.createTracking(request)).toEqual(response);
  expect(storage.readAuthorization).toHaveBeenCalledWith(installationId);
  expect(fetcher).toHaveBeenCalledWith(
    'https://api.example.test/api/tracking',
    expect.objectContaining({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer stored-token',
      },
      body: JSON.stringify(request),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    }),
  );
});
it('does not fetch without an authorization', async () => {
  const { storage, fetcher, client } = setup();
  storage.readAuthorization.mockResolvedValue(undefined);
  await expect(client.createTracking(request)).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  [401, 'UNAUTHORIZED'],
  [400, 'INVALID_REQUEST'],
  [500, 'SERVICE_UNAVAILABLE'],
  [403, 'SERVICE_UNAVAILABLE'],
])('maps status %s without exposing response details', async (status, code) => {
  const { fetcher, client } = setup();
  fetcher.mockResolvedValue(
    new Response('private internal error', { status: Number(status) }),
  );
  await expect(client.createTracking(request)).rejects.toMatchObject({ code });
});
it('sanitizes network errors', async () => {
  const { fetcher, client } = setup();
  fetcher.mockRejectedValue(new Error('network secrets'));
  await expect(client.createTracking(request)).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    message: 'Tracking service unavailable. Please try again later.',
  });
});
it.each([{}, { ...response, trackingId: 'invalid' }])(
  'rejects malformed success responses',
  async (body) => {
    const { fetcher, client } = setup();
    fetcher.mockResolvedValue(Response.json(body));
    await expect(client.createTracking(request)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  },
);
it('does not fetch invalid input', async () => {
  const { fetcher, client } = setup();
  await expect(
    client.createTracking({ ...request, recipient: 'bad' }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('does not fetch without a configured API', async () => {
  const { storage, fetcher } = setup();
  await expect(
    createTrackingClient(storage, '', fetcher).createTracking(request),
  ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('sanitizes storage errors', async () => {
  const { storage, fetcher, client } = setup();
  storage.readAuthorization.mockRejectedValue(new Error('storage detail'));
  await expect(client.createTracking(request)).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  });
  expect(fetcher).not.toHaveBeenCalled();
});

const history = {
  trackingId: response.trackingId,
  recipient: request.recipient,
  subject: '',
  createdAt: response.createdAt,
  status: 'OPEN_DETECTED',
  openCount: 1,
  firstOpenedAt: response.createdAt,
  lastOpenedAt: response.createdAt,
  events: [
    {
      eventId: crypto.randomUUID(),
      openedAt: response.createdAt,
      ip: '192.0.2.1',
      userAgent: 'Raw agent',
    },
  ],
};
it('getTracking reads storage and sends Bearer with the UUID URL and parses history', async () => {
  const { client, storage, fetcher } = setup();
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValue(Response.json(history));
  expect(await client.getTracking(response.trackingId)).toEqual(history);
  expect(storage.readAuthorization).toHaveBeenCalledWith(installationId);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    `https://api.example.test/api/tracking/${response.trackingId}`,
    expect.objectContaining({
      method: 'GET',
      headers: { Authorization: 'Bearer stored-token' },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    }),
  );
});
it.each([
  [401, 'UNAUTHORIZED'],
  [404, 'NOT_FOUND'],
  [400, 'INVALID_TRACKING_ID'],
  [500, 'SERVICE_UNAVAILABLE'],
])('getTracking maps HTTP %s', async (status, code) => {
  const { client, fetcher } = setup();
  fetcher.mockResolvedValue(
    new Response('private details', { status: Number(status) }),
  );
  await expect(client.getTracking(response.trackingId)).rejects.toMatchObject({
    code,
  });
});
it('getTracking sanitizes network failures', async () => {
  const { client, fetcher } = setup();
  fetcher.mockRejectedValue(new Error('private details'));
  await expect(client.getTracking(response.trackingId)).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    message: 'Tracking service unavailable. Please try again later.',
  });
});
it('getTracking does not fetch without a token', async () => {
  const { client, fetcher, storage } = setup();
  storage.readAuthorization.mockResolvedValue(undefined);
  await expect(client.getTracking(response.trackingId)).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it('getTracking rejects malformed response', async () => {
  const { client, fetcher } = setup();
  fetcher.mockResolvedValue(Response.json({ ...history, events: [{}] }));
  await expect(client.getTracking(response.trackingId)).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  });
});
it('getTracking rejects invalid UUID before fetch', async () => {
  const { client, fetcher } = setup();
  await expect(client.getTracking('../secret')).rejects.toMatchObject({
    code: 'INVALID_TRACKING_ID',
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it('getTracking does not fetch without API configuration', async () => {
  const { storage, fetcher } = setup();
  await expect(
    createTrackingClient(storage, '', fetcher).getTracking(response.trackingId),
  ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('getTracking sanitizes storage failures', async () => {
  const { client, storage, fetcher } = setup();
  storage.readAuthorization.mockRejectedValue(new Error('private storage'));
  await expect(client.getTracking(response.trackingId)).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  });
  expect(fetcher).not.toHaveBeenCalled();
});
