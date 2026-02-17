#!/usr/bin/env node
/**
 * Bundle Size Budget Checker (Milestone 3: Performance & Stability)
 *
 * Enforces bundle size budgets per LAYER_2_BUILD_PLAN.md B.4.3
 *
 * Budgets:
 * - Core app (no Monaco): < 500 KB gzipped
 * - Total (Expert Mode): < 1.5 MB gzipped
 *
 * Usage:
 *   node scripts/check-bundle-budget.js
 *
 * Exit codes:
 *   0 - All budgets met
 *   1 - Budget exceeded (blocks CI)
 *
 * @license GPL-3.0-or-later
 */

import { readdirSync, statSync, readFileSync } from 'fs';
import { join, basename, extname } from 'path';
import { gzipSync } from 'zlib';

// Budget definitions (in bytes)
const BUDGETS = {
  // Core app bundle - must be under 500KB gzipped for initial load
  // Vite generates hashes with alphanumeric chars and underscores
  coreApp: {
    name: 'Core App (no Monaco)',
    budget: 500 * 1024, // 500 KB
    pattern: /^index-[a-zA-Z0-9_-]+\.js$/,
    critical: true,
  },
  // Main CSS
  mainCSS: {
    name: 'Main CSS',
    budget: 150 * 1024, // 150 KB
    pattern: /^index-[a-zA-Z0-9_-]+\.css$/,
    critical: false,
  },
  // Total assets (excluding WASM and external Monaco)
  totalAssets: {
    name: 'Total Assets',
    budget: 1024 * 1024, // 1 MB (not including lazy-loaded Monaco)
    pattern: null, // Sum all
    critical: true,
  },
};

// Performance regression thresholds
const REGRESSION_THRESHOLD = 0.15; // 15% increase triggers warning

/**
 * Get gzipped size of a file
 * @param {string} filePath - Path to file
 * @returns {number} Gzipped size in bytes
 */
function getGzippedSize(filePath) {
  const content = readFileSync(filePath);
  const gzipped = gzipSync(content, { level: 9 });
  return gzipped.length;
}

/**
 * Get raw size of a file
 * @param {string} filePath - Path to file
 * @returns {number} Size in bytes
 */
function getRawSize(filePath) {
  return statSync(filePath).size;
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Recursively get all files in directory
 * @param {string} dir - Directory path
 * @param {string[]} files - Accumulated files
 * @returns {string[]} All file paths
 */
function getAllFiles(dir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Check bundle size budgets
 * @param {string} distPath - Path to dist directory
 * @returns {Object} Results with violations
 */
function checkBudgets(distPath) {
  const results = {
    passed: true,
    criticalFailure: false,
    checks: [],
    summary: {},
  };

  // Get all files in dist
  let allFiles;
  try {
    allFiles = getAllFiles(distPath);
  } catch (e) {
    console.error(`Error reading dist directory: ${e.message}`);
    results.passed = false;
    results.criticalFailure = true;
    return results;
  }

  // Filter to assets (JS, CSS, HTML)
  const assetExtensions = ['.js', '.css', '.html', '.json'];
  const assets = allFiles.filter((f) => assetExtensions.includes(extname(f)));

  // Calculate sizes
  const fileSizes = assets.map((filePath) => ({
    path: filePath,
    name: basename(filePath),
    raw: getRawSize(filePath),
    gzipped: getGzippedSize(filePath),
  }));

  // Check each budget
  for (const [key, budget] of Object.entries(BUDGETS)) {
    let matchedFiles;
    let totalGzipped;

    if (budget.pattern) {
      // Match specific pattern
      matchedFiles = fileSizes.filter((f) => budget.pattern.test(f.name));
      totalGzipped = matchedFiles.reduce((sum, f) => sum + f.gzipped, 0);
    } else {
      // Sum all assets
      matchedFiles = fileSizes;
      totalGzipped = fileSizes.reduce((sum, f) => sum + f.gzipped, 0);
    }

    const passed = totalGzipped <= budget.budget;
    const percentOfBudget = ((totalGzipped / budget.budget) * 100).toFixed(1);

    const check = {
      name: budget.name,
      budget: budget.budget,
      budgetFormatted: formatBytes(budget.budget),
      actual: totalGzipped,
      actualFormatted: formatBytes(totalGzipped),
      percentOfBudget,
      passed,
      critical: budget.critical,
      files: matchedFiles.map((f) => ({
        name: f.name,
        gzipped: formatBytes(f.gzipped),
        raw: formatBytes(f.raw),
      })),
    };

    results.checks.push(check);

    if (!passed) {
      results.passed = false;
      if (budget.critical) {
        results.criticalFailure = true;
      }
    }

    results.summary[key] = {
      gzipped: totalGzipped,
      budget: budget.budget,
      passed,
    };
  }

  return results;
}

/**
 * Print results to console
 * @param {Object} results - Budget check results
 */
function printResults(results) {
  console.log('\n=== Bundle Size Budget Check ===\n');

  for (const check of results.checks) {
    const icon = check.passed ? '✅' : check.critical ? '❌' : '⚠️';
    const status = check.passed
      ? 'PASS'
      : check.critical
        ? 'FAIL (BLOCKING)'
        : 'WARN';

    console.log(`${icon} ${check.name}`);
    console.log(`   Budget: ${check.budgetFormatted}`);
    console.log(`   Actual: ${check.actualFormatted} (${check.percentOfBudget}% of budget)`);
    console.log(`   Status: ${status}`);

    if (check.files.length > 0 && check.files.length <= 5) {
      console.log('   Files:');
      for (const file of check.files) {
        console.log(`     - ${file.name}: ${file.gzipped} gzipped (${file.raw} raw)`);
      }
    }

    console.log('');
  }

  // Summary
  console.log('=== Summary ===\n');

  if (results.criticalFailure) {
    console.log('❌ FAILED: Critical budget exceeded. This PR should not be merged.');
    console.log('   Action: Investigate bundle size increase before proceeding.\n');
  } else if (!results.passed) {
    console.log('⚠️  WARNING: Non-critical budget exceeded.');
    console.log('   Action: Review bundle size increase and justify in PR.\n');
  } else {
    console.log('✅ PASSED: All budgets met.\n');
  }

  // Output JSON for CI parsing
  console.log('=== JSON Output ===');
  console.log(JSON.stringify(results.summary, null, 2));
}

// Main execution
const distPath = process.argv[2] || 'dist';

console.log(`Checking bundle sizes in: ${distPath}`);

const results = checkBudgets(distPath);
printResults(results);

// Exit with appropriate code
process.exit(results.criticalFailure ? 1 : 0);
