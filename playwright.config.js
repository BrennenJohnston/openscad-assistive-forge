import { defineConfig, devices } from '@playwright/test'

const isWindows = process.platform === 'win32'
const isCI = !!process.env.CI
const baseURL = process.env.PW_BASE_URL || 'http://localhost:5173'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Limit workers on Windows to reduce terminal hangs/stalls
  workers: isCI || isWindows ? 1 : undefined,
  // Use list reporter in CI to prevent HTML reporter hangs, HTML locally
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'html',
  
  // Global timeout to prevent hangs (per test: 60s, total: 5min in CI)
  timeout: 60000,
  globalTimeout: isCI ? 300000 : 600000,
  
  // Prevent terminal hang issues
  outputDir: './test-results',
  
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Prevent hangs with explicit timeouts
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Edge - Tier 1 browser (blocking in CI)
    {
      name: 'msedge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    // Firefox - Tier 1 browser
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    // Visual regression tests (Milestone 3: Performance & Stability)
    // Run separately with: npm run test:visual
    {
      name: 'visual-regression',
      testDir: './tests/visual',
      use: {
        ...devices['Desktop Chrome'],
        // Consistent viewport for visual comparisons
        viewport: { width: 1280, height: 720 },
      },
      // Visual tests should not run with regular E2E
      testMatch: '**/*.visual.spec.js',
    },
    // WebKit/Safari - Tier 2 browser (requires macOS runners)
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    // In CI, don't reuse server - start fresh and ensure clean shutdown
    reuseExistingServer: !isCI,
    timeout: 120000,
    // Ensure the server shuts down when tests complete
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
