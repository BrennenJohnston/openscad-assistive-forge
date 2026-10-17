/**
 * Runtime boundary validation. The checks themselves are written ahead of
 * time from the schemas in validation-schema-defs.js (see
 * scripts/build-validators.mjs), so the page compiles no code at run time.
 * @license GPL-3.0-or-later
 */

import {
  validateFileUpload,
  validateUrlParamValue,
  validateDraftState,
  validatePreset,
  validatePresetsCollection,
  validateLibraryMap,
  validateSavedProject,
  validateSavedProjectsCollection,
} from './generated/validators.js';
import { isValidHexColor } from './color-utils.js';

export {
  validateFileUpload,
  validateUrlParamValue,
  validateDraftState,
  validatePreset,
  validatePresetsCollection,
  validateLibraryMap,
  validateSavedProject,
  /** @reserved Planned for bulk import/export validation of project collections. */
  validateSavedProjectsCollection,
};

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
 * Validate a single parameter value against schema constraints
 * @reserved Planned for real-time input validation as users type.
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
 * @reserved Planned for URL-parameter and preset-import sanitization.
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
