import { SignJWT } from 'jose';
import { expect, it, vi } from 'vitest';
import { createAuthorization } from './authorization.js';
import { signToken } from './token.js';
const key = new TextEncoder().encode(
  'test-only-key-longer-than-thirty-two-bytes',
);
const identity = {
  licenseId: 'lic_test',
  installationId: '8a73e54e-c33f-40ca-a2dc-06626851744d',
};
const now = Math.floor(Date.now() / 1000);
const claims = { ...identity, iat: now, exp: now + 3600 };
it('returns only the authenticated identity', async () => {
  expect(
    await createAuthorization(async () => key)(
      `Bearer ${await signToken(claims, key)}`,
    ),
  ).toEqual(identity);
});
it.each([
  undefined,
  '',
  'Basic abc',
  'Bearer',
  'Bearer a b',
  'Bearer a,Bearer b',
])('rejects missing or malformed authorization %s', async (header) => {
  const provider = vi.fn();
  await expect(createAuthorization(provider)(header)).rejects.toMatchObject({
    statusCode: 401,
  });
  expect(provider).not.toHaveBeenCalled();
});
it('rejects an invalid signature', async () => {
  const token = await signToken(
    claims,
    new TextEncoder().encode('different-test-key-longer-than-thirty-two-bytes'),
  );
  await expect(
    createAuthorization(async () => key)(`Bearer ${token}`),
  ).rejects.toMatchObject({ statusCode: 401 });
});
it('rejects an expired token', async () => {
  const token = await signToken(
    { ...claims, iat: now - 60, exp: now - 1 },
    key,
  );
  await expect(
    createAuthorization(async () => key)(`Bearer ${token}`),
  ).rejects.toMatchObject({ statusCode: 401 });
});
it.each([
  { ...claims, licenseId: '' },
  { ...claims, installationId: 'invalid' },
  { iat: now, exp: now + 60 },
])('rejects signed tokens with invalid identity', async (payload) => {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('email-tracker')
    .setAudience('email-tracker-extension')
    .sign(key);
  await expect(
    createAuthorization(async () => key)(`Bearer ${token}`),
  ).rejects.toMatchObject({ statusCode: 401 });
});
it('propagates secret-provider failures as internal failures', async () => {
  await expect(
    createAuthorization(async () => {
      throw new Error('secret failure');
    })('Bearer abc'),
  ).rejects.toThrow('secret failure');
});
