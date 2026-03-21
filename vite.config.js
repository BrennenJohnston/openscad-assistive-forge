import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const SW_CACHE_VERSION_TOKEN = '__SW_CACHE_VERSION__';
const APP_VERSION_TOKEN = '__APP_VERSION__';
const BUILD_TIME_TOKEN = '__BUILD_TIME__';
const COMMIT_SHA_TOKEN = '__COMMIT_SHA__';

/**
 * Get version info for the build
 */
function getBuildInfo() {
  // Read package.json version
  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
  const version = pkg.version;

  // Get commit SHA from CI environment
  const commitSha =
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    'local';

  // Build timestamp
  const buildTime = new Date().toISOString();

  // SW cache version
  const swVersion =
    commitSha !== 'local'
      ? `commit-${commitSha.slice(0, 8)}`
      : `build-${buildTime.replace(/[-:.TZ]/g, '').slice(0, 14)}`;

  return { version, commitSha, buildTime, swVersion };
}

/**
 * Plugin to inject version info into service worker
 */
function injectSwCacheVersion() {
  const { swVersion } = getBuildInfo();

  return {
    name: 'inject-sw-cache-version',
    apply: 'build',
    generateBundle(_, bundle) {
      const swAsset = bundle['sw.js'];
      if (!swAsset || swAsset.type !== 'asset') return;

      const source = swAsset.source.toString();
      swAsset.source = source.replace(SW_CACHE_VERSION_TOKEN, swVersion);
    },
  };
}

// Get build info for define replacements
const buildInfo = getBuildInfo();

export default defineConfig({
  base: '/',
  plugins: [injectSwCacheVersion()],
  define: {
    // Inject version info as global constants
    __APP_VERSION__: JSON.stringify(buildInfo.version),
    __BUILD_TIME__: JSON.stringify(buildInfo.buildTime),
    __COMMIT_SHA__: JSON.stringify(buildInfo.commitSha),
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'ajv': ['ajv'],
        },
      },
    },
  },
  server: {
    port: 5173,
    headers: {
      // Required for SharedArrayBuffer in development
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['openscad-wasm'],
  },
});
