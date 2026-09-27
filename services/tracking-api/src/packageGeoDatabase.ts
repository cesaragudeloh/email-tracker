import { copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

// The database is optional for offline builds. An explicitly configured but
// unreadable source fails the build instead of silently deploying without geo.
export async function packageGeoDatabase(
  source: string | undefined,
  output: string,
): Promise<void> {
  await mkdir(output, { recursive: true });
  const destination = join(output, 'GeoLite2-City.mmdb');
  if (source) await copyFile(source, destination);
  else await rm(destination, { force: true });
}
