import { defineConfig, devices } from '@playwright/test';

/**
 * Mobile layout regression tests.
 *
 * The tests run against the already-running dev stack (Vite + API server).
 * Start both services before running: `pnpm run dev` in this package and
 * `pnpm run dev` in artifacts/api-server.
 *
 * Override the target URL with the LUMINA_TEST_URL env var, e.g.
 *   LUMINA_TEST_URL=http://localhost:3000 pnpm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  retries: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',

  use: {
    baseURL: process.env.LUMINA_TEST_URL ?? 'http://localhost:80',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },

  projects: [
    // Global setup project – logs in and saves session state
    {
      name: 'setup',
      testMatch: '**/global-setup.spec.ts',
    },
    // Mobile layout tests run after setup – Chromium at 375 px width
    {
      name: 'mobile-layout',
      use: {
        browserName: 'chromium',
        // 375 px wide – matches a typical small phone (iPhone SE/12 mini)
        viewport: { width: 375, height: 812 },
        // Emulate a coarse-pointer touch device so useIsMobile() returns true
        hasTouch: true,
        isMobile: true,
        storageState: 'e2e/.auth/mobile.json',
      },
      dependencies: ['setup'],
      testMatch: '**/mobile-layout.spec.ts',
    },
    // Tutorial system tests – desktop Chromium
    {
      name: 'tutorial',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
        storageState: 'e2e/.auth/mobile.json',
      },
      dependencies: ['setup'],
      testMatch: '**/tutorial.spec.ts',
    },
  ],
});
