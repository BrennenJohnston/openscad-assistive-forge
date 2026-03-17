/**
 * Test command - Run tests for scaffolded web app
 * @license GPL-3.0-or-later
 */

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import chalk from 'chalk';

/**
 * Find test files in a directory
 * @param {string} dir - Directory to search
 * @param {string[]} patterns - File patterns to match
 * @returns {string[]} Test file paths
 */
function findTestFiles(dir, patterns = ['*.test.js', '*.spec.js', '*.test.ts', '*.spec.ts']) {
  const files = [];
  
  if (!existsSync(dir)) return files;
  
  const entries = readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory() && !['node_modules', 'dist', '.git'].includes(entry.name)) {
      files.push(...findTestFiles(fullPath, patterns));
    } else if (entry.isFile()) {
      const isTestFile = patterns.some(pattern => {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return regex.test(entry.name);
      });
      if (isTestFile) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

/**
 * Generate test coverage report
 * @param {Object} results - Test results
 * @returns {Object} Coverage report
 */
function generateCoverageReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      skipped: results.skipped,
      coverage: results.coverage || 0
    },
    files: results.files || []
  };
  
  return report;
}

/**
 * Create sample test file
 * @param {string} webappDir - Webapp directory
 */
function createSampleTest(webappDir) {
  const testDir = join(webappDir, 'test');
  const sampleTest = `/**
 * Sample Test File
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';

describe('Parameter Schema', () => {
  it('should have valid properties', () => {
    const schemaEl = document.getElementById('param-schema');
    expect(schemaEl).toBeDefined();
    
    if (schemaEl) {
      const schema = JSON.parse(schemaEl.textContent);
      expect(schema).toHaveProperty('properties');
    }
  });
  
  it('should have default values for all parameters', () => {
    const schemaEl = document.getElementById('param-schema');
    if (!schemaEl) return;
    
    const schema = JSON.parse(schemaEl.textContent);
    const properties = schema.properties || {};
    
    for (const [key, prop] of Object.entries(properties)) {
      expect(prop).toHaveProperty('default', \`Parameter \${key} should have a default value\`);
    }
  });
});

describe('SCAD Source', () => {
  it('should have embedded SCAD content', () => {
    const scadEl = document.getElementById('scad-source');
    expect(scadEl).toBeDefined();
    
    if (scadEl) {
      const content = scadEl.textContent;
      expect(content.length).toBeGreaterThan(0);
    }
  });
});
`;

  mkdirSync(testDir, { recursive: true });
  writeFileSync(join(testDir, 'schema.test.js'), sampleTest, 'utf-8');
  
  return join(testDir, 'schema.test.js');
}

/**
 * Test command handler
 * @param {string} webapp - Webapp directory path
 * @param {Object} options - Command options
 */
async function testCommand(webapp, options) {
  try {
    console.log(chalk.blue('🧪 OpenSCAD Forge - Test Runner'));
    
    const webappDir = resolve(webapp);
    
    // Validate webapp directory
    if (!existsSync(webappDir)) {
      console.error(chalk.red(`✗ Webapp directory not found: ${webappDir}`));
      process.exit(1);
    }
    
    console.log(chalk.gray(`Webapp: ${webappDir}`));
    
    // Find test files
    const testFiles = findTestFiles(webappDir);
    
    if (testFiles.length === 0) {
      console.log(chalk.yellow('⚠ No test files found'));
      
      if (options.init) {
        console.log(chalk.gray('Creating sample test file...'));
        const samplePath = createSampleTest(webappDir);
        console.log(chalk.green(`✓ Created: ${samplePath}`));
        
        // Add vitest to package.json
        const packageJsonPath = join(webappDir, 'package.json');
        if (existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
          
          if (!packageJson.devDependencies) {
            packageJson.devDependencies = {};
          }
          
          packageJson.devDependencies.vitest = '^1.0.0';
          packageJson.devDependencies['@vitest/ui'] = '^1.0.0';
          packageJson.devDependencies['@vitest/coverage-v8'] = '^1.0.0';
          packageJson.devDependencies.jsdom = '^23.0.0';
          
          if (!packageJson.scripts) {
            packageJson.scripts = {};
          }
          packageJson.scripts.test = 'vitest run';
          packageJson.scripts['test:watch'] = 'vitest';
          packageJson.scripts['test:ui'] = 'vitest --ui';
          packageJson.scripts['test:coverage'] = 'vitest run --coverage';
          
          writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
          console.log(chalk.green('✓ Updated package.json with test scripts'));
        }
        
        // Create vitest config
        const vitestConfig = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'test/']
    }
  }
});
`;
        writeFileSync(join(webappDir, 'vitest.config.js'), vitestConfig, 'utf-8');
        console.log(chalk.green('✓ Created vitest.config.js'));
        
        // Create test setup file
        const setupFile = `/**
 * Test Setup
 */

// Mock browser APIs if needed
if (typeof window !== 'undefined') {
  // Setup DOM elements for testing
  const schemaScript = document.createElement('script');
  schemaScript.type = 'application/json';
  schemaScript.id = 'param-schema';
  schemaScript.textContent = JSON.stringify({
    title: 'Test Model',
    properties: {
      width: { type: 'number', default: 10 },
      height: { type: 'number', default: 20 }
    }
  });
  document.head.appendChild(schemaScript);
  
  const scadScript = document.createElement('script');
  scadScript.type = 'text/plain';
  scadScript.id = 'scad-source';
  scadScript.textContent = 'cube([width, height, 10]);';
  document.head.appendChild(scadScript);
}
`;
        mkdirSync(join(webappDir, 'test'), { recursive: true });
        writeFileSync(join(webappDir, 'test', 'setup.js'), setupFile, 'utf-8');
        console.log(chalk.green('✓ Created test/setup.js'));
        
        console.log(chalk.blue('\n📋 Next steps:'));
        console.log(chalk.gray('  npm install'));
        console.log(chalk.gray('  npm test'));
        
        return;
      }
      
      console.log(chalk.yellow('Run with --init to create sample test files'));
      return;
    }
    
    console.log(chalk.green(`✓ Found ${testFiles.length} test file(s)`));
    
    // List test files
    if (options.list) {
      console.log(chalk.blue('\nTest files:'));
      for (const file of testFiles) {
        console.log(chalk.gray(`  - ${file.replace(webappDir, '.')}`));
      }
      return;
    }
    
    // Show test instructions
    console.log(chalk.blue('\n📋 Running tests:'));
    console.log(chalk.gray('  npm test'));
    
    if (options.watch) {
      console.log(chalk.gray('\nWatch mode:'));
      console.log(chalk.gray('  npm run test:watch'));
    }
    
    if (options.coverage) {
      console.log(chalk.gray('\nWith coverage:'));
      console.log(chalk.gray('  npm run test:coverage'));
    }
    
    if (options.ui) {
      console.log(chalk.gray('\nUI mode:'));
      console.log(chalk.gray('  npm run test:ui'));
    }
    
    // Generate report if requested
    if (options.report) {
      const report = generateCoverageReport({
        total: testFiles.length,
        passed: 0,
        failed: 0,
        skipped: 0,
        coverage: 0,
        files: testFiles.map(f => ({ path: f, status: 'pending' }))
      });
      
      const reportPath = options.out || join(webappDir, 'test-report.json');
      writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
      console.log(chalk.green(`\n✓ Report generated: ${reportPath}`));
    }
    
  } catch (err) {
    console.error(chalk.red(`✗ Unexpected error: ${err.message}`));
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}
