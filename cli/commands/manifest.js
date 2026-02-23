/**
 * Manifest command - Auto-generate forge-manifest.json from a local folder or .zip
 * @license GPL-3.0-or-later
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from 'fs';
import { resolve, basename, extname, relative } from 'path';
import chalk from 'chalk';
import JSZip from 'jszip';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Extensions treated as companion files (not presets, not main) */
const COMPANION_EXTS = new Set(['.txt', '.svg', '.csv', '.dxf']);

/** Extensions that are likely preset files */
const PRESET_EXT = '.json';

/** Basename patterns that suggest a preset file */
const PRESET_NAME_HINTS = ['preset', 'presets', 'params', 'parameters', 'config'];

// ---------------------------------------------------------------------------
// File scanning helpers
// ---------------------------------------------------------------------------

/**
 * Walk a directory recursively and collect all file paths (forward-slash, relative).
 *
 * @param {string} dir     Absolute path to directory
 * @param {string} [base]  Base path for relative output (defaults to dir)
 * @returns {string[]}     Relative file paths with forward slashes
 */
function walkDir(dir, base = dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      results.push(...walkDir(full, base));
    } else if (entry.isFile()) {
      const rel = relative(base, full).replace(/\\/g, '/');
      results.push(rel);
    }
  }

  return results;
}

/**
 * Apply the same main-file detection heuristics used by the app's zip-handler.
 * Re-implemented here to avoid pulling in browser-only zip-handler dependencies.
 *
 * @param {string[]} scadFiles - List of .scad file paths (relative)
 * @param {Map<string, string>} [contentMap] - Optional map for annotation scanning
 * @returns {string|null}
 */
function detectMainFile(scadFiles, contentMap = new Map()) {
  if (scadFiles.length === 0) return null;
  if (scadFiles.length === 1) return scadFiles[0];

  // Strategy 1: exact "main.scad"
  const mainScad = scadFiles.find(
    (p) => p.toLowerCase() === 'main.scad' || p.toLowerCase().endsWith('/main.scad')
  );
  if (mainScad) return mainScad;

  // Strategy 2: filename contains "main"
  const mainNamed = scadFiles.find((p) =>
    p.split('/').pop().toLowerCase().includes('main')
  );
  if (mainNamed) return mainNamed;

  // Strategy 3: prefer root-level files
  const rootFiles = scadFiles.filter((p) => !p.includes('/'));
  if (rootFiles.length === 1) return rootFiles[0];

  // Strategy 4: first file with Customizer annotations
  const candidates = rootFiles.length > 0 ? rootFiles : scadFiles;
  for (const p of candidates) {
    const content = contentMap.get(p);
    if (content && hasCustomizerAnnotations(content)) return p;
  }

  // Strategy 5: fallback — first alphabetically (root preferred)
  return rootFiles.length > 0 ? rootFiles.sort()[0] : scadFiles.sort()[0];
}

/**
 * Check whether a .scad file contains Customizer parameter annotations.
 * @param {string} content
 * @returns {boolean}
 */
function hasCustomizerAnnotations(content) {
  return /\/\*\s*\[.*?\]\s*\*\//.test(content) || /\/\/\s*\[.*?\]/.test(content);
}

/**
 * Decide if a JSON filename looks like a preset/parameter-sets file.
 *
 * Heuristics (any match → likely preset):
 *  - Basename contains a known hint word
 *  - OR the JSON content has a "parameterSets" or "presets" top-level key
 *
 * @param {string} filePath - Relative file path
 * @param {string} [content] - File content (optional; improves detection)
 * @returns {boolean}
 */
function looksLikePresetFile(filePath, content) {
  const name = basename(filePath, PRESET_EXT).toLowerCase();
  if (PRESET_NAME_HINTS.some((hint) => name.includes(hint))) return true;

  if (content) {
    try {
      const parsed = JSON.parse(content);
      if (parsed && (parsed.parameterSets || parsed.presets)) return true;
    } catch {
      // not valid JSON or not a preset file
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Manifest generation
// ---------------------------------------------------------------------------

/**
 * Build a forge-manifest.json object from a list of file paths and content.
 *
 * @param {Object} opts
 * @param {string[]}            opts.allFiles   All relative file paths
 * @param {Map<string,string>}  opts.contentMap File path → content (may be empty for zip mode)
 * @param {string}              opts.name       Project name
 * @param {string}              opts.author     Author name
 * @param {boolean}             opts.zipMode    If true, generate a bundle-style manifest
 * @param {string}              [opts.zipName]  .zip filename (used when zipMode=true)
 * @returns {{ manifest: Object, mainFile: string|null, warnings: string[] }}
 */
function buildManifest({ allFiles, contentMap, name, author, zipMode, zipName }) {
  const warnings = [];

  // Categorise files
  const scadFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.scad'));
  const jsonFiles = allFiles.filter((f) => f.toLowerCase().endsWith(PRESET_EXT));
  const companionFiles = allFiles.filter((f) =>
    COMPANION_EXTS.has(extname(f).toLowerCase())
  );

  // Detect main file
  const mainFile = detectMainFile(scadFiles, contentMap);

  if (!mainFile) {
    warnings.push('No .scad files found — "files.main" will be empty.');
  }

  // Detect preset files
  const presetFiles = jsonFiles.filter((f) =>
    looksLikePresetFile(f, contentMap.get(f))
  );

  // Companion files (non-preset, non-main .scad)
  const companions = companionFiles;

  // Build manifest
  const manifest = {
    forgeManifest: '1.0',
    name: name || basename(zipName || '.').replace(/\.zip$/i, '') || 'My Project',
    author: author || '',
    files: {},
  };

  if (!author) delete manifest.author;

  if (zipMode && zipName) {
    // Bundle manifest: point to the .zip
    manifest.files.bundle = zipName;
    // Include files.main as override if detected
    if (mainFile) manifest.files.main = mainFile;
  } else {
    // Uncompressed manifest: list all files
    if (mainFile) manifest.files.main = mainFile;

    const otherScad = scadFiles.filter((f) => f !== mainFile);
    if (companions.length > 0 || otherScad.length > 0) {
      manifest.files.companions = [...otherScad, ...companions];
    }

    if (presetFiles.length === 1) {
      manifest.files.presets = presetFiles[0];
    } else if (presetFiles.length > 1) {
      manifest.files.presets = presetFiles;
    }
  }

  return { manifest, mainFile, warnings };
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

/**
 * `openscad-forge manifest <path>` handler
 *
 * @param {string} inputPath  Folder or .zip path
 * @param {Object} options    Commander options
 */
export async function manifestCommand(inputPath, options) {
  try {
    console.log(chalk.blue('📋 OpenSCAD Forge - Manifest Generator'));

    const absPath = resolve(inputPath);

    if (!existsSync(absPath)) {
      console.error(chalk.red(`✗ Path not found: ${absPath}`));
      process.exit(1);
    }

    const stat = statSync(absPath);
    const isZipFile = !stat.isDirectory() && absPath.toLowerCase().endsWith('.zip');
    const isDirectory = stat.isDirectory();

    if (!isZipFile && !isDirectory) {
      console.error(chalk.red(`✗ Input must be a folder or a .zip file: ${absPath}`));
      process.exit(1);
    }

    console.log(chalk.gray(`Input: ${absPath}`));
    console.log(chalk.gray(`Mode: ${isZipFile ? 'zip file' : 'folder'}`));

    let allFiles = [];
    const contentMap = new Map();

    // ------------------------------------------------------------------
    // Scan input
    // ------------------------------------------------------------------
    if (isDirectory) {
      console.log(chalk.gray('Scanning folder...'));
      allFiles = walkDir(absPath);

      // Read .scad and .json content for better detection
      for (const f of allFiles) {
        const ext = extname(f).toLowerCase();
        if (ext === '.scad' || ext === '.json') {
          try {
            contentMap.set(f, readFileSync(`${absPath}/${f}`, 'utf-8'));
          } catch {
            // skip unreadable files
          }
        }
      }
    } else {
      // Zip file
      console.log(chalk.gray('Reading zip file...'));
      const buffer = readFileSync(absPath);
      const zip = new JSZip();
      const zipData = await zip.loadAsync(buffer);

      for (const [relativePath, entry] of Object.entries(zipData.files)) {
        if (entry.dir) continue;
        const normalized = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
        if (normalized.includes('..')) continue;
        allFiles.push(normalized);

        const ext = extname(normalized).toLowerCase();
        if (ext === '.scad' || ext === '.json') {
          try {
            contentMap.set(normalized, await entry.async('text'));
          } catch {
            // skip
          }
        }
      }
    }

    console.log(chalk.green(`✓ Found ${allFiles.length} file(s)`));

    const scadCount = allFiles.filter((f) => f.toLowerCase().endsWith('.scad')).length;
    if (scadCount === 0) {
      console.error(chalk.red('✗ No .scad files found. Cannot generate manifest.'));
      process.exit(1);
    }

    // ------------------------------------------------------------------
    // Determine zip mode
    // ------------------------------------------------------------------
    // --zip flag forces bundle mode; loading from a .zip file implies bundle mode
    const zipMode = options.zip || isZipFile;
    const zipName = isZipFile ? basename(absPath) : (options.zip ? basename(absPath) + '.zip' : null);

    // ------------------------------------------------------------------
    // Build manifest
    // ------------------------------------------------------------------
    const { manifest, mainFile, warnings } = buildManifest({
      allFiles,
      contentMap,
      name: options.name,
      author: options.author,
      zipMode,
      zipName,
    });

    for (const w of warnings) {
      console.log(chalk.yellow(`⚠ ${w}`));
    }

    if (mainFile) {
      console.log(chalk.green(`✓ Main file detected: ${mainFile}`));
    }

    // ------------------------------------------------------------------
    // Output
    // ------------------------------------------------------------------
    const output = JSON.stringify(manifest, null, 2) + '\n';

    if (options.out) {
      const outPath = resolve(options.out);
      writeFileSync(outPath, output, 'utf-8');
      console.log(chalk.green(`✓ Manifest written to: ${outPath}`));
    } else {
      // stdout
      process.stdout.write(output);
    }

    // Summary to stderr when writing to stdout so it doesn't corrupt JSON output
    const log = options.out ? console.log : (msg) => process.stderr.write(msg + '\n');
    log(chalk.blue('\n📦 Summary:'));
    log(chalk.gray(`  Total files: ${allFiles.length}`));
    log(chalk.gray(`  .scad files: ${scadCount}`));
    log(chalk.gray(`  Main file: ${mainFile ?? '(none detected)'}`));
    log(chalk.gray(`  Bundle mode: ${zipMode ? 'yes' : 'no'}`));
    if (manifest.files.presets) {
      const presets = Array.isArray(manifest.files.presets)
        ? manifest.files.presets
        : [manifest.files.presets];
      log(chalk.gray(`  Preset file(s): ${presets.join(', ')}`));
    }

    if (options.out) {
      console.log(chalk.green('\n✓ Done!'));
    }
  } catch (err) {
    console.error(chalk.red(`✗ Unexpected error: ${err.message}`));
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}
