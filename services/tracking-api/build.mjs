import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'build/lambda/index.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: false,
});
