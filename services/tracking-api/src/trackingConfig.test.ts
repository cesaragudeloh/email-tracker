import { expect, it } from 'vitest';
import { readTrackingConfig } from './trackingConfig.js';
const env = { TRACKING_TABLE_NAME: 'tracking', JWT_SECRET_ARN: 'secret-arn' };
it('defaults to the production tracking origin', () => {
  expect(readTrackingConfig(env).TRACKING_BASE_URL).toBe(
    'https://tracking.cesaragudelo.com',
  );
});
it('supports a normalized local override', () => {
  expect(
    readTrackingConfig({ ...env, TRACKING_BASE_URL: 'http://localhost:3000/' })
      .TRACKING_BASE_URL,
  ).toBe('http://localhost:3000');
});
it.each([
  'ftp://example.test',
  'https://user:password@example.test',
  'https://example.test/?secret=value',
  'https://example.test/#hash',
  'http://example.test',
])('rejects unsafe URL %s', (url) => {
  expect(() =>
    readTrackingConfig({ ...env, TRACKING_BASE_URL: url }),
  ).toThrow();
});
it('requires table and secret configuration', () => {
  expect(() => readTrackingConfig({})).toThrow();
});
