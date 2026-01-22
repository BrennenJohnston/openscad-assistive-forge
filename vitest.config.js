import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',  // Playwright E2E tests
      '**/.{idea,git,cache,output,temp}/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/js/**/*.js'],
      exclude: [
        'src/worker/**',
        'src/main.js',
        'src/js/**/*.test.js',
        'src/js/**/*.spec.js',
        // UI controller files - primarily tested via E2E tests
        'src/js/drawer-controller.js',
        'src/js/tutorial-sandbox.js',
        'src/js/preview-settings-drawer.js'
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
        // Note: Phase 1 target achieved for core modules
        // parser.js: 88.82%, preset-manager.js: 70.37%
        // Target: Increase to 80% as more tests are added
      }
    },
    // Increase timeout for integration tests
    testTimeout: 10000
  }
})
