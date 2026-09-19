/**
 * Shared validation constants for file uploads and data boundaries
 * @license GPL-3.0-or-later
 */

// File upload size limits (in bytes).
// Storage caps were raised (owner-approved) because IndexedDB stores
// binary companions on disk, not in RAM; the real render-memory
// constraint is the WASM mount budget below, which is enforced
// separately (see mount-filter.js).
export const FILE_SIZE_LIMITS = {
  SCAD_FILE: 5 * 1024 * 1024, // 5MB for individual .scad files
  ZIP_FILE: 250 * 1024 * 1024, // 250MB for .zip archives (multi-file projects with STLs/images)
  STL_VIEW_FILE: 250 * 1024 * 1024, // 250MB for direct STL viewing (three.js parse only)
};

// Folder import limits (webkitdirectory / directory-picker / folder drop).
// Single source so the caps cannot drift between entry points.
export const FOLDER_IMPORT_LIMITS = {
  MAX_FILES: 2000,
  MAX_BYTES: 500 * 1024 * 1024, // 500 MB total
  WARN_FILES: 200, // soft warning threshold
  WARN_BYTES: 150 * 1024 * 1024, // soft warning: large project, slower renders
};

// Per-render WASM filesystem budget. Mounted files live in the Emscripten
// heap alongside geometry; above this, mount-filter.js warns (and only
// dependency-referenced binaries are mounted at all once the binary set
// is non-trivial).
export const WASM_MOUNT_BUDGET = 256 * 1024 * 1024; // 256 MB

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
