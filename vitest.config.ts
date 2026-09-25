import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@email-tracker/shared': fileURLToPath(
        new URL('./packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    // Comprobar el CSS real encapsulado, sin sustituir su import por texto vacío.
    css: { include: [/TrackingToggle\.css/] },
    include: [
      '{apps,services,infrastructure,packages}/**/src/**/*.{test,spec}.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/cdk.out/**',
    ],
  },
});
