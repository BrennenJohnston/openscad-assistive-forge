/**
 * Shared validation constants for file uploads and data boundaries
 * @license GPL-3.0-or-later
 */

// File upload size limits (in bytes)
export const FILE_SIZE_LIMITS = {
  SCAD_FILE: 5 * 1024 * 1024, // 5MB for individual .scad files
  ZIP_FILE: 10 * 1024 * 1024, // 10MB for .zip archives
};

// URL param limits
export const URL_PARAM_LIMITS = {
  MAX_STRING_LENGTH: 10000,
  MAX_NUMBER_VALUE: 1e6,
  MIN_NUMBER_VALUE: -1e6,
};

// localStorage size recommendations
export const STORAGE_LIMITS = {
  MAX_DRAFT_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_PRESET_SIZE: 1 * 1024 * 1024, // 1MB per preset
  MAX_PRESETS_COUNT: 50,
  MAX_SAVED_PROJECT_SIZE: 5 * 1024 * 1024, // 5MB (matches draft size)
  MAX_SAVED_PROJECTS_COUNT: 25, // Conservative limit for browser storage
  MAX_NOTES_LENGTH: 5000, // Characters for project notes
};
