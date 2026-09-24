import { describe, expect, it } from 'vitest';
import { createLicense, hashActivationCode, licenseItems } from './license.js';

describe('license codes', () => {
  it('computes a known SHA-256 vector after normalization', () => {
    expect(hashActivationCode(' abc ')).toBe(
      'b5d4045c3f466fa91fe2cc6abe79232a1a57cdf104f7a26e716e0a1e2789df78',
    );
    expect(hashActivationCode(' abcd-efgh ')).toBe(
      hashActivationCode('ABCD-EFGH'),
    );
  });
  it('generates independent random codes and stores only the hash', () => {
    const first = createLicense(2);
    const second = createLicense(2);
    expect(first.activationCode).not.toBe(second.activationCode);
    expect(first.license.licenseId).not.toBe(second.license.licenseId);
    expect(first.license.activationCodeHash).toBe(
      hashActivationCode(first.activationCode),
    );
    expect(JSON.stringify(licenseItems(first.license))).not.toContain(
      first.activationCode,
    );
    expect(licenseItems(first.license)[0].PK).toBe(
      `CODE#${first.license.activationCodeHash}`,
    );
    expect(first.license).toMatchObject({
      maxDevices: 2,
      activeDevices: 0,
      status: 'ACTIVE',
    });
  });
  it.each([0, -1, 1.5, NaN])('rejects invalid maxDevices %s', (value) => {
    expect(() => createLicense(value)).toThrow();
  });
  it('rejects a past expiration', () => {
    expect(() => createLicense(1, 1)).toThrow();
  });
});
