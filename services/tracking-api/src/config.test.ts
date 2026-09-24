import { expect, it } from 'vitest';
import { readConfig } from './config.js';

it('loads configuration with a 24-hour default', () => {
  expect(
    readConfig({ LICENSE_TABLE_NAME: 'table', JWT_SECRET_ARN: 'arn' })
      .JWT_TTL_SECONDS,
  ).toBe(86400);
});
it('rejects missing configuration and invalid TTL', () => {
  expect(() => readConfig({})).toThrow();
  expect(() =>
    readConfig({
      LICENSE_TABLE_NAME: 'table',
      JWT_SECRET_ARN: 'arn',
      JWT_TTL_SECONDS: '-1',
    }),
  ).toThrow();
});
