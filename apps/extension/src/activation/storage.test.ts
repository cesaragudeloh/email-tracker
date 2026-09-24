import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createActivationStorage } from './storage.js';

const installationId = '8a73e54e-c33f-40ca-a2dc-06626851744d';
let values: Record<string, unknown>;
const area = {
  get: vi.fn(async (key: string) => ({ [key]: values[key] })),
  set: vi.fn(async (data: Record<string, unknown>) => {
    Object.assign(values, data);
  }),
  remove: vi.fn(async (key: string) => {
    delete values[key];
  }),
  setAccessLevel: vi.fn(async () => {}),
};
let queue: Promise<unknown>;
const locks = {
  request: vi.fn((_name: string, callback: () => Promise<unknown>) => {
    const next = queue.then(callback);
    queue = next.catch(() => {});
    return next;
  }),
};
function storage() {
  return createActivationStorage(
    area as unknown as chrome.storage.LocalStorageArea,
    locks as unknown as LockManager,
  );
}
function authorization(exp = Math.floor(Date.now() / 1000) + 60) {
  const payload = {
    licenseId: 'lic_test',
    installationId,
    iat: Math.floor(Date.now() / 1000),
    exp,
    iss: 'email-tracker',
    aud: 'email-tracker-extension',
  };
  // No firma real: el estado local NO verifica firma ni autoriza acciones backend.
  return {
    status: 'ACTIVATED' as const,
    licenseId: 'lic_test',
    installationId,
    expiresIn: 60,
    accessToken: `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload))}.fake`,
  };
}

beforeEach(() => {
  values = {};
  queue = Promise.resolve();
  vi.clearAllMocks();
});
describe('activation storage (mocked chrome.storage)', () => {
  it('generates and stores an installation UUID once', async () => {
    const first = await storage().getInstallationId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(values.installationId).toBe(first);
    expect(await storage().getInstallationId()).toBe(first);
    expect(area.set).toHaveBeenCalledTimes(1);
    expect(area.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
  });
  it('reuses an existing installation', async () => {
    values.installationId = installationId;
    expect(await storage().getInstallationId()).toBe(installationId);
    expect(area.set).not.toHaveBeenCalled();
  });
  it('serializes first-run initialization in concurrent contexts', async () => {
    const [first, second] = await Promise.all([
      storage().getInstallationId(),
      storage().getInstallationId(),
    ]);
    expect(first).toBe(second);
    expect(area.set).toHaveBeenCalledTimes(1);
  });
  it('replaces an invalid ID and clears stale authorization', async () => {
    values = { installationId: 'bad', authorization: authorization() };
    expect(await storage().getInstallationId()).not.toBe('bad');
    expect(values.authorization).toBeUndefined();
  });
  it('stores the access token without storing the activation code', async () => {
    const value = authorization();
    await storage().saveAuthorization(value, installationId);
    expect(values.authorization).toEqual(value);
    expect(await storage().readAuthorization(installationId)).toEqual(value);
    expect(JSON.stringify(values)).not.toContain('activationCode');
  });
  it('returns inactive with no token', async () => {
    expect(await storage().readAuthorization(installationId)).toBeUndefined();
  });
  it('does not treat an expired token as activated', async () => {
    values.authorization = authorization(1);
    expect(await storage().readAuthorization(installationId)).toBeUndefined();
  });
  it('rejects malformed tokens and foreign installations', async () => {
    values.authorization = { ...authorization(), accessToken: 'bad' };
    expect(await storage().readAuthorization(installationId)).toBeUndefined();
    await expect(
      storage().saveAuthorization(authorization(), crypto.randomUUID()),
    ).rejects.toThrow();
  });
  it('propagates storage errors', async () => {
    area.set.mockRejectedValueOnce(new Error('quota'));
    await expect(
      storage().saveAuthorization(authorization(), installationId),
    ).rejects.toThrow('quota');
  });
});
