/**
 * OpenSCAD WASM Web Worker
 * @license GPL-3.0-or-later
 *
 * ## Performance Notes: Threading and WASM
 *
 * This worker uses the **official OpenSCAD WASM build** with Manifold support.
 * OpenSCAD renders run on a single core, which is the primary bottleneck for complex models.
 *
 * ### Performance Optimizations Implemented:
 * - **Manifold Backend:** 5-30x faster boolean operations (--backend=Manifold)
 * - **Binary STL Export:** 18x faster than ASCII STL (--export-format=binstl)
 * - **Capability Detection:** Automatic detection of available features
 * - **Lazy Union:** Optional optimization for union() calls (--enable=lazy-union)
 * - **Performance Observability:** Real-time metrics and logging
 *
 * ### WASM Build Info:
 * - Source: Official OpenSCAD snapshot build (https://files.openscad.org/snapshots/)
 * - Location: /wasm/openscad-official/openscad.js
 * - Features: Manifold geometry engine, fast-csg, lazy-union support
 *
 * ### Future Enhancements:
 * - Threaded WASM for multi-core parallelism (requires SharedArrayBuffer)
 */

import { resolveFileParams } from '../js/file-param-resolver.js';
import {
  FONT_ASSET_DIR,
  FONT_FILES,
  FONT_MOUNT_DIR,
} from '../js/font-manifest.js';
import {
  escapeRegExp,
  formatScadValue,
  buildDefineArgs,
} from '../js/scad-param-formatter.js';
import { validateSVGOutput } from './svg-validation.js';
import { postProcessDXF } from './dxf-postprocess.js';
import { parseOffTriangleCount } from './mesh-stats.js';
import { generateMissingFileWarnings } from './missing-file-warnings.js';
import { resolveMountContent } from './mount-content.js';
import {
  translateWorkerError,
  MODEL_NOT_2D_SUGGESTION,
} from './error-translations.js';

// Official WASM is loaded dynamically in initWASM() from /wasm/openscad-official/

// Worker state
let openscadInstance = null;
let openscadModule = null;
let initialized = false;
let currentRenderTimeout = null;
const mountedFiles = new Map(); // Track files in virtual filesystem
const mountedLibraries = new Set(); // Track mounted library IDs
let assetBaseUrl = ''; // Base URL for fetching assets (fonts, libraries, etc.)
let wasmAssetLogShown = false;
let openscadConsoleOutput = ''; // Accumulated console output from OpenSCAD
let openscadCapabilities = null;
let _callMainInvoked = false;
// Mutes console mirroring inside the Module print/printErr closures while the
// --help capability probe runs (its ~200-line usage block otherwise floods the
// page console as [OpenSCAD ERR] on every cold start). Output still accumulates
// in openscadConsoleOutput for the capability parser.
let capabilityProbeActive = false;

function isAbsoluteUrl(value) {
  return /^[a-z]+:\/\//i.test(value);
}

function normalizeBaseUrl(value) {
  if (!value) return '';
  return value.endsWith('/') ? value : `${value}/`;
}

function _resolveWasmAsset(path, prefix) {
  if (!path) return path;
  if (/^(data:|blob:)/i.test(path)) return path;
  if (isAbsoluteUrl(path)) return path;

  const base = normalizeBaseUrl(assetBaseUrl || self.location.origin);
  const resolvedBase = prefix
    ? isAbsoluteUrl(prefix)
      ? prefix
      : new URL(prefix, base).toString()
    : base;
  const resolved = new URL(path, normalizeBaseUrl(resolvedBase)).toString();

  if (
    !wasmAssetLogShown &&
    (path.endsWith('.wasm') || path.endsWith('.data'))
  ) {
    if (import.meta.env.DEV)
      console.log('[Worker] Resolved WASM asset URL:', resolved);
    wasmAssetLogShown = true;
  }

  return resolved;
}

// Timing metrics for performance profiling
let wasmInitStartTime = 0;
let wasmInitDurationMs = 0;

/**
 * Ensure we have access to the underlying OpenSCAD WASM module
 * @returns {Promise<Object|null>}
 */
async function ensureOpenSCADModule() {
  if (openscadModule) return openscadModule;
  // With official WASM, openscadInstance IS the module after ready resolves
  if (openscadInstance) {
    openscadModule = openscadInstance;
  }
  return openscadModule;
}

// Error classification (ERROR_TRANSLATIONS / translateWorkerError) lives in
// ./error-translations.js (shared with unit tests).

/**
 * Initialize OpenSCAD WASM
 * @param {string} baseUrl - Base URL for fetching assets (optional, defaults to current origin)
 */
async function initWASM(baseUrl = '', cachedCapabilities = null) {
  try {
    // Start timing WASM initialization
    wasmInitStartTime = performance.now();

    // Set asset base URL (derive from self.location if not provided)
    assetBaseUrl = baseUrl || self.location.origin;
    if (import.meta.env.DEV)
      console.log('[Worker] Asset base URL:', assetBaseUrl);

    // Init progress is indeterminate (percent: -1): stage milestones are not
    // tied to any real measurement, so only the stage message is honest.
    self.postMessage({
      type: 'PROGRESS',
      payload: {
        requestId: 'init',
        percent: -1,
        message: 'Loading official OpenSCAD WASM with Manifold...',
      },
    });

    // Load official OpenSCAD WASM from vendored location
    const wasmBasePath = `${assetBaseUrl}/wasm/openscad-official`;
    const wasmJsUrl = `${wasmBasePath}/openscad.js`;

    if (import.meta.env.DEV)
      console.log('[Worker] Loading official OpenSCAD from:', wasmJsUrl);

    // Integrity check: verify WASM artifacts match the vendored manifest.
    // Guards against corrupted or tampered files before they produce silent
    // wrong results. Verifies byte size AND the SHA-256 recorded in
    // INTEGRITY.json (previously only content-length was compared, which
    // cannot detect same-size tampering). The fetch hits the HTTP/SW cache
    // and the 10.7 MB digest takes milliseconds.
    let integrityData = null;
    try {
      const integrityUrl = `${wasmBasePath}/INTEGRITY.json`;
      const integrityResp = await fetch(integrityUrl);
      if (integrityResp.ok) {
        integrityData = await integrityResp.json();
        console.log(`[Worker] WASM build: ${integrityData.build}`);
        if (integrityData.knownIssues?.length) {
          if (import.meta.env.DEV) {
            console.log(
              `[Worker] Known issues: ${integrityData.knownIssues.length} documented`
            );
          }
        }

        // Verify size and SHA-256 of both the JS loader and the WASM binary
        const filesToCheck = [
          { name: 'openscad.js', url: wasmJsUrl },
          { name: 'openscad.wasm', url: `${wasmBasePath}/openscad.wasm` },
        ];
        const mismatches = [];

        for (const { name, url } of filesToCheck) {
          const expected = integrityData.files?.[name];
          if (!expected?.size && !expected?.sha256) continue;

          try {
            const resp = await fetch(url);
            if (!resp.ok) continue;
            const buffer = await resp.arrayBuffer();

            if (expected.size && buffer.byteLength !== expected.size) {
              mismatches.push(
                `${name}: expected ${expected.size} bytes, got ${buffer.byteLength}`
              );
              continue;
            }
            if (expected.sha256 && crypto?.subtle) {
              const digest = await crypto.subtle.digest('SHA-256', buffer);
              const hex = Array.from(new Uint8Array(digest))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');
              if (hex !== expected.sha256) {
                mismatches.push(
                  `${name}: SHA-256 mismatch (expected ${expected.sha256.slice(0, 16)}…, got ${hex.slice(0, 16)}…)`
                );
              }
            }
          } catch (_fetchErr) {
            // Fetch may fail on some CDN configs; skip this file's check
          }
        }

        if (mismatches.length > 0) {
          const msg = `[Worker] WASM integrity check FAILED — ${mismatches.join('; ')}. Files may be corrupted or tampered with; re-run npm run setup-wasm.`;
          console.warn(msg);
          self.postMessage({
            type: 'WARNING',
            payload: {
              code: 'WASM_INTEGRITY',
              message:
                'WASM engine files failed integrity verification (size or SHA-256 mismatch). Re-download them with "npm run setup-wasm".',
              severity: 'warning',
            },
          });
        } else if (import.meta.env.DEV) {
          console.log('[Worker] WASM integrity verified (size + SHA-256)');
        }
      }
    } catch (integrityErr) {
      // Non-fatal — integrity check is informational, not blocking
      if (import.meta.env.DEV)
        console.log('[Worker] Integrity check skipped:', integrityErr.message);
    }

    // Dynamic import of official WASM module
    const OpenSCADModule = await import(/* @vite-ignore */ wasmJsUrl);
    const OpenSCAD = OpenSCADModule.default;

    self.postMessage({
      type: 'PROGRESS',
      payload: {
        requestId: 'init',
        percent: -1,
        message: 'Initializing WebAssembly module...',
      },
    });

    // Initialize OpenSCAD with configuration
    const module = await OpenSCAD({
      // Prevent auto-running main (GUI) on init; we call callMain manually.
      noInitialRun: true,
      // Keep runtime alive after callMain (e.g., --help during capability checks).
      noExitRuntime: true,
      locateFile: (path) => {
        // All WASM assets are in the same directory
        if (path.endsWith('.wasm') || path.endsWith('.data')) {
          const resolved = `${wasmBasePath}/${path}`;
          if (!wasmAssetLogShown) {
            if (import.meta.env.DEV)
              console.log('[Worker] Resolved WASM asset:', resolved);
            wasmAssetLogShown = true;
          }
          return resolved;
        }
        return path;
      },
      print: (text) => {
        openscadConsoleOutput += text + '\n';
        if (!capabilityProbeActive) console.log('[OpenSCAD]', text);
      },
      printErr: (text) => {
        openscadConsoleOutput += '[ERR] ' + text + '\n';
        if (!capabilityProbeActive) console.error('[OpenSCAD ERR]', text);
        // Detecting GUI mode or abort errors is done via console output inspection
      },
    });

    self.postMessage({
      type: 'PROGRESS',
      payload: {
        requestId: 'init',
        percent: -1,
        message: 'Waiting for WebAssembly to be ready...',
      },
    });

    // Wait for the module to be fully ready
    await module.ready;

    // Store module references
    openscadInstance = module;
    openscadModule = module;
    initialized = true;

    console.log('[Worker] Official OpenSCAD WASM loaded successfully');

    self.postMessage({
      type: 'PROGRESS',
      payload: {
        requestId: 'init',
        percent: -1,
        message: 'Loading fonts for text() support...',
      },
    });

    // Mount fonts for text() support
    await mountFonts();

    // Check OpenSCAD capabilities (Manifold, fast-csg, etc.)
    // When cachedCapabilities is provided (worker restart), skip callMain(['--help']).
    // Calling callMain() twice in the same WASM process (once for --help, once for
    // the actual render) corrupts Emscripten global state and degrades geometry output.
    let detectedCapabilities;
    if (cachedCapabilities) {
      if (import.meta.env.DEV) {
        console.log(
          '[Worker] Using cached capabilities — skipping callMain --help'
        );
      }
      detectedCapabilities = cachedCapabilities;
    } else {
      self.postMessage({
        type: 'PROGRESS',
        payload: {
          requestId: 'init',
          percent: -1,
          message: 'Checking rendering capabilities...',
        },
      });
      detectedCapabilities = await checkCapabilities();
    }
    openscadCapabilities = detectedCapabilities;

    // Calculate total WASM init duration
    wasmInitDurationMs = Math.round(performance.now() - wasmInitStartTime);

    self.postMessage({
      type: 'PROGRESS',
      payload: {
        requestId: 'init',
        percent: -1,
        message: 'Finalizing initialization...',
      },
    });

    self.postMessage({
      type: 'READY',
      payload: {
        wasmInitDurationMs,
        capabilities: detectedCapabilities,
      },
    });

    console.log(
      `[Worker] OpenSCAD WASM initialized successfully in ${wasmInitDurationMs}ms`
    );
  } catch (error) {
    console.error('[Worker] Failed to initialize OpenSCAD:', error);
    self.postMessage({
      type: 'ERROR',
      payload: {
        requestId: 'init',
        code: 'INIT_FAILED',
        message: 'Failed to initialize OpenSCAD engine',
        details: error.message,
      },
    });
  }
}

/**
 * Mount Liberation fonts for OpenSCAD text() support
 * Fonts are loaded from /fonts/ and mounted to /usr/share/fonts/truetype/liberation/
 * @returns {Promise<void>}
 */
async function mountFonts() {
  const module = await ensureOpenSCADModule();
  if (!module || !module.FS) {
    console.warn('[Worker] Cannot mount fonts: filesystem not available');
    return;
  }

  const FS = module.FS;

  // Create the font directory structure, one level at a time. Derived from the
  // manifest's mount path so the directory the fonts land in and the path the
  // UI reports cannot drift apart (F2).
  const fontPath = FONT_MOUNT_DIR;
  let built = '';
  for (const segment of fontPath.split('/').filter(Boolean)) {
    built += `/${segment}`;
    try {
      FS.mkdir(built);
    } catch (_e) {
      /* may exist */
    }
  }

  // The fonts to load — one source of truth, shared with the Font List panel.
  const fonts = FONT_FILES;

  // Valid TrueType fonts start with these 4 magic bytes (scalar type = 0x00010000).
  // If the server returns HTML (e.g. SPA _redirects masking a 404), the first bytes
  // will be ASCII (0x3C for '<') instead.
  const TTF_MAGIC = [0x00, 0x01, 0x00, 0x00];

  let mounted = 0;
  let failed = 0;
  let corruptCount = 0;

  for (const fontFile of fonts) {
    try {
      const fontUrl = `${assetBaseUrl}/${FONT_ASSET_DIR}/${fontFile}`;
      const response = await fetch(fontUrl);

      if (!response.ok) {
        console.warn(`[Worker] Font not found: ${fontFile}`);
        failed++;
        continue;
      }

      const fontData = await response.arrayBuffer();
      const headerBytes = new Uint8Array(fontData.slice(0, 4));
      const isTTF = TTF_MAGIC.every((b, i) => headerBytes[i] === b);

      if (!isTTF) {
        console.warn(
          `[Worker] Font ${fontFile} has invalid TTF header ` +
            `(got ${Array.from(headerBytes)
              .map((b) => '0x' + b.toString(16).padStart(2, '0'))
              .join(' ')}). ` +
            `The server may be returning HTML instead of the font file.`
        );
        corruptCount++;
        failed++;
        continue;
      }

      FS.writeFile(`${fontPath}/${fontFile}`, new Uint8Array(fontData));
      if (import.meta.env.DEV)
        console.log(`[Worker] Mounted font: ${fontFile}`);
      mounted++;
    } catch (error) {
      console.warn(`[Worker] Failed to mount font ${fontFile}:`, error.message);
      failed++;
    }
  }

  if (mounted > 0) {
    if (import.meta.env.DEV) {
      console.log(
        `[Worker] Font mounting complete: ${mounted} mounted, ${failed} failed`
      );
    }
  } else {
    console.warn(
      '[Worker] No fonts mounted - text() function may not work correctly'
    );
    self.postMessage({
      type: 'WARNING',
      payload: {
        code: 'NO_FONTS',
        message:
          'No fonts were loaded — the text() function will not render correctly.' +
          (corruptCount > 0
            ? ' Font files appear to be corrupted (HTML served instead of TTF). Check deployment.'
            : ''),
        severity: 'warning',
      },
    });
  }
}

/**
 * Check which OpenSCAD features are available in this WASM build
 * This runs `--help` and parses the output to detect supported flags
 * @returns {Promise<Object>} Capability flags
 */
async function checkCapabilities() {
  const capabilities = {
    hasManifold: false,
    hasFastCSG: false,
    hasLazyUnion: false,
    hasRenderColorsFlag: false,
    hasBinarySTL: false,
    version: 'unknown',
    checkedAt: Date.now(),
  };

  try {
    const module = await ensureOpenSCADModule();
    if (!module || typeof module.callMain !== 'function') {
      console.warn('[Worker] Cannot check capabilities: module not available');
      return capabilities;
    }

    // OpenSCAD writes the --help usage block to stderr. The Emscripten glue
    // binds out/err to the Module print/printErr closures once at creation, so
    // reassigning module.printErr here can never intercept it — instead the
    // worker-scope capabilityProbeActive flag mutes the console mirroring in
    // those closures and the help text is read back from the
    // openscadConsoleOutput delta they still accumulate.
    const consoleOutputBeforeHelp = openscadConsoleOutput.length;

    try {
      capabilityProbeActive = true;
      _callMainInvoked = true;
      await module.callMain(['--help']);
    } catch (_error) {
      // --help might exit with non-zero, that's okay
    } finally {
      capabilityProbeActive = false;
    }

    // Reset the guard after the non-destructive --help probe.
    // The guard exists to detect double *render* invocations that corrupt
    // geometry; --help does not modify geometry state.
    _callMainInvoked = false;

    const helpText = openscadConsoleOutput.slice(consoleOutputBeforeHelp);

    // Parse capabilities from help text
    // Note: Modern OpenSCAD uses --backend=Manifold instead of --enable=manifold
    // Check for --backend option that mentions Manifold
    // The help text format is: "--backend arg   3D rendering backend to use: 'CGAL' ... or 'Manifold'"
    // Use a more flexible pattern that matches various help text formats
    const helpTextLength = helpText.length;
    const hasManifoldBackend = /--backend\s+.*Manifold/i.test(helpText);
    const hasManifoldMention = helpText.toLowerCase().includes('manifold');
    const hasManifoldEnable = /--enable[^\n]*manifold/i.test(helpText);
    const hasFastCSGFlag = /--enable[^\n]*fast-csg/i.test(helpText);
    const hasLazyUnionFlag =
      /--enable\s+arg.*lazy-union/i.test(helpText) ||
      helpText.includes('lazy-union');
    const hasRenderColorsFlag =
      /--enable[^\n]*render-colors/i.test(helpText) ||
      helpText.includes('render-colors');
    const hasBinarySTLFlag =
      helpText.includes('export-format') || helpText.includes('binstl');

    capabilities.hasManifold =
      hasManifoldBackend || hasManifoldMention || hasManifoldEnable;

    // fast-csg was an older experimental flag, now integrated into Manifold backend
    // Check if it's still available as --enable option
    capabilities.hasFastCSG = hasFastCSGFlag;

    // lazy-union is still an --enable flag
    capabilities.hasLazyUnion = hasLazyUnionFlag;

    // Some builds expose render-colors as an experimental flag; newer builds
    // emit COFF without the flag, so only pass it when help advertises it.
    capabilities.hasRenderColorsFlag = hasRenderColorsFlag;

    // Check for export-format option (binary STL support)
    capabilities.hasBinarySTL = hasBinarySTLFlag;

    // When --help text is empty (older WASM builds), assume Manifold support
    // but not binary STL since we can't detect capabilities from flags.
    if (helpTextLength === 0) {
      capabilities.hasManifold = true;
      capabilities.hasBinarySTL = false;
    }

    // Try to extract version
    const versionMatch =
      helpText.match(/OpenSCAD version (\d+\.\d+\.\d+)/i) ||
      helpText.match(/version[:\s]+(\d+\.\d+)/i);
    if (versionMatch) {
      capabilities.version = versionMatch[1];
    }

    if (import.meta.env.DEV)
      console.log('[Worker] Detected capabilities:', capabilities);
    return capabilities;
  } catch (error) {
    console.error('[Worker] Capability check failed:', error);
    return capabilities;
  }
}

// Work directory for multi-file design packages
// All files are mounted here so include/use statements resolve correctly
const WORK_DIR = '/work';

/**
 * Mount files into OpenSCAD virtual filesystem
 * Enable include/use statements to resolve companion files correctly
 *
 * Files are mounted under /work/ directory so that:
 * - Main file runs from /work/mainfile.scad
 * - Include files like openings_and_additions.txt are at /work/openings_and_additions.txt
 * - OpenSCAD's include path resolution finds them correctly
 *
 * @param {Map<string, string>} files - Map of file paths to content
 * @param {Object} options - Mount options
 * @param {boolean} options.useWorkDir - Mount under /work/ (default: true for multi-file projects)
 * @returns {Promise<{workDir: string, files: Map<string, string>}>} Mount result with resolved paths
 */
async function mountFiles(files, options = {}) {
  const module = await ensureOpenSCADModule();
  if (!module || !module.FS) {
    throw new Error('OpenSCAD filesystem not available');
  }

  const FS = module.FS;
  const useWorkDir = options.useWorkDir !== false && files.size > 1;
  const baseDir = useWorkDir ? WORK_DIR : '';

  // Create work directory if needed
  if (useWorkDir) {
    try {
      FS.mkdir(WORK_DIR);
      if (import.meta.env.DEV)
        console.log(`[Worker FS] Created work directory: ${WORK_DIR}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        console.warn(
          `[Worker FS] Work directory creation warning:`,
          error.message
        );
      }
    }
  }

  // Create directory structure
  const directories = new Set();

  for (const filePath of files.keys()) {
    // Security: Reject path traversal attempts
    if (filePath.includes('..') || filePath.startsWith('/')) {
      console.warn(`[Worker FS] Skipping invalid path: ${filePath}`);
      continue;
    }

    // Extract all directory components
    const parts = filePath.split('/');
    let currentPath = baseDir;

    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      if (currentPath) {
        directories.add(currentPath);
      }
    }
  }

  // Create directories
  for (const dir of Array.from(directories).sort()) {
    try {
      FS.mkdir(dir);
      if (import.meta.env.DEV)
        console.log(`[Worker FS] Created directory: ${dir}`);
    } catch (error) {
      // Directory may already exist, ignore
      if (error.code !== 'EEXIST') {
        console.warn(
          `[Worker FS] Failed to create directory ${dir}:`,
          error.message
        );
      }
    }
  }

  // Write files - track the resolved paths
  const resolvedPaths = new Map();

  for (const [filePath, content] of files.entries()) {
    // Security: Skip path traversal attempts
    if (filePath.includes('..') || filePath.startsWith('/')) {
      continue;
    }

    const resolvedPath = baseDir ? `${baseDir}/${filePath}` : filePath;

    try {
      // S-013: data-URL companion files (images) are decoded to binary
      // before mounting — see ./mount-content.js (shared with unit tests).
      const fsContent = resolveMountContent(content, {
        onDecodeError: (decodeErr) =>
          console.warn(
            `[Worker FS] Failed to decode data URL for ${resolvedPath}, mounting as text:`,
            decodeErr.message
          ),
      });
      if (import.meta.env.DEV && fsContent !== content) {
        console.log(
          `[Worker FS] Decoded data URL for: ${resolvedPath} (${fsContent.byteLength} binary bytes)`
        );
      }
      FS.writeFile(resolvedPath, fsContent);
      mountedFiles.set(resolvedPath, fsContent);
      resolvedPaths.set(filePath, resolvedPath);
      const size =
        fsContent instanceof Uint8Array
          ? fsContent.byteLength
          : fsContent.length;
      if (import.meta.env.DEV)
        console.log(
          `[Worker FS] Mounted file: ${resolvedPath} (${size} bytes)`
        );
    } catch (error) {
      console.error(`[Worker FS] Failed to mount file ${resolvedPath}:`, error);
      throw new Error(`Failed to mount file: ${filePath}`);
    }
  }

  if (import.meta.env.DEV) {
    console.log(
      `[Worker FS] Successfully mounted ${files.size} files under ${baseDir || '/'}`
    );
  }

  return {
    workDir: baseDir,
    files: resolvedPaths,
  };
}

// generateMissingFileWarnings lives in ./missing-file-warnings.js (shared
// with unit tests).

/**
 * Clear all mounted files from virtual filesystem
 * Also cleans up the /work/ directory for design packages
 */
function clearMountedFiles() {
  if (!openscadModule || !openscadModule.FS) {
    mountedFiles.clear();
    return;
  }

  const FS = openscadModule.FS;

  // Remove all tracked mounted files
  for (const filePath of mountedFiles.keys()) {
    try {
      FS.unlink(filePath);
    } catch (_error) {
      // File may already be deleted, ignore
    }
  }

  // Recursively remove the work directory and all its contents
  function rmRecursive(path) {
    try {
      const entries = FS.readdir(path);
      for (const entry of entries) {
        if (entry === '.' || entry === '..') continue;
        const fullPath = `${path}/${entry}`;
        try {
          const stat = FS.stat(fullPath);
          if (FS.isDir(stat.mode)) {
            rmRecursive(fullPath);
          } else {
            FS.unlink(fullPath);
          }
        } catch (_e) {
          // Ignore errors for individual entries
        }
      }
      FS.rmdir(path);
    } catch (_e) {
      // Directory may not exist or be already removed
    }
  }

  try {
    const workDirAnalysis = FS.analyzePath(WORK_DIR);
    if (workDirAnalysis.exists) {
      rmRecursive(WORK_DIR);
    }
  } catch (_error) {
    // Work directory may not exist, ignore
  }

  mountedFiles.clear();
  if (import.meta.env.DEV) console.log('[Worker FS] Cleared all mounted files');
}

/**
 * Mount library files from public/libraries/ into virtual filesystem
 * @param {Array<{id: string, path: string}>} libraries - Array of library configurations
 * @returns {Promise<void>}
 */
async function mountLibraries(libraries) {
  const module = await ensureOpenSCADModule();
  if (!module || !module.FS) {
    throw new Error('OpenSCAD filesystem not available');
  }

  const FS = module.FS;
  let totalMounted = 0;
  const baseRoot = '/libraries';

  const ensureDir = (dirPath) => {
    const parts = dirPath.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += `/${part}`;

      // Check if path exists and what type it is
      const analyzed = FS.analyzePath(current);

      // If exists and is a directory, skip
      if (analyzed.exists && analyzed.object?.isFolder) {
        continue;
      }

      // If exists but NOT a directory, we have a problem
      if (analyzed.exists && !analyzed.object?.isFolder) {
        throw new Error(`Path exists as file, not directory: ${current}`);
      }

      try {
        FS.mkdir(current);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
    }
  };

  ensureDir(baseRoot);

  for (const lib of libraries) {
    const libRoot = lib.path.startsWith('/') ? lib.path : `/${lib.path}`;
    if (mountedLibraries.has(lib.id)) {
      const rootExists = !!FS.analyzePath(libRoot).exists;
      if (rootExists) {
        if (import.meta.env.DEV)
          console.log(`[Worker FS] Library ${lib.id} already mounted`);
        continue;
      }
      // Stale mount tracked (root missing) - remount
      mountedLibraries.delete(lib.id);
    }

    try {
      if (import.meta.env.DEV)
        console.log(`[Worker FS] Mounting library: ${lib.id} from ${lib.path}`);

      // Fetch library file list from manifest or directory listing
      // For now, we'll try to mount the library directory recursively
      const manifestUrl = `${assetBaseUrl}${lib.path}/manifest.json`;
      const response = await fetch(manifestUrl).catch(() => {
        return null;
      });

      let manifest = null;
      if (response && response.ok) {
        try {
          manifest = await response.json();
        } catch (error) {
          console.warn(
            `[Worker FS] Invalid manifest for ${lib.id}, skipping:`,
            error.message
          );
        }
      }

      if (manifest && Array.isArray(manifest.files)) {
        const files = manifest.files || [];

        ensureDir(libRoot);

        // Fetch and mount each file
        for (const file of files) {
          try {
            const fileResponse = await fetch(
              `${assetBaseUrl}${lib.path}/${file}`
            );
            if (fileResponse.ok) {
              const content = await fileResponse.text();
              const filePath = `${libRoot}/${file}`;

              // Create subdirectories if needed
              const parts = file.split('/');
              let currentPath = libRoot;
              for (let i = 0; i < parts.length - 1; i++) {
                currentPath += '/' + parts[i];
                try {
                  FS.mkdir(currentPath);
                } catch (error) {
                  if (error.code !== 'EEXIST') throw error;
                }
              }

              FS.writeFile(filePath, content);
              totalMounted++;
            }
          } catch (error) {
            console.warn(
              `[Worker FS] Failed to mount ${file} from ${lib.id}:`,
              error.message
            );
          }
        }

        mountedLibraries.add(lib.id);
        if (import.meta.env.DEV)
          console.log(`[Worker FS] Successfully mounted library: ${lib.id}`);
      } else {
        // No manifest, try to fetch common files
        console.warn(`[Worker FS] No manifest found for ${lib.id}, skipping`);
      }
    } catch (error) {
      console.error(`[Worker FS] Failed to mount library ${lib.id}:`, error);
      self.postMessage({
        type: 'WARNING',
        message: `Failed to mount library: ${lib.id}`,
      });
      continue;
    }
  }

  if (import.meta.env.DEV) {
    console.log(
      `[Worker FS] Successfully mounted ${mountedLibraries.size} libraries (${totalMounted} files)`
    );
  }
}

/**
 * Clear mounted libraries from virtual filesystem
 */
function clearLibraries() {
  if (!openscadModule || !openscadModule.FS) {
    mountedLibraries.clear();
    return;
  }

  // Note: We don't actually delete library files from FS as they may be reused
  // Just clear the tracking set
  mountedLibraries.clear();
  if (import.meta.env.DEV) console.log('[Worker FS] Cleared library tracking');
}

/**
 * Convert parameters to OpenSCAD variable assignments.
 * Uses the shared formatScadValue() to stay in sync with buildDefineArgs().
 * @param {Object} parameters - Parameter key-value pairs
 * @param {Object} paramTypes - Parameter type information for special handling
 * @returns {string} OpenSCAD variable assignments
 */
function parametersToScad(parameters, paramTypes = {}) {
  if (!parameters || Object.keys(parameters).length === 0) {
    return '';
  }

  const assignments = Object.entries(parameters)
    .map(([key, value]) => {
      const formatted = formatScadValue(key, value, paramTypes);
      if (formatted === null) return null;
      return `${key} = ${formatted};`;
    })
    .filter((a) => a !== null);

  return assignments.join('\n') + '\n\n';
}

/**
 * Apply parameter overrides by replacing existing assignments when possible.
 * This avoids the "assigned but overwritten" issue when prepending overrides.
 *
 * @param {string} scadContent
 * @param {Object} parameters
 * @param {Object} paramTypes - Map of parameter names to their schema types
 * @returns {{scad: string, replacedKeys: string[], prependedKeys: string[]}}
 */
function _applyOverrides(scadContent, parameters, paramTypes = {}) {
  if (!parameters || Object.keys(parameters).length === 0) {
    return { scad: scadContent, replacedKeys: [], prependedKeys: [] };
  }

  let updated = scadContent;
  const replacedKeys = [];
  const prependedKeys = [];

  for (const [key, value] of Object.entries(parameters)) {
    const assignmentValue = formatScadValue(
      key,
      value,
      paramTypes,
      scadContent
    );

    // Skip null values
    if (assignmentValue === null) {
      continue;
    }

    const keyRe = escapeRegExp(key);
    const lineRe = new RegExp(
      `^(\\s*)(${keyRe})\\s*=\\s*[^;]*;([ \\t]*\\/\\/.*)?$`,
      'm'
    );

    if (lineRe.test(updated)) {
      updated = updated.replace(lineRe, `$1$2 = ${assignmentValue};$3`);
      replacedKeys.push(key);
    } else {
      prependedKeys.push(key);
    }
  }

  if (prependedKeys.length > 0) {
    const prependParams = {};
    for (const k of prependedKeys) prependParams[k] = parameters[k];
    updated = parametersToScad(prependParams, paramTypes) + updated;
  }

  return { scad: updated, replacedKeys, prependedKeys };
}

/**
 * Render using callMain with -D flags (file-based approach)
 * @param {string} scadContent - OpenSCAD source code
 * @param {Object} parameters - Parameters to pass via -D flags
 * @param {string} format - Output format (stl, obj, off, amf, 3mf)
 * @param {string} mainFilePath - Path for the main SCAD file (defaults to /tmp/input.scad)
 * @returns {Promise<ArrayBuffer>} Rendered data
 */
async function renderWithCallMain(
  scadContent,
  parameters,
  format,
  mainFilePath = null,
  renderOptions = {},
  paramTypes = {}
) {
  let inputFile = mainFilePath || '/tmp/input.scad';
  const outputFile = `/tmp/output.${format}`;
  let wroteTempInput = false;
  // Performance flags: Use Manifold backend for 5-30x faster CSG operations
  // Note: Modern OpenSCAD uses --backend=Manifold instead of --enable=manifold
  // lazy-union is still opt-in via --enable flag
  // Allow toggling between Manifold (fast) and CGAL (stable)
  const capabilities = openscadCapabilities || {};
  const supportsManifold = Boolean(capabilities.hasManifold);
  const supportsLazyUnion = Boolean(capabilities.hasLazyUnion);
  const supportsRenderColorsFlag = Boolean(capabilities.hasRenderColorsFlag);
  const supportsBinarySTL = Boolean(capabilities.hasBinarySTL);
  const enableLazyUnion =
    Boolean(renderOptions?.enableLazyUnion) && supportsLazyUnion;

  // Engine selection: Use Manifold by default, but allow user to disable
  // renderOptions.useManifold: undefined/true = use Manifold, false = use CGAL (stable)
  const useManifold = renderOptions?.useManifold !== false;

  const performanceFlags = [];
  if (supportsManifold && useManifold) {
    performanceFlags.push('--backend=Manifold');
    if (format === 'off' && supportsRenderColorsFlag) {
      // render-colors enables per-face RGBA in OFF export (COFF data) on
      // builds that still advertise the experimental flag.
      performanceFlags.push('--enable=render-colors');
    }
  } else if (supportsManifold && !useManifold) {
    performanceFlags.push('--backend=CGAL');
    if (import.meta.env.DEV)
      console.log('[Worker] Using CGAL (stable) backend instead of Manifold');
  }
  if (enableLazyUnion) {
    performanceFlags.push('--enable=lazy-union');
  }
  const exportFlags = [];
  if (format === 'stl' && supportsBinarySTL) {
    exportFlags.push('--export-format=binstl');
  }
  try {
    const module = await ensureOpenSCADModule();
    if (!module || !module.FS) {
      throw new Error('OpenSCAD filesystem not available');
    }

    // Ensure /tmp directory exists
    try {
      module.FS.mkdir('/tmp');
    } catch (_e) {
      // May already exist
    }

    // Write input file to FS (unless it's already mounted via mainFilePath)
    let shouldWriteInput = !mainFilePath || inputFile.startsWith('/tmp/');
    if (!shouldWriteInput) {
      let inputExists = false;
      try {
        inputExists = module.FS.analyzePath(inputFile).exists;
      } catch (_e) {
        inputExists = false;
      }
      if (!inputExists) {
        inputFile = '/tmp/input.scad';
        shouldWriteInput = true;
      }
    }
    // 2D export flag used later for guard checks and fallback handling.
    const is2DExport = format === 'svg' || format === 'dxf';

    // Path resolution for import()/use/include — shared by BOTH 2D and 3D paths.
    // OpenSCAD WASM doesn't support the -I flag, so we use OPENSCADPATH env var.
    // Desktop OpenSCAD resolves relative imports next to the main SCAD file,
    // then searches OPENSCADPATH. We replicate this by:
    //   1. Writing the main file to the correct directory (done above)
    //   2. Setting OPENSCADPATH to include both the library root and the
    //      working directory (for multi-file zip projects)
    // See: openscad-playground#35 for the upstream path resolution bug.
    if (module.ENV) {
      const searchPaths = ['/libraries'];
      if (inputFile.startsWith(WORK_DIR + '/')) {
        const inputDir = inputFile.substring(0, inputFile.lastIndexOf('/'));
        if (inputDir && !searchPaths.includes(inputDir)) {
          searchPaths.unshift(inputDir);
        }
        if (!searchPaths.includes(WORK_DIR)) {
          searchPaths.push(WORK_DIR);
        }
      }
      module.ENV.OPENSCADPATH = searchPaths.join(':');
    }

    // Symlink workaround: OpenSCAD searches "directory of calling file" first.
    // When main is /tmp/input.scad, it looks for MCAD/boxes.scad as /tmp/MCAD/boxes.scad
    // before OPENSCADPATH. Create symlinks so that search succeeds.
    const symlinkInputDir =
      inputFile.substring(0, inputFile.lastIndexOf('/')) || '/tmp';
    if (symlinkInputDir && mountedLibraries.size > 0) {
      for (const libId of mountedLibraries) {
        const libPath = `/libraries/${libId}`;
        const symlinkPath = `${symlinkInputDir}/${libId}`;
        try {
          try {
            module.FS.unlink(symlinkPath);
          } catch (_e) {
            /* path may not exist */
          }
          module.FS.symlink(libPath, symlinkPath);
          if (import.meta.env.DEV) {
            console.log(
              `[Worker FS] Symlinked ${symlinkPath} -> ${libPath} for include resolution`
            );
          }
        } catch (e) {
          console.warn(
            `[Worker FS] Failed to symlink ${libId} for include resolution:`,
            e.message
          );
        }
      }
    }

    // For 2D exports (SVG/DXF), the SCAD file's own logic — driven by
    // parameters like generate="first layer for SVG/DXF file" — is
    // responsible for producing 2D geometry (via its own projection()
    // calls).  We render directly to the target format; no wrapper needed.
    let effectiveScadContent = scadContent;
    let defineArgs;

    if (renderOptions?.useSourceOverrides) {
      const overrideResult = _applyOverrides(
        scadContent,
        parameters,
        paramTypes
      );
      effectiveScadContent = overrideResult.scad;
      defineArgs = [];
      if (import.meta.env.DEV) {
        console.log(
          '[Worker] Source overrides applied — replaced:',
          overrideResult.replacedKeys,
          'prepended:',
          overrideResult.prependedKeys
        );
      }
    } else {
      defineArgs = buildDefineArgs(parameters, paramTypes, scadContent);
    }

    if (shouldWriteInput) {
      module.FS.writeFile(inputFile, effectiveScadContent);
      wroteTempInput = true;
    }

    // Pre-render guard: scan SCAD source for known-crashy functions
    // roof() and projection() trigger CGAL assertion failures in WASM (openscad-wasm#5, #6)
    // We emit a WARNING but do NOT block — some uses work; the guard is informational.
    const riskyFunctions = [];
    if (/\broof\s*\(/m.test(scadContent)) {
      riskyFunctions.push('roof()');
    }
    if (!is2DExport && /\bprojection\s*\(/m.test(scadContent)) {
      riskyFunctions.push('projection()');
    }
    if (riskyFunctions.length > 0) {
      const warningMsg =
        `WARNING: Your model uses ${riskyFunctions.join(' and ')}, which may crash ` +
        `the browser rendering engine due to a known CGAL/WebAssembly issue. ` +
        `If rendering fails, try removing these functions. ` +
        `Desktop OpenSCAD may handle them better.`;
      console.warn('[Worker]', warningMsg);
      // Emit as a console message so the UI can display it
      self.postMessage({
        type: 'CONSOLE',
        payload: { level: 'warn', message: warningMsg },
      });
    }

    // Build command: [performance flags, -D key=value, ...] -o outputFile inputFile
    const args = [
      ...performanceFlags,
      ...exportFlags,
      ...defineArgs,
      '-o',
      outputFile,
      inputFile,
    ];

    if (import.meta.env.DEV)
      console.log('[Worker] Calling OpenSCAD with args:', args);
    let inputExists = false;
    let _inputSize = null;
    try {
      inputExists = module.FS.analyzePath(inputFile).exists;
      if (inputExists) {
        _inputSize = module.FS.stat(inputFile).size;
      }
    } catch (_e) {
      inputExists = false;
    }

    // Clear accumulated console output for this render
    openscadConsoleOutput = '';

    // S-012: Synthetic missing-file warnings. Scan for include/use directives
    // and inject desktop-format warnings for files not found in the virtual FS.
    const inputDir = inputFile.substring(0, inputFile.lastIndexOf('/'));
    const fsSearchPaths = [inputDir, WORK_DIR, '/libraries'].filter(Boolean);
    const missingFileWarnings = generateMissingFileWarnings(
      scadContent,
      (refFile) => {
        for (const dir of fsSearchPaths) {
          try {
            if (module.FS.analyzePath(`${dir}/${refFile}`).exists) return true;
          } catch (_e) {
            /* path may be invalid */
          }
        }
        for (const key of mountedFiles.keys()) {
          if (key === refFile || key.endsWith('/' + refFile)) return true;
        }
        return false;
      }
    );
    if (missingFileWarnings.length > 0) {
      openscadConsoleOutput = missingFileWarnings.join('\n') + '\n';
    }

    if (_callMainInvoked) {
      console.warn(
        '[Worker] DEFENSE-IN-DEPTH: callMain already invoked in this module lifetime. ' +
          'Geometry may be corrupted. The render controller should have restarted the worker.'
      );
      // BUG-A fix: abort the render rather than proceeding with corrupted WASM state.
      // The needsRestart flag ensures the render controller restarts before retrying.
      const doubleInvokeError = new Error(
        'WASM_DOUBLE_INVOKE: The rendering engine was not restarted between renders. ' +
          'This render has been cancelled to prevent corrupted geometry. ' +
          'The engine will restart automatically before the next render.'
      );
      doubleInvokeError.code = 'WASM_DOUBLE_INVOKE';
      doubleInvokeError.needsRestart = true;
      throw doubleInvokeError;
    }

    // Execute OpenSCAD with fail-open retry logic
    try {
      _callMainInvoked = true;
      const exitCode = await module.callMain(args);

      // Check exit code - non-zero means compilation failed.
      if (exitCode !== 0) {
        const modelIsNot2D =
          openscadConsoleOutput.includes(
            'Current top level object is not a 2D object'
          ) || openscadConsoleOutput.includes('not a 2D object');

        // For 2D exports where the model produces 3D geometry: signal the
        // caller to perform the two-pass fallback (STL → projection) at the
        // controller level, using fresh workers between passes.  Attempting
        // the fallback inside the same worker crashes because callMain
        // corrupts WASM state after a non-zero exit.
        if (is2DExport && modelIsNot2D) {
          const err = new Error(
            'MODEL_NOT_2D: Your model produces 3D geometry. ' +
              'The render controller will retry with a two-pass projection fallback.'
          );
          err.code = 'MODEL_NOT_2D';
          err.needsRestart = true;
          throw err;
        }

        {
          const err = new Error(
            `OpenSCAD compilation failed with exit code ${exitCode}. ` +
              `Output: ${openscadConsoleOutput.substring(0, 500)}`
          );
          err.needsRestart = true;
          throw err;
        }
      }

      // Check for empty geometry
      if (
        openscadConsoleOutput.includes('Current top level object is empty') ||
        openscadConsoleOutput.includes('top-level object is empty')
      ) {
        throw new Error(
          `Current top level object is empty. Output: ${openscadConsoleOutput.substring(0, 500)}`
        );
      }

      // Check for 2D object exported to a 3D format (STL/OBJ/etc.)
      if (
        !is2DExport &&
        (openscadConsoleOutput.includes(
          'Current top level object is not a 3D object'
        ) ||
          openscadConsoleOutput.includes('Top level object is a 2D object'))
      ) {
        throw new Error(
          `MODEL_IS_2D: Your model produces 2D geometry which cannot be displayed in the 3D viewer. ` +
            `To export: select SVG or DXF output format. ` +
            `To preview in 3D: adjust your model parameters to produce 3D geometry.`
        );
      }

      // Check for "not supported" ECHO messages
      const notSupportedMatch = openscadConsoleOutput.match(
        /ECHO:.*is not supported/i
      );
      if (notSupportedMatch) {
        throw new Error(
          `Configuration is not supported. Output: ${openscadConsoleOutput.substring(0, 500)}`
        );
      }
    } catch (error) {
      // After callMain throws (especially a numeric abort), the WASM module's
      // internal state is corrupted. Retrying on the same module is futile —
      // let the error propagate so the render controller can restart the worker.
      const isThrownNumeric =
        typeof error === 'number' || /^\d+$/.test(String(error));

      if (isThrownNumeric) {
        console.warn(
          `[Worker] callMain threw numeric abort (${error}), module likely corrupted — skipping same-module retry`
        );
        throw error;
      }

      // For non-numeric errors (compilation failures with useful output),
      // re-throw as-is for the render controller to handle.
      throw error;
    }

    // Read output file
    const outputData = module.FS.readFile(outputFile);

    // Clean up temporary files
    try {
      if (wroteTempInput) {
        module.FS.unlink(inputFile);
      }
    } catch (_e) {
      // Ignore cleanup errors
    }
    try {
      module.FS.unlink(outputFile);
    } catch (_e) {
      // Ignore cleanup errors
    }
    return {
      data: outputData,
      diagnostics: {
        defineArgs,
        performanceFlags,
        exportFlags,
        inputFile,
        useSourceOverrides: Boolean(renderOptions?.useSourceOverrides),
      },
    };
  } catch (error) {
    console.error(`[Worker] Render via callMain to ${format} failed:`, error);
    throw error;
  }
}

/**
 * Validate 2D output format (SVG/DXF) for completeness
 * Returns an object with valid flag and error message if invalid
 * @param {ArrayBuffer} outputBuffer - The output data
 * @param {string} format - Output format ('svg' or 'dxf')
 * @returns {{valid: boolean, error?: string}}
 */
function validate2DOutput(outputBuffer, format) {
  // Convert buffer to string for text-based validation
  const decoder = new TextDecoder('utf-8');
  const content = decoder.decode(outputBuffer);

  if (format === 'svg') {
    return validateSVGOutput(content);
  } else if (format === 'dxf') {
    return validateDXFOutput(content);
  }

  // Unknown format - pass through
  return { valid: true };
}

// validateSVGOutput lives in ./svg-validation.js (shared with unit tests).

/**
 * Validate DXF output
 * @param {string} content - DXF content as string
 * @returns {{valid: boolean, error?: string}}
 */
function validateDXFOutput(content) {
  // Check minimum length
  if (!content || content.length < 50) {
    return {
      valid: false,
      error:
        'DXF output is empty or too small. Your model may not produce 2D geometry. ' +
        'Ensure your model uses projection() or 2D primitives, and that your parameter settings produce visible geometry.',
    };
  }

  // DXF files may start with comment lines (group code 999) before the structure.
  // OpenSCAD prepends "999\nDXF from OpenSCAD\n" before the standard "0\nSECTION" header.
  // Normalize line endings for cross-platform compatibility.
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedContent.split('\n').map((l) => l.trim());

  // Skip leading DXF comment pairs (group code 999 + comment text)
  let startIdx = 0;
  while (startIdx < lines.length - 1 && lines[startIdx] === '999') {
    startIdx += 2; // Skip group code 999 and its comment text value
  }

  // Check for DXF structure after any comment lines
  if (
    startIdx >= lines.length ||
    lines[startIdx] !== '0' ||
    !lines.includes('SECTION')
  ) {
    return {
      valid: false,
      error:
        'Invalid DXF output - missing DXF header structure. ' +
        'The OpenSCAD render may have failed silently.',
    };
  }

  // Check for ENTITIES section with actual content
  const entitiesIndex = lines.indexOf('ENTITIES');
  if (entitiesIndex === -1) {
    return {
      valid: false,
      error:
        'DXF contains no ENTITIES section (no geometry). ' +
        'Your model may not be configured for 2D output.',
    };
  }

  // Check for at least one entity after ENTITIES
  // Look for LINE, POLYLINE, LWPOLYLINE, CIRCLE, ARC, etc.
  const entityTypes = [
    'LINE',
    'POLYLINE',
    'LWPOLYLINE',
    'CIRCLE',
    'ARC',
    'SPLINE',
    'POINT',
  ];
  let hasEntity = false;

  for (let i = entitiesIndex; i < lines.length; i++) {
    if (entityTypes.includes(lines[i])) {
      hasEntity = true;
      break;
    }
    // Stop at ENDSEC
    if (lines[i] === 'ENDSEC') break;
  }

  if (!hasEntity) {
    return {
      valid: false,
      error:
        'DXF ENTITIES section is empty (no geometry). ' +
        'Your 3D model may not include any 2D projection. ' +
        'Ensure your model uses projection() or is configured for 2D output.',
    };
  }

  return { valid: true };
}

// postProcessDXF lives in ./dxf-postprocess.js (shared with unit tests).

/**
 * Memory warning threshold - use absolute size instead of percentage
 * since we can only measure allocated heap size, not actual usage.
 * 1GB is a reasonable threshold for complex models.
 */
const MEMORY_WARNING_THRESHOLD_MB = 1024; // 1GB

// Track heap size before each render to compute growth delta
let heapBeforeRenderMB = 0;

/**
 * Check memory usage and send warning if high.
 * Also records the pre-render heap size so we can report growth after render.
 * @param {string} requestId - Current request ID
 * @returns {Object} Memory usage info
 */
function checkMemoryBeforeRender(requestId) {
  if (!openscadModule || !openscadModule.HEAP8) {
    return { usedMB: 0, warning: false };
  }
  // Get WASM heap info - note HEAP8.length is allocated buffer size, not usage.
  // HEAP8.length == buffer.byteLength, so a percent-of-limit number would be
  // meaningless. We warn based on absolute heap size only.
  const heapAllocatedBytes = openscadModule.HEAP8.length;
  const usedMB = Math.round(heapAllocatedBytes / 1024 / 1024);

  // Record baseline for growth calculation
  heapBeforeRenderMB = usedMB;

  if (usedMB >= MEMORY_WARNING_THRESHOLD_MB) {
    self.postMessage({
      type: 'WARNING',
      payload: {
        requestId,
        code: 'HIGH_MEMORY',
        message: `Memory allocation is high (${usedMB} MB). Complex models may fail. Consider refreshing the page to free memory.`,
        severity: 'warning',
        memoryUsage: {
          used: heapAllocatedBytes,
          usedMB,
        },
      },
    });
    return { usedMB, warning: true };
  }

  return { usedMB, warning: false };
}

/**
 * Render OpenSCAD to specified format
 */
async function render(payload) {
  const {
    requestId,
    scadContent,
    parameters,
    paramTypes = {},
    timeoutMs,
    files,
    outputFormat = 'stl',
    libraries,
    mainFile,
    renderOptions = {},
  } = payload;

  try {
    // Check memory usage before starting render
    const memCheck = checkMemoryBeforeRender(requestId);
    if (memCheck.warning) {
      console.warn(`[Worker] High memory usage: ${memCheck.usedMB}MB`);
    }

    self.postMessage({
      type: 'PROGRESS',
      payload: { requestId, percent: 10, message: 'Preparing model...' },
    });

    // Mount libraries if provided
    if (libraries && libraries.length > 0) {
      self.postMessage({
        type: 'PROGRESS',
        payload: {
          requestId,
          percent: 12,
          message: `Mounting ${libraries.length} libraries...`,
        },
      });

      try {
        await mountLibraries(libraries);

        self.postMessage({
          type: 'PROGRESS',
          payload: {
            requestId,
            percent: 15,
            message: 'Libraries mounted successfully',
          },
        });
      } catch (error) {
        console.warn('[Worker] Library mounting failed:', error);
        // Continue rendering - libraries might not be strictly required
      }
    }

    // Mount additional files if provided (for multi-file projects)
    // Mount additional files for multi-file project include/use resolution
    let mountResult = null;
    const hasNoFiles = !files || Object.keys(files).length === 0;
    if (hasNoFiles && /\binclude\s*</m.test(scadContent)) {
      console.warn(
        '[Worker] SCAD uses include<> but no companion files were provided. ' +
          'Included files will not be found in the virtual filesystem.'
      );
    }

    // Always clear previously mounted files before each render to prevent stale
    // file residue across preset switches, even when no new files are provided.
    // BUG-A fix: conditional cleanup only ran when files were provided, leaving
    // old companion file aliases mounted across preset changes.
    const _fsClearStart = Date.now();
    clearMountedFiles();
    const _fsClearMs = Date.now() - _fsClearStart;
    if (_fsClearMs > 50) {
      console.warn(
        `[Worker FS] clearMountedFiles took ${_fsClearMs}ms — unusually slow`
      );
    }

    if (files && Object.keys(files).length > 0) {
      // Convert files object to Map
      const filesMap = new Map(Object.entries(files));

      self.postMessage({
        type: 'PROGRESS',
        payload: {
          requestId,
          percent: 17,
          message: `Mounting ${filesMap.size} files...`,
        },
      });

      // Mount files under /work/ directory for proper include resolution
      mountResult = await mountFiles(filesMap, { useWorkDir: true });

      self.postMessage({
        type: 'PROGRESS',
        payload: {
          requestId,
          percent: 20,
          message: 'Files mounted successfully',
        },
      });

      if (import.meta.env.DEV)
        console.log('[Worker] Files mounted under:', mountResult.workDir);
    }

    // Mount uploaded [file] parameter bytes into the worker FS so that
    // import() / include statements in the SCAD code can resolve them.
    // Desktop OpenSCAD resolves relative to the source file directory.
    const fileParamMountDir =
      mountResult && mountResult.workDir ? mountResult.workDir : '/tmp';
    const fileParamResult = resolveFileParams(parameters, fileParamMountDir);
    let renderParameters = parameters;

    if (fileParamResult.mountOperations.length > 0) {
      const module = await ensureOpenSCADModule();
      if (module && module.FS) {
        try {
          module.FS.mkdir(fileParamMountDir);
        } catch (_e) {
          /* may exist */
        }

        for (const op of fileParamResult.mountOperations) {
          try {
            module.FS.writeFile(op.mountPath, op.data);
            mountedFiles.set(op.mountPath, op.data);
            if (import.meta.env.DEV) {
              console.log(
                `[Worker FS] Mounted file param "${op.paramName}": ${op.mountPath} (${op.data.byteLength} bytes)`
              );
            }
          } catch (err) {
            console.warn(
              `[Worker FS] Failed to mount file param "${op.paramName}":`,
              err.message
            );
          }
        }
      }
      renderParameters = fileParamResult.resolvedParams;
    }

    if (import.meta.env.DEV)
      console.log('[Worker] Rendering with parameters:', renderParameters);

    self.postMessage({
      type: 'PROGRESS',
      payload: { requestId, percent: 30, message: 'Compiling OpenSCAD...' },
    });

    // Set up timeout
    const timeoutPromise = new Promise((_, reject) => {
      currentRenderTimeout = setTimeout(() => {
        reject(new Error('Render timeout exceeded'));
      }, timeoutMs || 60000);
    });

    // Determine the format to render
    const format = (outputFormat || 'stl').toLowerCase();
    const formatName = format.toUpperCase();

    // 2D parameter resolution is handled by the caller (main.js) via
    // resolve2DExportParameters(), which uses the parsed schema to set
    // model-specific parameters (e.g. generate, type_of_keyguard) to their
    // 2D-compatible values before this render call.
    // Track render timing
    let renderStartTime = 0;
    let renderDurationMs = 0;

    // Render to specified format
    const renderPromise = (async () => {
      // Note: render methods are blocking calls - we can't get intermediate progress
      // Use indeterminate progress messaging
      self.postMessage({
        type: 'PROGRESS',
        payload: {
          requestId,
          percent: -1,
          message: `Rendering model to ${formatName} (this may take a while)...`,
        },
      });

      // Start timing the actual render operation
      renderStartTime = performance.now();

      // Always use callMain approach - official WASM uses callMain for all operations
      if (import.meta.env.DEV)
        console.log('[Worker] Using callMain with official OpenSCAD WASM');

      // Determine main file path
      // For multi-file projects, use the work directory path
      // For multi-file projects, include/use statements must resolve correctly
      let mainFileToUse;

      if (mainFile && mountResult && mountResult.workDir) {
        // Multi-file project: use the work directory path
        mainFileToUse = `${mountResult.workDir}/${mainFile}`;
        if (import.meta.env.DEV)
          console.log(`[Worker] Multi-file project: using ${mainFileToUse}`);
      } else if (mainFile && mountResult && mountResult.files.has(mainFile)) {
        // File was mounted but without work directory
        mainFileToUse = mountResult.files.get(mainFile);
      } else {
        // Single file or no mounted files: use /tmp
        mainFileToUse = '/tmp/input.scad';

        // Write to temporary location
        const module = await ensureOpenSCADModule();
        if (!module || !module.FS) {
          throw new Error('OpenSCAD filesystem not available');
        }
        try {
          module.FS.mkdir('/tmp');
        } catch (_e) {
          // May already exist
        }
      }

      const callMainResult = await renderWithCallMain(
        scadContent,
        renderParameters,
        format,
        mainFileToUse,
        renderOptions,
        paramTypes
      );
      const outputData = callMainResult.data;
      const renderDiagnostics = callMainResult.diagnostics;

      // Capture render duration
      renderDurationMs = Math.round(performance.now() - renderStartTime);

      self.postMessage({
        type: 'PROGRESS',
        payload: {
          requestId,
          percent: 95,
          message: `Processing ${formatName} output...`,
        },
      });

      return { data: outputData, format, renderDurationMs, renderDiagnostics };
    })();

    // Race between render and timeout
    const result = await Promise.race([renderPromise, timeoutPromise]);
    const {
      data: outputData,
      format: resultFormat,
      renderDurationMs: workerRenderMs,
      renderDiagnostics: workerDiagnostics,
    } = result;

    // Clear timeout
    if (currentRenderTimeout) {
      clearTimeout(currentRenderTimeout);
      currentRenderTimeout = null;
    }

    // Convert output data to ArrayBuffer
    let outputBuffer;
    let triangleCount = 0;
    let isTextFormat = false;

    if (outputData instanceof ArrayBuffer) {
      outputBuffer = outputData;
    } else if (typeof outputData === 'string') {
      // Text format (ASCII STL, OBJ, OFF, etc.)
      isTextFormat = true;
      const encoder = new TextEncoder();
      outputBuffer = encoder.encode(outputData).buffer;

      // Count triangles for mesh formats
      if (resultFormat === 'stl') {
        triangleCount = (outputData.match(/facet normal/g) || []).length;
      } else if (resultFormat === 'obj') {
        triangleCount = (outputData.match(/^f /gm) || []).length;
      } else if (resultFormat === 'off') {
        triangleCount = parseOffTriangleCount(outputData);
      }
    } else if (outputData instanceof Uint8Array) {
      // CRITICAL FIX: Uint8Array's .buffer property returns the underlying ArrayBuffer
      // which might be the WASM heap or a larger pre-allocated buffer.
      // We must slice to get only the actual file content.
      outputBuffer = outputData.buffer.slice(
        outputData.byteOffset,
        outputData.byteOffset + outputData.byteLength
      );
    } else {
      throw new Error(`Unknown ${resultFormat.toUpperCase()} data format`);
    }

    // OFF delivered as a buffer (the render-colors default path) skipped the
    // string-branch counting above and left the status bar at "0 triangles" —
    // the header parse works on raw bytes, so recover the count here.
    if (resultFormat === 'off' && triangleCount === 0 && outputBuffer) {
      triangleCount = parseOffTriangleCount(outputBuffer);
    }

    // Validate 2D format outputs (SVG/DXF) - they may be "valid" but empty
    if (resultFormat === 'svg' || resultFormat === 'dxf') {
      try {
        const validationResult = validate2DOutput(outputBuffer, resultFormat);
        if (!validationResult.valid) {
          throw new Error(validationResult.error);
        }
      } catch (validationError) {
        if (
          validationError.message?.startsWith('SVG ') ||
          validationError.message?.startsWith('DXF ') ||
          validationError.message?.startsWith('Invalid ')
        ) {
          throw validationError;
        }
        console.warn(
          `[Worker] 2D validation threw unexpectedly: ${validationError.message}`
        );
        throw validationError;
      }
    }

    // Post-process DXF to fix known OpenSCAD WASM compatibility issues
    // (upstream issue: github.com/openscad/openscad/issues/4268)
    let dxfPostProcessed = false;
    let dxfPostProcessError = null;
    if (resultFormat === 'dxf') {
      try {
        outputBuffer = postProcessDXF(outputBuffer);
        dxfPostProcessed = true;
      } catch (dxfError) {
        dxfPostProcessError = dxfError.message;
        console.warn(
          '[Worker] DXF post-processing failed, using raw output:',
          dxfError.message
        );
      }
    }

    // For binary STL, read triangle count from header
    // Binary STL format: 80 bytes header + 4 bytes triangle count + (50 bytes per triangle)
    if (
      resultFormat === 'stl' &&
      !isTextFormat &&
      outputBuffer.byteLength > 84
    ) {
      const view = new DataView(outputBuffer);
      const headerTriangleCount = view.getUint32(80, true);

      // Sanity check: verify triangle count matches file size
      // Each triangle = 50 bytes (12 bytes normal + 36 bytes vertices + 2 bytes attribute)
      const expectedFileSize = 84 + headerTriangleCount * 50;
      const actualFileSize = outputBuffer.byteLength;

      if (Math.abs(expectedFileSize - actualFileSize) <= 50) {
        // Triangle count is consistent with file size
        triangleCount = headerTriangleCount;
      } else {
        // Triangle count from header seems incorrect, calculate from file size
        console.warn(
          `[Worker] STL header triangle count (${headerTriangleCount}) inconsistent with file size (${actualFileSize}). Calculating from size.`
        );
        triangleCount = Math.floor((actualFileSize - 84) / 50);
      }
    }

    self.postMessage(
      {
        type: 'COMPLETE',
        payload: {
          requestId,
          data: outputBuffer,
          format: resultFormat,
          stats: {
            triangles: triangleCount,
            size: outputBuffer.byteLength,
          },
          timing: {
            renderMs: workerRenderMs,
            wasmInitMs: wasmInitDurationMs,
          },
          consoleOutput: openscadConsoleOutput || '',
          diagnostics: workerDiagnostics || undefined,
          postProcessing:
            resultFormat === 'dxf'
              ? { dxfNormalized: dxfPostProcessed, error: dxfPostProcessError }
              : undefined,
        },
      },
      [outputBuffer]
    ); // Transfer ownership of ArrayBuffer
    if (import.meta.env.DEV) {
      console.log(
        `[Worker] Render complete: ${triangleCount} triangles in ${workerRenderMs}ms`
      );
    }
  } catch (error) {
    // Clear timeout on error
    if (currentRenderTimeout) {
      clearTimeout(currentRenderTimeout);
      currentRenderTimeout = null;
    }

    console.error('[Worker] Render failed:', error);

    // Translate error to user-friendly message
    // Pass the entire error object to translateError which now handles all types
    const translated = translateWorkerError(error);

    // Include captured OpenSCAD console output in details so the UI can provide
    // actionable guidance (e.g., which toggle/parameter to change).
    const consoleDetails = openscadConsoleOutput
      ? `\n\n[OpenSCAD output]\n${openscadConsoleOutput.substring(0, 1200)}`
      : '';
    const details = (error?.stack || translated.raw || '') + consoleDetails;

    // If the translated code is generic but the console output indicates empty geometry,
    // override to EMPTY_GEOMETRY so the UI can show dependency guidance.
    let code = translated.code;
    let message = translated.message;
    if (
      code === 'INTERNAL_ERROR' &&
      openscadConsoleOutput &&
      (openscadConsoleOutput.includes('Current top level object is empty') ||
        openscadConsoleOutput.includes('top-level object is empty'))
    ) {
      code = 'EMPTY_GEOMETRY';
      message =
        'This configuration produces no geometry. Check that required options are enabled/disabled for this selection.';
    }

    // If error indicates 2D model trying to export to a 3D format
    const is2DOutput =
      (outputFormat || 'stl').toLowerCase() === 'svg' ||
      (outputFormat || 'stl').toLowerCase() === 'dxf';
    const confirmed2DModel =
      !is2DOutput &&
      (code === 'INTERNAL_ERROR' ||
        code === 'RENDER_FAILED' ||
        translated.raw?.includes('MODEL_IS_2D')) &&
      openscadConsoleOutput &&
      (openscadConsoleOutput.includes(
        'Current top level object is not a 3D object'
      ) ||
        openscadConsoleOutput.includes('Top level object is a 2D object'));

    if (confirmed2DModel) {
      code = 'MODEL_IS_2D';
      message =
        'Your model produces 2D geometry which cannot be previewed in the 3D viewer. ' +
        'To export: select SVG or DXF output format. ' +
        'To preview in 3D: adjust your model parameters to produce 3D geometry.';
    }

    // Reverse case: 3D model exported to a 2D format (SVG/DXF)
    const confirmedNot2D =
      is2DOutput &&
      (translated.raw?.includes('MODEL_NOT_2D') ||
        openscadConsoleOutput?.includes(
          'Current top level object is not a 2D object'
        ) ||
        openscadConsoleOutput?.includes('not a 2D object'));

    if (confirmedNot2D) {
      code = 'MODEL_NOT_2D';
      message =
        'Your model produces 3D geometry but SVG/DXF export requires 2D output. ' +
        MODEL_NOT_2D_SUGGESTION;
    }

    // Signal that the WASM module needs a restart before the next render.
    // callMain with non-zero exit or a numeric abort corrupts module state.
    // MODEL_NOT_2D is included: callMain ran (setting _callMainInvoked=true) even
    // though OpenSCAD exited with code 1. Without a restart the next render hits
    // WASM_DOUBLE_INVOKE because the worker-side guard sees _callMainInvoked=true.
    const needsRestart =
      error?.needsRestart === true ||
      typeof error === 'number' ||
      /^\d+$/.test(String(error)) ||
      code === 'INTERNAL_ERROR' ||
      code === 'MODEL_NOT_2D' ||
      code === 'WASM_ABORT' ||
      code === 'WASM_UNREACHABLE' ||
      code === 'WASM_OOB';

    self.postMessage({
      type: 'ERROR',
      payload: {
        requestId,
        code,
        message,
        details,
        consoleOutput: openscadConsoleOutput || '',
        needsRestart,
      },
    });
  }
}

/**
 * Cancel current render
 */
function cancelRender(requestId) {
  if (currentRenderTimeout) {
    clearTimeout(currentRenderTimeout);
    currentRenderTimeout = null;

    self.postMessage({
      type: 'ERROR',
      payload: {
        requestId,
        code: 'CANCELLED',
        message: 'Render cancelled by user',
      },
    });
  }
}

/**
 * Get current memory usage of the WASM heap.
 * Includes growth delta since last render start for leak detection.
 * @returns {Object} Memory usage info
 */
function getMemoryUsage() {
  if (!openscadModule || !openscadModule.HEAP8) {
    return {
      used: 0,
      usedMB: 0,
      available: true,
      growthMB: 0,
    };
  }

  // IMPORTANT: heapTotalBytes is the ALLOCATED heap-buffer size, not actual
  // used bytes. WASM linear memory grows in 64KB pages; once grown it never
  // shrinks. There is no `limit` value available from the WASM runtime, so
  // we deliberately do NOT publish a percent/limit (BR-4: drop the
  // fictional memory percentage). Consumers should use the absolute
  // `usedMB` and the worker's own HIGH_MEMORY warning instead.
  const heapTotalBytes = openscadModule.HEAP8.length;
  const heapTotalMB = Math.round(heapTotalBytes / 1024 / 1024);

  // Growth since last render start (helps detect memory leaks between renders)
  const growthMB =
    heapBeforeRenderMB > 0 ? heapTotalMB - heapBeforeRenderMB : 0;

  return {
    used: heapTotalBytes,
    usedMB: heapTotalMB,
    available: true,
    growthMB,
  };
}

// Message handler
self.onmessage = async (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      await initWASM(
        payload?.assetBaseUrl,
        payload?.cachedCapabilities || null
      );
      break;

    case 'PING':
      // Heartbeat response — proves the worker event loop is responsive
      self.postMessage({
        type: 'PONG',
        payload: {
          id: payload?.id,
          timestamp: Date.now(),
          initialized,
          rendering: !!currentRenderTimeout,
        },
      });
      break;

    case 'GET_MEMORY_USAGE':
      self.postMessage({
        type: 'MEMORY_USAGE',
        payload: getMemoryUsage(),
      });
      break;

    case 'RENDER':
      if (!initialized) {
        self.postMessage({
          type: 'ERROR',
          payload: {
            requestId: payload.requestId,
            code: 'RENDER_FAILED',
            message:
              'Worker not initialized. Please wait for initialization to complete.',
          },
        });
        return;
      }
      await render(payload);
      break;

    case 'CANCEL':
      cancelRender(payload.requestId);
      break;

    case 'MOUNT_FILES':
      try {
        await mountFiles(payload.files);
        self.postMessage({
          type: 'FILES_MOUNTED',
          payload: { success: true, count: payload.files.size },
        });
      } catch (error) {
        self.postMessage({
          type: 'ERROR',
          payload: {
            requestId: 'mount',
            code: 'MOUNT_FAILED',
            message: 'Failed to mount files: ' + error.message,
          },
        });
      }
      break;

    case 'CLEAR_FILES':
      clearMountedFiles();
      self.postMessage({
        type: 'FILES_CLEARED',
        payload: { success: true },
      });
      break;

    case 'MOUNT_LIBRARIES':
      try {
        await mountLibraries(payload.libraries);
        self.postMessage({
          type: 'LIBRARIES_MOUNTED',
          payload: { success: true, count: payload.libraries.length },
        });
      } catch (error) {
        self.postMessage({
          type: 'ERROR',
          payload: {
            requestId: 'mount-libraries',
            code: 'LIBRARY_MOUNT_FAILED',
            message: 'Failed to mount libraries: ' + error.message,
          },
        });
      }
      break;

    case 'CLEAR_LIBRARIES':
      clearLibraries();
      self.postMessage({
        type: 'LIBRARIES_CLEARED',
        payload: { success: true },
      });
      break;

    default:
      console.warn('[Worker] Unknown message type:', type);
  }
};
