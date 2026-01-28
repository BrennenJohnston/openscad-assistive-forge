/**
 * Ajv validation schemas for runtime boundary validation
 * @license GPL-3.0-or-later
 */

import Ajv from 'ajv';
import {
  FILE_SIZE_LIMITS,
  URL_PARAM_LIMITS,
  STORAGE_LIMITS,
} from './validation-constants.js';
import { isValidHexColor } from './color-utils.js';

// Initialize Ajv with options
const ajv = new Ajv({
  allErrors: true, // Collect all errors, not just first
  coerceTypes: true, // Auto-convert types (important for URL params)
  removeAdditional: false, // Keep extra properties
  useDefaults: true, // Apply default values from schema
  allowUnionTypes: true, // Allow "type: [..]" without strict warnings
});

/**
 * File upload validation schema
 */
const fileUploadSchema = {
  type: 'object',
  required: ['name', 'size'],
  properties: {
    name: { type: 'string', minLength: 1 },
    size: { type: 'number', minimum: 0 },
  },
  anyOf: [
    {
      properties: {
        name: { type: 'string', pattern: '\\.scad$' },
        size: { type: 'number', maximum: FILE_SIZE_LIMITS.SCAD_FILE },
      },
    },
    {
      properties: {
        name: { type: 'string', pattern: '\\.zip$' },
        size: { type: 'number', maximum: FILE_SIZE_LIMITS.ZIP_FILE },
      },
    },
  ],
};

/**
 * URL parameter validation schema (for model parameters from hash)
 * This validates individual parameter values, not the URL structure itself
 * Note: URL params are always strings, so we validate as string type
 */
const urlParamValueSchema = {
  type: 'string',
  maxLength: URL_PARAM_LIMITS.MAX_STRING_LENGTH,
};

/**
 * localStorage draft state validation schema
 */
const draftStateSchema = {
  type: 'object',
  required: ['fileName', 'fileContent'],
  properties: {
    fileName: { type: 'string', minLength: 1, maxLength: 255 },
    fileContent: { type: 'string', maxLength: STORAGE_LIMITS.MAX_DRAFT_SIZE },
    parameters: { type: 'object', default: {} },
    defaults: { type: 'object', default: {} },
    version: { type: ['number', 'string'], default: 1 },
    timestamp: { type: 'number', default: 0 },
  },
};

/**
 * localStorage preset validation schema
 */
const presetSchema = {
  type: 'object',
  required: ['name', 'parameters'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    parameters: { type: 'object' },
    version: { type: 'number', default: 1 },
    timestamp: { type: 'number', default: 0 },
  },
};

/**
 * localStorage presets collection validation schema
 */
const presetsCollectionSchema = {
  type: 'array',
  items: presetSchema,
  maxItems: STORAGE_LIMITS.MAX_PRESETS_COUNT,
};

/**
 * localStorage library enablement map validation schema
 */
const libraryMapSchema = {
  type: 'object',
  patternProperties: {
    '^[a-zA-Z0-9_-]+$': { type: 'boolean' },
  },
  additionalProperties: false,
};

/**
 * Saved project validation schema
 */
const savedProjectSchema = {
  type: 'object',
  required: [
    'id',
    'schemaVersion',
    'name',
    'originalName',
    'kind',
    'mainFilePath',
    'content',
    'notes',
    'savedAt',
    'lastLoadedAt',
  ],
  properties: {
    id: { type: 'string', minLength: 1 },
    schemaVersion: { type: 'number', minimum: 1, maximum: 100 },
    name: { type: 'string', minLength: 1, maxLength: 255 },
    originalName: { type: 'string', minLength: 1, maxLength: 255 },
    kind: { type: 'string', enum: ['scad', 'zip'] },
    mainFilePath: { type: 'string', minLength: 1, maxLength: 500 },
    content: {
      type: 'string',
      maxLength: STORAGE_LIMITS.MAX_SAVED_PROJECT_SIZE,
    },
    projectFiles: { type: ['string', 'null'], default: null },
    notes: {
      type: 'string',
      maxLength: STORAGE_LIMITS.MAX_NOTES_LENGTH,
      default: '',
    },
    savedAt: { type: 'number', minimum: 0 },
    lastLoadedAt: { type: 'number', minimum: 0 },
  },
};

/**
 * Saved projects collection validation schema
 */
const savedProjectsCollectionSchema = {
  type: 'array',
  items: savedProjectSchema,
  maxItems: STORAGE_LIMITS.MAX_SAVED_PROJECTS_COUNT,
};

// Compile validators
export const validateFileUpload = ajv.compile(fileUploadSchema);
export const validateUrlParamValue = ajv.compile(urlParamValueSchema);
export const validateDraftState = ajv.compile(draftStateSchema);
export const validatePreset = ajv.compile(presetSchema);
export const validatePresetsCollection = ajv.compile(presetsCollectionSchema);
export const validateLibraryMap = ajv.compile(libraryMapSchema);
export const validateSavedProject = ajv.compile(savedProjectSchema);
export const validateSavedProjectsCollection = ajv.compile(
  savedProjectsCollectionSchema
);

/**
 * Validate URL params object (all values)
 * @param {Object} params - Parameter object to validate
 * @returns {{valid: boolean, sanitized: Object, errors: Array}}
 */
export function validateUrlParams(params) {
  if (!params || typeof params !== 'object') {
    return {
      valid: false,
      sanitized: {},
      errors: ['params must be an object'],
    };
  }

  const sanitized = {};
  const errors = [];

  for (const [key, value] of Object.entries(params)) {
    const valid = validateUrlParamValue(value);
    if (valid) {
      sanitized[key] = value;
    } else {
      errors.push(
        `Invalid value for parameter '${key}': ${JSON.stringify(value)}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    sanitized,
    errors,
  };
}

/**
 * Get user-friendly error messages from Ajv errors
 * @param {Array} errors - Ajv errors array
 * @returns {string}
 */
export function getValidationErrorMessage(errors) {
  if (!errors || errors.length === 0) return 'Validation failed';

  const messages = errors.map((err) => {
    const path = err.instancePath || err.dataPath || 'data';
    const message = err.message || 'invalid';
    return `${path}: ${message}`;
  });

  return messages.join('; ');
}

/**
 * Create a parameter validator from JSON Schema
 * This validates parameter values against their schema constraints
 * @param {Object} schema - JSON Schema (from schema-generator.js)
 * @returns {Function} Validator function (params) => {valid, errors, sanitized}
 */
export function createParameterValidator(schema) {
  if (!schema || !schema.properties) {
    return () => ({ valid: true, errors: [], sanitized: {} });
  }

  // Compile the schema
  const validate = ajv.compile(schema);

  /**
   * Validate parameter values
   * @param {Object} params - Parameter values to validate
   * @returns {{valid: boolean, errors: Array, sanitized: Object}}
   */
  return function validateParameters(params) {
    if (!params || typeof params !== 'object') {
      return {
        valid: false,
        errors: ['Parameters must be an object'],
        sanitized: {},
      };
    }

    // Clone params to avoid mutation
    const data = { ...params };

    // Run validation
    const valid = validate(data);

    if (valid) {
      return {
        valid: true,
        errors: [],
        sanitized: data,
      };
    }

    // Convert errors to user-friendly format
    const errors = (validate.errors || []).map((err) => {
      const paramName = err.instancePath?.replace(/^\//, '') || 'unknown';
      const constraint = err.keyword;
      const expected = err.params;

      switch (constraint) {
        case 'minimum':
          return `${paramName}: value must be at least ${expected.limit}`;
        case 'maximum':
          return `${paramName}: value must be at most ${expected.limit}`;
        case 'type':
          return `${paramName}: expected ${expected.type}`;
        case 'enum':
          return `${paramName}: must be one of: ${expected.allowedValues?.join(', ')}`;
        case 'pattern':
          return `${paramName}: invalid format`;
        case 'multipleOf':
          return `${paramName}: must be a multiple of ${expected.multipleOf}`;
        default:
          return `${paramName}: ${err.message || 'invalid value'}`;
      }
    });

    return {
      valid: false,
      errors,
      sanitized: data,
    };
  };
}

/**
 * Validate a single parameter value against schema constraints
 * @param {string} paramName - Parameter name
 * @param {*} value - Value to validate
 * @param {Object} propertySchema - JSON Schema property definition
 * @returns {{valid: boolean, error: string|null, coerced: *}}
 */
export function validateParameterValue(paramName, value, propertySchema) {
  if (!propertySchema) {
    return { valid: true, error: null, coerced: value };
  }

  let coerced = value;
  const errors = [];

  // Type coercion
  if (propertySchema.type === 'integer') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      errors.push(`${paramName}: must be an integer`);
    } else {
      coerced = parsed;
    }
  } else if (propertySchema.type === 'number') {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      errors.push(`${paramName}: must be a number`);
    } else {
      coerced = parsed;
    }
  } else if (propertySchema.type === 'boolean') {
    if (typeof value === 'string') {
      coerced = value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
    } else {
      coerced = Boolean(value);
    }
  }

  // Range validation (for numeric types)
  if (typeof coerced === 'number') {
    if (
      propertySchema.minimum !== undefined &&
      coerced < propertySchema.minimum
    ) {
      errors.push(`${paramName}: must be at least ${propertySchema.minimum}`);
    }
    if (
      propertySchema.maximum !== undefined &&
      coerced > propertySchema.maximum
    ) {
      errors.push(`${paramName}: must be at most ${propertySchema.maximum}`);
    }
    if (
      propertySchema.multipleOf !== undefined &&
      coerced % propertySchema.multipleOf !== 0
    ) {
      errors.push(
        `${paramName}: must be a multiple of ${propertySchema.multipleOf}`
      );
    }
  }

  // Enum validation
  if (propertySchema.enum && !propertySchema.enum.includes(coerced)) {
    // Try case-insensitive match for strings
    if (typeof coerced === 'string') {
      const match = propertySchema.enum.find(
        (e) => String(e).toLowerCase() === coerced.toLowerCase()
      );
      if (match) {
        coerced = match;
      } else {
        errors.push(
          `${paramName}: must be one of: ${propertySchema.enum.join(', ')}`
        );
      }
    } else {
      errors.push(
        `${paramName}: must be one of: ${propertySchema.enum.join(', ')}`
      );
    }
  }

  // Color validation - use shared utility
  if (propertySchema.format === 'color') {
    if (!isValidHexColor(String(coerced))) {
      errors.push(
        `${paramName}: must be a valid hex color (e.g., FF0000 or #FF0000)`
      );
    }
  }

  return {
    valid: errors.length === 0,
    error: errors.length > 0 ? errors.join('; ') : null,
    coerced,
  };
}

/**
 * Clamp parameter values to their schema constraints
 * Useful for sanitizing URL parameters or external input
 * @param {Object} params - Parameter values
 * @param {Object} schema - JSON Schema
 * @returns {Object} Clamped parameter values
 */
export function clampParameterValues(params, schema) {
  if (!params || !schema?.properties) {
    return params;
  }

  const result = { ...params };

  for (const [name, value] of Object.entries(params)) {
    const prop = schema.properties[name];
    if (!prop) continue;

    let clamped = value;

    // Coerce to number if needed
    if (prop.type === 'integer' || prop.type === 'number') {
      const num =
        prop.type === 'integer' ? parseInt(value, 10) : parseFloat(value);
      if (!isNaN(num)) {
        clamped = num;

        // Clamp to range
        if (prop.minimum !== undefined && clamped < prop.minimum) {
          clamped = prop.minimum;
        }
        if (prop.maximum !== undefined && clamped > prop.maximum) {
          clamped = prop.maximum;
        }

        // Round to step
        if (prop.multipleOf !== undefined) {
          clamped = Math.round(clamped / prop.multipleOf) * prop.multipleOf;
        }
      }
    }

    // Validate enum
    if (prop.enum && !prop.enum.includes(clamped)) {
      // Use default if available, otherwise first enum value
      clamped = prop.default !== undefined ? prop.default : prop.enum[0];
    }

    result[name] = clamped;
  }

  return result;
}
