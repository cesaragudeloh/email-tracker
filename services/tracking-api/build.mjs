import process from 'node:process';
import { packageGeoDatabase } from './dist/packageGeoDatabase.js';
import { build } from 'esbuild';

await build({
  entryPoints: [
    'src/index.ts',
    'src/createTracking.ts',
    'src/getTracking.ts',
    'src/openTrackingPixel.ts',
  ],
  outdir: 'build/lambda',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: false,
});

await packageGeoDatabase(process.env.GEOLITE2_CITY_DB_PATH, 'build/lambda');
