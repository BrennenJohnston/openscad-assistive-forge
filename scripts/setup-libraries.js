#!/usr/bin/env node
/**
 * Download OpenSCAD Library Bundles
 * @license GPL-3.0-or-later
 * 
 * This script downloads popular OpenSCAD libraries for use in the web customizer.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);

const LIBRARIES_DIR = path.join(process.cwd(), 'public', 'libraries');

// Library definitions — pinned to specific tags or commit hashes for reproducibility.
// IMPORTANT: Do NOT use 'master' HEAD. A breaking change pushed upstream silently
// breaks user models. Update these pins deliberately after testing.
//
// To update a library:
//   1. Change the 'pin' field to the new tag or commit hash
//   2. Run `npm run setup-libraries`
//   3. Test with representative .scad files
//   4. Commit the updated pin
const LIBRARIES = {
  MCAD: {
    name: 'MCAD',
    repo: 'https://github.com/openscad/MCAD.git',
    branch: 'master',
    // MCAD has no tagged releases; pin to a known-good commit
    pin: null, // null = use branch HEAD (MCAD is stable/low-churn)
    license: 'LGPL-2.1',
    description: 'Mechanical CAD library',
  },
  BOSL2: {
    name: 'BOSL2',
    repo: 'https://github.com/BelfrySCAD/BOSL2.git',
    branch: 'master',
    // BOSL2 is actively evolving; pin to a known-good commit
    pin: null, // TODO: pin to specific commit after first verified clone
    license: 'BSD-2-Clause',
    description: 'Belfry OpenSCAD Library v2',
  },
  NopSCADlib: {
    name: 'NopSCADlib',
    repo: 'https://github.com/nophead/NopSCADlib.git',
    branch: 'master',
    // NopSCADlib has tagged releases — prefer tags when updating
    pin: null, // TODO: pin to specific tag after first verified clone
    license: 'GPL-3.0',
    description: 'Parts library for 3D printers',
  },
  dotSCAD: {
    name: 'dotSCAD',
    repo: 'https://github.com/JustinSDK/dotSCAD.git',
    branch: 'master',
    pin: null, // Low churn, low risk
    license: 'LGPL-3.0',
    description: 'Artistic patterns library',
  },
};

/**
 * Ensure libraries directory exists
 */
function ensureLibrariesDir() {
  if (!fs.existsSync(LIBRARIES_DIR)) {
    fs.mkdirSync(LIBRARIES_DIR, { recursive: true });
    console.log(`✓ Created ${LIBRARIES_DIR}`);
  }
}

/**
 * Check if git is available
 */
async function checkGit() {
  try {
    await execAsync('git --version');
    return true;
  } catch (error) {
    console.error('✗ Git is not installed or not in PATH');
    console.error('  Please install Git: https://git-scm.com/downloads');
    return false;
  }
}

/**
 * Clone or update a library
 */
async function setupLibrary(libConfig) {
  const libPath = path.join(LIBRARIES_DIR, libConfig.name);
  
  try {
    if (fs.existsSync(libPath)) {
      if (libConfig.pin) {
        // Pinned library — check if we're already at the right commit
        process.chdir(libPath);
        try {
          const { stdout: currentHash } = await execAsync('git rev-parse HEAD');
          if (currentHash.trim().startsWith(libConfig.pin.substring(0, 7))) {
            console.log(`\n📦 ${libConfig.name} already at pinned commit ${libConfig.pin.substring(0, 8)}...`);
          } else {
            console.log(`\n📦 Updating ${libConfig.name} to pinned commit ${libConfig.pin.substring(0, 8)}...`);
            await execAsync(`git fetch origin`);
            await execAsync(`git checkout ${libConfig.pin}`);
            console.log(`✓ ${libConfig.name} checked out to ${libConfig.pin.substring(0, 8)}`);
          }
        } catch (_e) {
          console.log(`\n📦 Updating ${libConfig.name}...`);
          await execAsync('git pull');
          console.log(`✓ ${libConfig.name} updated`);
        }
      } else {
        console.log(`\n📦 Updating ${libConfig.name} (unpinned — using branch HEAD)...`);
        process.chdir(libPath);
        await execAsync('git pull');
        console.log(`✓ ${libConfig.name} updated`);
      }
    } else {
      console.log(`\n📦 Downloading ${libConfig.name}...`);
      console.log(`   ${libConfig.description}`);
      console.log(`   License: ${libConfig.license}`);
      
      if (libConfig.pin) {
        // Clone full history (needed for checkout of specific commit)
        await execAsync(
          `git clone --branch ${libConfig.branch} ${libConfig.repo} "${libPath}"`
        );
        process.chdir(libPath);
        await execAsync(`git checkout ${libConfig.pin}`);
        console.log(`✓ ${libConfig.name} downloaded and pinned to ${libConfig.pin.substring(0, 8)}`);
      } else {
        // Shallow clone of branch HEAD (unpinned)
        await execAsync(
          `git clone --depth 1 --branch ${libConfig.branch} ${libConfig.repo} "${libPath}"`
        );
        console.log(`✓ ${libConfig.name} downloaded (unpinned — branch HEAD)`);
      }
    }
    
    // Get commit info
    process.chdir(libPath);
    const { stdout: commitInfo } = await execAsync('git log -1 --format="%H %ci"');
    const [hash, date] = commitInfo.trim().split(' ');
    
    // Write metadata (includes pin status for audit trail)
    const metadata = {
      name: libConfig.name,
      license: libConfig.license,
      description: libConfig.description,
      repository: libConfig.repo,
      branch: libConfig.branch,
      pin: libConfig.pin || null,
      pinned: !!libConfig.pin,
      commit: hash,
      date: date,
      downloaded: new Date().toISOString(),
    };
    
    fs.writeFileSync(
      path.join(libPath, '.library-metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    return true;
  } catch (error) {
    console.error(`✗ Failed to setup ${libConfig.name}: ${error.message}`);
    return false;
  }
}

/**
 * Recursively collect .scad file paths relative to a root directory.
 * @param {string} dir - Absolute directory path to scan
 * @param {string} [prefix=''] - Relative path prefix for recursion
 * @returns {string[]} Sorted array of relative .scad file paths
 */
function collectScadFiles(dir, prefix = '') {
  const files = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return files;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'manifest.json') continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectScadFiles(path.join(dir, entry.name), relative));
    } else if (entry.name.endsWith('.scad')) {
      files.push(relative);
    }
  }
  return files.sort();
}

/**
 * Generate a per-library manifest.json containing the files array that the
 * web worker's mountLibraries() expects.  Without this file the worker skips
 * the library with "No manifest found … skipping".
 */
function generatePerLibraryManifest(libName) {
  const libPath = path.join(LIBRARIES_DIR, libName);
  if (!fs.existsSync(libPath)) return null;

  const files = collectScadFiles(libPath);
  const manifest = { name: libName, files, generated: new Date().toISOString() };

  const manifestPath = path.join(libPath, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  ✓ Per-library manifest: ${libName} (${files.length} .scad files)`);
  return manifest;
}

/**
 * Generate library manifest
 */
function generateManifest() {
  const manifest = {
    generated: new Date().toISOString(),
    libraries: {},
  };
  
  for (const libName of Object.keys(LIBRARIES)) {
    const libPath = path.join(LIBRARIES_DIR, libName);
    const metadataPath = path.join(libPath, '.library-metadata.json');
    
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      manifest.libraries[libName] = {
        available: true,
        ...metadata,
      };
    } else {
      manifest.libraries[libName] = {
        available: false,
        name: libName,
        description: LIBRARIES[libName].description,
      };
    }

    generatePerLibraryManifest(libName);
  }
  
  const manifestPath = path.join(LIBRARIES_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n✓ Generated manifest: ${manifestPath}`);
  
  return manifest;
}

/**
 * Print summary
 */
function printSummary(manifest) {
  console.log('\n' + '='.repeat(60));
  console.log('Library Bundle Summary');
  console.log('='.repeat(60));
  
  const available = Object.values(manifest.libraries).filter(lib => lib.available);
  const unavailable = Object.values(manifest.libraries).filter(lib => !lib.available);
  
  if (available.length > 0) {
    console.log('\n✓ Available Libraries:');
    available.forEach(lib => {
      console.log(`  - ${lib.name}: ${lib.description}`);
      console.log(`    License: ${lib.license}`);
      console.log(`    Updated: ${new Date(lib.date).toLocaleDateString()}`);
    });
  }
  
  if (unavailable.length > 0) {
    console.log('\n✗ Unavailable Libraries:');
    unavailable.forEach(lib => {
      console.log(`  - ${lib.name}: ${lib.description}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${available.length}/${Object.keys(manifest.libraries).length} libraries available`);
  console.log('='.repeat(60));
}

/**
 * Main execution
 */
async function main() {
  console.log('OpenSCAD Library Bundle Setup');
  console.log('='.repeat(60));
  
  // Check prerequisites
  if (!await checkGit()) {
    process.exit(1);
  }
  
  // Setup directory
  ensureLibrariesDir();
  
  const originalDir = process.cwd();
  
  // Download each library
  for (const libConfig of Object.values(LIBRARIES)) {
    await setupLibrary(libConfig);
    process.chdir(originalDir);
  }
  
  // Generate manifest
  const manifest = generateManifest();
  
  // Print summary
  printSummary(manifest);
  
  console.log('\n✓ Library setup complete!');
  console.log('\nNext steps:');
  console.log('  1. Restart the dev server (npm run dev)');
  console.log('  2. Enable libraries in the UI settings');
  console.log('  3. Use them in your .scad files with include/use statements');
}

// Run if called directly (cross-platform: normalize both sides)
const __filename = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1]) === __filename) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { setupLibrary, generateManifest, collectScadFiles, generatePerLibraryManifest };
