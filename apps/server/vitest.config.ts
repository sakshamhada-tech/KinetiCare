import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
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
      // cli.ts and seed.ts are executable entry-point scripts (run via
      // `node --experimental-strip-types`) that orchestrate the server/seed;
      // they are not library modules and are not meaningfully unit-testable.
      exclude: ['src/cli.ts', 'src/seed.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
