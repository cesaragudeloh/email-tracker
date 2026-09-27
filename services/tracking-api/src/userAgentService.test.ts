import { expect, it, vi } from 'vitest';
import { UserAgentService } from './userAgentService.js';
const chrome =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
it.each([
  [chrome, 'Chrome', 'Windows', 'Desktop'],
  [`${chrome} Edg/130.0.0.0`, 'Edge', 'Windows', 'Desktop'],
  [
    'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
    'Firefox',
    'Linux',
    'Desktop',
  ],
  [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    'Safari',
    'macOS',
    'Desktop',
  ],
  [
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    'Chrome',
    'Android',
    'Mobile',
  ],
  [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mobile Safari',
    'iOS',
    'Mobile',
  ],
  [
    'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mobile Safari',
    'iOS',
    'Tablet',
  ],
  ['', 'Unknown', 'Unknown', 'Unknown'],
  ['opaque proxy', 'Unknown', 'Unknown', 'Unknown'],
])('parses UA %s', (ua, browser, os, deviceType) => {
  expect(new UserAgentService().parse(ua)).toMatchObject({
    browser,
    os,
    deviceType,
  });
});
it('keeps browser version', () =>
  expect(new UserAgentService().parse(chrome).browserVersion).toBe(
    '130.0.0.0',
  ));
it('skips empty UA and propagates parser failure to pixel fallback', () => {
  const parser = vi.fn(() => {
    throw new Error('parser failure');
  });
  const service = new UserAgentService(parser);
  expect(service.parse('  ').deviceType).toBe('Unknown');
  expect(parser).not.toHaveBeenCalled();
  expect(() => service.parse('raw')).toThrow('parser failure');
});
