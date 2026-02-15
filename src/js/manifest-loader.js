/**
 * Forge Project Manifest Loader
 *
 * Fetches and validates a forge-manifest.json from a remote URL,
 * downloads all referenced project files in parallel, and assembles
 * them into a project Map compatible with handleFile().
 *
 * This enables "one-link project sharing": an external author hosts
 * a manifest + files on GitHub (CORS-friendly) and generates a single
 * URL that opens Forge with everything pre-loaded.
 *
 * @license GPL-3.0-or-later
 * @see docs/research/PROJECT_SHARING_REFERENCES.md
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Supported manifest schema versions */
const SUPPORTED_VERSIONS = ['1.0'];

/** Per-file fetch timeout (ms) */
const FETCH_TIMEOUT_MS = 30_000;

/** Maximum individual file size (bytes) — 10 MB */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum total project size (bytes) — 50 MB */
const MAX_TOTAL_SIZE_BYTES = 50 * 1024 * 1024;

/** Maximum number of files a manifest may declare */
const MAX_FILE_COUNT = 50;

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Structured error for manifest loading failures.
 * `code` lets callers branch on error type without parsing messages.
 */
export class ManifestError extends Error {
  /**
   * @param {string} message  Human-readable description
   * @param {string} code     Machine-readable error code
   * @param {Object} [details] Optional context (URL, HTTP status, etc.)
   */
  constructor(message, code, details = null) {
    super(message);
    this.name = 'ManifestError';
    this.code = code;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

/**
 * Validate a parsed manifest object against the forge-manifest spec.
 *
 * @param {Object} data  Parsed JSON
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateManifest(data) {
  const errors = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['Manifest must be a JSON object'] };
  }

  // -- forgeManifest (required) -------------------------------------------
  if (!data.forgeManifest) {
    errors.push('Missing required field: "forgeManifest" (version string)');
  } else if (!SUPPORTED_VERSIONS.includes(String(data.forgeManifest))) {
    errors.push(
      `Unsupported manifest version "${data.forgeManifest}". ` +
        `Supported: ${SUPPORTED_VERSIONS.join(', ')}`
    );
  }

  // -- files (required) ---------------------------------------------------
  if (!data.files || typeof data.files !== 'object') {
    errors.push('Missing required field: "files"');
  } else {
    // files.main — required, must end in .scad
    if (!data.files.main || typeof data.files.main !== 'string') {
      errors.push('Missing required field: "files.main" (path to .scad file)');
    } else if (!data.files.main.toLowerCase().endsWith('.scad')) {
      errors.push('"files.main" must point to a .scad file');
    }

    // files.companions — optional array of strings
    if (data.files.companions !== undefined) {
      if (!Array.isArray(data.files.companions)) {
        errors.push('"files.companions" must be an array of file paths');
      } else if (!data.files.companions.every((f) => typeof f === 'string')) {
        errors.push('Each entry in "files.companions" must be a string');
      }
    }

    // files.presets — optional string or array of strings
    if (data.files.presets !== undefined) {
      const p = data.files.presets;
      if (typeof p === 'string') {
        // OK — single preset file
      } else if (Array.isArray(p)) {
        if (!p.every((f) => typeof f === 'string')) {
          errors.push('Each entry in "files.presets" must be a string');
        }
      } else {
        errors.push('"files.presets" must be a string or array of strings');
      }
    }

    // files.assets — optional array of strings
    if (data.files.assets !== undefined) {
      if (!Array.isArray(data.files.assets)) {
        errors.push('"files.assets" must be an array of file paths');
      } else if (!data.files.assets.every((f) => typeof f === 'string')) {
        errors.push('Each entry in "files.assets" must be a string');
      }
    }

    // Count total files to prevent abuse
    const totalFiles = countManifestFiles(data.files);
    if (totalFiles > MAX_FILE_COUNT) {
      errors.push(
        `Manifest declares ${totalFiles} files (max ${MAX_FILE_COUNT})`
      );
    }
  }

  // -- defaults — optional object -----------------------------------------
  if (data.defaults !== undefined && typeof data.defaults !== 'object') {
    errors.push('"defaults" must be an object');
  }

  // -- Optional metadata — type-check only --------------------------------
  if (data.name !== undefined && typeof data.name !== 'string') {
    errors.push('"name" must be a string');
  }
  if (data.author !== undefined && typeof data.author !== 'string') {
    errors.push('"author" must be a string');
  }
  if (data.id !== undefined && typeof data.id !== 'string') {
    errors.push('"id" must be a string');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// URL resolution helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a file path relative to a manifest URL.
 *
 * Already-absolute URLs (http/https) are returned as-is.
 * Directory traversal ("..") is rejected for security.
 *
 * @param {string} filePath     Relative (or absolute) file path
 * @param {string} manifestUrl  The URL the manifest was fetched from
 * @returns {string} Fully-resolved URL
 */
export function resolveFileUrl(filePath, manifestUrl) {
  // Allow absolute URLs
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }

  // Reject directory traversal
  if (filePath.includes('..')) {
    throw new ManifestError(
      `Suspicious path in manifest: "${filePath}" — directory traversal is not allowed`,
      'INVALID_PATH'
    );
  }

  return new URL(filePath, manifestUrl).href;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/**
 * Fetch with an AbortController-based timeout.
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      throw new ManifestError(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s: ${url}`,
        'TIMEOUT',
        { url }
      );
    }
    throw error;
  }
}

/**
 * Fetch a single file with CORS-aware error handling.
 *
 * @param {string} url       Fully-resolved URL
 * @param {string} fileName  Human-readable name for error messages
 * @returns {Promise<string>} File content as text
 */
async function fetchFile(url, fileName) {
  try {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new ManifestError(
        `Failed to download "${fileName}": server returned ${response.status} ${response.statusText}`,
        'HTTP_ERROR',
        { status: response.status, url }
      );
    }

    // Guard against unexpectedly large responses
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE_BYTES) {
      throw new ManifestError(
        `File "${fileName}" exceeds the ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB size limit`,
        'FILE_TOO_LARGE',
        { url, size: parseInt(contentLength, 10) }
      );
    }

    return await response.text();
  } catch (error) {
    if (error instanceof ManifestError) throw error;

    // `fetch()` throws a TypeError for network/CORS failures
    if (error.name === 'TypeError') {
      throw new ManifestError(
        `Couldn't fetch "${fileName}". The file may not be publicly accessible, ` +
          `or the server doesn't support CORS. ` +
          `Try hosting on GitHub (raw.githubusercontent.com includes CORS headers).`,
        'CORS_ERROR',
        { url }
      );
    }

    throw new ManifestError(
      `Network error fetching "${fileName}": ${error.message}`,
      'NETWORK_ERROR',
      { url }
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Count total files declared in a manifest's `files` block.
 */
function countManifestFiles(files) {
  let count = 0;
  if (files.main) count += 1;
  if (files.companions) count += files.companions.length;
  if (files.presets) {
    count += Array.isArray(files.presets) ? files.presets.length : 1;
  }
  if (files.assets) count += files.assets.length;
  return count;
}

/**
 * Build the list of { path, url, kind } entries from a validated manifest.
 */
function buildFileList(files, manifestUrl) {
  const list = [];

  // Main .scad file
  list.push({
    path: files.main,
    url: resolveFileUrl(files.main, manifestUrl),
    kind: 'main',
  });

  // Companion files (e.g. openings_and_additions.txt)
  if (files.companions) {
    for (const companion of files.companions) {
      list.push({
        path: companion,
        url: resolveFileUrl(companion, manifestUrl),
        kind: 'companion',
      });
    }
  }

  // Preset JSON files
  if (files.presets) {
    const presetPaths = Array.isArray(files.presets)
      ? files.presets
      : [files.presets];
    for (const preset of presetPaths) {
      list.push({
        path: preset,
        url: resolveFileUrl(preset, manifestUrl),
        kind: 'preset',
      });
    }
  }

  // Asset files (SVG, etc.)
  if (files.assets) {
    for (const asset of files.assets) {
      list.push({
        path: asset,
        url: resolveFileUrl(asset, manifestUrl),
        kind: 'asset',
      });
    }
  }

  return list;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Load a complete project from a forge-manifest.json URL.
 *
 * Returns a project Map (compatible with the ZIP extraction path in
 * handleFile) plus the parsed manifest and its defaults.
 *
 * @param {string} manifestUrl  URL to forge-manifest.json
 * @param {Object} [options]
 * @param {function} [options.onProgress]  Progress callback
 * @returns {Promise<{
 *   manifest: Object,
 *   projectFiles: Map<string, string>,
 *   mainFile: string,
 *   mainContent: string,
 *   defaults: Object
 * }>}
 */
export async function loadManifest(manifestUrl, { onProgress } = {}) {
  const progress = onProgress || (() => {});

  // ------------------------------------------------------------------
  // Step 1: Fetch the manifest itself
  // ------------------------------------------------------------------
  progress({
    stage: 'manifest',
    message: 'Fetching project manifest...',
  });

  let manifestData;
  try {
    const raw = await fetchFile(manifestUrl, 'forge-manifest.json');
    manifestData = JSON.parse(raw);
  } catch (error) {
    if (error instanceof ManifestError) throw error;
    throw new ManifestError(
      `Invalid manifest JSON: ${error.message}`,
      'PARSE_ERROR'
    );
  }

  // ------------------------------------------------------------------
  // Step 2: Validate
  // ------------------------------------------------------------------
  progress({ stage: 'validate', message: 'Validating manifest...' });

  const validation = validateManifest(manifestData);
  if (!validation.valid) {
    throw new ManifestError(
      `Invalid manifest:\n• ${validation.errors.join('\n• ')}`,
      'VALIDATION_ERROR',
      { errors: validation.errors }
    );
  }

  // ------------------------------------------------------------------
  // Step 3: Build resolved file list
  // ------------------------------------------------------------------
  const filesToFetch = buildFileList(manifestData.files, manifestUrl);

  console.log(
    `[Manifest] Downloading ${filesToFetch.length} file(s) from:`,
    manifestUrl
  );

  // ------------------------------------------------------------------
  // Step 4: Fetch all files in parallel
  // ------------------------------------------------------------------
  progress({
    stage: 'download',
    message: `Downloading ${filesToFetch.length} file(s)...`,
    total: filesToFetch.length,
    completed: 0,
  });

  let completedCount = 0;
  let totalBytes = 0;

  const fetchPromises = filesToFetch.map(async (entry) => {
    const content = await fetchFile(entry.url, entry.path);
    totalBytes += content.length;

    if (totalBytes > MAX_TOTAL_SIZE_BYTES) {
      throw new ManifestError(
        `Total project size exceeds ${Math.round(MAX_TOTAL_SIZE_BYTES / (1024 * 1024))}MB limit`,
        'PROJECT_TOO_LARGE'
      );
    }

    completedCount++;
    progress({
      stage: 'download',
      message: `Downloaded ${entry.path} (${completedCount}/${filesToFetch.length})`,
      total: filesToFetch.length,
      completed: completedCount,
    });

    return { ...entry, content };
  });

  // Use allSettled so we can report *which* files failed
  const results = await Promise.allSettled(fetchPromises);
  const failures = results.filter((r) => r.status === 'rejected');

  if (failures.length > 0) {
    // Throw the first failure — its message already contains the file name
    throw failures[0].reason;
  }

  const fetchedFiles = results.map((r) => r.value);

  // ------------------------------------------------------------------
  // Step 5: Assemble project Map (same format as extractZipFiles)
  // ------------------------------------------------------------------
  const projectFiles = new Map();
  let mainFile = null;
  let mainContent = null;

  for (const file of fetchedFiles) {
    projectFiles.set(file.path, file.content);
    if (file.kind === 'main') {
      mainFile = file.path;
      mainContent = file.content;
    }
  }

  console.log(
    `[Manifest] Project assembled: ${projectFiles.size} files, ` +
      `main="${mainFile}", ${Math.round(totalBytes / 1024)}KB total`
  );

  progress({ stage: 'complete', message: 'Project loaded from manifest' });

  return {
    manifest: manifestData,
    projectFiles,
    mainFile,
    mainContent,
    defaults: manifestData.defaults || {},
  };
}
