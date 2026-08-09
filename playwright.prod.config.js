import { defineConfig, devices } from '@playwright/test'

// Production-parity e2e lane.
//
// Every other automated check in this repository runs against the Vite dev
// server, which sends no Content-Security-Policy. The built app behind the
// shipped `public/_headers` CSP had therefore never been loaded by any test —
// and that is the gap a broken editor walked through to production.
//
// This config serves `dist` through `vite preview`, which replays the real
// `/*` headers (see readProductionHeaders in vite.config.js). Its specs live
// in their own directory: dropped into tests/e2e they would be collected by
// playwright.config.js and pass vacuously against the CSP-free dev server.

const isCI = !!process.env.CI
const baseURL = process.env.PW_PROD_BASE_URL || 'http://localhost:4173'

export default defineConfig({
  testDir: './tests/e2e-prod',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? [['list']] : [['list'], ['html', { open: 'never' }]],

  timeout: 240000,
  globalTimeout: process.env.PW_PROD_GLOBAL_TIMEOUT
    ? Number(process.env.PW_PROD_GLOBAL_TIMEOUT)
    : 900000,

  outputDir: './test-results/prod',

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 45000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Matches the owner's evidence screenshots, so the artifacts this
        // lane writes can be compared against them directly.
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],

  webServer: {
    // `npm run preview` picks up preview.headers from vite.config.js.
    command: 'npm run preview',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
