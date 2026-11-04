import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const tsProjects = [
  'apps/web/tsconfig.json',
  'apps/server/tsconfig.json',
  'packages/shared/tsconfig.json',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      'node_modules/**',
      '**/coverage/**',
      '**/.nyc_output/**',
      'playwright-report/**',
      'test-results/**',
      'artifacts/**',
      'apps/web/public/mediapipe/**',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      '*.tsbuildinfo',
    ],
  },
  // Base recommended rules for all TS/TSX (lint-only, no type-aware project needed).
  ...tseslint.configs.recommended,
  prettier,
  // Type-aware rules only for source files that belong to a tsconfig project.
  {
    files: ['apps/**/src/**/*.{ts,tsx}', 'packages/**/src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: tsProjects,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  }
);
