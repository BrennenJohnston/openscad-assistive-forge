import { defineConfig, devices } from '@playwright/test'
import { PROJECT_IGNORES } from './scripts/e2e-shard.mjs'

/** What a project leaves out, as Playwright wants it; the table says why. */
const ignores = (project) =>
  PROJECT_IGNORES[project].map((file) => `**/${file}`)

const isWindows = process.platform === 'win32'
const isCI = !!process.env.CI
const baseURL = process.env.PW_BASE_URL || 'http://localhost:5173'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Windows: 1 worker (terminal hang avoidance). CI: 2 workers (ubuntu-latest has 2 vCPUs).
  workers: isWindows ? 1 : (isCI ? 2 : undefined),
  // Use list reporter in CI to prevent HTML reporter hangs, HTML locally.
  // The JSON report feeds scripts/check-e2e-complete.mjs (Q-23): a run the
  // clock cut short must fail the job, not pass with tests never started.
  reporter: isCI
    ? [
        ['list'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'playwright-results.json' }],
      ]
    : 'html',
  
  // Global timeout: 10min CI (2 workers + retries), 30min local (1 worker on Windows)
  // Firefox/WebKit projects override per-test timeout to 90s (see below).
  // PW_GLOBAL_TIMEOUT allows slow CI jobs (WebKit on macOS regularly needs
  // 9-11min wall time) to raise the ceiling without affecting other jobs.
  timeout: 60000,
  globalTimeout: process.env.PW_GLOBAL_TIMEOUT
    ? Number(process.env.PW_GLOBAL_TIMEOUT)
    : isCI
      ? 600000
      : 1800000,
  
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
      testIgnore: ignores('msedge'),
    },
    // Firefox - Tier 1 browser (extended timeouts for WASM init overhead)
    // wasm-smoke runs on Chromium-family projects only for now: it performs
    // real WASM renders with no CI skip, and Firefox/WebKit CI runners are
    // not yet proven stable for that (see the skip-debt drawdown plan).
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        actionTimeout: 15000,
        navigationTimeout: 45000,
      },
      timeout: 90000,
      testIgnore: ignores('firefox'),
    },
    // Visual regression tests (Milestone 3: Performance & Stability)
    // Run separately with: npm run test:visual
    {
      name: 'visual-regression',
      testDir: './tests/visual',
      snapshotPathTemplate: '{testDir}/baselines/{platform}/{arg}{ext}',
      use: {
        ...devices['Desktop Chrome'],
        // Consistent viewport for visual comparisons
        viewport: { width: 1280, height: 720 },
      },
      // Visual tests should not run with regular E2E
      testMatch: '**/*.visual.spec.js',
    },
    // WebKit/Safari - Tier 2 browser (requires macOS runners, extended timeouts)
    //
    // Q-48 (owner, 2026-08-14): this lane is SCOPED, and the reason is
    // arithmetic. Running all 782 tests, it reached 177 of them in its
    // 25-minute budget - 103 passed, 2 failed, 70 skipped, 597 never started -
    // so it reported the clock rather than the browser. MEASURED cost on the
    // macOS runner: ~13.5s per executed test in classic-mode, ~7.6s in
    // accessibility, against ~19 tests/min on the Firefox lane. Finishing the
    // whole suite needs roughly 100+ minutes, and macOS runners bill at 10x,
    // so a complete lane was rejected on cost.
    //
    // The owner chose coverage weighted toward accessibility, because Safari
    // is the browser VoiceOver users are on, so that suite buys more here than
    // anywhere else. The scope is these five files (~176 tests), which fit the
    // existing budget and still include classic-mode, where this lane's one
    // reproducible failure lives.
    //
    // Anything outside this list is NOT covered on Safari. Widening it means
    // re-checking the arithmetic above, not just adding a line.
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        actionTimeout: 15000,
        navigationTimeout: 45000,
      },
      timeout: 90000,
      testMatch: [
        '**/accessibility.spec.js',
        '**/classic-mode.spec.js',
        '**/theme-switching.spec.js',
        '**/first-visit-choice.spec.js',
        '**/basic-workflow.spec.js',
      ],
    },
    // Mobile & tablet projects — scoped to responsive audit spec to avoid
    // interference with desktop-only E2E tests.
    {
      name: 'mobile-iphone',
      use: { ...devices['iPhone 12'] },
      testMatch: '**/responsive-audit.spec.js',
    },
    {
      name: 'mobile-pixel',
      use: { ...devices['Pixel 5'] },
      testMatch: '**/responsive-audit.spec.js',
    },
    {
      name: 'tablet-ipad',
      use: { ...devices['iPad (gen 7)'] },
      testMatch: '**/responsive-audit.spec.js',
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
