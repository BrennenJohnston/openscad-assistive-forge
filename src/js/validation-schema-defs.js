/**
 * The schemas the app checks stored and incoming data against, and the
 * options the checks use. scripts/build-validators.mjs writes the checks
 * from them ahead of time into src/js/generated/validators.js; nothing here
 * runs in the page.
 * @license GPL-3.0-or-later
 */

import {
  FILE_SIZE_LIMITS,
  URL_PARAM_LIMITS,
  STORAGE_LIMITS,
} from './validation-constants.js';

/** The options every check is written with. */
export const AJV_OPTIONS = {
  allErrors: true, // Collect all errors, not just first
  coerceTypes: true, // Auto-convert types (important for URL params)
  removeAdditional: false, // Keep extra properties
  useDefaults: true, // Apply default values from schema
  allowUnionTypes: true, // Allow "type: [..]" without strict warnings
};

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
 * Saved project validation schema (v2 with folder support)
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
    // 'folder-link' = pointer to a folder on disk (handle in the folder-sync
    // DB under folderRef); the record itself stores no file contents.
    kind: { type: 'string', enum: ['scad', 'zip', 'folder-link'] },
    mainFilePath: { type: 'string', minLength: 1, maxLength: 500 },
    content: {
      type: 'string',
      maxLength: STORAGE_LIMITS.MAX_SAVED_PROJECT_SIZE,
    },
    projectFiles: { type: ['string', 'null'], default: null },
    folderRef: { type: ['string', 'null'], default: null },
    fileSummary: {
      type: ['object', 'null'],
      default: null,
      properties: {
        fileCount: { type: 'number', minimum: 0 },
        totalBytes: { type: 'number', minimum: 0 },
      },
    },
    // v2 fields
    folderId: { type: ['string', 'null'], default: null },
    overlayFiles: { type: 'object', default: {} },
    presets: { type: 'array', default: [] },
    notes: {
      type: 'string',
      maxLength: STORAGE_LIMITS.MAX_NOTES_LENGTH,
      default: '',
    },
    forkedFrom: { type: ['object', 'null'], default: null },
    // v2 sidecar: per-project UI preferences (Basic/Advanced mode + hidden panels)
    uiPreferences: { type: ['object', 'null'], default: null },
    sourceExampleKey: { type: ['string', 'null'], default: null },
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

/** Each written check's export name, and its schema. */
export const SCHEMAS = {
  validateFileUpload: fileUploadSchema,
  validateUrlParamValue: urlParamValueSchema,
  validateDraftState: draftStateSchema,
  validatePreset: presetSchema,
  validatePresetsCollection: presetsCollectionSchema,
  validateLibraryMap: libraryMapSchema,
  validateSavedProject: savedProjectSchema,
  validateSavedProjectsCollection: savedProjectsCollectionSchema,
};
