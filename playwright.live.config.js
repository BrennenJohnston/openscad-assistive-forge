import { defineConfig, devices } from '@playwright/test'

// The live lane: the map tools against a DEPLOYED site and the real outside
// services (the address search, the map data servers), in a real browser.
//
// Every other lane routes those services to fixtures, and a fixture-green
// map tool once shipped that could not get data on the published site. This
// lane runs a person's map from a deployed preview instead, so a server that
// refuses the site is a red here. The services are shared and public: the
// lane runs by hand before a gate and in the release gate, never on every
// push. Run: PW_LIVE_URL=https://<branch>.openscad-assistive-forge.pages.dev
// npm run test:e2e:live

const baseURL = process.env.PW_LIVE_URL

if (!baseURL) {
  throw new Error(
    'PW_LIVE_URL is not set: the live lane runs against a deployed site, for example https://develop.openscad-assistive-forge.pages.dev'
  )
}

export default defineConfig({
  testDir: './tests/e2e-live',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  // A pull may ask two servers, wait 30 s and ask again: minutes, not seconds.
  timeout: 300000,
  outputDir: './test-results/live',

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30000,
    navigationTimeout: 60000,
  },

  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        // The installed Chrome in a window, as a person would use it;
        // PW_LIVE_HEADLESS=1 hides the window.
        channel: process.env.PW_LIVE_CHANNEL || 'chrome',
        headless: process.env.PW_LIVE_HEADLESS === '1',
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
})
