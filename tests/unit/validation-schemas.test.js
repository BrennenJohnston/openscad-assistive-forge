/**
 * Unit tests for validation schemas (Ajv boundary validation)
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateFileUpload,
  validateUrlParamValue,
  validateUrlParams,
  validateDraftState,
  validatePreset,
  validatePresetsCollection,
  validateLibraryMap,
  getValidationErrorMessage,
} from '../../src/js/validation-schemas.js';
import {
  FILE_SIZE_LIMITS,
  URL_PARAM_LIMITS,
  STORAGE_LIMITS,
} from '../../src/js/validation-constants.js';

describe('Validation Schemas', () => {
  describe('File Upload Validation', () => {
    it('should validate valid .scad file', () => {
      const file = { name: 'test.scad', size: 1024 };
      expect(validateFileUpload(file)).toBe(true);
    });

    it('should validate valid .zip file', () => {
      const file = { name: 'project.zip', size: 5 * 1024 * 1024 };
      expect(validateFileUpload(file)).toBe(true);
    });

    it('should reject file exceeding .scad size limit', () => {
      const file = { name: 'large.scad', size: FILE_SIZE_LIMITS.SCAD_FILE + 1 };
      expect(validateFileUpload(file)).toBe(false);
    });

    it('should reject file exceeding .zip size limit', () => {
      const file = { name: 'large.zip', size: FILE_SIZE_LIMITS.ZIP_FILE + 1 };
      expect(validateFileUpload(file)).toBe(false);
    });

    it('should reject file with missing name', () => {
      const file = { size: 1024 };
      expect(validateFileUpload(file)).toBe(false);
    });

    it('should reject file with missing size', () => {
      const file = { name: 'test.scad' };
      expect(validateFileUpload(file)).toBe(false);
    });

    it('should reject file with empty name', () => {
      const file = { name: '', size: 1024 };
      expect(validateFileUpload(file)).toBe(false);
    });

    it('should reject file with negative size', () => {
      const file = { name: 'test.scad', size: -1 };
      expect(validateFileUpload(file)).toBe(false);
    });

    it('should reject unsupported file extension', () => {
      const file = { name: 'test.exe', size: 1024 };
      expect(validateFileUpload(file)).toBe(false);
    });
  });

  describe('URL Parameter Value Validation', () => {
    it('should validate valid string', () => {
      expect(validateUrlParamValue('hello')).toBe(true);
    });

    it('should validate numeric string', () => {
      expect(validateUrlParamValue('42')).toBe(true);
    });

    it('should validate boolean string', () => {
      expect(validateUrlParamValue('true')).toBe(true);
      expect(validateUrlParamValue('false')).toBe(true);
    });

    it('should validate empty string', () => {
      expect(validateUrlParamValue('')).toBe(true);
    });

    it('should reject string exceeding max length', () => {
      const longString = 'a'.repeat(URL_PARAM_LIMITS.MAX_STRING_LENGTH + 1);
      expect(validateUrlParamValue(longString)).toBe(false);
    });

    it('should coerce null to empty string', () => {
      // With coerceTypes: true, null is coerced to empty string
      expect(validateUrlParamValue(null)).toBe(true);
    });

    it('should reject undefined', () => {
      expect(validateUrlParamValue(undefined)).toBe(false);
    });

    it('should reject object', () => {
      expect(validateUrlParamValue({ key: 'value' })).toBe(false);
    });

    it('should reject array', () => {
      expect(validateUrlParamValue([1, 2, 3])).toBe(false);
    });
  });

  describe('URL Params Collection Validation', () => {
    it('should validate valid params object with strings', () => {
      const params = { width: '10', height: '20', label: 'test' };
      const result = validateUrlParams(params);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual(params);
      expect(result.errors).toEqual([]);
    });

    it('should handle null values (coerced to empty string)', () => {
      // With coerceTypes: true, null is coerced to empty string
      const params = { width: '10', invalid: null, height: '20' };
      const result = validateUrlParams(params);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual({ width: '10', invalid: null, height: '20' });
    });

    it('should handle empty object', () => {
      const result = validateUrlParams({});
      expect(result.valid).toBe(true);
      expect(result.sanitized).toEqual({});
      expect(result.errors).toEqual([]);
    });

    it('should reject non-object input', () => {
      const result = validateUrlParams(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle mixed valid and invalid values', () => {
      const params = {
        valid1: 'test',
        invalid1: { nested: 'object' },
        valid2: '42',
        invalid2: [1, 2, 3],
      };
      const result = validateUrlParams(params);
      expect(result.valid).toBe(false);
      expect(result.sanitized).toEqual({ valid1: 'test', valid2: '42' });
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('Draft State Validation', () => {
    it('should validate valid draft state', () => {
      const draft = {
        fileName: 'test.scad',
        fileContent: 'cube([10,10,10]);',
        parameters: { width: 10 },
        defaults: { width: 5 },
        version: 1,
        timestamp: Date.now(),
      };
      expect(validateDraftState(draft)).toBe(true);
    });

    it('should validate minimal draft state', () => {
      const draft = {
        fileName: 'test.scad',
        fileContent: 'cube([10,10,10]);',
      };
      expect(validateDraftState(draft)).toBe(true);
    });

    it('should apply default values for optional fields', () => {
      const draft = {
        fileName: 'test.scad',
        fileContent: 'cube([10,10,10]);',
      };
      validateDraftState(draft);
      expect(draft.parameters).toEqual({});
      expect(draft.defaults).toEqual({});
      expect(draft.version).toBeDefined();
      expect(draft.timestamp).toBeDefined();
    });

    it('should reject draft missing fileName', () => {
      const draft = {
        fileContent: 'cube([10,10,10]);',
      };
      expect(validateDraftState(draft)).toBe(false);
    });

    it('should reject draft missing fileContent', () => {
      const draft = {
        fileName: 'test.scad',
      };
      expect(validateDraftState(draft)).toBe(false);
    });

    it('should reject draft with empty fileName', () => {
      const draft = {
        fileName: '',
        fileContent: 'cube([10,10,10]);',
      };
      expect(validateDraftState(draft)).toBe(false);
    });

    it('should reject draft with fileName too long', () => {
      const draft = {
        fileName: 'a'.repeat(256),
        fileContent: 'cube([10,10,10]);',
      };
      expect(validateDraftState(draft)).toBe(false);
    });

    it('should reject draft with fileContent exceeding character limit', () => {
      // Note: maxLength in JSON Schema is for string character count, not bytes
      const draft = {
        fileName: 'test.scad',
        fileContent: 'a'.repeat(STORAGE_LIMITS.MAX_DRAFT_SIZE + 1),
      };
      expect(validateDraftState(draft)).toBe(false);
    });
  });

  describe('Preset Validation', () => {
    it('should validate valid preset', () => {
      const preset = {
        name: 'My Preset',
        parameters: { width: 10, height: 20 },
        version: 1,
        timestamp: Date.now(),
      };
      expect(validatePreset(preset)).toBe(true);
    });

    it('should validate minimal preset', () => {
      const preset = {
        name: 'My Preset',
        parameters: {},
      };
      expect(validatePreset(preset)).toBe(true);
    });

    it('should apply default values', () => {
      const preset = {
        name: 'My Preset',
        parameters: {},
      };
      validatePreset(preset);
      expect(preset.version).toBeDefined();
      expect(preset.timestamp).toBeDefined();
    });

    it('should reject preset missing name', () => {
      const preset = {
        parameters: {},
      };
      expect(validatePreset(preset)).toBe(false);
    });

    it('should reject preset missing parameters', () => {
      const preset = {
        name: 'My Preset',
      };
      expect(validatePreset(preset)).toBe(false);
    });

    it('should reject preset with empty name', () => {
      const preset = {
        name: '',
        parameters: {},
      };
      expect(validatePreset(preset)).toBe(false);
    });

    it('should reject preset with name too long', () => {
      const preset = {
        name: 'a'.repeat(101),
        parameters: {},
      };
      expect(validatePreset(preset)).toBe(false);
    });
  });

  describe('Presets Collection Validation', () => {
    it('should validate empty collection', () => {
      expect(validatePresetsCollection([])).toBe(true);
    });

    it('should validate collection with valid presets', () => {
      const presets = [
        { name: 'Preset 1', parameters: {} },
        { name: 'Preset 2', parameters: { width: 10 } },
      ];
      expect(validatePresetsCollection(presets)).toBe(true);
    });

    it('should reject collection with invalid preset', () => {
      const presets = [
        { name: 'Valid', parameters: {} },
        { name: '', parameters: {} }, // Invalid: empty name
      ];
      expect(validatePresetsCollection(presets)).toBe(false);
    });

    it('should reject collection exceeding max count', () => {
      const presets = Array.from({ length: STORAGE_LIMITS.MAX_PRESETS_COUNT + 1 }, (_, i) => ({
        name: `Preset ${i}`,
        parameters: {},
      }));
      expect(validatePresetsCollection(presets)).toBe(false);
    });

    it('should validate collection at max count', () => {
      const presets = Array.from({ length: STORAGE_LIMITS.MAX_PRESETS_COUNT }, (_, i) => ({
        name: `Preset ${i}`,
        parameters: {},
      }));
      expect(validatePresetsCollection(presets)).toBe(true);
    });
  });

  describe('Library Map Validation', () => {
    it('should validate empty library map', () => {
      expect(validateLibraryMap({})).toBe(true);
    });

    it('should validate valid library map', () => {
      const map = {
        'BOSL2': true,
        'threads-scad': false,
        'my_library': true,
      };
      expect(validateLibraryMap(map)).toBe(true);
    });

    it('should reject invalid key format', () => {
      const map = {
        'valid-key': true,
        'invalid key with spaces': true,
      };
      expect(validateLibraryMap(map)).toBe(false);
    });

    it('should reject non-boolean values', () => {
      const map = {
        'BOSL2': 'yes', // Should be boolean
      };
      expect(validateLibraryMap(map)).toBe(false);
    });

    it('should accept keys with alphanumeric, underscore, and dash', () => {
      const map = {
        'lib123': true,
        'my_lib': true,
        'my-lib': true,
        'MyLib': true,
      };
      expect(validateLibraryMap(map)).toBe(true);
    });
  });

  describe('Error Message Generation', () => {
    it('should generate message for empty errors', () => {
      const message = getValidationErrorMessage([]);
      expect(message).toBe('Validation failed');
    });

    it('should generate message for null errors', () => {
      const message = getValidationErrorMessage(null);
      expect(message).toBe('Validation failed');
    });

    it('should generate message from Ajv errors', () => {
      const file = { name: '', size: -1 };
      validateFileUpload(file);
      const message = getValidationErrorMessage(validateFileUpload.errors);
      expect(message).toContain('name');
      expect(message).toContain('size');
    });

    it('should join multiple errors with semicolon', () => {
      const file = { name: '', size: -1 };
      validateFileUpload(file);
      const message = getValidationErrorMessage(validateFileUpload.errors);
      expect(message).toContain(';');
    });
  });

  describe('Type Coercion', () => {
    it('should accept numeric strings for URL params', () => {
      const value = '42';
      expect(validateUrlParamValue(value)).toBe(true);
    });

    it('should accept boolean strings for URL params', () => {
      expect(validateUrlParamValue('true')).toBe(true);
      expect(validateUrlParamValue('false')).toBe(true);
    });

    it('should accept plain strings for URL params', () => {
      expect(validateUrlParamValue('hello world')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero-sized file', () => {
      const file = { name: 'empty.scad', size: 0 };
      expect(validateFileUpload(file)).toBe(true);
    });

    it('should handle file at exact size limit', () => {
      const file = { name: 'exact.scad', size: FILE_SIZE_LIMITS.SCAD_FILE };
      expect(validateFileUpload(file)).toBe(true);
    });

    it('should allow minimal draft with required fields', () => {
      const draft = {
        fileName: 'test.scad',
        fileContent: 'cube(10);',
      };
      expect(validateDraftState(draft)).toBe(true);
    });

    it('should handle preset with empty parameters object', () => {
      const preset = {
        name: 'Empty Preset',
        parameters: {},
      };
      expect(validatePreset(preset)).toBe(true);
    });

    it('should handle library map with zero entries', () => {
      expect(validateLibraryMap({})).toBe(true);
    });
  });
});
