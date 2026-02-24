/**
 * Forge Project Manifest Loader
 *
 * Fetches and validates a forge-manifest.json from a remote URL,
 * downloads all referenced project files in parallel, and assembles
 * them into a project Map compatible with handleFile().
 *
 * Supports two loading modes:
 *  - Uncompressed: individual files declared in files.main / files.companions / files.presets
 *  - Bundle: a single .zip declared in files.bundle (extracted via zip-handler.js)
 *
 * This enables "one-link project sharing": an external author hosts
 * a manifest + files on GitHub (CORS-friendly) and generates a single
 * URL that opens Forge with everything pre-loaded.
 *
 * @license GPL-3.0-or-later
 * @see docs/research/PROJECT_SHARING_REFERENCES.md
 */

import { extractZipFiles } from './zip-handler.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Supported manifest schema versions */
const SUPPORTED_VERSIONS = ['1.0'];

/** Per-file fetch timeout (ms) */
const FETCH_TIMEOUT_MS = 30_000;

/** Maximum individual file size (bytes) — 50 MB */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Maximum total project size (bytes) — 500 MB */
const MAX_TOTAL_SIZE_BYTES = 500 * 1024 * 1024;

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
    const hasBundle =
      data.files.bundle !== undefined && data.files.bundle !== null;

    // files.bundle — optional .zip path; when present, files.main is optional
    if (hasBundle) {
      if (typeof data.files.bundle !== 'string' || !data.files.bundle) {
        errors.push(
          '"files.bundle" must be a non-empty string path to a .zip file'
        );
      } else if (!data.files.bundle.toLowerCase().endsWith('.zip')) {
        errors.push('"files.bundle" must point to a .zip file');
      }
    }

    // files.main — required unless files.bundle is present; must end in .scad
    if (!hasBundle) {
      if (!data.files.main || typeof data.files.main !== 'string') {
        errors.push(
          'Missing required field: "files.main" (path to .scad file)'
        );
      } else if (!data.files.main.toLowerCase().endsWith('.scad')) {
        errors.push('"files.main" must point to a .scad file');
      }
    } else if (data.files.main !== undefined) {
      // files.main is optional with bundle but must still be valid if present
      if (typeof data.files.main !== 'string' || !data.files.main) {
        errors.push('"files.main" must be a non-empty string when specified');
      } else if (!data.files.main.toLowerCase().endsWith('.scad')) {
        errors.push('"files.main" must point to a .scad file');
      }
    }

    // files.companions — optional array of strings (not used with bundle)
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

    // Count total files to prevent abuse (bundle counts as 1)
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
// Git LFS helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether text content is a Git LFS pointer file.
 *
 * An LFS pointer has the exact format:
 *   version https://git-lfs.github.com/spec/v1
 *   oid sha256:<64-hex-chars>
 *   size <bytes>
 *
 * @param {string} text  Content to inspect
 * @returns {{ oid: string, size: number } | null}  Parsed pointer or null
 */
export function detectLfsPointer(text) {
  if (!text.startsWith('version https://git-lfs.github.com/spec/v1'))
    return null;
  const oidMatch = text.match(/^oid sha256:([a-f0-9]{64})$/m);
  const sizeMatch = text.match(/^size (\d+)$/m);
  if (!oidMatch || !sizeMatch) return null;
  return { oid: oidMatch[1], size: parseInt(sizeMatch[1], 10) };
}

/**
 * Rewrite a raw.githubusercontent.com URL to the media.githubusercontent.com
 * equivalent that serves actual LFS file contents.
 *
 * raw:   https://raw.githubusercontent.com/OWNER/REPO/BRANCH/path
 * media: https://media.githubusercontent.com/media/OWNER/REPO/BRANCH/path
 *
 * Non-raw URLs are returned unchanged.
 *
 * @param {string} rawUrl
 * @returns {string}
 */
export function resolveGitHubLfsUrl(rawUrl) {
  return rawUrl.replace(
    'https://raw.githubusercontent.com/',
    'https://media.githubusercontent.com/media/'
  );
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
 * Fetch a binary file as a Blob with CORS-aware error handling.
 * Used for bundle (.zip) downloads.
 *
 * Transparently handles Git LFS pointer files: if raw.githubusercontent.com
 * returns a small text response that looks like an LFS pointer, the fetch is
 * retried against media.githubusercontent.com which serves the actual content.
 *
 * @param {string} url       Fully-resolved URL
 * @param {string} fileName  Human-readable name for error messages
 * @returns {Promise<Blob>}
 */
async function fetchBlob(url, fileName) {
  try {
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new ManifestError(
        `Failed to download "${fileName}": server returned ${response.status} ${response.statusText}`,
        'HTTP_ERROR',
        { status: response.status, url }
      );
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_TOTAL_SIZE_BYTES) {
      throw new ManifestError(
        `Bundle "${fileName}" exceeds the ${Math.round(MAX_TOTAL_SIZE_BYTES / (1024 * 1024))}MB size limit`,
        'FILE_TOO_LARGE',
        { url, size: parseInt(contentLength, 10) }
      );
    }

    // LFS pointer detection: raw.githubusercontent.com returns a ~130-byte
    // text file instead of the real binary when the file is LFS-tracked.
    // Detect this and re-fetch from media.githubusercontent.com.
    // Strategy: clone the response so we can read it as text without consuming
    // the original, then fall back to the original blob if not an LFS pointer.
    const rawSize = contentLength ? parseInt(contentLength, 10) : null;
    if (rawSize === null || rawSize < 1024) {
      const cloned = response.clone();
      const text = await cloned.text();
      const lfsPointer = detectLfsPointer(text);
      if (lfsPointer) {
        const mediaUrl = resolveGitHubLfsUrl(url);
        if (mediaUrl === url) {
          // URL was not a raw.githubusercontent.com URL — cannot redirect
          throw new ManifestError(
            `"${fileName}" is a Git LFS pointer but the URL is not a raw.githubusercontent.com URL. ` +
              `Ensure the file is hosted on GitHub and the manifest URL points to raw.githubusercontent.com.`,
            'LFS_POINTER',
            { url, oid: lfsPointer.oid, size: lfsPointer.size }
          );
        }
        return fetchBlob(mediaUrl, fileName);
      }
    }

    return await response.blob();
  } catch (error) {
    if (error instanceof ManifestError) throw error;

    if (error.name === 'TypeError') {
      throw new ManifestError(
        `Couldn't fetch bundle "${fileName}". The file may not be publicly accessible, ` +
          `or the server doesn't support CORS. ` +
          `Try hosting on GitHub (raw.githubusercontent.com includes CORS headers).`,
        'CORS_ERROR',
        { url }
      );
    }

    throw new ManifestError(
      `Network error fetching bundle "${fileName}": ${error.message}`,
      'NETWORK_ERROR',
      { url }
    );
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
 * A bundle counts as 1 file regardless of its contents.
 */
function countManifestFiles(files) {
  let count = 0;
  if (files.bundle) {
    count += 1;
  } else {
    if (files.main) count += 1;
    if (files.companions) count += files.companions.length;
    if (files.presets) {
      count += Array.isArray(files.presets) ? files.presets.length : 1;
    }
    if (files.assets) count += files.assets.length;
  }
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
  // Step 0: Reject placeholder / template URLs before hitting the network
  // ------------------------------------------------------------------
  const PLACEHOLDER_PATTERNS = [
    'YOUR_USERNAME',
    'YOUR_REPO',
    'YOUR_GITHUB_USERNAME',
    'OWNER',
    'REPOSITORY',
    '________',
  ];

  const upperUrl = manifestUrl.toUpperCase();
  const matchedPlaceholder = PLACEHOLDER_PATTERNS.find((p) =>
    upperUrl.includes(p)
  );
  if (matchedPlaceholder) {
    throw new ManifestError(
      `The manifest URL still contains the placeholder "${matchedPlaceholder}". ` +
        `Replace it with your actual GitHub username and repository name. ` +
        `See the Manifest Sharing Guide for details.`,
      'INVALID_URL',
      { url: manifestUrl, placeholder: matchedPlaceholder }
    );
  }

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
  // Bundle path: files.bundle is present — download zip and extract
  // ------------------------------------------------------------------
  if (manifestData.files.bundle) {
    return loadManifestBundle(manifestData, manifestUrl, progress);
  }

  // ------------------------------------------------------------------
  // Step 3: Build resolved file list (uncompressed path)
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

// ---------------------------------------------------------------------------
// Bundle loading helper
// ---------------------------------------------------------------------------

/**
 * Load a project from a manifest with `files.bundle` set.
 * Downloads the .zip, extracts it, and applies manifest defaults.
 *
 * @param {Object}   manifestData  Validated manifest object
 * @param {string}   manifestUrl   URL the manifest was fetched from
 * @param {function} progress      Progress callback
 * @returns {Promise<{manifest, projectFiles, mainFile, mainContent, defaults}>}
 */
async function loadManifestBundle(manifestData, manifestUrl, progress) {
  const bundlePath = manifestData.files.bundle;
  const bundleUrl = resolveFileUrl(bundlePath, manifestUrl);

  console.log(`[Manifest] Bundle path detected: ${bundlePath}`);

  progress({
    stage: 'download',
    message: `Downloading bundle ${bundlePath}...`,
    total: 1,
    completed: 0,
  });

  // Download the zip as a Blob
  const zipBlob = await fetchBlob(bundleUrl, bundlePath);

  progress({
    stage: 'download',
    message: `Downloaded ${bundlePath}, extracting...`,
    total: 1,
    completed: 1,
  });

  // Extract using the shared zip-handler
  let extracted;
  try {
    extracted = await extractZipFiles(zipBlob);
  } catch (error) {
    throw new ManifestError(
      `Failed to extract bundle "${bundlePath}": ${error.message}`,
      'BUNDLE_EXTRACT_ERROR',
      { url: bundleUrl }
    );
  }

  const projectFiles = extracted.files;
  let mainFile = extracted.mainFile;

  // If files.main is explicitly specified in the manifest, use it as override
  if (manifestData.files.main) {
    const override = manifestData.files.main;
    if (projectFiles.has(override)) {
      mainFile = override;
    } else {
      console.warn(
        `[Manifest] files.main override "${override}" not found in bundle — ` +
          `falling back to auto-detected main: "${mainFile}"`
      );
    }
  }

  const mainContent = projectFiles.get(mainFile) ?? null;

  console.log(
    `[Manifest] Bundle assembled: ${projectFiles.size} files, ` +
      `main="${mainFile}"`
  );

  progress({
    stage: 'complete',
    message: 'Project loaded from bundle manifest',
  });

  return {
    manifest: manifestData,
    projectFiles,
    mainFile,
    mainContent,
    defaults: manifestData.defaults || {},
  };
}
