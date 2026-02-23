/**
 * Dependency Checker - Parse SCAD files for include/use/import dependencies
 * Show actionable warning when include/use/import files are missing
 * @license GPL-3.0-or-later
 */

/**
 * Parse SCAD file for dependencies (best-effort regex, not full parser)
 * @param {string} scadContent - OpenSCAD source code
 * @returns {Object} Dependencies found
 */
export function extractDependencies(scadContent) {
  const dependencies = {
    includes: [], // include <file.txt>
    uses: [], // use <file.scad>
    imports: [], // import("file.svg")
  };

  if (!scadContent) return dependencies;

  // Match include <filename> or include "filename"
  // Handles various extensions: .txt, .scad, .json, etc.
  const includeRegex = /include\s*[<"]([^>"]+)[>"]/g;
  let match;
  while ((match = includeRegex.exec(scadContent)) !== null) {
    const filename = match[1].trim();
    if (filename && !dependencies.includes.includes(filename)) {
      dependencies.includes.push(filename);
    }
  }

  // Match use <filename> or use "filename"
  const useRegex = /use\s*[<"]([^>"]+)[>"]/g;
  while ((match = useRegex.exec(scadContent)) !== null) {
    const filename = match[1].trim();
    if (filename && !dependencies.uses.includes(filename)) {
      dependencies.uses.push(filename);
    }
  }

  // Match import("filename") - for SVG, STL, etc.
  const importRegex = /import\s*\(\s*["']([^"']+)["']\s*(?:,\s*[^)]+)?\)/g;
  while ((match = importRegex.exec(scadContent)) !== null) {
    const filename = match[1].trim();
    if (filename && !dependencies.imports.includes(filename)) {
      dependencies.imports.push(filename);
    }
  }

  return dependencies;
}

/**
 * Check if all dependencies are present in uploaded files
 * @param {Object} dependencies - From extractDependencies()
 * @param {string[]} uploadedFilenames - Names of uploaded files
 * @param {Object} options - Check options
 * @param {Set<string>} [options.availableLibraries] - Libraries loaded in app
 * @returns {Object} Missing files report
 */
export function checkDependencies(
  dependencies,
  uploadedFilenames,
  options = {}
) {
  const { availableLibraries = new Set() } = options;

  // Create case-insensitive lookup of uploaded files
  const uploadedLower = new Set(uploadedFilenames.map((f) => f.toLowerCase()));
  const uploadedBasenames = new Set(
    uploadedFilenames.map((f) => {
      const parts = f.split('/');
      return parts[parts.length - 1].toLowerCase();
    })
  );

  const missing = {
    includes: [],
    uses: [],
    imports: [],
  };

  // Check includes
  for (const file of dependencies.includes) {
    const lower = file.toLowerCase();
    const basename = lower.split('/').pop();

    // Check if file exists (full path or just basename)
    if (
      !uploadedLower.has(lower) &&
      !uploadedBasenames.has(basename) &&
      !isLibraryPath(file, availableLibraries)
    ) {
      missing.includes.push(file);
    }
  }

  // Check uses
  for (const file of dependencies.uses) {
    const lower = file.toLowerCase();
    const basename = lower.split('/').pop();

    if (
      !uploadedLower.has(lower) &&
      !uploadedBasenames.has(basename) &&
      !isLibraryPath(file, availableLibraries)
    ) {
      missing.uses.push(file);
    }
  }

  // Check imports (SVG, STL, etc.)
  for (const file of dependencies.imports) {
    const lower = file.toLowerCase();
    const basename = lower.split('/').pop();

    if (!uploadedLower.has(lower) && !uploadedBasenames.has(basename)) {
      missing.imports.push(file);
    }
  }

  const hasMissing =
    missing.includes.length > 0 ||
    missing.uses.length > 0 ||
    missing.imports.length > 0;

  return { hasMissing, missing };
}

/**
 * Check if a path refers to a library that's available in the app
 * @param {string} path - File path from include/use
 * @param {Set<string>} availableLibraries - Set of library names
 * @returns {boolean}
 */
function isLibraryPath(path, availableLibraries) {
  // Common OpenSCAD library paths
  const libraryPrefixes = ['MCAD/', 'BOSL/', 'BOSL2/', 'Round-Anything/'];

  for (const prefix of libraryPrefixes) {
    if (path.startsWith(prefix)) {
      const libName = prefix.replace('/', '');
      return availableLibraries.has(libName.toLowerCase());
    }
  }

  return false;
}

/**
 * Recursively scan all SCAD files for dependencies
 * @param {Map<string, string>} files - Map of filename to content
 * @param {string} mainFile - Entry point file
 * @returns {Object} All dependencies found across all files
 */
export function scanAllDependencies(files, mainFile) {
  const allDependencies = {
    includes: new Set(),
    uses: new Set(),
    imports: new Set(),
  };

  const scanned = new Set();

  function scanFile(filename) {
    if (scanned.has(filename)) return;
    scanned.add(filename);

    const content = files.get(filename);
    if (!content) return;

    const deps = extractDependencies(content);

    // Add to all dependencies
    deps.includes.forEach((f) => allDependencies.includes.add(f));
    deps.uses.forEach((f) => allDependencies.uses.add(f));
    deps.imports.forEach((f) => allDependencies.imports.add(f));

    // Recursively scan included/used files that exist
    [...deps.includes, ...deps.uses].forEach((depFile) => {
      // Check if this file exists in the uploaded files
      const normalizedPath = normalizeDepPath(depFile, filename);
      if (files.has(normalizedPath)) {
        scanFile(normalizedPath);
      } else if (files.has(depFile)) {
        scanFile(depFile);
      }
    });
  }

  scanFile(mainFile);

  return {
    includes: Array.from(allDependencies.includes),
    uses: Array.from(allDependencies.uses),
    imports: Array.from(allDependencies.imports),
  };
}

/**
 * Normalize dependency path relative to the file containing it
 * @param {string} depPath - Path from include/use statement
 * @param {string} containingFile - File that has the include/use
 * @returns {string} Normalized path
 */
function normalizeDepPath(depPath, containingFile) {
  // If absolute path (starts with /), return as-is
  if (depPath.startsWith('/')) {
    return depPath.slice(1);
  }

  // Get directory of containing file
  const containingDir = containingFile.includes('/')
    ? containingFile.substring(0, containingFile.lastIndexOf('/'))
    : '';

  if (!containingDir) {
    return depPath;
  }

  // Resolve relative path
  const parts = (containingDir + '/' + depPath).split('/');
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
 * Generate user-friendly message for missing dependencies
 * @param {Object} missing - From checkDependencies()
 * @returns {string} Human-readable message
 */
export function formatMissingDependencies(missing) {
  const parts = [];

  if (missing.includes.length > 0) {
    parts.push(`Include files: ${missing.includes.join(', ')}`);
  }
  if (missing.uses.length > 0) {
    parts.push(`Library files: ${missing.uses.join(', ')}`);
  }
  if (missing.imports.length > 0) {
    parts.push(`Import files: ${missing.imports.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Create preflight check result for UI display
 * @param {string} scadContent - Main SCAD file content
 * @param {string[]} uploadedFilenames - All uploaded filenames
 * @param {Object} options - Check options
 * @returns {Object} Preflight result
 */
export function runPreflightCheck(
  scadContent,
  uploadedFilenames,
  options = {}
) {
  const dependencies = extractDependencies(scadContent);
  const { hasMissing, missing } = checkDependencies(
    dependencies,
    uploadedFilenames,
    options
  );

  const totalDependencies =
    dependencies.includes.length +
    dependencies.uses.length +
    dependencies.imports.length;

  const totalMissing =
    missing.includes.length + missing.uses.length + missing.imports.length;

  return {
    success: !hasMissing,
    totalDependencies,
    totalMissing,
    dependencies,
    missing,
    message: hasMissing
      ? `Missing ${totalMissing} required file${totalMissing > 1 ? 's' : ''}`
      : totalDependencies > 0
        ? `All ${totalDependencies} dependencies found`
        : 'No external dependencies',
  };
}
