import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';

const request = {
  activationCode: 'ABCD-EFGH',
  installationId: '8a73e54e-c33f-40ca-a2dc-06626851744d',
};
const response = {
  status: 'ACTIVATED',
  accessToken: 'token',
  expiresIn: 60,
  licenseId: 'lic_test',
  installationId: request.installationId,
};
describe('activation HTTP client (mocked fetch)', () => {
  it('posts JSON and validates the response', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(response));
    expect(
      await createApiClient('https://api.example.test', fetcher).activate(
        request,
      ),
    ).toEqual(response);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/activate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
        credentials: 'omit',
        redirect: 'error',
      }),
    );
  });
  it.each([
    'INVALID_CODE',
    'LICENSE_REVOKED',
    'LICENSE_EXPIRED',
    'DEVICE_LIMIT_REACHED',
  ])('preserves safe API error %s', async (error) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error }, { status: 403 }));
    await expect(
      createApiClient('https://api.test', fetcher).activate(request),
    ).rejects.toMatchObject({ code: error });
  });
  it.each([
    Response.json({ error: 'AWS detail' }, { status: 403 }),
    Response.json({ error: 'INVALID_CODE' }, { status: 500 }),
    new Response('not JSON', { status: 502 }),
    Response.json({}),
    Response.json({ ...response, installationId: crypto.randomUUID() }),
  ])('sanitizes malformed or server responses', async (result) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(result);
    await expect(
      createApiClient('https://api.test', fetcher).activate(request),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
  it('maps network and timeout failures to a safe error', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('connection secret details'));
    await expect(
      createApiClient('https://api.test', fetcher).activate(request),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
  it('does not fetch without a configured API', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      createApiClient('', fetcher).activate(request),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
