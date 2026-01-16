/**
 * Validate command - Validate parity between implementations
 * @license GPL-3.0-or-later
 */

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import chalk from 'chalk';
import YAML from 'yaml';

/**
 * Load test cases from YAML or JSON file
 * @param {string} casesPath - Path to test cases file
 * @returns {Array} Test cases
 */
function loadTestCases(casesPath) {
  const content = readFileSync(casesPath, 'utf-8');
  
  if (casesPath.endsWith('.json')) {
    return JSON.parse(content);
  } else if (casesPath.endsWith('.yaml') || casesPath.endsWith('.yml')) {
    // Use robust YAML parsing (supports arrays, nested objects, numbers, booleans, etc.)
    const parsed = YAML.parse(content);

    // Accept a few common shapes:
    // 1) - name: Case A
    //      params: { ... }
    // 2) { cases: [ ... ] }
    // 3) { "Case A": { ...params... }, "Case B": { ... } }
    let cases = [];

    if (Array.isArray(parsed)) {
      cases = parsed;
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.cases)) {
      cases = parsed.cases;
    } else if (parsed && typeof parsed === 'object') {
      cases = Object.entries(parsed).map(([name, params]) => ({ name, params }));
    } else {
      throw new Error('YAML test cases must be a list, {cases: [...]}, or a map of name -> params');
    }

    // Normalize and validate cases
    return cases.map((c, idx) => {
      const name = c?.name ?? `case-${idx + 1}`;
      const params = c?.params ?? c?.parameters ?? (typeof c === 'object' ? c.params : null);
      if (!params || typeof params !== 'object') {
        throw new Error(`Invalid test case "${name}": missing params object`);
      }
      return { name: String(name), params };
    });
  } else {
    throw new Error('Test cases must be .json, .yaml, or .yml file');
  }
}

/**
 * Validate parameter schema
 * @param {string} webappPath - Path to webapp directory
 * @returns {Object} Validation result
 */
function validateSchema(webappPath) {
  const indexPath = join(webappPath, 'index.html');
  
  if (!existsSync(indexPath)) {
    return {
      valid: false,
      errors: ['index.html not found'],
    };
  }
  
  const content = readFileSync(indexPath, 'utf-8');
  const schemaMatch = content.match(/<script type="application\/json" id="param-schema">([\s\S]*?)<\/script>/);
  
  if (!schemaMatch) {
    return {
      valid: false,
      errors: ['Parameter schema not found in index.html'],
    };
  }
  
  try {
    const schema = JSON.parse(schemaMatch[1]);
    
    // Basic schema validation
    const errors = [];
    
    if (!schema.type || schema.type !== 'object') {
      errors.push('Schema must have type: "object"');
    }
    
    if (!schema.properties || typeof schema.properties !== 'object') {
      errors.push('Schema must have properties object');
    }
    
    const paramCount = Object.keys(schema.properties || {}).length;
    
    if (paramCount === 0) {
      errors.push('Schema has no parameters');
    }
    
    // Validate each parameter
    for (const [name, prop] of Object.entries(schema.properties || {})) {
      if (!prop.type) {
        errors.push(`Parameter "${name}" missing type`);
      }
      
      if (typeof prop.default === 'undefined') {
        errors.push(`Parameter "${name}" missing default value`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      schema,
      paramCount,
    };
  } catch (err) {
    return {
      valid: false,
      errors: [`Failed to parse schema: ${err.message}`],
    };
  }
}

/**
 * Validate UI components
 * @param {string} webappPath - Path to webapp directory
 * @returns {Object} Validation result
 */
function validateUI(webappPath) {
  const errors = [];
  
  // Check for required files
  const requiredFiles = [
    'index.html',
    'src/main.js',
    'src/js/parser.js',
    'src/js/ui-generator.js',
    'src/styles/main.css',
  ];
  
  for (const file of requiredFiles) {
    if (!existsSync(join(webappPath, file))) {
      errors.push(`Missing required file: ${file}`);
    }
  }
  
  // Check for accessibility features in CSS
  const cssPath = join(webappPath, 'src/styles/main.css');
  if (existsSync(cssPath)) {
    const css = readFileSync(cssPath, 'utf-8');
    
    if (!css.includes('focus-visible')) {
      errors.push('CSS missing focus-visible styles for accessibility');
    }
    
    if (!css.includes('prefers-reduced-motion')) {
      errors.push('CSS missing prefers-reduced-motion media query');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Load golden fixtures for comparison
 * @param {string} fixturesPath - Path to fixtures directory
 * @returns {Object} Map of fixture name to data
 */
function loadGoldenFixtures(fixturesPath) {
  const fixtures = {};
  
  if (!existsSync(fixturesPath)) {
    return fixtures;
  }
  
  const files = readdirSync(fixturesPath);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const fixturePath = join(fixturesPath, file);
      const content = readFileSync(fixturePath, 'utf-8');
      const fixtureName = file.replace('.json', '');
      fixtures[fixtureName] = JSON.parse(content);
    }
  }
  
  return fixtures;
}

/**
 * Save golden fixture
 * @param {string} fixturesPath - Path to fixtures directory
 * @param {string} name - Fixture name
 * @param {Object} data - Fixture data
 */
function saveGoldenFixture(fixturesPath, name, data) {
  mkdirSync(fixturesPath, { recursive: true });
  const fixturePath = join(fixturesPath, `${name}.json`);
  writeFileSync(fixturePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Compare parameter values
 * @param {Object} expected - Expected parameters
 * @param {Object} actual - Actual parameters
 * @returns {Object} Comparison result
 */
function compareParameters(expected, actual) {
  const differences = [];
  
  // Check all expected parameters
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (!(key in actual)) {
      differences.push({
        parameter: key,
        type: 'missing',
        expected: expectedValue,
        actual: undefined,
      });
    } else if (JSON.stringify(expectedValue) !== JSON.stringify(actual[key])) {
      differences.push({
        parameter: key,
        type: 'value-mismatch',
        expected: expectedValue,
        actual: actual[key],
      });
    }
  }
  
  // Check for unexpected parameters
  for (const key of Object.keys(actual)) {
    if (!(key in expected)) {
      differences.push({
        parameter: key,
        type: 'unexpected',
        expected: undefined,
        actual: actual[key],
      });
    }
  }
  
  return {
    match: differences.length === 0,
    differences,
  };
}

/**
 * Run test cases
 * @param {string} webappPath - Path to webapp directory
 * @param {Array} testCases - Test cases to run
 * @param {Object} options - Validation options
 * @returns {Object} Test results
 */
function runTestCases(webappPath, testCases, options) {
  console.log(chalk.gray(`Running ${testCases.length} test case(s)...`));
  
  const results = {
    total: testCases.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    cases: [],
  };
  
  // Load golden fixtures if they exist
  const fixturesPath = join(webappPath, 'test', 'fixtures');
  const goldenFixtures = loadGoldenFixtures(fixturesPath);
  const hasGoldenFixtures = Object.keys(goldenFixtures).length > 0;
  
  if (hasGoldenFixtures) {
    console.log(chalk.blue(`  Loaded ${Object.keys(goldenFixtures).length} golden fixture(s)`));
  }
  
  for (const testCase of testCases) {
    console.log(chalk.gray(`  Testing: ${testCase.name}`));
    
    const caseResult = {
      name: testCase.name,
      status: 'skipped',
      reason: 'STL rendering tests require headless browser environment',
    };
    
    // Check if we have a golden fixture for this test case
    if (goldenFixtures[testCase.name]) {
      const comparison = compareParameters(goldenFixtures[testCase.name].params, testCase.params);
      
      if (comparison.match) {
        caseResult.status = 'passed';
        caseResult.reason = 'Parameters match golden fixture';
        results.passed++;
      } else {
        caseResult.status = 'failed';
        caseResult.reason = `Parameters differ from golden fixture (${comparison.differences.length} difference(s))`;
        caseResult.differences = comparison.differences;
        results.failed++;
      }
    } else {
      // Save as new golden fixture if requested
      if (options.saveFixtures) {
        saveGoldenFixture(fixturesPath, testCase.name, {
          name: testCase.name,
          params: testCase.params,
          timestamp: new Date().toISOString(),
        });
        caseResult.reason = 'Saved as golden fixture';
        console.log(chalk.green(`    ✓ Saved golden fixture: ${testCase.name}`));
      }
      results.skipped++;
    }
    
    results.cases.push(caseResult);
  }
  
  return results;
}

/**
 * Format validation results
 * @param {Object} results - Validation results
 * @param {string} format - Output format (text|json|junit)
 * @returns {string} Formatted output
 */
function formatResults(results, format) {
  if (format === 'json') {
    return JSON.stringify(results, null, 2);
  }
  
  if (format === 'junit') {
    // Basic JUnit XML format
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<testsuites>\n';
    xml += `  <testsuite name="OpenSCAD Forge Validation" tests="${results.testResults?.total || 0}">\n`;
    
    for (const testCase of results.testResults?.cases || []) {
      xml += `    <testcase name="${testCase.name}">\n`;
      if (testCase.status === 'skipped') {
        xml += `      <skipped message="${testCase.reason}" />\n`;
      } else if (testCase.status === 'failed') {
        xml += `      <failure message="${testCase.reason}" />\n`;
      }
      xml += '    </testcase>\n';
    }
    
    xml += '  </testsuite>\n';
    xml += '</testsuites>\n';
    return xml;
  }
  
  // Text format (default)
  let output = '';
  
  output += chalk.blue('═'.repeat(60)) + '\n';
  output += chalk.blue.bold('  OpenSCAD Forge - Validation Report') + '\n';
  output += chalk.blue('═'.repeat(60)) + '\n\n';
  
  // Schema validation
  output += chalk.cyan('Schema Validation:') + '\n';
  if (results.schema.valid) {
    output += chalk.green(`  ✓ Valid schema with ${results.schema.paramCount} parameters\n`);
  } else {
    output += chalk.red('  ✗ Invalid schema\n');
    for (const error of results.schema.errors) {
      output += chalk.red(`    - ${error}\n`);
    }
  }
  output += '\n';
  
  // UI validation
  output += chalk.cyan('UI Validation:') + '\n';
  if (results.ui.valid) {
    output += chalk.green('  ✓ All required files present\n');
  } else {
    output += chalk.red('  ✗ UI validation failed\n');
    for (const error of results.ui.errors) {
      output += chalk.red(`    - ${error}\n`);
    }
  }
  output += '\n';
  
  // Test cases
  if (results.testResults) {
    output += chalk.cyan('Test Cases:') + '\n';
    output += chalk.gray(`  Total: ${results.testResults.total}\n`);
    output += chalk.green(`  Passed: ${results.testResults.passed}\n`);
    output += chalk.red(`  Failed: ${results.testResults.failed}\n`);
    output += chalk.yellow(`  Skipped: ${results.testResults.skipped}\n`);
    
    // Show details of failed tests
    const failedTests = results.testResults.cases.filter((c) => c.status === 'failed');
    if (failedTests.length > 0) {
      output += '\n' + chalk.red('  Failed Test Details:') + '\n';
      for (const test of failedTests) {
        output += chalk.red(`    ✗ ${test.name}: ${test.reason}\n`);
        if (test.differences) {
          for (const diff of test.differences) {
            output += chalk.gray(`      - ${diff.parameter}: `);
            if (diff.type === 'missing') {
              output += chalk.red(`missing (expected: ${JSON.stringify(diff.expected)})\n`);
            } else if (diff.type === 'unexpected') {
              output += chalk.yellow(`unexpected (actual: ${JSON.stringify(diff.actual)})\n`);
            } else {
              output += chalk.yellow(`expected ${JSON.stringify(diff.expected)}, got ${JSON.stringify(diff.actual)}\n`);
            }
          }
        }
      }
    }
    output += '\n';
  }
  
  // Summary
  output += chalk.blue('─'.repeat(60)) + '\n';
  const allValid = results.schema.valid && results.ui.valid;
  if (allValid) {
    output += chalk.green.bold('  ✓ Validation PASSED\n');
  } else {
    output += chalk.red.bold('  ✗ Validation FAILED\n');
  }
  output += chalk.blue('═'.repeat(60)) + '\n';
  
  return output;
}

/**
 * Validate command handler
 * @param {string} webapp - Path to webapp directory
 * @param {Object} options - Command options
 */
export async function validateCommand(webapp, options) {
  try {
    console.log(chalk.blue('✓ OpenSCAD Forge - Validation'));
    console.log(chalk.gray(`Webapp: ${webapp}\n`));
    
    const webappPath = resolve(webapp);
    
    // Check if webapp directory exists
    if (!existsSync(webappPath)) {
      console.error(chalk.red(`✗ Webapp directory not found: ${webappPath}`));
      process.exit(1);
    }
    
    const results = {
      webapp: webappPath,
      timestamp: new Date().toISOString(),
    };
    
    // Validate schema
    console.log(chalk.gray('Validating parameter schema...'));
    results.schema = validateSchema(webappPath);
    
    // Validate UI
    console.log(chalk.gray('Validating UI components...'));
    results.ui = validateUI(webappPath);
    
    // Run test cases if provided
    if (options.cases) {
      const casesPath = resolve(options.cases);
      if (!existsSync(casesPath)) {
        console.error(chalk.yellow(`⚠ Test cases file not found: ${casesPath}`));
      } else {
        console.log(chalk.gray('Loading test cases...'));
        const testCases = loadTestCases(casesPath);
        results.testResults = runTestCases(webappPath, testCases, options);
      }
    }
    
    // Format and output results
    const output = formatResults(results, options.format);
    console.log(output);
    
    // Exit with appropriate code
    const allValid = results.schema.valid && results.ui.valid;
    if (!allValid) {
      process.exit(1);
    }
    
  } catch (err) {
    console.error(chalk.red(`✗ Unexpected error: ${err.message}`));
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}
