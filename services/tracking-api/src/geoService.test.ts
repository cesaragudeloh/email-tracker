import { expect, it, vi } from 'vitest';
import { MaxMindGeoService } from './geoService.js';

it.each(['8.8.8.8', '2001:4860:4860::8888', '::ffff:8.8.8.8'])(
  'looks up public IP %s and caches the database across concurrent requests',
  async (ip) => {
    const get = vi.fn().mockReturnValue({
      country: { names: { en: 'Colombia' } },
      subdivisions: [{ names: { en: 'Antioquia' } }],
      city: { names: { es: 'Medellín', en: 'Medellin' } },
    });
    const load = vi.fn().mockResolvedValue({ get });
    const service = new MaxMindGeoService('database', load);
    const results = await Promise.all([service.locate(ip), service.locate(ip)]);
    expect(results[0]).toEqual({
      country: 'Colombia',
      region: 'Antioquia',
      city: 'Medellín',
    });
    expect(load).toHaveBeenCalledExactlyOnceWith('database');
    expect(get).toHaveBeenCalledWith(ip);
  },
);
it.each([
  '10.1.2.3',
  '172.16.0.1',
  '172.31.255.255',
  '192.168.1.2',
  '127.0.0.1',
  '169.254.1.1',
  '100.64.0.1',
  '::1',
  '0:0:0:0:0:0:0:1',
  '::',
  'fc00::1',
  'fd12::1',
  'fe80::1',
  '::ffff:127.0.0.1',
  '::ffff:c0a8:102',
  '',
  'invalid',
  '999.1.1.1',
  '8.8.8.8:80',
])('skips invalid/local IP %s without loading DB', async (ip) => {
  const load = vi.fn();
  expect(await new MaxMindGeoService('db', load).locate(ip)).toBeNull();
  expect(load).not.toHaveBeenCalled();
});
it.each([
  [null, null],
  [{}, null],
  [
    { country: { names: { en: 'Colombia' } } },
    { country: 'Colombia', region: null, city: null },
  ],
])('handles absent and partial geo %j', async (result, expected) => {
  const load = vi.fn().mockResolvedValue({ get: () => result });
  expect(await new MaxMindGeoService('db', load).locate('8.8.8.8')).toEqual(
    expected,
  );
});
it('caches failed DB load and propagates to the pixel fallback', async () => {
  const load = vi.fn().mockRejectedValue(new Error('private path'));
  const service = new MaxMindGeoService('db', load);
  await expect(service.locate('8.8.8.8')).rejects.toThrow();
  await expect(service.locate('8.8.8.8')).rejects.toThrow();
  expect(load).toHaveBeenCalledOnce();
});
it('propagates lookup failure and absent configuration to the pixel fallback', async () => {
  await expect(
    new MaxMindGeoService(undefined).locate('8.8.8.8'),
  ).rejects.toThrow('GEO_DATABASE_UNAVAILABLE');
  const load = vi.fn().mockResolvedValue({
    get: () => {
      throw new Error('lookup');
    },
  });
  await expect(
    new MaxMindGeoService('db', load).locate('8.8.8.8'),
  ).rejects.toThrow('lookup');
});
