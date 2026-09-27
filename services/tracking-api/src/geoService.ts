import { BlockList, isIP } from 'node:net';
import { open, type CityResponse } from 'maxmind';

export interface GeoResult {
  country: string | null;
  region: string | null;
  city: string | null;
}
export interface GeoService {
  locate(ip: string): Promise<GeoResult | null>;
}
interface CityReader {
  get(ip: string): CityResponse | null;
}

const excluded = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  excluded.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  excluded.addSubnet(address, prefix, 'ipv6');

export function isLookupIp(ip: string): boolean {
  const version = isIP(ip);
  return version !== 0 && !excluded.check(ip, version === 4 ? 'ipv4' : 'ipv6');
}

export class MaxMindGeoService implements GeoService {
  // Cache even a failed load: missing/corrupt deployment assets must not cause
  // repeated disk reads. A new deployment/runtime retries with the new asset.
  private reader: Promise<CityReader> | undefined;
  constructor(
    private readonly path: string | undefined,
    private readonly load: (path: string) => Promise<CityReader> = (path) =>
      open<CityResponse>(path),
  ) {}
  async locate(ip: string): Promise<GeoResult | null> {
    if (!isLookupIp(ip)) return null;
    if (!this.path) throw new Error('GEO_DATABASE_UNAVAILABLE');
    this.reader ??= this.load(this.path);
    // Errors propagate to OpenTrackingService, which warns and persists the
    // event without geo. No provider error text or input is logged.
    const result = (await this.reader).get(ip);
    if (!result) return null;
    const name = (names?: { es?: string; en?: string }): string | null =>
      names?.es || names?.en || null;
    const geo = {
      country: name(result.country?.names),
      region: name(result.subdivisions?.[0]?.names),
      city: name(result.city?.names),
    };
    return Object.values(geo).some(Boolean) ? geo : null;
  }
}
