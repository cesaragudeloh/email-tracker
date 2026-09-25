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
