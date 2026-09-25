import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts', 'src/createTracking.ts'],
  outdir: 'build/lambda',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: false,
});
