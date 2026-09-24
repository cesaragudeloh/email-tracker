import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import { resolveApiBaseUrl } from './src/config.js';

const extensionRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  if (mode === 'content') {
    // Los content scripts declarativos deben ser scripts clásicos autónomos.
    // Esta segunda compilación conserva el popup, el worker y el manifiesto.
    return {
      root: extensionRoot,
      publicDir: false,
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
          entry: fileURLToPath(new URL('./src/content.ts', import.meta.url)),
          name: 'EmailTrackerContent',
          formats: ['iife'],
          fileName: () => 'content.js',
        },
      },
    };
  }

  return {
    root: extensionRoot,
    base: './',
    publicDir: false,
    plugins: [
      {
        name: 'activation-manifest',
        generateBundle() {
          const env = loadEnv(mode, extensionRoot, 'VITE_');
          const apiUrl = resolveApiBaseUrl(mode, env.VITE_ACTIVATION_API_URL);
          const manifest = JSON.parse(
            readFileSync(
              new URL('./public/manifest.json', import.meta.url),
              'utf8',
            ),
          );
          if (apiUrl)
            manifest.host_permissions = [new URL(apiUrl).origin + '/*'];
          this.emitFile({
            type: 'asset',
            fileName: 'manifest.json',
            source: JSON.stringify(manifest, null, 2),
          });
        },
      },
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      modulePreload: false,
      rolldownOptions: {
        input: {
          popup: fileURLToPath(new URL('./popup.html', import.meta.url)),
          background: fileURLToPath(
            new URL('./src/background.ts', import.meta.url),
          ),
        },
        output: {
          entryFileNames: '[name].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
