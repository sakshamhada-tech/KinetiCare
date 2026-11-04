import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Single forked worker so suite collection happens in one reliably
    // initialized process, avoiding the vitest worker `config is undefined`
    // race under a fresh `npm ci`.
    pool: 'forks',
    poolOptions: {
      forks: {
        maxWorkers: 1,
      },
    },
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)', '__tests__/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['**/types.ts'],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
    },
  },
});
