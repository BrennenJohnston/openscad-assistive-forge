import { defineConfig, devices } from '@playwright/test'

const isWindows = process.platform === 'win32'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Limit workers on Windows to reduce terminal hangs/stalls
  workers: process.env.CI || isWindows ? 1 : undefined,
  reporter: 'html',
  
  // Global timeout to prevent hangs (per test: 60s, total: 10min)
  timeout: 60000,
  globalTimeout: 600000,
  
  // Prevent terminal hang issues
  outputDir: './test-results',
  
  use: {
    baseURL: 'http://localhost:5173',
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
    // Firefox and Webkit disabled for now - enable when browser binaries are installed
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
  
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI || process.env.PW_REUSE_SERVER === '1',
    timeout: 120000,
  },
})
