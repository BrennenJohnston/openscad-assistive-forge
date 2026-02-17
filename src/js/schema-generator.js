/**
 * JSON Schema Generator
 * Converts extracted OpenSCAD parameters to standard JSON Schema format
 * @license GPL-3.0-or-later
 */

/**
 * Schema version for compatibility tracking
 * Follows semver: breaking changes = major bump
 */
export const SCHEMA_VERSION = '1.0.0';

/**
 * JSON Schema draft version
 */
export const JSON_SCHEMA_DRAFT = 'https://json-schema.org/draft/2020-12/schema';

/**
 * Convert a single parameter to JSON Schema property definition
 * @param {Object} param - Parameter from extractParameters()
 * @returns {Object} JSON Schema property definition
 */
function paramToSchemaProperty(param) {
  const property = {};

  // Map types to JSON Schema types
  switch (param.type) {
    case 'integer':
      property.type = 'integer';
      break;
    case 'number':
      property.type = 'number';
      break;
    case 'boolean':
      property.type = 'boolean';
      break;
    case 'color':
      property.type = 'string';
      property.format = 'color';
      property.pattern = '^#?[0-9A-Fa-f]{6}$';
      break;
    case 'file':
      property.type = 'object';
      property.format = 'file';
      property.properties = {
        name: { type: 'string' },
        size: { type: 'integer' },
        type: { type: 'string' },
        data: { type: 'string', contentEncoding: 'base64' },
      };
      break;
    case 'vector':
      property.type = 'array';
      property.format = 'vector';
      // Define items based on components or default to numbers
      if (param.nested) {
        // Nested vectors: array of arrays
        property.items = {
          type: 'array',
          items: { type: 'number' },
        };
      } else {
        property.items = { type: 'number' };
        // Add constraints to items if defined
        if (param.minimum !== undefined) {
          property.items.minimum = param.minimum;
        }
        if (param.maximum !== undefined) {
          property.items.maximum = param.maximum;
        }
      }
      // Store dimension as extension
      if (param.dimension !== undefined) {
        property['x-dimension'] = param.dimension;
        property.minItems = param.dimension;
        property.maxItems = param.dimension;
      }
      // Store component metadata as extension
      if (param.components) {
        property['x-components'] = param.components;
      }
      break;
    case 'raw':
      // Raw/expression types - store as string with original value
      property.type = 'string';
      property.format = 'expression';
      if (param.rawValue) {
        property['x-raw-value'] = param.rawValue;
      }
      if (param.parseFailureReason) {
        property['x-parse-failure'] = param.parseFailureReason;
      }
      break;
    case 'string':
    default:
      property.type = 'string';
      break;
  }

  // Add constraints
  if (param.minimum !== undefined) {
    property.minimum = param.minimum;
  }
  if (param.maximum !== undefined) {
    property.maximum = param.maximum;
  }
  if (param.step !== undefined) {
    property.multipleOf = param.step;
  }
  if (param.enum !== undefined && param.enum.length > 0) {
    property.enum = param.enum;
  }

  // Add default value
  if (param.default !== undefined) {
    property.default = param.default;
  }

  // Add description
  if (param.description) {
    property.description = param.description;
  }

  // Add custom extensions for UI hints (x-* prefix for custom properties)
  if (param.uiType) {
    property['x-ui-type'] = param.uiType;
  }
  if (param.unit) {
    property['x-unit'] = param.unit;
  }
  if (param.group) {
    property['x-group'] = param.group;
  }
  if (param.order !== undefined) {
    property['x-order'] = param.order;
  }
  if (param.dependency) {
    property['x-dependency'] = param.dependency;
  }
  if (param.acceptedExtensions) {
    property['x-accepted-extensions'] = param.acceptedExtensions;
  }

  return property;
}

/**
 * Convert extracted parameters to JSON Schema
 * @param {Object} extracted - Output from extractParameters()
 * @param {Object} options - Additional schema options
 * @param {string} options.title - Schema title
 * @param {string} options.description - Schema description
 * @param {string} options.id - Schema $id
 * @returns {Object} JSON Schema object
 */
export function toJsonSchema(extracted, options = {}) {
  const { groups = [], parameters = {}, libraries = [] } = extracted;

  const schema = {
    $schema: JSON_SCHEMA_DRAFT,
    $id: options.id || 'openscad-parameters',
    title: options.title || 'OpenSCAD Parameters',
    description:
      options.description || 'Parameters extracted from OpenSCAD file',
    type: 'object',
    properties: {},
    'x-schema-version': SCHEMA_VERSION,
    'x-generator': 'openscad-assistive-forge',
  };

  // Add group definitions as custom extension
  if (groups.length > 0) {
    schema['x-groups'] = groups.map((group) => ({
      id: group.id,
      label: group.label,
      order: group.order,
    }));
  }

  // Add library dependencies
  if (libraries.length > 0) {
    schema['x-libraries'] = libraries;
  }

  // Convert each parameter to JSON Schema property
  for (const [name, param] of Object.entries(parameters)) {
    schema.properties[name] = paramToSchemaProperty(param);
  }

  // Add required array if there are any required parameters
  // Currently, all parameters have defaults, so none are required
  // But keep the structure for future extensibility
  const required = Object.entries(parameters)
    .filter(([_, param]) => param.required)
    .map(([name]) => name);

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

/**
 * Convert JSON Schema back to internal parameter format
 * @param {Object} schema - JSON Schema object
 * @returns {Object} Internal format { groups, parameters }
 */
export function fromJsonSchema(schema) {
  const groups = [];
  const parameters = {};

  // Extract groups from custom extension
  if (schema['x-groups']) {
    groups.push(
      ...schema['x-groups'].map((g) => ({
        id: g.id,
        label: g.label,
        order: g.order,
      }))
    );
  }

  // Convert properties to parameters
  if (schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      const param = {
        name,
        default: prop.default,
        description: prop.description || '',
      };

      // Map JSON Schema type to internal type
      if (prop.format === 'color') {
        param.type = 'color';
        param.uiType = 'color';
      } else if (prop.format === 'file') {
        param.type = 'file';
        param.uiType = 'file';
      } else if (prop.format === 'vector' || (prop.type === 'array' && prop['x-dimension'])) {
        param.type = 'vector';
        param.uiType = 'vector';
        if (prop['x-dimension'] !== undefined) {
          param.dimension = prop['x-dimension'];
        }
        if (prop['x-components']) {
          param.components = prop['x-components'];
        }
        // Extract item constraints
        if (prop.items) {
          if (prop.items.minimum !== undefined) {
            param.minimum = prop.items.minimum;
          }
          if (prop.items.maximum !== undefined) {
            param.maximum = prop.items.maximum;
          }
        }
      } else if (prop.format === 'expression') {
        param.type = 'raw';
        param.uiType = 'raw';
        if (prop['x-raw-value']) {
          param.rawValue = prop['x-raw-value'];
        }
        if (prop['x-parse-failure']) {
          param.parseFailureReason = prop['x-parse-failure'];
        }
      } else if (prop.type === 'integer') {
        param.type = 'integer';
      } else if (prop.type === 'number') {
        param.type = 'number';
      } else if (prop.type === 'boolean') {
        param.type = 'boolean';
        param.uiType = 'toggle';
      } else if (prop.type === 'array') {
        // Generic array without vector format - treat as vector
        param.type = 'vector';
        param.uiType = 'vector';
        if (prop.minItems !== undefined) {
          param.dimension = prop.minItems;
        }
      } else {
        param.type = 'string';
      }

      // Extract constraints
      if (prop.minimum !== undefined) {
        param.minimum = prop.minimum;
      }
      if (prop.maximum !== undefined) {
        param.maximum = prop.maximum;
      }
      if (prop.multipleOf !== undefined) {
        param.step = prop.multipleOf;
      }
      if (prop.enum) {
        param.enum = prop.enum;
        param.uiType =
          prop.enum.length === 2 &&
          prop.enum.map((v) => String(v).toLowerCase()).includes('yes') &&
          prop.enum.map((v) => String(v).toLowerCase()).includes('no')
            ? 'toggle'
            : 'select';
      }

      // Extract custom extensions
      if (prop['x-ui-type']) {
        param.uiType = prop['x-ui-type'];
      }
      if (prop['x-unit']) {
        param.unit = prop['x-unit'];
      }
      if (prop['x-group']) {
        param.group = prop['x-group'];
      }
      if (prop['x-order'] !== undefined) {
        param.order = prop['x-order'];
      }
      if (prop['x-dependency']) {
        param.dependency = prop['x-dependency'];
      }
      if (prop['x-accepted-extensions']) {
        param.acceptedExtensions = prop['x-accepted-extensions'];
      }

      // Determine UI type if not specified
      if (!param.uiType) {
        if (
          param.minimum !== undefined &&
          param.maximum !== undefined &&
          (param.type === 'integer' || param.type === 'number')
        ) {
          param.uiType = 'slider';
        } else if (param.type === 'integer' || param.type === 'number') {
          param.uiType = 'input';
        } else {
          param.uiType = 'input';
        }
      }

      // Default group if not specified
      if (!param.group) {
        param.group = 'General';
      }

      parameters[name] = param;
    }
  }

  // Ensure at least one group exists
  if (groups.length === 0) {
    groups.push({ id: 'General', label: 'General', order: 0 });
  }

  // Extract libraries from custom extension
  const libraries = schema['x-libraries'] || [];

  return { groups, parameters, libraries };
}

/**
 * Validate a JSON Schema structure
 * @param {Object} schema - Schema to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateSchema(schema) {
  const errors = [];

  if (!schema) {
    errors.push('Schema is null or undefined');
    return { valid: false, errors };
  }

  if (typeof schema !== 'object') {
    errors.push('Schema must be an object');
    return { valid: false, errors };
  }

  if (schema.type !== 'object') {
    errors.push('Schema type must be "object"');
  }

  if (!schema.properties || typeof schema.properties !== 'object') {
    errors.push('Schema must have a "properties" object');
  } else {
    // Validate each property
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (!prop.type && !prop.enum) {
        errors.push(`Property "${name}" must have a type or enum`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Merge two schemas (useful for extending base schemas)
 * @param {Object} base - Base schema
 * @param {Object} extension - Extension schema (takes precedence)
 * @returns {Object} Merged schema
 */
export function mergeSchemas(base, extension) {
  const merged = {
    ...base,
    ...extension,
    properties: {
      ...(base.properties || {}),
      ...(extension.properties || {}),
    },
  };

  // Merge groups
  const baseGroups = base['x-groups'] || [];
  const extGroups = extension['x-groups'] || [];
  const groupMap = new Map();

  for (const group of [...baseGroups, ...extGroups]) {
    groupMap.set(group.id, group);
  }

  if (groupMap.size > 0) {
    merged['x-groups'] = Array.from(groupMap.values());
  }

  // Merge libraries
  const baseLibs = base['x-libraries'] || [];
  const extLibs = extension['x-libraries'] || [];
  const libSet = new Set([...baseLibs, ...extLibs]);

  if (libSet.size > 0) {
    merged['x-libraries'] = Array.from(libSet);
  }

  return merged;
}

/**
 * Get default values from a schema
 * @param {Object} schema - JSON Schema
 * @returns {Object} Map of parameter names to default values
 */
export function getSchemaDefaults(schema) {
  const defaults = {};

  if (schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (prop.default !== undefined) {
        defaults[name] = prop.default;
      }
    }
  }

  return defaults;
}

/**
 * Get schema metadata (groups, libraries, version)
 * @param {Object} schema - JSON Schema
 * @returns {Object} Metadata object
 */
export function getSchemaMetadata(schema) {
  return {
    title: schema.title,
    description: schema.description,
    version: schema['x-schema-version'],
    generator: schema['x-generator'],
    groups: schema['x-groups'] || [],
    libraries: schema['x-libraries'] || [],
    propertyCount: Object.keys(schema.properties || {}).length,
  };
}
