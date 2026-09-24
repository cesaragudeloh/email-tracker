import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/cdk.out/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
];
