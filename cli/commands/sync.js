/**
 * Sync command - Detect and apply safe auto-fixes
 * @license GPL-3.0-or-later
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import chalk from 'chalk';

/**
 * Detect issues in webapp
 * @param {string} webappPath - Path to webapp directory
 * @returns {Array} Array of detected issues
 */
function detectIssues(webappPath) {
  const issues = [];
  
  // Check package.json for outdated dependencies
  const packageJsonPath = join(webappPath, 'package.json');
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    
    // Check for specific known version issues
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    if (deps['three'] && deps['three'].startsWith('^0.1')) {
      issues.push({
        type: 'outdated-dependency',
        severity: 'warning',
        file: 'package.json',
        message: 'three.js version is outdated',
        packageName: 'three', // Correct npm package name
        currentValue: deps['three'],
        suggestedValue: '^0.160.0',
        autoFixable: true,
      });
    }
    
    if (deps['ajv'] && deps['ajv'].startsWith('^7.')) {
      issues.push({
        type: 'outdated-dependency',
        severity: 'warning',
        file: 'package.json',
        message: 'ajv version is outdated',
        packageName: 'ajv',
        currentValue: deps['ajv'],
        suggestedValue: '^8.12.0',
        autoFixable: true,
      });
    }
    
    if (deps['vite'] && deps['vite'].startsWith('^4.')) {
      issues.push({
        type: 'outdated-dependency',
        severity: 'info',
        file: 'package.json',
        message: 'vite version is outdated',
        packageName: 'vite',
        currentValue: deps['vite'],
        suggestedValue: '^5.0.0',
        autoFixable: true,
      });
    }
    
    // Check for missing dependencies
    if (!deps['jszip']) {
      issues.push({
        type: 'missing-dependency',
        severity: 'warning',
        file: 'package.json',
        message: 'Missing jszip dependency (needed for multi-file projects)',
        suggestedValue: '^3.10.1',
        autoFixable: true,
      });
    }
    
    // Check for missing scripts
    if (!packageJson.scripts?.build) {
      issues.push({
        type: 'missing-script',
        severity: 'error',
        file: 'package.json',
        message: 'Missing build script',
        suggestedValue: 'vite build',
        autoFixable: true,
      });
    }
    
    if (!packageJson.scripts?.preview) {
      issues.push({
        type: 'missing-script',
        severity: 'info',
        file: 'package.json',
        message: 'Missing preview script',
        suggestedValue: 'vite preview',
        autoFixable: true,
      });
    }
  } else {
    issues.push({
      type: 'missing-file',
      severity: 'error',
      file: 'package.json',
      message: 'package.json not found',
      autoFixable: false,
    });
  }
  
  // Check index.html for accessibility issues
  const indexPath = join(webappPath, 'index.html');
  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, 'utf-8');
    
    if (!html.includes('lang=')) {
      issues.push({
        type: 'accessibility',
        severity: 'error',
        file: 'index.html',
        message: 'Missing lang attribute on <html> tag',
        autoFixable: true,
      });
    }
    
    if (!html.includes('viewport')) {
      issues.push({
        type: 'accessibility',
        severity: 'error',
        file: 'index.html',
        message: 'Missing viewport meta tag',
        autoFixable: true,
      });
    }
  }
  
  // Check CSS for accessibility features
  const cssPath = join(webappPath, 'src/styles/main.css');
  if (existsSync(cssPath)) {
    const css = readFileSync(cssPath, 'utf-8');
    
    if (!css.includes(':focus-visible')) {
      issues.push({
        type: 'accessibility',
        severity: 'warning',
        file: 'src/styles/main.css',
        message: 'Missing :focus-visible styles',
        autoFixable: false,
        suggestion: 'Add focus-visible styles for keyboard navigation',
      });
    }
    
    if (!css.includes('prefers-reduced-motion')) {
      issues.push({
        type: 'accessibility',
        severity: 'warning',
        file: 'src/styles/main.css',
        message: 'Missing prefers-reduced-motion media query',
        autoFixable: false,
        suggestion: 'Add prefers-reduced-motion support for animations',
      });
    }
  }
  
  // Check for vite.config.js
  const viteConfigPath = join(webappPath, 'vite.config.js');
  if (!existsSync(viteConfigPath)) {
    issues.push({
      type: 'missing-file',
      severity: 'warning',
      file: 'vite.config.js',
      message: 'Missing vite.config.js',
      autoFixable: true,
    });
  }
  
  // Check for .gitignore
  const gitignorePath = join(webappPath, '.gitignore');
  if (!existsSync(gitignorePath)) {
    issues.push({
      type: 'missing-file',
      severity: 'info',
      file: '.gitignore',
      message: 'Missing .gitignore',
      autoFixable: true,
    });
  }
  
  // Check for worker file
  const workerPath = join(webappPath, 'src/worker/openscad-worker.js');
  if (!existsSync(workerPath)) {
    issues.push({
      type: 'missing-file',
      severity: 'error',
      file: 'src/worker/openscad-worker.js',
      message: 'Missing OpenSCAD worker file',
      autoFixable: false,
      suggestion: 'Worker file is required for rendering',
    });
  }
  
  // Check for console.log statements in production code
  const mainJsPath = join(webappPath, 'src/main.js');
  if (existsSync(mainJsPath)) {
    const mainJs = readFileSync(mainJsPath, 'utf-8');
    const consoleLogCount = (mainJs.match(/console\.log/g) || []).length;
    if (consoleLogCount > 0) {
      issues.push({
        type: 'code-quality',
        severity: 'info',
        file: 'src/main.js',
        message: `Found ${consoleLogCount} console.log statement(s)`,
        autoFixable: false,
        suggestion: 'Consider removing or using environment-based logging',
      });
    }
  }
  
  // Check for proper theme support in CSS
  const variablesCssPath = join(webappPath, 'src/styles/variables.css');
  if (existsSync(variablesCssPath)) {
    const css = readFileSync(variablesCssPath, 'utf-8');
    if (!css.includes('[data-theme="dark"]')) {
      issues.push({
        type: 'feature-missing',
        severity: 'info',
        file: 'src/styles/variables.css',
        message: 'Dark theme support not detected',
        autoFixable: false,
        suggestion: 'Consider adding dark theme CSS custom properties',
      });
    }
  }
  
  // Check for README
  const readmePath = join(webappPath, 'README.md');
  if (!existsSync(readmePath)) {
    issues.push({
      type: 'missing-file',
      severity: 'info',
      file: 'README.md',
      message: 'Missing README.md',
      autoFixable: false,
      suggestion: 'Add documentation for your project',
    });
  }
  
  return issues;
}

/**
 * Apply fix for a specific issue
 * @param {string} webappPath - Path to webapp directory
 * @param {Object} issue - Issue to fix
 * @returns {boolean} Whether fix was applied successfully
 */
function applyFix(webappPath, issue) {
  try {
    const filePath = join(webappPath, issue.file);
    
    switch (issue.type) {
      case 'outdated-dependency': {
        const packageJson = JSON.parse(readFileSync(filePath, 'utf-8'));
        // Use packageName from issue object, or fall back to extracting from message
        const depName = issue.packageName || issue.message.split(' ')[0];
        
        if (packageJson.dependencies?.[depName]) {
          packageJson.dependencies[depName] = issue.suggestedValue;
        } else if (packageJson.devDependencies?.[depName]) {
          packageJson.devDependencies[depName] = issue.suggestedValue;
        }
        
        writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
        return true;
      }
      
      case 'missing-dependency': {
        const packageJson = JSON.parse(readFileSync(filePath, 'utf-8'));
        
        if (!packageJson.dependencies) {
          packageJson.dependencies = {};
        }
        
        const depName = issue.message.match(/Missing (\w+) dependency/)?.[1];
        if (depName) {
          packageJson.dependencies[depName] = issue.suggestedValue;
        }
        
        writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
        return true;
      }
      
      case 'missing-script': {
        const packageJson = JSON.parse(readFileSync(filePath, 'utf-8'));
        
        if (!packageJson.scripts) {
          packageJson.scripts = {};
        }
        
        const scriptName = issue.message.includes('build') ? 'build' : 
                          issue.message.includes('preview') ? 'preview' : 'unknown';
        
        if (scriptName !== 'unknown') {
          packageJson.scripts[scriptName] = issue.suggestedValue;
        }
        
        writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
        return true;
      }
      
      case 'accessibility': {
        if (issue.file === 'index.html') {
          let html = readFileSync(filePath, 'utf-8');
          
          if (issue.message.includes('lang attribute')) {
            html = html.replace('<html>', '<html lang="en">');
          }
          
          if (issue.message.includes('viewport')) {
            const headClose = html.indexOf('</head>');
            if (headClose !== -1) {
              const viewport = '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n';
              html = html.slice(0, headClose) + viewport + html.slice(headClose);
            }
          }
          
          writeFileSync(filePath, html, 'utf-8');
          return true;
        }
        return false;
      }
      
      case 'missing-file': {
        if (issue.file === 'vite.config.js') {
          const viteConfig = `import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: true,
  },
});
`;
          writeFileSync(filePath, viteConfig, 'utf-8');
          return true;
        }
        
        if (issue.file === '.gitignore') {
          const gitignore = `node_modules/
dist/
.DS_Store
*.log
.env
.vscode/
.idea/
`;
          writeFileSync(filePath, gitignore, 'utf-8');
          return true;
        }
        
        return false;
      }
      
      default:
        return false;
    }
  } catch (err) {
    console.error(chalk.red(`Failed to apply fix: ${err.message}`));
    return false;
  }
}

/**
 * Format issue for display
 * @param {Object} issue - Issue object
 * @returns {string} Formatted issue
 */
function formatIssue(issue) {
  const severityColor = {
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,
  };
  
  const color = severityColor[issue.severity] || chalk.gray;
  const icon = issue.severity === 'error' ? '✗' : '⚠';
  
  let output = color(`  ${icon} [${issue.severity.toUpperCase()}] ${issue.file}`);
  output += '\n' + chalk.gray(`    ${issue.message}`);
  
  if (issue.autoFixable) {
    output += '\n' + chalk.green('    ↳ Auto-fixable');
  } else if (issue.suggestion) {
    output += '\n' + chalk.gray(`    ↳ ${issue.suggestion}`);
  }
  
  return output;
}

/**
 * Sync command handler
 * @param {string} webapp - Path to webapp directory
 * @param {Object} options - Command options
 */
export async function syncCommand(webapp, options) {
  try {
    console.log(chalk.blue('🔄 OpenSCAD Forge - Sync & Auto-Fix'));
    console.log(chalk.gray(`Webapp: ${webapp}\n`));
    
    const webappPath = resolve(webapp);
    
    if (!existsSync(webappPath)) {
      console.error(chalk.red(`✗ Webapp directory not found: ${webappPath}`));
      process.exit(1);
    }
    
    console.log(chalk.gray('Scanning for issues...\n'));
    const issues = detectIssues(webappPath);
    
    if (issues.length === 0) {
      console.log(chalk.green('✓ No issues found!'));
      return;
    }
    
    console.log(chalk.cyan(`Found ${issues.length} issue(s):\n`));
    for (const issue of issues) {
      console.log(formatIssue(issue));
    }
    console.log();
    
    const autoFixable = issues.filter((i) => i.autoFixable);
    console.log(chalk.blue(`Auto-fixable: ${autoFixable.length}/${issues.length}`));
    console.log();
    
    if (options.dryRun) {
      console.log(chalk.yellow('🔍 Dry run mode - no changes applied'));
      console.log(chalk.gray('Run without --dry-run to apply fixes'));
      return;
    }
    
    if (!options.applySafeFixes && !options.force) {
      console.log(chalk.yellow('No fixes applied (use --apply-safe-fixes or --force)'));
      console.log(chalk.gray('Options:'));
      console.log(chalk.gray('  --apply-safe-fixes : Apply only safe, auto-fixable changes'));
      console.log(chalk.gray('  --force           : Apply all fixes (may be breaking)'));
      return;
    }
    
    let issuesToFix = [];
    if (options.force) {
      issuesToFix = issues;
      console.log(chalk.yellow('⚠ Force mode enabled - applying all fixes'));
    } else if (options.applySafeFixes) {
      issuesToFix = autoFixable.filter((i) => i.severity !== 'error' || i.type !== 'missing-file');
      console.log(chalk.blue('Applying safe fixes...'));
    }
    
    let fixed = 0;
    let failed = 0;
    
    for (const issue of issuesToFix) {
      if (issue.autoFixable) {
        const success = applyFix(webappPath, issue);
        if (success) {
          console.log(chalk.green(`  ✓ Fixed: ${issue.file} - ${issue.message}`));
          fixed++;
        } else {
          console.log(chalk.red(`  ✗ Failed: ${issue.file} - ${issue.message}`));
          failed++;
        }
      }
    }
    
    console.log();
    console.log(chalk.blue('─'.repeat(60)));
    console.log(chalk.green(`  ✓ Applied ${fixed} fix(es)`));
    if (failed > 0) {
      console.log(chalk.red(`  ✗ Failed ${failed} fix(es)`));
    }
    console.log(chalk.blue('═'.repeat(60)));
    
    const remainingIssues = detectIssues(webappPath);
    if (remainingIssues.length > 0) {
      console.log();
      console.log(chalk.yellow(`⚠ ${remainingIssues.length} issue(s) remaining`));
      console.log(chalk.gray('Some issues require manual intervention'));
    } else {
      console.log();
      console.log(chalk.green('✓ All issues resolved!'));
    }
    
  } catch (err) {
    console.error(chalk.red(`✗ Unexpected error: ${err.message}`));
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}
