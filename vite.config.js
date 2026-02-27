import { defineConfig } from 'vite';
import { readFileSync, readdirSync, statSync, mkdirSync, copyFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

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

/**
 * Collect all .py files under a directory (excluding __pycache__).
 * Returns paths relative to `baseDir`, using forward slashes.
 * @param {string} dir - Absolute path to directory
 * @param {string} baseDir - Root to compute relative paths from
 * @param {string[]} exclude - Filenames to skip
 * @returns {string[]}
 */
function collectPyFiles(dir, baseDir, exclude = []) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__pycache__') continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectPyFiles(fullPath, baseDir, exclude));
    } else if (entry.endsWith('.py') && !exclude.includes(entry)) {
      results.push(relative(baseDir, fullPath).replace(/\\/g, '/'));
    }
  }
  return results;
}

/**
 * Vite plugin: copy the forge_cad Python package into public/python/ at build start
 * and generate forge_cad_index.json for the Pyodide worker to discover files.
 *
 * In dev mode (buildStart) Vite serves public/ statically, so this also works with
 * `pixi run dev` / `npm run dev`.
 */
function copyForgeCadPlugin() {
  return {
    name: 'copy-forge-cad',
    buildStart() {
      const src = join(process.cwd(), 'forge-cad-to-parametric', 'forge_cad');
      const dest = join(process.cwd(), 'public', 'python', 'forge_cad');
      const srcBase = join(process.cwd(), 'forge-cad-to-parametric');

      const files = collectPyFiles(src, srcBase, ['cli.py', 'prompts.py']);

      for (const relPath of files) {
        const srcFile = join(srcBase, relPath);
        const destFile = join(process.cwd(), 'public', 'python', relPath);
        mkdirSync(join(destFile, '..'), { recursive: true });
        copyFileSync(srcFile, destFile);
      }

      // Write index so the Pyodide worker can discover all files without a directory listing
      const indexPath = join(process.cwd(), 'public', 'python', 'forge_cad_index.json');
      writeFileSync(indexPath, JSON.stringify({ files }, null, 2));

      console.log(`[copy-forge-cad] Copied ${files.length} Python files → public/python/`);
    },
  };
}

// Get build info for define replacements
const buildInfo = getBuildInfo();

export default defineConfig({
  base: '/',
  plugins: [injectSwCacheVersion(), copyForgeCadPlugin()],
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
