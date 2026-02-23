#!/usr/bin/env node

/**
 * OpenSCAD Forge CLI - Developer Toolchain
 * @license GPL-3.0-or-later
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Import commands
import { extractCommand } from '../cli/commands/extract.js';
import { scaffoldCommand } from '../cli/commands/scaffold.js';
import { validateCommand } from '../cli/commands/validate.js';
import { syncCommand } from '../cli/commands/sync.js';
import { themeCommand } from '../cli/commands/theme.js';
import { ciCommand } from '../cli/commands/ci.js';
import { manifestCommand } from '../cli/commands/manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
);

const program = new Command();

program
  .name('openscad-forge')
  .description('Developer toolchain for OpenSCAD Customizer projects')
  .version(packageJson.version);

// Extract command
program
  .command('extract <file>')
  .description('Extract parameters from an OpenSCAD file to JSON Schema')
  .option('-o, --out <path>', 'Output file path', 'params.schema.json')
  .option('-f, --format <format>', 'Output format (json|yaml)', 'json')
  .option('--pretty', 'Pretty-print JSON output', false)
  .action(extractCommand);

// Scaffold command
program
  .command('scaffold')
  .description('Generate a standalone web app from schema and scad file')
  .requiredOption('-s, --schema <path>', 'Parameter schema JSON file')
  .requiredOption('--scad <path>', 'OpenSCAD source file')
  .option('-o, --out <path>', 'Output directory', './webapp')
  .option(
    '--template <name>',
    'Template to use (vanilla|react|vue|svelte|angular|preact)',
    'vanilla'
  )
  .option('--title <title>', 'App title')
  .option('--theme <theme>', 'Theme preset (default|dark|custom)')
  .action(scaffoldCommand);

// Validate command
program
  .command('validate <webapp>')
  .description('Validate parity between implementations')
  .option('--cases <path>', 'Test cases YAML file')
  .option('--ref <ref>', 'Reference implementation (docker-openscad|wasm)', 'wasm')
  .option('--tolerance <n>', 'STL comparison tolerance', '0.001')
  .option('--format <format>', 'Output format (text|json|junit)', 'text')
  .option('--save-fixtures', 'Save test cases as golden fixtures', false)
  .action(validateCommand);

// Sync command
program
  .command('sync <webapp>')
  .description('Detect and apply safe auto-fixes to a web app')
  .option('--dry-run', 'Show what would be fixed without applying', false)
  .option('--apply-safe-fixes', 'Apply safe fixes automatically', false)
  .option('--force', 'Apply all fixes including potentially breaking ones', false)
  .action(syncCommand);

// Theme command
program
  .command('theme')
  .description('Generate custom color themes for your web app')
  .option('-o, --out <path>', 'Output CSS file path')
  .option('--preset <name>', 'Use a theme preset (blue|purple|green|orange|slate)')
  .option('--custom', 'Generate custom theme from colors', false)
  .option('--primary <color>', 'Primary color (hex)')
  .option('--secondary <color>', 'Secondary color (hex)')
  .option('--background <color>', 'Background color (hex)')
  .option('--list', 'List available theme presets', false)
  .option('--force', 'Overwrite existing file', false)
  .action(themeCommand);

// CI command
program
  .command('ci')
  .description('Generate CI/CD configuration files')
  .option('--provider <name>', 'CI/CD provider (github|gitlab|vercel|netlify|docker|validation)')
  .option('-o, --out <path>', 'Output directory', '.')
  .option('--list', 'List available providers', false)
  .action(ciCommand);

// Manifest command
program
  .command('manifest <path>')
  .description('Auto-generate forge-manifest.json from a local folder or .zip file')
  .option('-o, --out <path>', 'Output file path (default: stdout)')
  .option('--zip', 'Generate a bundle-style manifest pointing to a .zip file', false)
  .option('--name <name>', 'Project name (defaults to folder/file name)')
  .option('--author <author>', 'Author name')
  .action(manifestCommand);

program.parse();
