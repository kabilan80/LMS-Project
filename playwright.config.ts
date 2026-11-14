import { defineConfig, devices } from '@playwright/test';
import { ADMIN, API_PORT, API_URL, DATABASE_URL, WEB_PORT, WEB_URL } from './e2e/support/env';

/**
 * Browser tests for the whole LMS. `pnpm e2e` starts its own API (port 4100, database `lms_e2e`, recreated on
 * every run) and web app (port 4300), so it never touches your development data.
 * MySQL must be running and the user in E2E_DATABASE_URL must be allowed to create databases/tables.
 */
export default defineConfig({
  testDir: './e2e/tests',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false, // specs share one database; each spec creates its own uniquely named users
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /responsive\.spec\.ts/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'node e2e/scripts/start-api.mjs',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      env: {
        DATABASE_URL,
        JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-123456',
        PORT: String(API_PORT),
        CLIENT_URL: WEB_URL,
        E2E_ADMIN_NAME: ADMIN.name,
        E2E_ADMIN_EMAIL: ADMIN.email,
        E2E_ADMIN_PASSWORD: ADMIN.password,
        PAYMENT_PROVIDER: 'mock',
        DISABLE_RATE_LIMITS: 'true',
      },
    },
    {
      command: `pnpm --filter @lms/web exec vite --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_URL: API_URL },
    },
  ],
});
