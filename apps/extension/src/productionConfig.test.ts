import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadEnv } from 'vite';
import viteConfig from '../vite.config.js';
import { resolveApiBaseUrl } from './config.js';

it('builds a production manifest with only the configured API host and preserves provider matches', async () => {
  const production = readFileSync(
    new URL('../.env.production', import.meta.url),
    'utf8',
  );
  expect(production.trim()).toBe(
    'VITE_ACTIVATION_API_URL=https://tracking.cesaragudelo.com',
  );
  expect(resolveApiBaseUrl('production', production.trim().split('=')[1])).toBe(
    'https://tracking.cesaragudelo.com',
  );
  // Exercise the actual Vite plugin without writing build artifacts or using a browser.
  if (typeof viteConfig !== 'function')
    throw new Error('Expected Vite config factory');
  const config = await viteConfig({ command: 'build', mode: 'production' });
  const plugin = config.plugins
    ?.flat()
    .find(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        'name' in entry &&
        entry.name === 'activation-manifest',
    );
  if (
    !plugin ||
    typeof plugin !== 'object' ||
    !('generateBundle' in plugin) ||
    typeof plugin.generateBundle !== 'function'
  )
    throw new Error('Missing manifest plugin');
  let source = '';
  const generate = plugin.generateBundle as unknown as (this: {
    emitFile: (asset: { source: string }) => void;
  }) => void;
  generate.call({
    emitFile: (asset) => {
      source = asset.source;
    },
  });
  const manifest = JSON.parse(source);
  const root = new URL('../', import.meta.url).pathname;
  const configured = loadEnv(
    'production',
    root,
    'VITE_',
  ).VITE_ACTIVATION_API_URL;
  expect(manifest.host_permissions).toEqual([
    new URL(resolveApiBaseUrl('production', configured)).origin + '/*',
  ]);
  expect(manifest.content_scripts[0].matches).toEqual([
    'https://mail.google.com/*',
    'https://outlook.office.com/*',
    'https://outlook.live.com/*',
    'https://outlook.office365.com/*',
  ]);
  expect(manifest.permissions).toEqual(['storage']);
});
