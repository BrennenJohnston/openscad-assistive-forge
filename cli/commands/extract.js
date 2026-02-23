/**
 * Extract command - Extract parameters from OpenSCAD files to JSON Schema
 * @license GPL-3.0-or-later
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, basename } from 'path';
import chalk from 'chalk';
import YAML from 'yaml';
import { extractParameters } from '../../src/js/parser.js';

/**
 * Convert extracted parameters to JSON Schema format
 * @param {Object} extracted - Extracted parameters from parser
 * @param {string} filename - Source filename
 * @returns {Object} JSON Schema object
 */
function toJsonSchema(extracted, filename) {
  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `https://openscad-forge.example.com/schemas/${basename(filename, '.scad')}.json`,
    title: extracted.metadata?.title || basename(filename, '.scad'),
    description: extracted.metadata?.description || `Parameters for ${basename(filename)}`,
    type: 'object',
    properties: {},
    required: [],
  };

  // Add metadata if available
  if (extracted.metadata) {
    schema['x-metadata'] = {
      version: extracted.metadata.version,
      author: extracted.metadata.author,
      license: extracted.metadata.license,
      url: extracted.metadata.url,
    };
  }

  // Convert groups to schema
  if (extracted.groups && extracted.groups.length > 0) {
    // Note: web parser emits groups as { id, label, order }.
    // Keep output stable for consumers by emitting { name, label, collapsed, order }.
    schema['x-groups'] = extracted.groups.map((group) => {
      const g = {
        name: group.name || group.id || group.label,
        label: group.label || group.name || group.id,
        collapsed: group.collapsed || false,
      };
      if (typeof group.order === 'number') {
        g.order = group.order;
      }
      return g;
    });
  }

  // Convert parameters to schema properties
  for (const [paramName, param] of Object.entries(extracted.parameters)) {
    const property = {
      type: param.type,
      title: param.label || paramName,
      description: param.description || '',
      default: param.default,
    };

    // Add x-group for grouping
    if (param.group) {
      property['x-group'] = param.group;
    }

    // Add order for UI rendering
    if (typeof param.order === 'number') {
      property['x-order'] = param.order;
    }

    // Type-specific properties
    switch (param.type) {
      case 'number':
      case 'integer':
        // Web parser uses minimum/maximum/step; keep compat with older min/max too.
        if (typeof param.minimum !== 'undefined') property.minimum = param.minimum;
        else if (typeof param.min !== 'undefined') property.minimum = param.min;

        if (typeof param.maximum !== 'undefined') property.maximum = param.maximum;
        else if (typeof param.max !== 'undefined') property.maximum = param.max;

        if (typeof param.step !== 'undefined') property['x-step'] = param.step;
        break;

      case 'string':
        if (param.enum && param.enum.length > 0) {
          property.enum = param.enum;
        }
        if (param.minLength) property.minLength = param.minLength;
        if (param.maxLength) property.maxLength = param.maxLength;
        if (param.pattern) property.pattern = param.pattern;
        break;

      case 'boolean':
        // No additional properties needed
        break;

      case 'color':
        // Color parameters use string type in JSON Schema with x-hint
        property.type = 'string';
        property['x-hint'] = 'color';
        break;

      case 'file':
        // File parameters use string type (filename) with x-hint
        property.type = 'string';
        property['x-hint'] = 'file';
        if (param.acceptedExtensions && param.acceptedExtensions.length > 0) {
          property['x-accepted-extensions'] = param.acceptedExtensions;
        }
        break;
    }

    // Add UI type hint if available (slider, toggle, select, input)
    // This helps UI generators create appropriate controls
    if (param.uiType && !property['x-hint']) {
      property['x-hint'] = param.uiType;
    }

    schema.properties[paramName] = property;

    // Mark as required if specified
    if (param.required) {
      schema.required.push(paramName);
    }
  }

  // Remove required array if empty
  if (schema.required.length === 0) {
    delete schema.required;
  }

  return schema;
}

/**
 * Extract command handler
 * @param {string} file - Input .scad file path
 * @param {Object} options - Command options
 */
export async function extractCommand(file, options) {
  try {
    console.log(chalk.blue('🔍 OpenSCAD Forge - Parameter Extraction'));
    console.log(chalk.gray(`Input: ${file}`));

    const filePath = resolve(file);
    let scadContent;
    try {
      scadContent = readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.error(chalk.red(`✗ Failed to read file: ${err.message}`));
      process.exit(1);
    }

    console.log(chalk.gray('Parsing parameters...'));

    const extracted = extractParameters(scadContent);

    if (!extracted.parameters || Object.keys(extracted.parameters).length === 0) {
      console.log(chalk.yellow('⚠ No parameters found in file'));
      console.log(
        chalk.gray(
          'Hint: Use Customizer annotations like:\n' +
            '  // My Parameter [min:0, max:100, step:5]\n' +
            '  my_param = 50;'
        )
      );
      process.exit(0);
    }

    const paramCount = Object.keys(extracted.parameters).length;
    const groupCount = extracted.groups?.length || 0;
    console.log(chalk.green(`✓ Found ${paramCount} parameter(s) in ${groupCount} group(s)`));

    const schema = toJsonSchema(extracted, file);

    let output;
    if (options.format === 'yaml') {
      output = YAML.stringify(schema);
    } else if (options.format === 'json') {
      output = options.pretty ? JSON.stringify(schema, null, 2) : JSON.stringify(schema);
    } else {
      console.error(chalk.red(`✗ Unsupported format: ${options.format}`));
      console.log(chalk.gray('Supported formats: json, yaml'));
      process.exit(1);
    }

    const outPath = resolve(options.out);
    try {
      writeFileSync(outPath, output + '\n', 'utf-8');
      console.log(chalk.green(`✓ Schema written to: ${outPath}`));
    } catch (err) {
      console.error(chalk.red(`✗ Failed to write output: ${err.message}`));
      process.exit(1);
    }

    console.log(chalk.blue('\n📋 Summary:'));
    console.log(chalk.gray(`  Parameters: ${paramCount}`));
    console.log(chalk.gray(`  Groups: ${groupCount}`));
    console.log(chalk.gray(`  Schema version: draft-07`));
    console.log(chalk.gray(`  Output format: ${options.format}`));

    if (groupCount > 0) {
      console.log(chalk.blue('\n📦 Parameters by group:'));
      for (const group of extracted.groups) {
        const groupName = group.label || group.name;
        const groupParams = Object.entries(extracted.parameters).filter(
          ([_, param]) => param.group === groupName
        );
        console.log(chalk.cyan(`  ${groupName} (${groupParams.length})`));
        groupParams.forEach(([name, param]) => {
          console.log(chalk.gray(`    - ${name}: ${param.type} = ${JSON.stringify(param.default)}`));
        });
      }
    }

    console.log(chalk.green('\n✓ Extraction complete!'));
  } catch (err) {
    console.error(chalk.red(`✗ Unexpected error: ${err.message}`));
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}
