import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createActivationService } from './activationService.js';
import { createLicense, type License } from './license.js';
import { ConcurrentActivationError } from './errors.js';
import { verifyToken } from './token.js';

const installationId = '8a73e54e-c33f-40ca-a2dc-06626851744d';
const now = 1800000000;
const key = new TextEncoder().encode('fake-test-signing-key-at-least-32-bytes');
let license: License;
const repository = {
  findByHash: vi.fn(),
  findInstallation: vi.fn(),
  register: vi.fn(),
};
const signingKey = vi.fn(async () => key);
const service = () =>
  createActivationService({
    repository,
    signingKey,
    ttlSeconds: 86400,
    now: () => now,
  });
const request = { activationCode: 'ABCD-EFGH', installationId };

beforeEach(() => {
  vi.resetAllMocks();
  license = createLicense(2).license;
  repository.findByHash.mockResolvedValue(license);
  repository.findInstallation.mockResolvedValue(undefined);
  repository.register.mockResolvedValue(undefined);
  signingKey.mockResolvedValue(key);
});

describe('activation service', () => {
  it('activates an ACTIVE license and registers a new installation', async () => {
    const result = await service()(request);
    expect(repository.register).toHaveBeenCalledWith(
      license,
      installationId,
      false,
      now,
    );
    expect(result).toMatchObject({
      status: 'ACTIVATED',
      expiresIn: 86400,
      installationId,
      licenseId: license.licenseId,
    });
    const claims = await verifyToken(
      result.accessToken,
      key,
      new Date(now * 1000),
    );
    expect(claims).toEqual({
      licenseId: license.licenseId,
      installationId,
      iat: now,
      exp: now + 86400,
    });
    expect(claims).not.toHaveProperty('activationCode');
  });
  it.each([
    ['missing', 'INVALID_CODE'],
    ['REVOKED', 'LICENSE_REVOKED'],
    ['expired', 'LICENSE_EXPIRED'],
    ['full', 'DEVICE_LIMIT_REACHED'],
  ])('rejects %s licenses without issuing tokens', async (state, code) => {
    if (state === 'missing') repository.findByHash.mockResolvedValue(undefined);
    if (state === 'REVOKED') license.status = 'REVOKED';
    if (state === 'expired') license.expiresAt = now;
    if (state === 'full') license.activeDevices = license.maxDevices;
    await expect(service()(request)).rejects.toMatchObject({ code });
    expect(repository.register).not.toHaveBeenCalled();
    expect(signingKey).not.toHaveBeenCalled();
  });
  it('allows an existing active installation at maxDevices without another slot', async () => {
    license.activeDevices = license.maxDevices;
    repository.findInstallation.mockResolvedValue({
      status: 'ACTIVE',
      installationId,
    });
    await expect(service()(request)).resolves.toMatchObject({
      status: 'ACTIVATED',
    });
    expect(repository.register).toHaveBeenCalledWith(
      license,
      installationId,
      true,
      now,
    );
  });
  it('refuses an individually revoked installation', async () => {
    repository.findInstallation.mockResolvedValue({ status: 'REVOKED' });
    await expect(service()(request)).rejects.toMatchObject({
      code: 'INSTALLATION_REVOKED',
    });
  });
  it('caps JWT lifetime at license expiration', async () => {
    license.expiresAt = now + 60;
    expect((await service()(request)).expiresIn).toBe(60);
  });
  it('retries an installation created by a concurrent request idempotently', async () => {
    repository.register.mockRejectedValueOnce(new ConcurrentActivationError());
    repository.findInstallation
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue({ status: 'ACTIVE' });
    await service()(request);
    expect(repository.register).toHaveBeenLastCalledWith(
      license,
      installationId,
      true,
      now,
    );
  });
  it('reports the device limit when the final slot was taken concurrently', async () => {
    repository.register.mockRejectedValueOnce(new ConcurrentActivationError());
    repository.findByHash
      .mockResolvedValueOnce({ ...license })
      .mockResolvedValue({ ...license, activeDevices: 2 });
    await expect(service()(request)).rejects.toMatchObject({
      code: 'DEVICE_LIMIT_REACHED',
    });
  });
  it('stops after bounded conflict retries', async () => {
    repository.register.mockRejectedValue(new ConcurrentActivationError());
    await expect(service()(request)).rejects.toBeInstanceOf(
      ConcurrentActivationError,
    );
    expect(repository.register).toHaveBeenCalledTimes(3);
  });
  it.each(['findByHash', 'findInstallation', 'register'] as const)(
    'propagates %s repository failures',
    async (method) => {
      repository[method].mockRejectedValue(new Error('AWS internal detail'));
      await expect(service()(request)).rejects.toThrow('AWS internal detail');
    },
  );
  it('does not consume a slot when secret retrieval fails', async () => {
    signingKey.mockRejectedValue(new Error('unavailable'));
    await expect(service()(request)).rejects.toThrow();
    expect(repository.register).not.toHaveBeenCalled();
  });
  it('rejects an unsafe token TTL', () => {
    expect(() =>
      createActivationService({ repository, signingKey, ttlSeconds: 0 }),
    ).toThrow();
  });
});

it('rechecks expiration after a slow signing-secret lookup', async () => {
  license.expiresAt = now + 1;
  const clock = vi
    .fn()
    .mockReturnValueOnce(now)
    .mockReturnValue(now + 2);
  const activate = createActivationService({
    repository,
    signingKey,
    ttlSeconds: 86400,
    now: clock,
  });
  await expect(activate(request)).rejects.toMatchObject({
    code: 'LICENSE_EXPIRED',
  });
  expect(repository.register).not.toHaveBeenCalled();
});

it('two concurrent installations cannot claim the same last slot', async () => {
  const currentLicense = { ...license, maxDevices: 1, activeDevices: 0 };
  repository.findByHash.mockImplementation(async () => ({ ...currentLicense }));
  repository.register.mockImplementation(async () => {
    if (currentLicense.activeDevices >= currentLicense.maxDevices)
      throw new ConcurrentActivationError();
    currentLicense.activeDevices++;
  });
  const activate = service();
  const results = await Promise.allSettled([
    activate(request),
    activate({
      ...request,
      installationId: '1c740bda-a51e-45ee-81d8-a8d518e9ea19',
    }),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(currentLicense.activeDevices).toBe(1);
  const rejected = results.find((result) => result.status === 'rejected');
  expect(rejected?.status === 'rejected' && rejected.reason.code).toBe(
    'DEVICE_LIMIT_REACHED',
  );
});
