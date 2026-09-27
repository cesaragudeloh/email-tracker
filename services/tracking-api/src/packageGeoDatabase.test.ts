import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { packageGeoDatabase } from './packageGeoDatabase.js';
it('packages the configured DB byte for byte, removes stale assets and rejects missing sources', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'geo-package-'));
  try {
    const source = join(dir, 'input.mmdb');
    const output = join(dir, 'lambda');
    const target = join(output, 'GeoLite2-City.mmdb');
    const bytes = Buffer.from([0, 255, 13, 10, 1]);
    await writeFile(source, bytes);
    await packageGeoDatabase(source, output);
    expect(await readFile(target)).toEqual(bytes);
    await packageGeoDatabase(undefined, output);
    await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      packageGeoDatabase(join(dir, 'missing'), output),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
