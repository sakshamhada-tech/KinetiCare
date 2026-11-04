module.exports = {
  testDir: './e2e',
  testMatch: /.*\.e2e\.test\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
    },
  ],
  // Start the full dev stack (web on 5173, API server on 8080) before e2e tests.
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:8080/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
};
