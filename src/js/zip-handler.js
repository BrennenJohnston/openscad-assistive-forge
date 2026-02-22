/**
 * ZIP File Handler - Extract and manage multi-file OpenSCAD projects
 * @license GPL-3.0-or-later
 */

import JSZip from 'jszip';
import { escapeHtml } from './html-utils.js';

/**
 * Extract files from a ZIP archive
 * @param {File|Blob} zipFile - ZIP file to extract
 * @returns {Promise<{files: Map<string, string>, mainFile: string}>}
 */
export async function extractZipFiles(zipFile) {
  try {
    const zip = new JSZip();
    const zipData = await zip.loadAsync(zipFile);

    const files = new Map();
    let mainFile = null;
    const scadFiles = [];

    // Image file types: extracted as base64 data URLs so the preview layer
    // and THREE.js overlay renderer can consume them directly.
    const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

    // Non-image binary types that cannot be stored as text strings and are
    // not used by the OpenSCAD WASM renderer. Extracting these as UTF-8 text
    // would corrupt their content and waste significant memory.
    const BINARY_ONLY_EXTS = new Set([
      'bmp',
      'tiff',
      'tif',
      'ico',
      'stl',
      'obj',
      'amf',
      '3mf',
      'wrl',
      'zip',
      'gz',
      'tar',
      'mp4',
      'mp3',
      'wav',
      'avi',
      'mov',
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
    ]);

    // Extract all files
    for (const [relativePath, zipEntry] of Object.entries(zipData.files)) {
      // Skip directories
      if (zipEntry.dir) continue;

      // Normalize path early so it is available for all extraction branches
      const normalizedPath = relativePath
        .replace(/^\/+/, '')
        .replace(/\\/g, '/');

      // Security: Reject paths with directory traversal attempts
      if (
        normalizedPath.includes('..') ||
        normalizedPath.startsWith('/') ||
        normalizedPath.includes('\\')
      ) {
        console.warn(
          `[ZIP] Skipping potentially malicious path: ${relativePath}`
        );
        continue;
      }

      const extMatch = normalizedPath.match(/\.([^./\\]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : '';

      // Extract image files as base64 data URLs (binary-safe)
      if (IMAGE_EXTS.has(ext)) {
        const base64Data = await zipEntry.async('base64');
        const mime = ext === 'jpg' ? 'jpeg' : ext;
        files.set(normalizedPath, `data:image/${mime};base64,${base64Data}`);
        console.log(
          `[ZIP] Extracted image: ${normalizedPath} (${base64Data.length} base64 chars)`
        );
        continue;
      }

      // Skip non-image binary files
      if (BINARY_ONLY_EXTS.has(ext)) {
        console.log(
          `[ZIP] Skipping binary file (not usable as text): ${relativePath}`
        );
        continue;
      }

      // Extract file content as text
      const content = await zipEntry.async('text');
      files.set(normalizedPath, content);

      // Track .scad files for main file detection
      if (normalizedPath.endsWith('.scad')) {
        scadFiles.push(normalizedPath);
      }

      console.log(
        `[ZIP] Extracted: ${normalizedPath} (${content.length} bytes)`
      );
    }

    // Detect main file
    mainFile = detectMainFile(scadFiles, files);

    if (!mainFile) {
      throw new Error('No .scad files found in ZIP archive');
    }

    console.log(`[ZIP] Main file detected: ${mainFile}`);
    console.log(`[ZIP] Total files extracted: ${files.size}`);

    // Diagnostic: classify each extracted file by type and size
    const fileClassification = {};
    for (const [filePath, content] of files.entries()) {
      const ext = filePath.split('.').pop()?.toLowerCase() || 'unknown';
      if (!fileClassification[ext])
        fileClassification[ext] = { count: 0, totalBytes: 0 };
      fileClassification[ext].count++;
      fileClassification[ext].totalBytes += content.length;
    }
    console.debug('[ZIP] File classification:', fileClassification);

    return { files, mainFile };
  } catch (error) {
    console.error('[ZIP] Extraction failed:', error);
    throw new Error(`Failed to extract ZIP file: ${error.message}`);
  }
}

/**
 * Detect the main .scad file from a list of candidates
 * Strategy:
 * 1. Look for "main.scad" or files with "main" in the filename
 * 2. Look for files in the root directory (no subdirectories)
 * 3. Look for the first .scad file with Customizer annotations
 * 4. Fall back to the first .scad file alphabetically
 *
 * @param {string[]} scadFiles - List of .scad file paths
 * @param {Map<string, string>} files - All extracted files
 * @returns {string|null} - Path to main file
 */
function detectMainFile(scadFiles, files) {
  if (scadFiles.length === 0) return null;
  if (scadFiles.length === 1) return scadFiles[0];

  // Strategy 1: Look for "main.scad"
  const mainScad = scadFiles.find(
    (path) =>
      path.toLowerCase() === 'main.scad' ||
      path.toLowerCase().endsWith('/main.scad')
  );
  if (mainScad) return mainScad;

  // Strategy 2: Look for files with "main" in the filename (basename only)
  const mainNamed = scadFiles.find((path) =>
    path.split('/').pop().toLowerCase().includes('main')
  );
  if (mainNamed) return mainNamed;

  // Strategy 3: Prefer root directory files
  const rootFiles = scadFiles.filter((path) => !path.includes('/'));
  if (rootFiles.length === 1) return rootFiles[0];

  // Strategy 4: Look for Customizer annotations
  for (const path of rootFiles.length > 0 ? rootFiles : scadFiles) {
    const content = files.get(path);
    if (content && hasCustomizerAnnotations(content)) {
      return path;
    }
  }

  // Strategy 5: Fall back to first file (prefer root, then alphabetical)
  return rootFiles.length > 0 ? rootFiles.sort()[0] : scadFiles.sort()[0];
}

/**
 * Check if a .scad file contains Customizer annotations
 * @param {string} content - File content
 * @returns {boolean}
 */
function hasCustomizerAnnotations(content) {
  // Look for common Customizer patterns
  const patterns = [
    /\/\*\s*\[.*?\]\s*\*\//, // /*[Group]*/
    /\/\/\s*\[.*?\]/, // // [min:max] or // [opt1, opt2]
  ];

  return patterns.some((pattern) => pattern.test(content));
}

/**
 * Validate ZIP file before extraction
 * @param {File} file - File to validate
 * @returns {{valid: boolean, error?: string}}
 */
import { FILE_SIZE_LIMITS } from './validation-constants.js';

export function validateZipFile(file) {
  // Check file extension
  if (!file.name.toLowerCase().endsWith('.zip')) {
    return { valid: false, error: 'File must have .zip extension' };
  }

  // Check file size using shared constant
  if (file.size > FILE_SIZE_LIMITS.ZIP_FILE) {
    const limitMB = FILE_SIZE_LIMITS.ZIP_FILE / (1024 * 1024);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `ZIP file exceeds ${limitMB}MB limit (${fileSizeMB}MB)`,
    };
  }

  // Check for empty file
  if (file.size === 0) {
    return { valid: false, error: 'ZIP file is empty' };
  }

  return { valid: true };
}

/**
 * Create a file tree structure for display
 * @param {Map<string, string>} files - Extracted files
 * @param {string} mainFile - Main .scad file path
 * @returns {string} - HTML representation of file tree
 */
export function createFileTree(files, mainFile) {
  const fileList = Array.from(files.keys()).sort();

  const items = fileList.map((path) => {
    const isMain = path === mainFile;
    const icon = path.endsWith('.scad') ? '📄' : '📎';
    const badge = isMain ? ' <span class="file-tree-badge">main</span>' : '';
    const className = isMain ? 'file-tree-item main' : 'file-tree-item';

    // Escape path to prevent XSS attacks from malicious ZIP file names
    return `<div class="${className}">${icon} ${escapeHtml(path)}${badge}</div>`;
  });

  return `
    <div class="file-tree">
      <div class="file-tree-header">📦 ZIP Contents (${files.size} files)</div>
      ${items.join('')}
    </div>
  `;
}

/**
 * Resolve include/use paths relative to a base file
 * @param {string} statement - include/use statement (e.g., 'include <utils/helpers.scad>')
 * @param {string} currentFile - Path of file containing the statement
 * @returns {string} - Resolved absolute path
 */
export function resolveIncludePath(statement, currentFile) {
  // Extract path from include/use statement
  // Matches: include <path>, include "path", use <path>, use "path"
  const match = statement.match(/(?:include|use)\s*[<"]([^>"]+)[>"]/);
  if (!match) return null;

  const includePath = match[1];

  // If absolute path (starts with /), use as-is
  if (includePath.startsWith('/')) {
    return includePath.slice(1); // Remove leading slash
  }

  // Resolve relative to current file's directory
  const currentDir = currentFile.includes('/')
    ? currentFile.substring(0, currentFile.lastIndexOf('/'))
    : '';

  if (!currentDir) {
    // Current file is in root, so relative path is the include path
    return includePath;
  }

  // Join paths and normalize
  const resolved = currentDir + '/' + includePath;
  return normalizePath(resolved);
}

/**
 * Normalize a file path (resolve .. and .)
 * @param {string} path
 * @returns {string}
 */
function normalizePath(path) {
  const parts = path.split('/');
  const result = [];

  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      result.pop();
    } else {
      result.push(part);
    }
  }

  return result.join('/');
}

/**
 * Scan a .scad file for include/use statements
 * @param {string} content - File content
 * @returns {string[]} - Array of include/use statements
 */
export function scanIncludes(content) {
  const includePattern = /(?:include|use)\s*[<"][^>"]+[>"]/g;
  const matches = content.match(includePattern) || [];
  return matches;
}

/**
 * Resolve a file from projectFiles by exact key or basename fallback.
 * Pure function with no side effects — safe to unit-test in isolation.
 *
 * Resolution order:
 *  1. Exact key match (returns immediately)
 *  2. Basename match (segment after last '/') — succeeds only when exactly
 *     one file in the Map has that basename; returns null when ambiguous.
 *
 * @param {Map<string, string>} projectFiles
 * @param {string} filename - Exact key or bare filename to resolve
 * @returns {{ key: string, content: string } | null}
 */
export function resolveProjectFile(projectFiles, filename) {
  if (!projectFiles || !filename) return null;

  if (projectFiles.has(filename)) {
    return { key: filename, content: projectFiles.get(filename) };
  }

  const matches = [];
  for (const key of projectFiles.keys()) {
    const basename = key.includes('/') ? key.split('/').pop() : key;
    if (basename === filename) matches.push(key);
  }

  if (matches.length === 1) {
    return { key: matches[0], content: projectFiles.get(matches[0]) };
  }

  if (matches.length > 1) {
    console.warn(
      `[resolveProjectFile] "${filename}" matches ${matches.length} paths — ` +
        'cannot auto-select. Require explicit user selection or preset mapping.'
    );
  }

  return null;
}

/**
 * Build a runtime mapping from preset names to their specific companion file
 * paths inside the projectFiles Map. Uses token-scoring heuristics so that
 * e.g. preset "iPad 7,8,9 - Fintie - TouchChat" maps to
 * "Cases and App Specifics/iPad 7,8,9/Fintie/TouchChat/openings_and_additions.txt".
 *
 * Only basenames that appear at MULTIPLE paths (aliasable) are considered for
 * the openings file mapping. Single-instance files need no alias.
 *
 * Returns path references only — no file content is duplicated.
 *
 * @param {Map<string, string>} files - All project files from ZIP extraction
 * @param {Object} parameterSets - OpenSCAD parameterSets object { "preset name": {...} }
 * @returns {Map<string, { openingsPath: string|null, svgPath: string|null }>}
 */
export function buildPresetCompanionMap(files, parameterSets) {
  const result = new Map();
  if (!files || !parameterSets) return result;

  const presetNames = Object.keys(parameterSets).filter(
    (n) => n !== 'design default values'
  );
  if (presetNames.length === 0) return result;

  // Group all file paths by basename
  const byBasename = new Map();
  for (const key of files.keys()) {
    const basename = key.split('/').pop();
    if (!byBasename.has(basename)) byBasename.set(basename, []);
    byBasename.get(basename).push(key);
  }

  // Aliasable basenames: same filename appears under multiple paths
  const aliasableBasenames = new Map();
  for (const [basename, paths] of byBasename.entries()) {
    if (paths.length > 1) aliasableBasenames.set(basename, paths);
  }

  // All SVG paths in the project
  const svgPaths = Array.from(files.keys()).filter((k) =>
    k.toLowerCase().endsWith('.svg')
  );

  // Tokenise a preset name into meaningful lowercase substrings
  function tokenise(name) {
    return name
      .toLowerCase()
      .split(/[\s\-_/,().]+/)
      .filter((t) => t.length > 1);
  }

  // Count how many tokens from the preset name appear in a candidate path
  function scorePath(path, tokens) {
    const lower = path.toLowerCase();
    return tokens.filter((t) => lower.includes(t)).length;
  }

  // Return the single best-scoring candidate, or null when ambiguous/no match.
  // Prefer deeper (longer) paths when scores are tied.
  function pickBest(candidates, tokens) {
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) {
      return scorePath(candidates[0], tokens) > 0 ? candidates[0] : null;
    }
    const scored = candidates
      .map((p) => ({ path: p, score: scorePath(p, tokens) }))
      .sort((a, b) => b.score - a.score || b.path.length - a.path.length);
    if (scored[0].score === 0) return null;
    if (scored[0].score === scored[1].score) return null; // ambiguous
    return scored[0].path;
  }

  for (const presetName of presetNames) {
    const tokens = tokenise(presetName);

    let openingsPath = null;
    const openingsCandidates = aliasableBasenames.get(
      'openings_and_additions.txt'
    );
    if (openingsCandidates) {
      openingsPath = pickBest(openingsCandidates, tokens);
      if (!openingsPath) {
        console.warn(
          `[PresetCompanionMap] Cannot unambiguously resolve openings path for preset: "${presetName}"`
        );
      }
    }

    let svgPath = null;
    if (svgPaths.length === 1) {
      svgPath = svgPaths[0];
    } else if (svgPaths.length > 1) {
      svgPath = pickBest(svgPaths, tokens);
      if (!svgPath) {
        console.warn(
          `[PresetCompanionMap] Cannot unambiguously resolve SVG path for preset: "${presetName}"`
        );
      }
    }

    result.set(presetName, { openingsPath, svgPath });
  }

  const mappedCount = Array.from(result.values()).filter(
    (v) => v.openingsPath !== null
  ).length;
  console.log(
    `[PresetCompanionMap] Mapped ${mappedCount}/${presetNames.length} presets to openings paths`
  );

  return result;
}

/**
 * Apply companion file alias mounting to a projectFiles Map.
 * Copies preset-specific file content from nested paths to the root-level
 * keys that SCAD include/import statements resolve to.
 *
 * Pure function — returns a new Map without mutating the input.
 *
 * @param {Map<string, string>} projectFiles
 * @param {{ openingsPath: string|null, svgPath: string|null }|null} companionMapping
 * @returns {Map<string, string>}
 */
export function applyCompanionAliases(projectFiles, companionMapping) {
  const result = new Map(projectFiles);
  if (!companionMapping) return result;

  if (
    companionMapping.openingsPath &&
    result.has(companionMapping.openingsPath)
  ) {
    result.set(
      'openings_and_additions.txt',
      result.get(companionMapping.openingsPath)
    );
  }
  if (companionMapping.svgPath && result.has(companionMapping.svgPath)) {
    result.set('default.svg', result.get(companionMapping.svgPath));
  }

  return result;
}

/**
 * Get file statistics for a ZIP project
 * @param {Map<string, string>} files - Extracted files
 * @returns {Object} - Statistics
 */
export function getZipStats(files) {
  const scadFiles = [];
  const otherFiles = [];
  let totalSize = 0;

  for (const [path, content] of files.entries()) {
    totalSize += content.length;

    if (path.endsWith('.scad')) {
      scadFiles.push(path);
    } else {
      otherFiles.push(path);
    }
  }

  return {
    totalFiles: files.size,
    scadFiles: scadFiles.length,
    otherFiles: otherFiles.length,
    totalSize,
    scadFilesList: scadFiles,
    otherFilesList: otherFiles,
  };
}
