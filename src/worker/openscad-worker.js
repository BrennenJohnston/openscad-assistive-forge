/**
 * OpenSCAD WASM Web Worker
 * @license GPL-3.0-or-later
 */

import { createOpenSCAD } from 'openscad-wasm-prebuilt';

// Worker state
let openscadInstance = null;
let openscadModule = null;
let initialized = false;
let currentRenderTimeout = null;
let mountedFiles = new Map(); // Track files in virtual filesystem
let mountedLibraries = new Set(); // Track mounted library IDs
let assetBaseUrl = ''; // Base URL for fetching assets (fonts, libraries, etc.)

/**
 * Ensure we have access to the underlying OpenSCAD WASM module
 * @returns {Promise<Object|null>}
 */
async function ensureOpenSCADModule() {
  if (openscadModule) return openscadModule;
  if (openscadInstance?.getInstance) {
    const maybeModule = openscadInstance.getInstance();
    openscadModule =
      typeof maybeModule?.then === 'function' ? await maybeModule : maybeModule;
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
  {
    pattern: /\b\d{6,}\b/, // Match long numeric error codes (like 1101176)
    message:
      'An internal rendering error occurred. Try reloading the page and rendering again.',
    code: 'INTERNAL_ERROR',
  },
];

/**
 * Translate raw OpenSCAD error to user-friendly message
 * @param {string} rawError - Raw error message from OpenSCAD
 * @returns {{message: string, code: string, raw: string}} Translated error info
 */
function translateError(rawError) {
  const errorStr = String(rawError);

  for (const { pattern, message, code } of ERROR_TRANSLATIONS) {
    if (pattern.test(errorStr)) {
      return { message, code, raw: errorStr };
    }
  }

  // Fallback: return a cleaned up version of the error
  // Remove internal paths and technical details that aren't helpful
  let cleaned = errorStr
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
    // Set asset base URL (derive from self.location if not provided)
    assetBaseUrl = baseUrl || self.location.origin;
    console.log('[Worker] Asset base URL:', assetBaseUrl);

    self.postMessage({
      type: 'PROGRESS',
      payload: {
        requestId: 'init',
        percent: 5,
        message: 'Downloading WASM module (~15-30MB)...',
      },
    });

    // Initialize OpenSCAD WASM
    openscadInstance = await createOpenSCAD();

    self.postMessage({
      type: 'PROGRESS',
      payload: {
        requestId: 'init',
        percent: 60,
        message: 'Initializing WebAssembly...',
      },
    });

    openscadModule = await ensureOpenSCADModule();
    initialized = true;

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
    });

    console.log('[Worker] OpenSCAD WASM initialized successfully');
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
  } catch (e) {
    /* may exist */
  }
  try {
    FS.mkdir('/usr/share');
  } catch (e) {
    /* may exist */
  }
  try {
    FS.mkdir('/usr/share/fonts');
  } catch (e) {
    /* may exist */
  }
  try {
    FS.mkdir('/usr/share/fonts/truetype');
  } catch (e) {
    /* may exist */
  }
  try {
    FS.mkdir('/usr/share/fonts/truetype/liberation');
  } catch (e) {
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
 * Mount files into OpenSCAD virtual filesystem
 * @param {Map<string, string>} files - Map of file paths to content
 * @returns {Promise<void>}
 */
async function mountFiles(files) {
  const module = await ensureOpenSCADModule();
  if (!module || !module.FS) {
    throw new Error('OpenSCAD filesystem not available');
  }

  const FS = module.FS;

  // Create directory structure
  const directories = new Set();

  for (const filePath of files.keys()) {
    // Extract all directory components
    const parts = filePath.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      directories.add(currentPath);
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

  // Write files
  for (const [filePath, content] of files.entries()) {
    try {
      FS.writeFile(filePath, content);
      mountedFiles.set(filePath, content);
      console.log(
        `[Worker FS] Mounted file: ${filePath} (${content.length} bytes)`
      );
    } catch (error) {
      console.error(`[Worker FS] Failed to mount file ${filePath}:`, error);
      throw new Error(`Failed to mount file: ${filePath}`);
    }
  }

  console.log(`[Worker FS] Successfully mounted ${files.size} files`);
}

/**
 * Clear all mounted files from virtual filesystem
 */
function clearMountedFiles() {
  if (!openscadModule || !openscadModule.FS) {
    mountedFiles.clear();
    return;
  }

  const FS = openscadModule.FS;

  for (const filePath of mountedFiles.keys()) {
    try {
      FS.unlink(filePath);
    } catch (error) {
      // File may already be deleted, ignore
    }
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

  for (const lib of libraries) {
    if (mountedLibraries.has(lib.id)) {
      console.log(`[Worker FS] Library ${lib.id} already mounted`);
      continue;
    }

    try {
      console.log(`[Worker FS] Mounting library: ${lib.id} from ${lib.path}`);

      // Fetch library file list from manifest or directory listing
      // For now, we'll try to mount the library directory recursively
      const manifestUrl = `${assetBaseUrl}${lib.path}/manifest.json`;
      const response = await fetch(manifestUrl).catch(() => {
        return null;
      });

      if (response && response.ok) {
        const manifest = await response.json();
        const files = manifest.files || [];

        // Create library directory
        try {
          FS.mkdir(lib.id);
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }

        // Fetch and mount each file
        for (const file of files) {
          try {
            const fileResponse = await fetch(
              `${assetBaseUrl}${lib.path}/${file}`
            );
            if (fileResponse.ok) {
              const content = await fileResponse.text();
              const filePath = `${lib.id}/${file}`;

              // Create subdirectories if needed
              const parts = file.split('/');
              let currentPath = lib.id;
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
        console.log(`[Worker FS] Successfully mounted library: ${lib.id}`);
      } else {
        // No manifest, try to fetch common files
        console.warn(`[Worker FS] No manifest found for ${lib.id}, skipping`);
      }
    } catch (error) {
      console.error(`[Worker FS] Failed to mount library ${lib.id}:`, error);
      throw new Error(`Failed to mount library: ${lib.id}`);
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
 * Convert hex color to RGB array [r, g, b] (0-255 range)
 * @param {string} hex - Hex color code (with or without #)
 * @returns {Array<number>} RGB array
 */
function hexToRgb(hex) {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Convert 3-digit hex to 6-digit
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return [r, g, b];
}

/**
 * Build -D command-line arguments from parameters
 * @param {Object} parameters - Parameter key-value pairs
 * @returns {Array<string>} Array of -D arguments
 */
function buildDefineArgs(parameters) {
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
      // Check if this is a color (hex string)
      if (/^#?[0-9A-Fa-f]{6}$/.test(value)) {
        const rgb = hexToRgb(value);
        formattedValue = `[${rgb[0]},${rgb[1]},${rgb[2]}]`;
      } else {
        // Escape quotes and wrap in quotes
        const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        formattedValue = `"${escaped}"`;
      }
    } else if (typeof value === 'number') {
      formattedValue = String(value);
    } else if (typeof value === 'boolean') {
      formattedValue = value ? 'true' : 'false';
    } else if (Array.isArray(value)) {
      formattedValue = `[${value.join(',')}]`;
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
        // Escape quotes in strings
        const escaped = value.replace(/"/g, '\\"');
        return `${key} = "${escaped}";`;
      } else if (typeof value === 'number') {
        return `${key} = ${value};`;
      } else if (typeof value === 'boolean') {
        return `${key} = ${value};`;
      } else if (Array.isArray(value)) {
        // Handle arrays (including RGB arrays)
        return `${key} = [${value.join(', ')}];`;
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
 * @returns {{scad: string, replacedKeys: string[], prependedKeys: string[]}}
 */
function applyOverrides(scadContent, parameters) {
  if (!parameters || Object.keys(parameters).length === 0) {
    return { scad: scadContent, replacedKeys: [], prependedKeys: [] };
  }

  let updated = scadContent;
  const replacedKeys = [];
  const prependedKeys = [];

  const formatValue = (value) => {
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

    // Handle arrays
    if (Array.isArray(value)) {
      return `[${value.join(', ')}]`;
    }

    // Handle strings
    if (typeof value === 'string') {
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
    const assignmentValue = formatValue(value);

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
    updated = parametersToScad(prependParams) + updated;
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
  mainFilePath = null
) {
  const inputFile = mainFilePath || '/tmp/input.scad';
  const outputFile = `/tmp/output.${format}`;

  try {
    const module = await ensureOpenSCADModule();
    if (!module || !module.FS) {
      throw new Error('OpenSCAD filesystem not available');
    }

    // Ensure /tmp directory exists
    try {
      module.FS.mkdir('/tmp');
    } catch (e) {
      // May already exist
    }

    // Write input file to FS (unless it's already mounted via mainFilePath)
    if (!mainFilePath || mainFilePath.startsWith('/tmp/')) {
      module.FS.writeFile(inputFile, scadContent);
    }

    // Build -D arguments
    const defineArgs = buildDefineArgs(parameters);

    // Build command: [-D key=value, ...] -o outputFile inputFile
    const args = [...defineArgs, '-o', outputFile, inputFile];

    console.log('[Worker] Calling OpenSCAD with args:', args);

    // Execute OpenSCAD
    await module.callMain(args);

    // Read output file
    const outputData = module.FS.readFile(outputFile);

    // Clean up temporary files
    try {
      if (!mainFilePath || mainFilePath.startsWith('/tmp/')) {
        module.FS.unlink(inputFile);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    try {
      module.FS.unlink(outputFile);
    } catch (e) {
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
async function renderWithExport(scadContent, format) {
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
    } catch (e) {
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
 * Memory warning threshold (percentage)
 */
const MEMORY_WARNING_THRESHOLD = 80;

/**
 * Check memory usage and send warning if high
 * @param {string} requestId - Current request ID
 * @returns {Object} Memory usage info
 */
function checkMemoryBeforeRender(requestId) {
  if (!openscadModule || !openscadModule.HEAP8) {
    return { percent: 0, warning: false };
  }

  const used = openscadModule.HEAP8.length;
  const limit = 512 * 1024 * 1024; // 512MB default limit
  const percent = Math.round((used / limit) * 100);
  const usedMB = Math.round(used / 1024 / 1024);
  const limitMB = Math.round(limit / 1024 / 1024);

  if (percent >= MEMORY_WARNING_THRESHOLD) {
    self.postMessage({
      type: 'WARNING',
      payload: {
        requestId,
        code: 'HIGH_MEMORY',
        message: `Memory usage is high (${usedMB}MB of ${limitMB}MB, ${percent}%). Complex models may fail. Consider refreshing the page if renders are slow.`,
        severity: 'warning',
        memoryUsage: { used, limit, percent, usedMB, limitMB },
      },
    });
    return { percent, warning: true, usedMB, limitMB };
  }

  return { percent, warning: false, usedMB, limitMB };
}

/**
 * Render OpenSCAD to specified format
 */
async function render(payload) {
  const {
    requestId,
    scadContent,
    parameters,
    timeoutMs,
    files,
    outputFormat = 'stl',
    libraries,
    mainFile,
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

      await mountFiles(filesMap);

      self.postMessage({
        type: 'PROGRESS',
        payload: {
          requestId,
          percent: 20,
          message: 'Files mounted successfully',
        },
      });
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

    // Determine rendering strategy:
    // 1. If parameters are provided, use callMain with -D flags (Phase 1.2 requirement)
    // 2. If mainFile is specified (multi-file project), use file-based rendering
    // 3. Otherwise, use legacy renderToStl/renderToObj methods as fallback
    const useCallMainApproach =
      (parameters && Object.keys(parameters).length > 0) || mainFile;

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

      let outputData;

      if (useCallMainApproach) {
        // File-based rendering with -D flags via callMain
        console.log('[Worker] Using callMain approach with -D flags');

        // Determine main file path
        const mainFileToUse = mainFile || '/tmp/input.scad';

        // If mainFile is specified and exists in mounted files, use it directly
        // Otherwise, write scadContent to the filesystem
        if (!mainFile) {
          // Write to temporary location
          const module = await ensureOpenSCADModule();
          if (!module || !module.FS) {
            throw new Error('OpenSCAD filesystem not available');
          }
          try {
            module.FS.mkdir('/tmp');
          } catch (e) {
            // May already exist
          }
        }

        outputData = await renderWithCallMain(
          scadContent,
          parameters,
          format,
          mainFileToUse
        );
      } else {
        // Legacy approach: use renderToStl/renderToObj methods
        console.log('[Worker] Using legacy renderTo* methods');

        // Apply parameter overrides via source modification (fallback)
        const applied = applyOverrides(scadContent, parameters);
        const fullScadContent = applied.scad;

        // Call appropriate render method based on format
        // OpenSCAD WASM may support: renderToStl, renderToObj, renderToOff, renderToAmf, renderTo3mf
        switch (format) {
          case 'stl':
            outputData = await openscadInstance.renderToStl(fullScadContent);
            break;
          case 'obj':
            // Try renderToObj method if available
            if (typeof openscadInstance.renderToObj === 'function') {
              outputData = await openscadInstance.renderToObj(fullScadContent);
            } else {
              // Fallback: use writeFile approach
              outputData = await renderWithExport(fullScadContent, 'obj');
            }
            break;
          case 'off':
            if (typeof openscadInstance.renderToOff === 'function') {
              outputData = await openscadInstance.renderToOff(fullScadContent);
            } else {
              outputData = await renderWithExport(fullScadContent, 'off');
            }
            break;
          case 'amf':
            if (typeof openscadInstance.renderToAmf === 'function') {
              outputData = await openscadInstance.renderToAmf(fullScadContent);
            } else {
              outputData = await renderWithExport(fullScadContent, 'amf');
            }
            break;
          case '3mf':
            if (typeof openscadInstance.renderTo3mf === 'function') {
              outputData = await openscadInstance.renderTo3mf(fullScadContent);
            } else {
              outputData = await renderWithExport(fullScadContent, '3mf');
            }
            break;
          default:
            throw new Error(`Unsupported output format: ${format}`);
        }
      }

      self.postMessage({
        type: 'PROGRESS',
        payload: {
          requestId,
          percent: 95,
          message: `Processing ${formatName} output...`,
        },
      });

      return { data: outputData, format };
    })();

    // Race between render and timeout
    const result = await Promise.race([renderPromise, timeoutPromise]);
    const { data: outputData, format: resultFormat } = result;

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
        },
      },
      [outputBuffer]
    ); // Transfer ownership of ArrayBuffer

    console.log('[Worker] Render complete:', triangleCount, 'triangles');
  } catch (error) {
    // Clear timeout on error
    if (currentRenderTimeout) {
      clearTimeout(currentRenderTimeout);
      currentRenderTimeout = null;
    }

    console.error('[Worker] Render failed:', error);

    // Translate error to user-friendly message
    const errorMessage = error?.message || String(error);
    const translated = translateError(errorMessage);

    self.postMessage({
      type: 'ERROR',
      payload: {
        requestId,
        code: translated.code,
        message: translated.message,
        details: error?.stack || translated.raw,
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
 * Get current memory usage of the WASM heap
 * @returns {Object} Memory usage info
 */
function getMemoryUsage() {
  if (!openscadModule || !openscadModule.HEAP8) {
    return { used: 0, limit: 512 * 1024 * 1024, percent: 0, available: true };
  }

  const used = openscadModule.HEAP8.length;
  const limit = 512 * 1024 * 1024; // 512MB default limit
  const percent = Math.round((used / limit) * 100);

  return {
    used,
    limit,
    percent,
    available: true,
    usedMB: Math.round(used / 1024 / 1024),
    limitMB: Math.round(limit / 1024 / 1024),
  };
}

// Message handler
self.onmessage = async (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      await initWASM(payload?.assetBaseUrl);
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
