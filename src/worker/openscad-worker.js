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
 * - Source: Official OpenSCAD Playground build (https://files.openscad.org/playground/)
 * - Location: /wasm/openscad-official/openscad.js
 * - Features: Manifold geometry engine, fast-csg, lazy-union support
 *
 * ### Future Enhancements:
 * - Threaded WASM for multi-core parallelism (requires SharedArrayBuffer)
 */

import { hexToRgb } from '../js/color-utils.js';

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

/**
 * Escape a string for use in a RegExp
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Error message translations for common OpenSCAD errors
 * Maps error patterns to user-friendly messages
 */
const ERROR_TRANSLATIONS = [
  {
    pattern: /Parser error/i,
    message:
      'Syntax error in your OpenSCAD file. Check for missing semicolons, brackets, or parentheses.',
    code: 'SYNTAX_ERROR',
  },
  {
    pattern: /Rendering cancelled|timeout/i,
    message:
      'Render was stopped because it was taking too long. Try reducing complexity (lower $fn value) or simplifying your design.',
    code: 'TIMEOUT',
  },
  {
    pattern: /out of memory|memory allocation failed|OOM/i,
    message:
      'This model is too complex for browser rendering. Try lowering $fn, reducing boolean operations, or simplifying the design.',
    code: 'OUT_OF_MEMORY',
  },
  {
    pattern: /Unknown module/i,
    message:
      'Your model uses a module that could not be found. Check include/use statements and ensure library files are loaded.',
    code: 'UNKNOWN_MODULE',
  },
  {
    pattern: /Unknown function/i,
    message:
      'Your model uses a function that could not be found. Check for typos or missing library includes.',
    code: 'UNKNOWN_FUNCTION',
  },
  {
    pattern: /Undefined variable/i,
    message:
      'A variable in your model is not defined. Check for typos in variable names.',
    code: 'UNDEFINED_VARIABLE',
  },
  {
    pattern: /WARNING: Object may not be a valid 2-manifold/i,
    message:
      'The model has geometry issues (non-manifold). It may still render but could cause problems for 3D printing.',
    code: 'NON_MANIFOLD_WARNING',
  },
  {
    pattern: /No top[ -]?level geometry/i,
    message:
      'Your model does not produce any geometry. Make sure you have at least one shape (cube, sphere, etc.) in your code.',
    code: 'NO_GEOMETRY',
  },
  {
    // IMPORTANT: Detect empty geometry from OpenSCAD console output
    pattern: /Current top[ -]?level object is empty/i,
    message:
      'This configuration produces no geometry. Check that the selected options are compatible — some parameter combinations may result in empty output.',
    code: 'EMPTY_GEOMETRY',
  },
  {
    pattern: /MODEL_NOT_2D|Current top level object is not a 2D object/i,
    message:
      'Your model produces 3D geometry but SVG/DXF export requires 2D output. ' +
      'Enable "use Laser Cutting best practices" or ensure your model uses projection() to produce 2D geometry.',
    code: 'MODEL_NOT_2D',
  },
  {
    // Detect "not supported" ECHO messages from OpenSCAD models
    pattern: /is not supported for/i,
    message:
      'This combination of options is not supported. Please check the "generate" setting and related options.',
    code: 'UNSUPPORTED_CONFIG',
  },
  {
    pattern: /Cannot open file/i,
    message:
      'A file referenced in your model could not be found. Check include/use paths and file names.',
    code: 'FILE_NOT_FOUND',
  },
  {
    pattern: /Recursion detected|Stack overflow/i,
    message:
      'Your model has infinite recursion. Check recursive module or function calls.',
    code: 'RECURSION',
  },
  // CGAL assertion failures — root cause of projection()/roof() crashes in WASM
  // See: openscad-wasm#6, openscad#6582, CGAL#7560
  {
    pattern: /CGAL assertion|CGAL_assertion|CGAL ERROR|CGAL precondition/i,
    message:
      'This model uses a geometry feature (projection/roof) that has a known issue in the browser engine. ' +
      'Try simplifying the design or removing projection()/roof() calls. ' +
      'This is a known upstream limitation (CGAL + WebAssembly).',
    code: 'CGAL_ASSERTION',
  },
  // Emscripten abort — typically triggered by unrecoverable CGAL/C++ errors
  {
    pattern: /Aborted\(|abort\(|Emscripten.*abort/i,
    message:
      'The rendering engine encountered a fatal error and stopped. ' +
      'This often happens with projection() or roof() functions. ' +
      'Try removing these functions or simplifying your design.',
    code: 'WASM_ABORT',
  },
  // WASM RuntimeError: unreachable — compiled trap instruction hit
  {
    pattern: /RuntimeError:\s*unreachable/i,
    message:
      'The rendering engine hit an internal error (unreachable code). ' +
      'This is typically caused by projection() or roof() in the browser engine. ' +
      'Try simplifying the model or removing these functions.',
    code: 'WASM_UNREACHABLE',
  },
  // WASM RuntimeError: memory access out of bounds
  {
    pattern: /RuntimeError:\s*memory access out of bounds/i,
    message:
      'The rendering engine ran out of accessible memory. ' +
      'Try reducing model complexity (lower $fn), removing minkowski() operations, or simplifying boolean operations.',
    code: 'WASM_OOB',
  },
  {
    pattern: /\b\d{6,}\b/, // Match long numeric error codes (like 1101176)
    message:
      'An internal rendering error occurred. Try reloading the page and rendering again.',
    code: 'INTERNAL_ERROR',
  },
];

/**
 * Translate raw OpenSCAD error to user-friendly message
 * @param {string|Error|Object} rawError - Raw error from OpenSCAD (can be string, Error, or object)
 * @returns {{message: string, code: string, raw: string}} Translated error info
 */
function translateError(rawError) {
  // Handle various error types to avoid "[object Object]"
  let errorStr;
  if (typeof rawError === 'string') {
    errorStr = rawError;
  } else if (rawError instanceof Error) {
    errorStr = rawError.message || rawError.toString();
  } else if (rawError && typeof rawError === 'object') {
    // Try to extract a meaningful message from the object
    errorStr =
      rawError.message ||
      rawError.error ||
      rawError.msg ||
      JSON.stringify(rawError).substring(0, 500);
  } else {
    errorStr = String(rawError);
  }

  for (const { pattern, message, code } of ERROR_TRANSLATIONS) {
    if (pattern.test(errorStr)) {
      return { message, code, raw: errorStr };
    }
  }

  // Fallback: return a cleaned up version of the error
  // Remove internal paths and technical details that aren't helpful
  const cleaned = errorStr
    .replace(/\/tmp\/[^\s]+/g, 'your model')
    .replace(/at line \d+/g, '')
    .trim();

  // If the error is very short or just a number, provide a generic message
  if (cleaned.length < 10 || /^\d+$/.test(cleaned)) {
    return {
      message:
        'An error occurred while rendering. Please check your model syntax and try again.',
      code: 'RENDER_FAILED',
      raw: errorStr,
    };
  }

  return {
    message: `Rendering error: ${cleaned}`,
    code: 'RENDER_FAILED',
    raw: errorStr,
  };
}

/**
 * Initialize OpenSCAD WASM
 * @param {string} baseUrl - Base URL for fetching assets (optional, defaults to current origin)
 */
async function initWASM(baseUrl = '') {
  try {
    // Start timing WASM initialization
    wasmInitStartTime = performance.now();

    // Set asset base URL (derive from self.location if not provided)
    assetBaseUrl = baseUrl || self.location.origin;
    console.log('[Worker] Asset base URL:', assetBaseUrl);

    self.postMessage({
      type: 'PROGRESS',
      payload: {
        requestId: 'init',
        percent: 5,
        message: 'Loading official OpenSCAD WASM with Manifold...',
      },
    });

    // Load official OpenSCAD WASM from vendored location
    const wasmBasePath = `${assetBaseUrl}/wasm/openscad-official`;
    const wasmJsUrl = `${wasmBasePath}/openscad.js`;

    console.log('[Worker] Loading official OpenSCAD from:', wasmJsUrl);

    // Integrity check: verify WASM artifacts match expected manifest.
    // Guards against corrupted or tampered files before they produce silent wrong results.
    // Checks both openscad.js and openscad.wasm sizes; optionally verifies SHA-256.
    let integrityData = null;
    try {
      const integrityUrl = `${wasmBasePath}/INTEGRITY.json`;
      const integrityResp = await fetch(integrityUrl);
      if (integrityResp.ok) {
        integrityData = await integrityResp.json();
        console.log(`[Worker] WASM build: ${integrityData.build}`);
        if (integrityData.knownIssues?.length) {
          console.log(
            `[Worker] Known issues: ${integrityData.knownIssues.length} documented`
          );
        }

        // Verify sizes of both JS loader and WASM binary
        const filesToCheck = [
          { name: 'openscad.js', url: wasmJsUrl },
          { name: 'openscad.wasm', url: `${wasmBasePath}/openscad.wasm` },
        ];
        const mismatches = [];

        for (const { name, url } of filesToCheck) {
          const expected = integrityData.files?.[name];
          if (!expected?.size) continue;

          try {
            const headResp = await fetch(url, { method: 'HEAD' });
            const actualSize = parseInt(
              headResp.headers.get('content-length'),
              10
            );
            if (actualSize && actualSize !== expected.size) {
              mismatches.push(
                `${name}: expected ${expected.size} bytes, got ${actualSize}`
              );
            }
          } catch (_headErr) {
            // HEAD may fail on some CDN configs; skip this file's check
          }
        }

        if (mismatches.length > 0) {
          const msg = `[Worker] WASM integrity warning: size mismatch — ${mismatches.join('; ')}. Files may be corrupted or outdated.`;
          console.warn(msg);
          self.postMessage({
            type: 'WARNING',
            payload: {
              code: 'WASM_INTEGRITY',
              message:
                'WASM file integrity check detected a size mismatch. Files may need re-downloading.',
              severity: 'warning',
            },
          });
        }
      }
    } catch (integrityErr) {
      // Non-fatal — integrity check is informational, not blocking
      console.log('[Worker] Integrity check skipped:', integrityErr.message);
    }

    // Dynamic import of official WASM module
    const OpenSCADModule = await import(/* @vite-ignore */ wasmJsUrl);
    const OpenSCAD = OpenSCADModule.default;

    self.postMessage({
      type: 'PROGRESS',
      payload: {
        requestId: 'init',
        percent: 20,
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
            console.log('[Worker] Resolved WASM asset:', resolved);
            wasmAssetLogShown = true;
          }
          return resolved;
        }
        return path;
      },
      print: (text) => {
        openscadConsoleOutput += text + '\n';
        console.log('[OpenSCAD]', text);
      },
      printErr: (text) => {
        openscadConsoleOutput += '[ERR] ' + text + '\n';
        console.error('[OpenSCAD ERR]', text);
        // Detecting GUI mode or abort errors is done via console output inspection
      },
    });

    self.postMessage({
      type: 'PROGRESS',
      payload: {
        requestId: 'init',
        percent: 50,
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
        percent: 75,
        message: 'Loading fonts for text() support...',
      },
    });

    // Mount fonts for text() support
    await mountFonts();

    // Check OpenSCAD capabilities (Manifold, fast-csg, etc.)
    self.postMessage({
      type: 'PROGRESS',
      payload: {
        requestId: 'init',
        percent: 85,
        message: 'Checking rendering capabilities...',
      },
    });

    const detectedCapabilities = await checkCapabilities();
    openscadCapabilities = detectedCapabilities;

    // Calculate total WASM init duration
    wasmInitDurationMs = Math.round(performance.now() - wasmInitStartTime);

    self.postMessage({
      type: 'PROGRESS',
      payload: {
        requestId: 'init',
        percent: 95,
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

  // Create font directory structure
  const fontPath = '/usr/share/fonts/truetype/liberation';
  try {
    FS.mkdir('/usr');
  } catch (_e) {
    /* may exist */
  }
  try {
    FS.mkdir('/usr/share');
  } catch (_e) {
    /* may exist */
  }
  try {
    FS.mkdir('/usr/share/fonts');
  } catch (_e) {
    /* may exist */
  }
  try {
    FS.mkdir('/usr/share/fonts/truetype');
  } catch (_e) {
    /* may exist */
  }
  try {
    FS.mkdir('/usr/share/fonts/truetype/liberation');
  } catch (_e) {
    /* may exist */
  }

  // List of fonts to load
  const fonts = [
    'LiberationSans-Regular.ttf',
    'LiberationSans-Bold.ttf',
    'LiberationSans-Italic.ttf',
    'LiberationMono-Regular.ttf',
  ];

  let mounted = 0;
  let failed = 0;

  for (const fontFile of fonts) {
    try {
      const fontUrl = `${assetBaseUrl}/fonts/${fontFile}`;
      const response = await fetch(fontUrl);

      if (!response.ok) {
        console.warn(`[Worker] Font not found: ${fontFile}`);
        failed++;
        continue;
      }

      const fontData = await response.arrayBuffer();
      FS.writeFile(`${fontPath}/${fontFile}`, new Uint8Array(fontData));
      console.log(`[Worker] Mounted font: ${fontFile}`);
      mounted++;
    } catch (error) {
      console.warn(`[Worker] Failed to mount font ${fontFile}:`, error.message);
      failed++;
    }
  }

  if (mounted > 0) {
    console.log(
      `[Worker] Font mounting complete: ${mounted} mounted, ${failed} failed`
    );
  } else {
    console.warn(
      '[Worker] No fonts mounted - text() function may not work correctly'
    );
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

    // Capture --help output
    const helpOutput = [];
    const originalPrint = module.print;
    const originalPrintErr = module.printErr;
    module.print = (text) => helpOutput.push(String(text));
    module.printErr = (text) => helpOutput.push(String(text));

    let _helpError = null;

    try {
      await module.callMain(['--help']);
    } catch (error) {
      _helpError = String(error?.message || error);
      // --help might exit with non-zero, that's okay
    }

    module.print = originalPrint;
    module.printErr = originalPrintErr;
    const helpText = helpOutput.join('\n');

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
    const hasBinarySTLFlag =
      helpText.includes('export-format') || helpText.includes('binstl');

    capabilities.hasManifold =
      hasManifoldBackend || hasManifoldMention || hasManifoldEnable;

    // fast-csg was an older experimental flag, now integrated into Manifold backend
    // Check if it's still available as --enable option
    capabilities.hasFastCSG = hasFastCSGFlag;

    // lazy-union is still an --enable flag
    capabilities.hasLazyUnion = hasLazyUnionFlag;

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
      FS.writeFile(resolvedPath, content);
      mountedFiles.set(resolvedPath, content);
      resolvedPaths.set(filePath, resolvedPath);
      console.log(
        `[Worker FS] Mounted file: ${resolvedPath} (${content.length} bytes)`
      );
    } catch (error) {
      console.error(`[Worker FS] Failed to mount file ${resolvedPath}:`, error);
      throw new Error(`Failed to mount file: ${filePath}`);
    }
  }

  console.log(
    `[Worker FS] Successfully mounted ${files.size} files under ${baseDir || '/'}`
  );

  return {
    workDir: baseDir,
    files: resolvedPaths,
  };
}

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
  console.log('[Worker FS] Cleared all mounted files');
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
        console.log(`[Worker FS] Library ${lib.id} already mounted`);
        continue;
      }
      // Stale mount tracked (root missing) - remount
      mountedLibraries.delete(lib.id);
    }

    try {
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
        let _mountedCount = 0;
        let _failedCount = 0;
        let failedSample = null;

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
              _mountedCount++;
            } else {
              _failedCount++;
              if (!failedSample) failedSample = file;
            }
          } catch (error) {
            console.warn(
              `[Worker FS] Failed to mount ${file} from ${lib.id}:`,
              error.message
            );
            _failedCount++;
            if (!failedSample) failedSample = file;
          }
        }

        mountedLibraries.add(lib.id);
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

  console.log(
    `[Worker FS] Successfully mounted ${mountedLibraries.size} libraries (${totalMounted} files)`
  );
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
  console.log('[Worker FS] Cleared library tracking');
}

/**
 * Recursively serialize a JS array to OpenSCAD vector syntax, handling nested vectors.
 * @param {Array} arr
 * @returns {string} e.g. "[[1,2],[3,4]]"
 */
function serializeScadVector(arr) {
  const parts = arr.map((item) =>
    Array.isArray(item) ? serializeScadVector(item) : String(item)
  );
  return `[${parts.join(',')}]`;
}

/**
 * Build -D command-line arguments from parameters
 * @param {Object} parameters - Parameter key-value pairs
 * @param {Object} paramTypes - Map of parameter names to their schema types (e.g. { expose_home_button: 'string', MW_version: 'boolean' })
 * @returns {Array<string>} Array of -D arguments
 */
function buildDefineArgs(parameters, paramTypes = {}) {
  if (!parameters || Object.keys(parameters).length === 0) {
    return [];
  }

  const args = [];

  for (const [key, value] of Object.entries(parameters)) {
    // Skip null/undefined values
    if (value === null || value === undefined) {
      continue;
    }

    let formattedValue;

    // Handle different value types
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      // CRITICAL FIX: Only convert "yes"/"no"/"true"/"false" to OpenSCAD boolean
      // when the parameter schema declares the type as 'boolean'.
      // String dropdown parameters like expose_home_button = "yes"; //[yes,no]
      // must remain as quoted strings so that OpenSCAD string comparisons
      // (e.g. if (expose_home_button == "yes")) evaluate correctly.
      const isBooleanParam = paramTypes[key] === 'boolean';

      if (isBooleanParam && (lowerValue === 'true' || lowerValue === 'yes')) {
        formattedValue = 'true';
      } else if (
        isBooleanParam &&
        (lowerValue === 'false' || lowerValue === 'no')
      ) {
        formattedValue = 'false';
      }
      // Check if this is a color (hex string)
      else if (/^#?[0-9A-Fa-f]{6}$/.test(value)) {
        const rgb = hexToRgb(value);
        formattedValue = `[${rgb[0]},${rgb[1]},${rgb[2]}]`;
      } else {
        // ALL non-boolean strings (including "yes"/"no" dropdowns) stay as quoted strings
        const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        formattedValue = `"${escaped}"`;
      }
    } else if (typeof value === 'number') {
      formattedValue = String(value);
    } else if (typeof value === 'boolean') {
      formattedValue = value ? 'true' : 'false';
    } else if (Array.isArray(value)) {
      formattedValue = serializeScadVector(value);
    } else if (typeof value === 'object' && value.data) {
      // File parameter - use filename
      const escaped = (value.name || 'uploaded_file')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
      formattedValue = `"${escaped}"`;
    } else {
      // Fallback: JSON stringify
      formattedValue = JSON.stringify(value);
    }

    // Add -D flag
    args.push('-D');
    args.push(`${key}=${formattedValue}`);
  }

  return args;
}

/**
 * Convert parameters to OpenSCAD variable assignments
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
      // Skip null/undefined values
      if (value === null || value === undefined) {
        return null;
      }

      // Check if this is a color parameter (hex string)
      if (
        paramTypes[key] === 'color' ||
        (typeof value === 'string' && /^#?[0-9A-Fa-f]{6}$/.test(value))
      ) {
        // Convert hex color to RGB array [r, g, b]
        const rgb = hexToRgb(value);
        return `${key} = [${rgb[0]}, ${rgb[1]}, ${rgb[2]}];`;
      }

      // Check if this is a file parameter (object with data property)
      if (typeof value === 'object' && value.data) {
        // For files, we'll use the filename or a special marker
        // The actual file data handling happens in the render function
        return `${key} = "${value.name || 'uploaded_file'}";`;
      }

      // Handle different value types
      if (typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        // CRITICAL FIX: Only convert to boolean when schema type is 'boolean'
        const isBooleanParam = paramTypes[key] === 'boolean';

        if (isBooleanParam && (lowerValue === 'true' || lowerValue === 'yes')) {
          return `${key} = true;`;
        } else if (
          isBooleanParam &&
          (lowerValue === 'false' || lowerValue === 'no')
        ) {
          return `${key} = false;`;
        }
        // ALL non-boolean strings (including "yes"/"no" dropdowns) stay as quoted strings
        const escaped = value.replace(/"/g, '\\"');
        return `${key} = "${escaped}";`;
      } else if (typeof value === 'number') {
        return `${key} = ${value};`;
      } else if (typeof value === 'boolean') {
        return `${key} = ${value};`;
      } else if (Array.isArray(value)) {
        return `${key} = ${serializeScadVector(value)};`;
      } else {
        return `${key} = ${JSON.stringify(value)};`;
      }
    })
    .filter((a) => a !== null); // Remove null entries

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

  const formatValue = (key, value) => {
    // Skip null/undefined
    if (value === null || value === undefined) {
      return null;
    }

    // Check if this is a color parameter (hex string)
    if (typeof value === 'string' && /^#?[0-9A-Fa-f]{6}$/.test(value)) {
      // Convert hex color to RGB array [r, g, b]
      const rgb = hexToRgb(value);
      return `[${rgb[0]}, ${rgb[1]}, ${rgb[2]}]`;
    }

    // Check if this is a file parameter (object with data property)
    if (typeof value === 'object' && value.data) {
      // For files, use the filename
      const escaped = (value.name || 'uploaded_file').replace(/"/g, '\\"');
      return `"${escaped}"`;
    }

    // Handle arrays (including nested vectors like [[1,2],[3,4]])
    if (Array.isArray(value)) {
      return serializeScadVector(value);
    }

    // Handle strings
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      // CRITICAL FIX: Only convert to boolean when schema type is 'boolean'
      const isBooleanParam = paramTypes[key] === 'boolean';

      if (isBooleanParam && (lowerValue === 'true' || lowerValue === 'yes')) {
        return 'true';
      } else if (
        isBooleanParam &&
        (lowerValue === 'false' || lowerValue === 'no')
      ) {
        return 'false';
      }
      // ALL non-boolean strings (including "yes"/"no" dropdowns) stay as quoted strings
      const escaped = value.replace(/"/g, '\\"');
      return `"${escaped}"`;
    }

    // Handle numbers and booleans
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return JSON.stringify(value);
  };

  for (const [key, value] of Object.entries(parameters)) {
    const assignmentValue = formatValue(key, value);

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
  const supportsBinarySTL = Boolean(capabilities.hasBinarySTL);
  const enableLazyUnion =
    Boolean(renderOptions?.enableLazyUnion) && supportsLazyUnion;

  // Engine selection: Use Manifold by default, but allow user to disable
  // renderOptions.useManifold: undefined/true = use Manifold, false = use CGAL (stable)
  const useManifold = renderOptions?.useManifold !== false;

  const performanceFlags = [];
  if (supportsManifold && useManifold) {
    performanceFlags.push('--backend=Manifold');
  } else if (supportsManifold && !useManifold) {
    // Explicitly use CGAL backend for stability
    performanceFlags.push('--backend=CGAL');
    console.log('[Worker] Using CGAL (stable) backend instead of Manifold');
  }
  if (enableLazyUnion) {
    performanceFlags.push('--enable=lazy-union');
  }
  const exportFlags = [];
  if (format === 'stl' && supportsBinarySTL) {
    exportFlags.push('--export-format=binstl');
  }
  const _shouldRetryWithoutFlags =
    performanceFlags.length > 0 || exportFlags.length > 0;

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

    if (shouldWriteInput) {
      module.FS.writeFile(inputFile, scadContent);
      wroteTempInput = true;
    }

    // Build -D arguments
    const defineArgs = buildDefineArgs(parameters, paramTypes);

    // Path resolution for import()/use/include:
    // OpenSCAD WASM doesn't support the -I flag, so we use OPENSCADPATH env var.
    // Desktop OpenSCAD resolves relative imports next to the main SCAD file,
    // then searches OPENSCADPATH. We replicate this by:
    //   1. Writing the main file to the correct directory (done above)
    //   2. Setting OPENSCADPATH to include both the library root and the
    //      working directory (for multi-file zip projects)
    // See: openscad-playground#35 for the upstream path resolution bug.
    if (module.ENV) {
      const searchPaths = ['/libraries'];
      // For multi-file projects mounted under /work/, add the work dir
      // so that `include <file.txt>` resolves relative to the project root
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

    // Execute OpenSCAD with fail-open retry logic
    try {
      const exitCode = await module.callMain(args);

      // Check exit code - non-zero means compilation failed.
      if (exitCode !== 0) {
        // Check if this is a 3D-to-2D format mismatch (model produces 3D but exporting to SVG/DXF).
        // OpenSCAD returns exit code 1 with "not a 2D object" — this is recoverable, not a module crash.
        const is2DFormat = format === 'svg' || format === 'dxf';
        const modelIsNot2D =
          openscadConsoleOutput.includes(
            'Current top level object is not a 2D object'
          ) || openscadConsoleOutput.includes('not a 2D object');

        if (is2DFormat && modelIsNot2D) {
          throw new Error(
            'MODEL_NOT_2D: Your model produces 3D geometry but SVG/DXF requires 2D output. ' +
              'Ensure your model uses projection() or enable "use Laser Cutting best practices" to produce 2D geometry.'
          );
        }

        // Any other non-zero exit corrupts the WASM module's internal state —
        // signal the render controller to restart before the next render.
        const err = new Error(
          `OpenSCAD compilation failed with exit code ${exitCode}. Output: ${openscadConsoleOutput.substring(0, 500)}`
        );
        err.needsRestart = true;
        throw err;
      }

      // Check for empty geometry - OpenSCAD returns exit code 0 but produces no output
      // This happens when parameter combinations result in no geometry being generated
      if (
        openscadConsoleOutput.includes('Current top level object is empty') ||
        openscadConsoleOutput.includes('top-level object is empty')
      ) {
        throw new Error(
          `Current top level object is empty. Output: ${openscadConsoleOutput.substring(0, 500)}`
        );
      }

      // Check for 2D object exported to a 3D format (STL/OBJ/etc.)
      // This happens when model produces 2D geometry but the render is trying
      // to export to a 3D format — applies to any project using projection() or 2D primitives.
      const is2DFormat = format === 'svg' || format === 'dxf';
      if (
        !is2DFormat &&
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

      // Check for "not supported" ECHO messages which indicate invalid configurations
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

    return outputData;
  } catch (error) {
    console.error(`[Worker] Render via callMain to ${format} failed:`, error);
    throw error;
  }
}

/**
 * Render using export method (fallback for formats without dedicated renderTo* methods)
 * @param {string} scadContent - OpenSCAD source code
 * @param {string} format - Output format (obj, off, amf, 3mf)
 * @returns {Promise<string|ArrayBuffer>} Rendered data
 */
async function _renderWithExport(scadContent, format) {
  // This is a fallback approach if OpenSCAD WASM doesn't have format-specific methods
  // We'll try using the file system approach: write .scad, export to format

  const inputFile = '/tmp/input.scad';
  const outputFile = `/tmp/output.${format}`;

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

    // Write input file
    module.FS.writeFile(inputFile, scadContent);

    // Execute OpenSCAD export command
    // This assumes OpenSCAD WASM supports command-line style operations
    await module.callMain(['-o', outputFile, inputFile]);

    // Read output file
    const outputData = module.FS.readFile(outputFile);

    // Clean up
    module.FS.unlink(inputFile);
    module.FS.unlink(outputFile);

    return outputData;
  } catch (error) {
    console.error(`[Worker] Export to ${format} failed:`, error);
    throw new Error(
      `Export to ${format.toUpperCase()} format not supported by OpenSCAD WASM`
    );
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

/**
 * Validate SVG output
 * @param {string} content - SVG content as string
 * @returns {{valid: boolean, error?: string}}
 */
function validateSVGOutput(content) {
  // Check minimum length
  if (!content || content.length < 50) {
    return {
      valid: false,
      error:
        'SVG output is empty or too small. Your model may not produce 2D geometry. ' +
        'Ensure your model uses projection() or 2D primitives, and that your parameter settings produce visible geometry.',
    };
  }

  // Check for SVG root element
  if (!/<svg[\s>]/i.test(content)) {
    return {
      valid: false,
      error:
        'Invalid SVG output - missing <svg> element. The OpenSCAD render may have failed silently.',
    };
  }

  // Check for at least one geometric element
  const geometricElements = [
    '<path',
    '<polygon',
    '<polyline',
    '<line',
    '<rect',
    '<circle',
    '<ellipse',
    '<g>',
  ];

  const hasGeometry = geometricElements.some((el) =>
    content.toLowerCase().includes(el.toLowerCase())
  );

  if (!hasGeometry) {
    return {
      valid: false,
      error:
        'SVG contains no geometry (no paths, polygons, or shapes). ' +
        'Your 3D model may not include any 2D projection. ' +
        'Ensure your model uses projection() or is configured for 2D output.',
    };
  }

  // Check for completely empty viewBox or very small content
  const viewBoxMatch = content.match(/viewBox="([^"]+)"/);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/).map(parseFloat);
    if (parts.length >= 4) {
      const width = parts[2];
      const height = parts[3];
      if ((width === 0 && height === 0) || (width < 0.001 && height < 0.001)) {
        return {
          valid: false,
          error:
            'SVG has zero-size viewBox (no visible geometry). ' +
            'Your model configuration may be producing empty output.',
        };
      }
    }
  }

  return { valid: true };
}

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

/**
 * Post-process DXF output from OpenSCAD WASM to fix known compatibility issues.
 *
 * The OpenSCAD WASM binary (based on development snapshots post-2022) exports DXF files
 * using LWPOLYLINE entities with R14+ subclass markers, but declares version AC1006 (R10).
 * This hybrid format is rejected by most CAD software (AutoCAD, CorelDRAW, Adobe Illustrator,
 * Xometry, SendCutSend, LibreCAD, NanoCAD, SketchUp -- see issue #4268).
 *
 * Simply changing the version number is NOT enough (confirmed by multiple users in #4268).
 * The only universally compatible approach is to convert LWPOLYLINE entities back to
 * individual LINE segments -- the format used by the working 2021.01 stable release.
 *
 * This post-processor:
 *   1. Removes the broken HEADER section entirely (R12 DXF doesn't require one)
 *   2. Preserves the TABLES section (LTYPE, LAYER, STYLE) as-is
 *   3. Converts each LWPOLYLINE to a series of LINE entities
 *   4. Preserves any non-LWPOLYLINE entities unchanged
 *   5. Produces a clean, headerless DXF compatible with all tested applications
 *
 * Reference: github.com/openscad/openscad/issues/4268
 *            github.com/openscad/openscad/pull/6599
 *
 * @param {ArrayBuffer} outputBuffer - Raw DXF output from WASM
 * @returns {ArrayBuffer} Post-processed DXF as ArrayBuffer
 */
function postProcessDXF(outputBuffer) {
  const decoder = new TextDecoder('utf-8');
  const content = decoder.decode(outputBuffer);
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.split('\n');

  // Parse DXF into group-code/value pairs
  const pairs = [];
  for (let i = 0; i + 1 < rawLines.length; i += 2) {
    pairs.push({
      code: rawLines[i].trim(),
      value: rawLines[i + 1].trim(),
    });
  }

  // Identify section boundaries
  // Sections are: 0/SECTION, 2/<name>, ..., 0/ENDSEC
  const sections = []; // {name, startIdx, endIdx}
  for (let i = 0; i < pairs.length; i++) {
    if (
      pairs[i].code === '0' &&
      pairs[i].value === 'SECTION' &&
      i + 1 < pairs.length &&
      pairs[i + 1].code === '2'
    ) {
      const name = pairs[i + 1].value;
      // Find matching ENDSEC
      for (let j = i + 2; j < pairs.length; j++) {
        if (pairs[j].code === '0' && pairs[j].value === 'ENDSEC') {
          sections.push({ name, startIdx: i, endIdx: j });
          break;
        }
      }
    }
  }

  // Extract EXTMIN/EXTMAX from HEADER for optional re-use
  const headerSection = sections.find((s) => s.name === 'HEADER');
  let extMin = null,
    extMax = null;
  if (headerSection) {
    for (let i = headerSection.startIdx; i <= headerSection.endIdx; i++) {
      if (pairs[i].code === '9' && pairs[i].value === '$EXTMIN') {
        extMin = { x: 0, y: 0 };
        for (
          let j = i + 1;
          j <= headerSection.endIdx &&
          pairs[j].code !== '9' &&
          pairs[j].code !== '0';
          j++
        ) {
          if (pairs[j].code === '10') extMin.x = parseFloat(pairs[j].value);
          if (pairs[j].code === '20') extMin.y = parseFloat(pairs[j].value);
        }
      }
      if (pairs[i].code === '9' && pairs[i].value === '$EXTMAX') {
        extMax = { x: 0, y: 0 };
        for (
          let j = i + 1;
          j <= headerSection.endIdx &&
          pairs[j].code !== '9' &&
          pairs[j].code !== '0';
          j++
        ) {
          if (pairs[j].code === '10') extMax.x = parseFloat(pairs[j].value);
          if (pairs[j].code === '20') extMax.y = parseFloat(pairs[j].value);
        }
      }
    }
  }

  // Parse LWPOLYLINE entities from the ENTITIES section
  const entitiesSection = sections.find((s) => s.name === 'ENTITIES');
  const parsedEntities = []; // Each is {type, layer, pairs} or {type:'LWPOLYLINE', layer, vertices, closed}

  if (entitiesSection) {
    let i = entitiesSection.startIdx + 2; // Skip 0/SECTION and 2/ENTITIES
    while (i <= entitiesSection.endIdx) {
      if (pairs[i].code === '0' && pairs[i].value === 'ENDSEC') break;
      if (pairs[i].code === '0') {
        const entityType = pairs[i].value;
        i++; // Move past the 0/EntityType pair

        // Collect all pairs until next 0-code (next entity or ENDSEC)
        const entityPairs = [];
        while (i <= entitiesSection.endIdx && pairs[i].code !== '0') {
          entityPairs.push(pairs[i]);
          i++;
        }

        if (entityType === 'LWPOLYLINE') {
          // Parse LWPOLYLINE into vertices
          let layer = '0';
          let closed = false;
          const vertices = [];
          let currentX = null;

          for (const ep of entityPairs) {
            if (ep.code === '8') layer = ep.value;
            if (ep.code === '70') closed = (parseInt(ep.value) & 1) !== 0;
            if (ep.code === '10') {
              if (currentX !== null && vertices.length > 0) {
                // Previous vertex didn't get a Y -- shouldn't happen, but guard
              }
              currentX = parseFloat(ep.value);
            }
            if (ep.code === '20') {
              if (currentX !== null) {
                vertices.push({ x: currentX, y: parseFloat(ep.value) });
                currentX = null;
              }
            }
          }
          parsedEntities.push({ type: 'LWPOLYLINE', layer, vertices, closed });
        } else {
          // Keep other entity types as raw pairs
          parsedEntities.push({
            type: entityType,
            layer: '0',
            rawPairs: entityPairs,
          });
        }
      } else {
        i++;
      }
    }
  }

  // Build clean DXF output with minimal R12 header for Adobe Illustrator compatibility.
  // Illustrator requires a HEADER section with $ACADVER to interpret geometry correctly;
  // without it, Illustrator falls back to text rendering (confirmed by @peterzieba in #4268).
  const out = [];

  // Helper to emit a group code/value pair with proper DXF formatting
  // Group codes are right-justified in a 3-char field; values on the next line
  function emit(code, value) {
    out.push(String(code).padStart(3));
    out.push(String(value));
  }

  // HEADER section -- minimal R12-compatible header
  // AC1009 = R12, the most universally supported DXF version.
  // Only LINE entities are used, which are fully R12 compatible.
  emit(0, 'SECTION');
  emit(2, 'HEADER');
  emit(9, '$ACADVER');
  emit(1, 'AC1009');
  if (extMin && extMax) {
    emit(9, '$EXTMIN');
    emit(10, extMin.x);
    emit(20, extMin.y);
    emit(9, '$EXTMAX');
    emit(10, extMax.x);
    emit(20, extMax.y);
  }
  emit(0, 'ENDSEC');

  // TABLES section -- copy from original, stripping any subclass markers
  const tablesSection = sections.find((s) => s.name === 'TABLES');
  if (tablesSection) {
    emit(0, 'SECTION');
    emit(2, 'TABLES');
    for (let i = tablesSection.startIdx + 2; i < tablesSection.endIdx; i++) {
      // Skip subclass markers (group code 100) -- not valid for R12
      if (pairs[i].code === '100') continue;
      emit(pairs[i].code, pairs[i].value);
    }
    emit(0, 'ENDSEC');
  }

  // ENTITIES section -- convert LWPOLYLINE to LINE, keep others
  emit(0, 'SECTION');
  emit(2, 'ENTITIES');

  for (const entity of parsedEntities) {
    if (entity.type === 'LWPOLYLINE') {
      const verts = entity.vertices;
      if (verts.length < 2) continue;

      const segmentCount = entity.closed ? verts.length : verts.length - 1;
      for (let s = 0; s < segmentCount; s++) {
        const p1 = verts[s];
        const p2 = verts[(s + 1) % verts.length];
        emit(0, 'LINE');
        emit(8, entity.layer);
        emit(10, p1.x);
        emit(20, p1.y);
        emit(11, p2.x);
        emit(21, p2.y);
      }
    } else {
      // Emit non-LWPOLYLINE entities as-is (skip subclass markers)
      emit(0, entity.type);
      for (const ep of entity.rawPairs || []) {
        if (ep.code === '100') continue; // Strip subclass markers
        emit(ep.code, ep.value);
      }
    }
  }

  emit(0, 'ENDSEC');

  // EOF
  emit(0, 'EOF');

  const result = out.join('\n') + '\n';

  const encoder = new TextEncoder();
  return encoder.encode(result).buffer;
}

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
    return { percent: 0, warning: false };
  }
  // Get WASM heap info - note HEAP8.length is allocated size, not usage
  const heapAllocatedBytes = openscadModule.HEAP8.length;
  const heapAllocatedMB = Math.round(heapAllocatedBytes / 1024 / 1024);

  // Record baseline for growth calculation
  heapBeforeRenderMB = heapAllocatedMB;

  // NOTE: We can only measure the allocated heap size, not actual usage.
  // HEAP8.length == buffer.byteLength, so percentage-based checks are meaningless.
  // Instead, warn based on absolute heap size (e.g., warn when heap > 1GB).
  const usedMB = heapAllocatedMB;
  const limitMB = MEMORY_WARNING_THRESHOLD_MB;

  if (heapAllocatedMB >= MEMORY_WARNING_THRESHOLD_MB) {
    self.postMessage({
      type: 'WARNING',
      payload: {
        requestId,
        code: 'HIGH_MEMORY',
        message: `Memory allocation is high (${usedMB}MB). Complex models may fail. Consider refreshing the page to free memory.`,
        severity: 'warning',
        memoryUsage: {
          used: heapAllocatedBytes,
          limit: limitMB * 1024 * 1024,
          percent: Math.round((usedMB / limitMB) * 100),
          usedMB,
          limitMB,
        },
      },
    });
    return {
      percent: Math.round((usedMB / limitMB) * 100),
      warning: true,
      usedMB,
      limitMB,
    };
  }

  return {
    percent: Math.round((usedMB / limitMB) * 100),
    warning: false,
    usedMB,
    limitMB,
  };
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
      console.warn(
        `[Worker] High memory usage: ${memCheck.usedMB}MB (${memCheck.percent}%)`
      );
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
    if (files && Object.keys(files).length > 0) {
      // Clear any previously mounted files to ensure clean FS state
      clearMountedFiles();

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

      console.log('[Worker] Files mounted under:', mountResult.workDir);
    }
    console.log('[Worker] Rendering with parameters:', parameters);

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

    // For 2D formats (SVG/DXF), enforce laser-cut compatible parameters.
    // Some keyguard models reject "first layer for SVG/DXF" when type_of_keyguard
    // remains "3D-Printed", producing "not a 2D object" at runtime.
    if (format === 'svg' || format === 'dxf') {
      parameters.use_Laser_Cutting_best_practices = 'yes';
      parameters.type_of_keyguard = 'Laser-Cut';
    }

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
      console.log('[Worker] Using callMain with official OpenSCAD WASM');

      // Determine main file path
      // For multi-file projects, use the work directory path
      // For multi-file projects, include/use statements must resolve correctly
      let mainFileToUse;

      if (mainFile && mountResult && mountResult.workDir) {
        // Multi-file project: use the work directory path
        mainFileToUse = `${mountResult.workDir}/${mainFile}`;
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

      const outputData = await renderWithCallMain(
        scadContent,
        parameters,
        format,
        mainFileToUse,
        renderOptions,
        paramTypes
      );

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

      return { data: outputData, format, renderDurationMs };
    })();

    // Race between render and timeout
    const result = await Promise.race([renderPromise, timeoutPromise]);
    const {
      data: outputData,
      format: resultFormat,
      renderDurationMs: workerRenderMs,
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
        // OFF format has triangle count in header
        const match = outputData.match(/^OFF\s+\d+\s+(\d+)/);
        if (match) triangleCount = parseInt(match[1]);
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
    if (resultFormat === 'dxf') {
      try {
        outputBuffer = postProcessDXF(outputBuffer);
      } catch (dxfError) {
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
        },
      },
      [outputBuffer]
    ); // Transfer ownership of ArrayBuffer
    console.log(
      `[Worker] Render complete: ${triangleCount} triangles in ${workerRenderMs}ms`
    );
  } catch (error) {
    // Clear timeout on error
    if (currentRenderTimeout) {
      clearTimeout(currentRenderTimeout);
      currentRenderTimeout = null;
    }

    console.error('[Worker] Render failed:', error);

    // Translate error to user-friendly message
    // Pass the entire error object to translateError which now handles all types
    const translated = translateError(error);

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
        'Enable "use Laser Cutting best practices" or ensure your model uses projection() to produce 2D geometry.';
    }

    // Signal that the WASM module needs a restart before the next render.
    // callMain with non-zero exit or a numeric abort corrupts module state.
    const needsRestart =
      error?.needsRestart === true ||
      typeof error === 'number' ||
      /^\d+$/.test(String(error)) ||
      code === 'INTERNAL_ERROR' ||
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
      limit: MEMORY_WARNING_THRESHOLD_MB * 1024 * 1024,
      percent: 0,
      available: true,
      growthMB: 0,
    };
  }

  // IMPORTANT: heapTotalBytes is the ALLOCATED heap size, not actual used memory.
  // WASM linear memory grows in 64KB pages; once grown it never shrinks.
  // We use the warning threshold (1GB) as the "limit" for reporting purposes.
  const heapTotalBytes = openscadModule.HEAP8.length;
  const heapTotalMB = Math.round(heapTotalBytes / 1024 / 1024);
  const used = heapTotalBytes;
  const limit = MEMORY_WARNING_THRESHOLD_MB * 1024 * 1024;
  const percent = Math.round((used / limit) * 100);

  // Growth since last render start (helps detect memory leaks between renders)
  const growthMB =
    heapBeforeRenderMB > 0 ? heapTotalMB - heapBeforeRenderMB : 0;

  return {
    used,
    limit,
    percent,
    available: true,
    usedMB: heapTotalMB,
    limitMB: MEMORY_WARNING_THRESHOLD_MB,
    growthMB,
  };
}

// Worker health heartbeat — responds immediately to prove the event loop is live.
// During a blocking callMain() render, this will NOT respond (expected).
// The render controller uses the absence of a response to detect hung workers.
let _lastHeartbeatId = null;

// Message handler
self.onmessage = async (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      await initWASM(payload?.assetBaseUrl);
      break;

    case 'PING':
      // Heartbeat response — proves the worker event loop is responsive
      _lastHeartbeatId = payload?.id;
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
