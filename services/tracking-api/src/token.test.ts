import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './token.js';

const key = new TextEncoder().encode('fake-signing-key-longer-than-32-bytes');
const claims = {
  licenseId: 'lic_test',
  installationId: '8a73e54e-c33f-40ca-a2dc-06626851744d',
  iat: 1800000000,
  exp: 1800086400,
};
describe('JWT', () => {
  it('signs and verifies expected claims', async () => {
    const token = await signToken(claims, key);
    expect(await verifyToken(token, key, new Date(claims.iat * 1000))).toEqual(
      claims,
    );
  });
  it('rejects a different signing key', async () => {
    await expect(
      verifyToken(
        await signToken(claims, key),
        new TextEncoder().encode('another-fake-signing-key-with-32-bytes'),
        new Date(claims.iat * 1000),
      ),
    ).rejects.toThrow();
  });
  it('rejects expired tokens', async () => {
    await expect(
      verifyToken(
        await signToken(claims, key),
        key,
        new Date(claims.exp * 1000),
      ),
    ).rejects.toThrow();
  });
  it('rejects tampering and unsigned tokens', async () => {
    const token = await signToken(claims, key);
    const parts = token.split('.');
    parts[1] = Buffer.from(
      JSON.stringify({ ...claims, licenseId: 'lic_attacker' }),
    ).toString('base64url');
    await expect(verifyToken(parts.join('.'), key)).rejects.toThrow();
    await expect(
      verifyToken(
        `${Buffer.from('{"alg":"none"}').toString('base64url')}.${parts[1]}.`,
        key,
      ),
    ).rejects.toThrow();
  });
  it('rejects a short signing key', async () => {
    await expect(signToken(claims, new Uint8Array(3))).rejects.toThrow();
  });
});
