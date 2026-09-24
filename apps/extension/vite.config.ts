import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

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
