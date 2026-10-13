import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests for the BackReserve web app against the live development API (http://localhost:5280, demo data seeded).
 * The Vite dev server is started automatically (or reused) on E2E_HOST:E2E_PORT, default 127.0.0.1:5173.
 * 127.0.0.1 is used instead of "localhost" so an unrelated server bound to [::1]:5173 can never be hit by accident.
 */
const host = process.env.E2E_HOST ?? '127.0.0.1';
const port = Number(process.env.E2E_PORT ?? 5173);
const baseURL = process.env.E2E_BASE_URL ?? `http://${host}:${port}`;

// iPhone 13 metrics, but rendered with Chromium (only Chromium is installed).
const { defaultBrowserType: _ignored, ...iphone13 } = devices['iPhone 13'];

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  // The full flow shares one tenant across steps and the API rate-limits auth/order endpoints per IP.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile-chromium',
      testMatch: /public\.spec\.ts/,
      use: { ...iphone13, browserName: 'chromium' },
    },
  ],
  webServer: {
    command: `npm run dev -- --host ${host} --port ${port} --strictPort`,
    cwd: '../../apps/web',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
