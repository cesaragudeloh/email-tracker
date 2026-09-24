import { expect, it } from 'vitest';
import { resolveApiBaseUrl } from './config.js';

it('defaults development to localhost and leaves production unconfigured', () => {
  expect(resolveApiBaseUrl('development')).toBe('http://localhost:3000');
  expect(resolveApiBaseUrl('production')).toBe('');
});
it('normalizes the configured endpoint and preserves stage paths', () => {
  expect(resolveApiBaseUrl('production', ' https://api.test/stage/ ')).toBe(
    'https://api.test/stage',
  );
});
it.each([
  'http://api.test',
  'https://user:pass@api.test',
  'https://api.test?secret=bad',
  'https://api.test#bad',
  'not-url',
])('rejects unsafe API configuration %s', (value) => {
  expect(() => resolveApiBaseUrl('production', value)).toThrow();
});
