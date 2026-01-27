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

    // Extract all files
    for (const [relativePath, zipEntry] of Object.entries(zipData.files)) {
      // Skip directories
      if (zipEntry.dir) continue;

      // Extract file content as text
      const content = await zipEntry.async('text');

      // Normalize path (remove leading slashes, convert backslashes)
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

    return { files, mainFile };
  } catch (error) {
    console.error('[ZIP] Extraction failed:', error);
    throw new Error(`Failed to extract ZIP file: ${error.message}`);
  }
}

/**
 * Detect the main .scad file from a list of candidates
 * Strategy:
 * 1. Look for "main.scad" or files with "main" in the name
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

  // Strategy 2: Look for files with "main" in the name
  const mainNamed = scadFiles.find((path) =>
    path.toLowerCase().includes('main')
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
