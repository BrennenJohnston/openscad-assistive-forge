import { defineConfig } from 'vite';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { injectSwVersion } from './scripts/inject-sw-version.js';

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
 * Replay the production security headers on the preview server.
 *
 * Cloudflare Pages applies `public/_headers`; `vite preview` applies nothing.
 * Without this, an e2e run against the built app would exercise a different
 * application than the one that ships — which is how a CSP that blocks the
 * editor's styles reached production behind a green test suite. The `/*`
 * block is parsed at config load so `_headers` stays the single source of
 * truth; the CSP string is never copied.
 */
function readProductionHeaders() {
  const raw = readFileSync('./public/_headers', 'utf-8');
  const headers = {};
  let inGlobalBlock = false;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inGlobalBlock = line.trim() === '/*';
      continue;
    }
    if (!inGlobalBlock) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }

  if (!headers['Content-Security-Policy']) {
    throw new Error(
      'vite.config.js: no Content-Security-Policy found in the /* block of ' +
        'public/_headers. The preview server must not serve the built app ' +
        'without the shipped CSP — that would make the production test lane ' +
        'lie about what production does.'
    );
  }

  return headers;
}

/**
 * D-31: WebKit will not load the dev worker script after a page reload.
 *
 * MEASURED. First load is fine - the request returns 200 with
 * Cross-Origin-Embedder-Policy: require-corp on it, and the worker starts in
 * about a second. After `location.reload()` WebKit refuses it outright:
 *
 *   Refused to load '/src/worker/openscad-worker.js?worker_file&type=module'
 *   worker because of Cross-Origin-Embedder-Policy
 *
 * and NO response arrives at all - the block happens against the cached entry,
 * before the network. The app then sits at data-wasm-ready unset for ever.
 * Chromium reloads the same page in a fifth of a second.
 *
 * The built app behind public/_headers does NOT have this problem: measured on
 * WebKit, first load 1.2s and reload 1.1s, worker attached both times. So this
 * is the dev server only, and never reached a user.
 *
 * `no-store` is what fixes it: nothing is cached, so there is no cached entry
 * to fail the check. It has to cover the worker's IMPORTS as well as its entry
 * - measured, pinning only the entry moved the failure one step along, to
 * svg-validation.js, mount-content.js, mesh-stats.js and dxf-postprocess.js.
 * Hence /src/worker/ rather than the `worker_file` query alone. Still scoped
 * rather than global so the rest of dev keeps its caching, and `apply: 'serve'`
 * leaves the build untouched.
 *
 * D-133: the same failure, one directory over. The render worker also imports
 * four modules the main thread uses - file-param-resolver.js, font-manifest.js,
 * scad-param-formatter.js and the color-utils.js the last of those pulls in -
 * and those live in /src/js/, which this scope never covered. The main document
 * loads them first, WebKit caches them, and the worker's import of the same URL
 * is then refused against that cached entry, so the engine never starts:
 *
 *   Refused to load '/src/js/scad-param-formatter.js' worker because of
 *   Cross-Origin-Embedder-Policy
 *   [RenderController] Init failed: Error: Worker error
 *
 * MEASURED on local WebKit at fbf52e2: every preview failed with "Preview
 * failed: Something Went Wrong", which is what the DP-32 announcement test was
 * really reporting. The built app is again unaffected - measured on WebKit
 * against dist behind these same headers, WASM ready in 855ms and a worker
 * restart succeeded - so this never reached a user either.
 *
 * The covered set is READ FROM THE WORKER'S OWN IMPORTS rather than listed by
 * hand, because a hand-written list is exactly what let the failure move one
 * step along last time. Add an import to the worker and it is covered.
 *
 * This is NOT a relaxation of COOP/COEP. Those headers are unchanged and
 * cross-origin isolation stays on - `crossOriginIsolated` is true and
 * SharedArrayBuffer is available before and after, measured.
 */
export function devWorkerModuleGraph(entry = 'src/worker/openscad-worker.js') {
  const root = process.cwd();
  const seen = new Set();
  const stack = [path.resolve(root, entry)];
  const fromRe =
    /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf-8');
    fromRe.lastIndex = 0;
    let match;
    while ((match = fromRe.exec(source))) {
      const spec = match[1] || match[2] || match[3];
      if (!spec || !spec.startsWith('.')) continue;
      let resolved = path.resolve(path.dirname(file), spec);
      if (!existsSync(resolved) && existsSync(`${resolved}.js`)) resolved += '.js';
      stack.push(resolved);
    }
  }

  const urls = new Set(
    [...seen].map((file) => `/${path.relative(root, file).split(path.sep).join('/')}`)
  );
  // Vite injects its HMR client into every module it transforms, the worker's
  // included, so those two URLs are part of the worker's graph even though no
  // source file names them. Measured: with only the app modules covered, WebKit
  // moved the refusal onto /@vite/client and the client's own env.mjs and the
  // first two worker inits still died.
  urls.add('/@vite/client');
  urls.add('/node_modules/vite/dist/client/env.mjs');
  urls.add('/node_modules/vite/dist/client/client.mjs');
  return urls;
}

function devWorkerNoStore() {
  const workerModules = devWorkerModuleGraph();

  return {
    name: 'd31-dev-worker-no-store',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url ? req.url.split('?')[0] : '';
        const covered =
          !!req.url &&
          (/worker_file|\/src\/worker\//.test(req.url) ||
            workerModules.has(pathname));
        if (!covered) {
          next();
          return;
        }
        // Vite's own transform middleware sets Cache-Control: no-cache on
        // module responses AFTER this runs, so simply setting the header here
        // is overwritten - measured, the reload still failed. Pin it instead.
        const setHeader = res.setHeader.bind(res);
        res.setHeader = (name, value) =>
          String(name).toLowerCase() === 'cache-control'
            ? res
            : setHeader(name, value);
        setHeader('Cache-Control', 'no-store');
        next();
      });
    },
  };
}

/**
 * Plugin to inject version info into the service worker.
 *
 * sw.js is copied from public/ verbatim and never appears in the Rollup
 * bundle, so this must run in closeBundle (after copyPublicDir) and rewrite
 * dist/sw.js on disk. injectSwVersion throws on any miss, failing the build
 * rather than shipping a frozen cache name that blocks old-cache purges.
 */
function injectSwCacheVersion() {
  const { swVersion } = getBuildInfo();

  return {
    name: 'inject-sw-cache-version',
    apply: 'build',
    closeBundle() {
      const injected = injectSwVersion('dist', swVersion);
      console.log(`[sw] cache version injected: ${injected}`);
    },
  };
}

// Get build info for define replacements
const buildInfo = getBuildInfo();

export default defineConfig({
  base: '/',
  plugins: [injectSwCacheVersion(), devWorkerNoStore()],
  define: {
    // Inject version info as global constants
    __APP_VERSION__: JSON.stringify(buildInfo.version),
    __BUILD_TIME__: JSON.stringify(buildInfo.buildTime),
    __COMMIT_SHA__: JSON.stringify(buildInfo.commitSha),
    // path-bool references process.env.PATH_BOOL_DEV_ASSERTS (Node-only global).
    // Vite doesn't auto-replace arbitrary process.env.* in pre-bundled deps.
    'process.env.PATH_BOOL_DEV_ASSERTS': 'undefined',
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
  preview: {
    port: 4173,
    // Fail loudly rather than serve the built app on some other port, where
    // the production test lane would silently connect to nothing.
    strictPort: true,
    headers: readProductionHeaders(),
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['openscad-wasm'],
  },
});
