/**
 * Saved Projects Manager
 * Manages persistent saved projects with IndexedDB (preferred) and localStorage fallback
 * Supports hierarchical folder organization and project file management
 * @license GPL-3.0-or-later
 */

import {
  validateSavedProject,
  getValidationErrorMessage,
} from './validation-schemas.js';
import { STORAGE_LIMITS } from './validation-constants.js';

const DB_NAME = 'openscad-forge-saved-projects';
const DB_VERSION = 2; // Bumped for v2 schema with folders, project files, assets
const STORE_NAME = 'projects';
const FOLDERS_STORE = 'folders';
const PROJECT_FILES_STORE = 'projectFiles';
const ASSETS_STORE = 'assets';
const LS_KEY = 'openscad-saved-projects';
const SCHEMA_VERSION = 2; // Project schema version

let db = null;
let storageType = null; // 'indexeddb' or 'localstorage'
let initPromise = null; // Track initialization promise to avoid race conditions

/**
 * Generate a simple UUID-like ID with optional prefix
 * @param {string} prefix - Optional prefix (e.g., 'folder', 'file', 'asset')
 * @returns {string}
 */
function generateId(prefix = '') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

/**
 * Generate a unique project name by appending a number suffix if needed
 * @param {string} baseName - The desired name
 * @param {Array} existingProjects - Array of existing projects
 * @returns {string} - Unique name (e.g., "example.scad", "example.scad (2)", "example.scad (3)")
 */
function generateUniqueName(baseName, existingProjects) {
  const existingNames = new Set(existingProjects.map((p) => p.name));

  // If the base name doesn't exist, use it as-is
  if (!existingNames.has(baseName)) {
    return baseName;
  }

  // Find the highest existing suffix number for this base name
  // Match pattern: "baseName" or "baseName (N)" where N is a number
  const suffixPattern = new RegExp(
    `^${escapeRegExp(baseName)}(?: \\((\\d+)\\))?$`
  );
  let maxSuffix = 1; // Start at 1 because the original has no suffix

  for (const name of existingNames) {
    const match = name.match(suffixPattern);
    if (match) {
      const suffix = match[1] ? parseInt(match[1], 10) : 1;
      maxSuffix = Math.max(maxSuffix, suffix);
    }
  }

  // Return the next available name
  return `${baseName} (${maxSuffix + 1})`;
}

/**
 * Escape special regex characters in a string
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ensure the database is initialized before any operation
 * @returns {Promise<void>}
 */
async function ensureInitialized() {
  if (storageType !== null && (storageType === 'localstorage' || db !== null)) {
    return; // Already initialized
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    await initPromise;
    return;
  }

  // Re-initialize if needed
  console.warn('[Saved Projects] Re-initializing database connection');
  await initSavedProjectsDB();
}

/**
 * Initialize IndexedDB database
 * @returns {Promise<{available: boolean, type: string}>}
 */
export async function initSavedProjectsDB() {
  // If already initialized with a valid connection, return early
  if (storageType === 'indexeddb' && db !== null) {
    return { available: true, type: 'indexeddb' };
  }
  if (storageType === 'localstorage') {
    return { available: true, type: 'localstorage' };
  }

  // Check if IndexedDB is available
  if (!window.indexedDB) {
    console.warn(
      '[Saved Projects] IndexedDB not available, falling back to localStorage'
    );
    storageType = 'localstorage';
    return { available: true, type: 'localstorage' };
  }


  // Create and track the initialization promise
  initPromise = (async () => {
    try {
      return await new Promise((resolve, _reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
          console.warn(
            '[Saved Projects] IndexedDB open failed, falling back to localStorage:',
            request.error
          );
          db = null;
          storageType = 'localstorage';
          resolve({ available: true, type: 'localstorage' });
        };

        request.onsuccess = () => {
          db = request.result;
          storageType = 'indexeddb';
          console.log('[Saved Projects] IndexedDB initialized successfully');

          // Handle connection errors (e.g., database deleted while in use)
          db.onerror = (event) => {
            console.error(
              '[Saved Projects] IndexedDB error:',
              event.target.error
            );
          };

          // Handle version change (another tab upgraded the database)
          db.onversionchange = () => {
            console.warn(
              '[Saved Projects] Database version changed, closing connection'
            );
            db.close();
            db = null;
          };

          resolve({ available: true, type: 'indexeddb' });
        };

        request.onupgradeneeded = (event) => {
          console.log(
            '[Saved Projects] Upgrading database schema from version',
            event.oldVersion,
            'to',
            event.newVersion
          );
          const database = event.target.result;
          const transaction = event.target.transaction;

          // Create projects store if it doesn't exist (v1)
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            const projectsStore = database.createObjectStore(STORE_NAME, {
              keyPath: 'id',
            });
            projectsStore.createIndex('savedAt', 'savedAt', { unique: false });
            projectsStore.createIndex('lastLoadedAt', 'lastLoadedAt', {
              unique: false,
            });
            projectsStore.createIndex('folderId', 'folderId', {
              unique: false,
            });
          } else if (event.oldVersion < 2) {
            // Upgrade existing projects store to v2 - add folderId index
            const projectsStore = transaction.objectStore(STORE_NAME);
            if (!projectsStore.indexNames.contains('folderId')) {
              projectsStore.createIndex('folderId', 'folderId', {
                unique: false,
              });
            }
          }

          // v2: Create folders store
          if (!database.objectStoreNames.contains(FOLDERS_STORE)) {
            const foldersStore = database.createObjectStore(FOLDERS_STORE, {
              keyPath: 'id',
            });
            foldersStore.createIndex('parentId', 'parentId', { unique: false });
            foldersStore.createIndex('name', 'name', { unique: false });
            foldersStore.createIndex('createdAt', 'createdAt', {
              unique: false,
            });
          }

          // v2: Create project files store (metadata for files within projects)
          if (!database.objectStoreNames.contains(PROJECT_FILES_STORE)) {
            const filesStore = database.createObjectStore(PROJECT_FILES_STORE, {
              keyPath: 'id',
            });
            filesStore.createIndex('projectId', 'projectId', { unique: false });
            filesStore.createIndex('path', 'path', { unique: false });
            filesStore.createIndex('kind', 'kind', { unique: false });
          }

          // v2: Create assets store (binary blobs like overlays)
          if (!database.objectStoreNames.contains(ASSETS_STORE)) {
            const assetsStore = database.createObjectStore(ASSETS_STORE, {
              keyPath: 'id',
            });
            assetsStore.createIndex('mimeType', 'mimeType', { unique: false });
            assetsStore.createIndex('createdAt', 'createdAt', {
              unique: false,
            });
          }

          // Migrate existing v1 projects to v2 schema
          if (event.oldVersion < 2 && event.oldVersion > 0) {
            console.log(
              '[Saved Projects] Migrating v1 projects to v2 schema...'
            );
            const projectsStore = transaction.objectStore(STORE_NAME);
            const cursorRequest = projectsStore.openCursor();

            cursorRequest.onsuccess = (e) => {
              const cursor = e.target.result;
              if (cursor) {
                const project = cursor.value;
                // Add v2 fields if missing
                if (project.schemaVersion === 1 || !project.schemaVersion) {
                  project.schemaVersion = 2;
                  project.folderId = project.folderId ?? null;
                  project.overlayFiles = project.overlayFiles ?? {};
                  project.presets = project.presets ?? [];
                  cursor.update(project);
                  console.log(
                    `[Saved Projects] Migrated project: ${project.name}`
                  );
                }
                cursor.continue();
              } else {
                console.log('[Saved Projects] Migration complete');
              }
            };
          }
        };

        request.onblocked = () => {
          console.warn(
            '[Saved Projects] IndexedDB blocked - close other tabs and try again'
          );
        };
      });
    } catch (error) {
      console.warn(
        '[Saved Projects] IndexedDB initialization error, falling back to localStorage:',
        error
      );
      db = null;
      storageType = 'localstorage';
      return { available: true, type: 'localstorage' };
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Get all saved projects from IndexedDB
 * @returns {Promise<Array>}
 */
async function getFromIndexedDB() {
  // If db connection is lost, try to reconnect
  if (!db) {
    console.warn(
      '[Saved Projects] IndexedDB connection lost, attempting reconnect'
    );
    await initSavedProjectsDB();

    // If still no connection after reinit, return empty
    if (!db) {
      console.warn('[Saved Projects] Could not reconnect to IndexedDB');
      return [];
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => {
        console.error(
          '[Saved Projects] Error reading from IndexedDB:',
          request.error
        );
        reject(request.error);
      };

      transaction.onerror = () => {
        console.error('[Saved Projects] Transaction error:', transaction.error);
        reject(transaction.error);
      };
    } catch (error) {
      console.error(
        '[Saved Projects] Exception reading from IndexedDB:',
        error
      );
      // Connection might be invalid, reset it
      db = null;
      reject(error);
    }
  });
}

/**
 * Save project to IndexedDB
 * @param {Object} project
 * @returns {Promise<void>}
 */
async function saveToIndexedDB(project) {
  if (!db) throw new Error('IndexedDB not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.put(project);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete project from IndexedDB
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteFromIndexedDB(id) {
  if (!db) throw new Error('IndexedDB not initialized');

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all projects from IndexedDB
 * @returns {Promise<void>}
 */
async function clearIndexedDB() {
  if (!db) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all saved projects from localStorage
 * @returns {Array}
 */
function getFromLocalStorage() {
  try {
    const data = localStorage.getItem(LS_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading saved projects from localStorage:', error);
    return [];
  }
}

/**
 * Save all projects to localStorage
 * @param {Array} projects
 */
function saveToLocalStorage(projects) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(projects));
  } catch (error) {
    console.error('Error saving projects to localStorage:', error);
    throw new Error('Failed to save to localStorage. Storage may be full.');
  }
}

/**
 * List all saved projects (metadata)
 * @returns {Promise<Array>} Array of project metadata sorted by lastLoadedAt desc
 */
export async function listSavedProjects() {
  try {
    // Ensure database is initialized
    await ensureInitialized();

    let projects = [];

    if (storageType === 'indexeddb') {
      try {
        projects = await getFromIndexedDB();
        console.log(
          `[Saved Projects] Retrieved ${projects.length} project(s) from IndexedDB`
        );
      } catch (indexedDbError) {
        console.error(
          '[Saved Projects] IndexedDB read failed, trying localStorage:',
          indexedDbError
        );
        // Fall back to localStorage if IndexedDB fails
        projects = getFromLocalStorage();
        console.log(
          `[Saved Projects] Fallback: Retrieved ${projects.length} project(s) from localStorage`
        );
      }
    } else {
      projects = getFromLocalStorage();
      console.log(
        `[Saved Projects] Retrieved ${projects.length} project(s) from localStorage`
      );
    }

    // Sort by lastLoadedAt (most recent first), then savedAt
    projects.sort((a, b) => {
      if (b.lastLoadedAt !== a.lastLoadedAt) {
        return b.lastLoadedAt - a.lastLoadedAt;
      }
      return b.savedAt - a.savedAt;
    });

    return projects;
  } catch (error) {
    console.error('[Saved Projects] Error listing saved projects:', error);
    return [];
  }
}

/**
 * Save a new project
 * @param {Object} options - Project details
 * @param {string} options.name - Display name
 * @param {string} options.originalName - Original file name
 * @param {string} options.kind - 'scad' or 'zip'
 * @param {string} options.mainFilePath - Main file path (for zip)
 * @param {string} options.content - Main file content
 * @param {Object} [options.projectFiles] - Optional: zip files map
 * @param {string} [options.notes] - Optional: user notes
 * @param {string} [options.folderId] - Optional: parent folder ID (null = root)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function saveProject({
  name,
  originalName,
  kind,
  mainFilePath,
  content,
  projectFiles = null,
  notes = '',
  folderId = null,
}) {
  try {
    // Ensure database is initialized
    await ensureInitialized();

    // Check project count limit
    const existingProjects = await listSavedProjects();
    if (existingProjects.length >= STORAGE_LIMITS.MAX_SAVED_PROJECTS_COUNT) {
      return {
        success: false,
        error: `Maximum saved projects limit reached (${STORAGE_LIMITS.MAX_SAVED_PROJECTS_COUNT}). Please delete some projects first.`,
      };
    }

    // Validate project size
    const contentSize = new Blob([content]).size;
    if (contentSize > STORAGE_LIMITS.MAX_SAVED_PROJECT_SIZE) {
      return {
        success: false,
        error: `Project content exceeds maximum size of ${STORAGE_LIMITS.MAX_SAVED_PROJECT_SIZE / (1024 * 1024)}MB`,
      };
    }

    // Generate unique name if duplicate exists
    const baseName = name || originalName;
    const uniqueName = generateUniqueName(baseName, existingProjects);

    // Create project record with v2 schema
    const now = Date.now();
    const project = {
      id: generateId('project'),
      schemaVersion: SCHEMA_VERSION,
      name: uniqueName,
      originalName,
      kind,
      mainFilePath,
      content,
      projectFiles: projectFiles ? JSON.stringify(projectFiles) : null,
      folderId: folderId, // v2: parent folder (null = root)
      overlayFiles: {}, // v2: overlay metadata
      presets: [], // v2: project-scoped presets metadata
      notes: notes || '',
      savedAt: now,
      lastLoadedAt: now,
    };

    // Validate against schema
    const valid = validateSavedProject(project);
    if (!valid) {
      const errorMsg = getValidationErrorMessage(validateSavedProject.errors);
      return {
        success: false,
        error: `Validation failed: ${errorMsg}`,
      };
    }

    // Save to storage with dual-write for redundancy
    if (storageType === 'indexeddb') {
      try {
        await saveToIndexedDB(project);
        console.log(
          `[Saved Projects] Project saved to IndexedDB: ${project.name}`
        );
      } catch (indexedDbError) {
        console.error(
          '[Saved Projects] IndexedDB save failed:',
          indexedDbError
        );
        // Fall back to localStorage
        const projects = getFromLocalStorage();
        projects.push(project);
        saveToLocalStorage(projects);
        console.log(
          `[Saved Projects] Fallback: Project saved to localStorage: ${project.name}`
        );
      }

      // Also save to localStorage as backup (best-effort, ignore errors)
      try {
        const lsProjects = getFromLocalStorage();
        // Don't add duplicates
        if (!lsProjects.find((p) => p.id === project.id)) {
          lsProjects.push(project);
          saveToLocalStorage(lsProjects);
          console.log('[Saved Projects] Backup copy saved to localStorage');
        }
      } catch (lsError) {
        // localStorage backup failed - not critical
        console.warn(
          '[Saved Projects] localStorage backup failed:',
          lsError.message
        );
      }
    } else {
      const projects = getFromLocalStorage();
      projects.push(project);
      saveToLocalStorage(projects);
      console.log(
        `[Saved Projects] Project saved to localStorage: ${project.name}`
      );
    }

    return { success: true, id: project.id };
  } catch (error) {
    console.error('[Saved Projects] Error saving project:', error);
    return {
      success: false,
      error: error.message || 'Failed to save project',
    };
  }
}

/**
 * Get a saved project by ID
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getProject(id) {
  try {
    // Ensure database is initialized
    await ensureInitialized();

    let project = null;

    // Try IndexedDB first
    if (storageType === 'indexeddb') {
      try {
        const projects = await getFromIndexedDB();
        project = projects.find((p) => p.id === id);
      } catch (indexedDbError) {
        console.error(
          '[Saved Projects] IndexedDB read failed:',
          indexedDbError
        );
      }
    }

    // Fall back to localStorage if not found in IndexedDB
    if (!project) {
      const lsProjects = getFromLocalStorage();
      project = lsProjects.find((p) => p.id === id);
      if (project && storageType === 'indexeddb') {
        console.log('[Saved Projects] Project found in localStorage fallback');
      }
    }

    if (
      project &&
      project.projectFiles &&
      typeof project.projectFiles === 'string'
    ) {
      // Parse projectFiles back to object
      try {
        project.projectFiles = JSON.parse(project.projectFiles);
      } catch (e) {
        console.error('[Saved Projects] Error parsing projectFiles:', e);
        project.projectFiles = null;
      }
    }

    return project || null;
  } catch (error) {
    console.error('[Saved Projects] Error getting project:', error);
    return null;
  }
}

/**
 * Update lastLoadedAt timestamp for a project
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function touchProject(id) {
  try {
    // Ensure database is initialized
    await ensureInitialized();

    const project = await getProject(id);
    if (!project) return false;

    project.lastLoadedAt = Date.now();

    if (storageType === 'indexeddb') {
      // Re-serialize projectFiles if needed
      if (project.projectFiles && typeof project.projectFiles === 'object') {
        project.projectFiles = JSON.stringify(project.projectFiles);
      }
      try {
        await saveToIndexedDB(project);
      } catch (indexedDbError) {
        console.error(
          '[Saved Projects] IndexedDB touch failed:',
          indexedDbError
        );
      }
    }

    // Also update localStorage (dual-write)
    const lsProjects = getFromLocalStorage();
    const index = lsProjects.findIndex((p) => p.id === id);
    if (index >= 0) {
      lsProjects[index].lastLoadedAt = project.lastLoadedAt;
      try {
        saveToLocalStorage(lsProjects);
      } catch (lsError) {
        console.warn(
          '[Saved Projects] localStorage touch failed:',
          lsError.message
        );
      }
    }

    return true;
  } catch (error) {
    console.error('[Saved Projects] Error touching project:', error);
    return false;
  }
}

/**
 * Update project metadata (name, notes, and/or projectFiles)
 * @param {Object} options
 * @param {string} options.id - Project ID
 * @param {string} [options.name] - New name
 * @param {string} [options.notes] - New notes
 * @param {string} [options.projectFiles] - New project files (JSON string)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateProject({ id, name, notes, projectFiles }) {
  try {
    // Ensure database is initialized
    await ensureInitialized();

    const project = await getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    if (name !== undefined) {
      project.name = name;
    }
    if (notes !== undefined) {
      if (notes.length > STORAGE_LIMITS.MAX_NOTES_LENGTH) {
        return {
          success: false,
          error: `Notes exceed maximum length of ${STORAGE_LIMITS.MAX_NOTES_LENGTH} characters`,
        };
      }
      project.notes = notes;
    }
    if (projectFiles !== undefined) {
      project.projectFiles = projectFiles;
    }

    // Validate updated project
    const tempProject = { ...project };
    if (
      tempProject.projectFiles &&
      typeof tempProject.projectFiles === 'object'
    ) {
      tempProject.projectFiles = JSON.stringify(tempProject.projectFiles);
    }

    const valid = validateSavedProject(tempProject);
    if (!valid) {
      const errorMsg = getValidationErrorMessage(validateSavedProject.errors);
      return {
        success: false,
        error: `Validation failed: ${errorMsg}`,
      };
    }

    // Prepare project for storage
    const projectToSave = { ...project };
    if (
      projectToSave.projectFiles &&
      typeof projectToSave.projectFiles === 'object'
    ) {
      projectToSave.projectFiles = JSON.stringify(projectToSave.projectFiles);
    }

    // Save updated project with dual-write
    if (storageType === 'indexeddb') {
      try {
        await saveToIndexedDB(projectToSave);
      } catch (indexedDbError) {
        console.error(
          '[Saved Projects] IndexedDB update failed:',
          indexedDbError
        );
      }
    }

    // Also update localStorage (dual-write)
    const lsProjects = getFromLocalStorage();
    const index = lsProjects.findIndex((p) => p.id === id);
    if (index >= 0) {
      lsProjects[index] = projectToSave;
    } else {
      lsProjects.push(projectToSave);
    }
    try {
      saveToLocalStorage(lsProjects);
    } catch (lsError) {
      console.warn(
        '[Saved Projects] localStorage update failed:',
        lsError.message
      );
    }

    return { success: true };
  } catch (error) {
    console.error('[Saved Projects] Error updating project:', error);
    return {
      success: false,
      error: error.message || 'Failed to update project',
    };
  }
}

/**
 * Delete a saved project
 * @param {string} id
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteProject(id) {
  try {
    // Ensure database is initialized
    await ensureInitialized();

    // v2: Delete all project files and assets first
    try {
      await deleteAllProjectFiles(id);
    } catch (filesError) {
      console.warn(
        '[Saved Projects] Error deleting project files:',
        filesError
      );
    }

    // Delete from both storage locations (dual-delete)
    if (storageType === 'indexeddb') {
      try {
        await deleteFromIndexedDB(id);
        console.log(`[Saved Projects] Deleted from IndexedDB: ${id}`);
      } catch (indexedDbError) {
        console.error(
          '[Saved Projects] IndexedDB delete failed:',
          indexedDbError
        );
      }
    }

    // Also delete from localStorage
    const projects = getFromLocalStorage();
    const filtered = projects.filter((p) => p.id !== id);
    try {
      saveToLocalStorage(filtered);
      console.log(`[Saved Projects] Deleted from localStorage: ${id}`);
    } catch (lsError) {
      console.warn(
        '[Saved Projects] localStorage delete failed:',
        lsError.message
      );
    }

    return { success: true };
  } catch (error) {
    console.error('[Saved Projects] Error deleting project:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete project',
    };
  }
}

/**
 * Get summary of saved projects (for clear cache warning)
 * @returns {Promise<{count: number, totalApproxBytes: number}>}
 */
export async function getSavedProjectsSummary() {
  try {
    const projects = await listSavedProjects();
    const count = projects.length;

    // Approximate total size
    let totalApproxBytes = 0;
    for (const project of projects) {
      totalApproxBytes += new Blob([project.content]).size;
      if (project.notes) {
        totalApproxBytes += new Blob([project.notes]).size;
      }
    }

    return { count, totalApproxBytes };
  } catch (error) {
    console.error(
      '[Saved Projects] Error getting saved projects summary:',
      error
    );
    return { count: 0, totalApproxBytes: 0 };
  }
}

/**
 * Clear all saved projects
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function clearAllSavedProjects() {
  try {
    // Clear both storage locations
    if (storageType === 'indexeddb') {
      try {
        await clearIndexedDB();
        console.log('[Saved Projects] Cleared IndexedDB');
      } catch (indexedDbError) {
        console.error(
          '[Saved Projects] IndexedDB clear failed:',
          indexedDbError
        );
      }
    }

    // Also clear localStorage
    try {
      localStorage.removeItem(LS_KEY);
      console.log('[Saved Projects] Cleared localStorage');
    } catch (lsError) {
      console.warn(
        '[Saved Projects] localStorage clear failed:',
        lsError.message
      );
    }

    return { success: true };
  } catch (error) {
    console.error('[Saved Projects] Error clearing saved projects:', error);
    return {
      success: false,
      error: error.message || 'Failed to clear saved projects',
    };
  }
}

/**
 * Get storage diagnostic information (for debugging)
 * @returns {Promise<Object>}
 */
export async function getStorageDiagnostics() {
  const diagnostics = {
    storageType,
    indexedDbAvailable: !!window.indexedDB,
    indexedDbConnected: db !== null,
    localStorageAvailable: false,
    indexedDbProjectCount: 0,
    localStorageProjectCount: 0,
    timestamp: new Date().toISOString(),
  };

  // Check localStorage availability
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    diagnostics.localStorageAvailable = true;
  } catch (e) {
    diagnostics.localStorageAvailable = false;
    diagnostics.localStorageError = e.message;
  }

  // Count IndexedDB projects
  if (db) {
    try {
      const projects = await getFromIndexedDB();
      diagnostics.indexedDbProjectCount = projects.length;
    } catch (e) {
      diagnostics.indexedDbError = e.message;
    }
  }

  // Count localStorage projects
  try {
    const projects = getFromLocalStorage();
    diagnostics.localStorageProjectCount = projects.length;
  } catch (e) {
    diagnostics.localStorageReadError = e.message;
  }

  console.log('[Saved Projects] Storage diagnostics:', diagnostics);
  return diagnostics;
}

// ============================================================================
// Folder Operations (v2)
// ============================================================================

/**
 * Create a new folder
 * @param {Object} options - Folder details
 * @param {string} options.name - Folder name
 * @param {string|null} [options.parentId] - Parent folder ID (null = root)
 * @param {string|null} [options.color] - Optional folder color
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function createFolder({ name, parentId = null, color = null }) {
  try {
    await ensureInitialized();

    if (!name || !name.trim()) {
      return { success: false, error: 'Folder name is required' };
    }

    // Verify parent folder exists if specified
    if (parentId) {
      const parentFolder = await getFolder(parentId);
      if (!parentFolder) {
        return { success: false, error: 'Parent folder not found' };
      }
    }

    const folder = {
      id: generateId('folder'),
      name: name.trim(),
      parentId,
      color,
      createdAt: Date.now(),
    };

    if (
      storageType === 'indexeddb' &&
      db &&
      db.objectStoreNames.contains(FOLDERS_STORE)
    ) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([FOLDERS_STORE], 'readwrite');
        const store = transaction.objectStore(FOLDERS_STORE);
        const request = store.put(folder);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      console.log(`[Saved Projects] Folder created: ${folder.name}`);
    } else {
      // localStorage fallback - store folders in a separate key (also used when v2 stores don't exist)
      const folders = getFoldersFromLocalStorage();
      folders.push(folder);
      saveFoldersToLocalStorage(folders);
    }

    return { success: true, id: folder.id };
  } catch (error) {
    console.error('[Saved Projects] Error creating folder:', error);
    return {
      success: false,
      error: error.message || 'Failed to create folder',
    };
  }
}

/**
 * Get a folder by ID
 * @param {string} id - Folder ID
 * @returns {Promise<Object|null>}
 */
export async function getFolder(id) {
  try {
    await ensureInitialized();

    if (storageType === 'indexeddb' && db) {
      // Check if folders store exists (v2 schema)
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        const folders = getFoldersFromLocalStorage();
        return folders.find((f) => f.id === id) || null;
      }
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([FOLDERS_STORE], 'readonly');
        const store = transaction.objectStore(FOLDERS_STORE);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } else {
      const folders = getFoldersFromLocalStorage();
      return folders.find((f) => f.id === id) || null;
    }
  } catch (error) {
    console.error('[Saved Projects] Error getting folder:', error);
    return null;
  }
}

/**
 * List all folders
 * @returns {Promise<Array>}
 */
export async function listFolders() {
  try {
    await ensureInitialized();

    if (storageType === 'indexeddb' && db) {
      // Check if folders store exists (v2 schema) - gracefully handle v1 databases
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        console.log(
          '[Saved Projects] Folders store not found (v1 database), returning empty array'
        );
        return getFoldersFromLocalStorage();
      }
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([FOLDERS_STORE], 'readonly');
        const store = transaction.objectStore(FOLDERS_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } else {
      return getFoldersFromLocalStorage();
    }
  } catch (error) {
    console.error('[Saved Projects] Error listing folders:', error);
    return [];
  }
}

/**
 * Rename a folder
 * @param {string} id - Folder ID
 * @param {string} newName - New name
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function renameFolder(id, newName) {
  try {
    await ensureInitialized();

    if (!newName || !newName.trim()) {
      return { success: false, error: 'Folder name is required' };
    }

    const folder = await getFolder(id);
    if (!folder) {
      return { success: false, error: 'Folder not found' };
    }

    folder.name = newName.trim();

    if (
      storageType === 'indexeddb' &&
      db &&
      db.objectStoreNames.contains(FOLDERS_STORE)
    ) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([FOLDERS_STORE], 'readwrite');
        const store = transaction.objectStore(FOLDERS_STORE);
        const request = store.put(folder);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } else {
      const folders = getFoldersFromLocalStorage();
      const index = folders.findIndex((f) => f.id === id);
      if (index >= 0) {
        folders[index] = folder;
        saveFoldersToLocalStorage(folders);
      }
    }

    console.log(`[Saved Projects] Folder renamed to: ${folder.name}`);
    return { success: true };
  } catch (error) {
    console.error('[Saved Projects] Error renaming folder:', error);
    return {
      success: false,
      error: error.message || 'Failed to rename folder',
    };
  }
}

/**
 * Delete a folder and optionally its contents
 * @param {string} id - Folder ID
 * @param {boolean} [deleteContents=false] - If true, delete projects inside; if false, move them to root
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteFolder(id, deleteContents = false) {
  try {
    await ensureInitialized();

    const folder = await getFolder(id);
    if (!folder) {
      return { success: false, error: 'Folder not found' };
    }

    // Get all projects in this folder
    const projectsInFolder = await getProjectsInFolder(id);

    // Get all subfolders
    const allFolders = await listFolders();
    const childFolders = allFolders.filter((f) => f.parentId === id);

    if (deleteContents) {
      // Delete all projects in folder
      for (const project of projectsInFolder) {
        await deleteProject(project.id);
      }
      // Recursively delete child folders
      for (const childFolder of childFolders) {
        await deleteFolder(childFolder.id, true);
      }
    } else {
      // Move projects to root (folderId = null)
      for (const project of projectsInFolder) {
        await moveProject(project.id, null);
      }
      // Move child folders to parent of deleted folder
      for (const childFolder of childFolders) {
        await moveFolder(childFolder.id, folder.parentId);
      }
    }

    // Delete the folder itself
    if (
      storageType === 'indexeddb' &&
      db &&
      db.objectStoreNames.contains(FOLDERS_STORE)
    ) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([FOLDERS_STORE], 'readwrite');
        const store = transaction.objectStore(FOLDERS_STORE);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } else {
      const folders = getFoldersFromLocalStorage();
      const filtered = folders.filter((f) => f.id !== id);
      saveFoldersToLocalStorage(filtered);
    }

    console.log(`[Saved Projects] Folder deleted: ${folder.name}`);
    return { success: true };
  } catch (error) {
    console.error('[Saved Projects] Error deleting folder:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete folder',
    };
  }
}

/**
 * Move a folder to a new parent
 * @param {string} id - Folder ID
 * @param {string|null} newParentId - New parent folder ID (null = root)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function moveFolder(id, newParentId) {
  try {
    await ensureInitialized();

    const folder = await getFolder(id);
    if (!folder) {
      return { success: false, error: 'Folder not found' };
    }

    // Prevent moving folder into itself or its descendants
    if (newParentId) {
      let currentParent = await getFolder(newParentId);
      while (currentParent) {
        if (currentParent.id === id) {
          return {
            success: false,
            error: 'Cannot move folder into itself or its descendants',
          };
        }
        currentParent = currentParent.parentId
          ? await getFolder(currentParent.parentId)
          : null;
      }
    }

    folder.parentId = newParentId;

    if (
      storageType === 'indexeddb' &&
      db &&
      db.objectStoreNames.contains(FOLDERS_STORE)
    ) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([FOLDERS_STORE], 'readwrite');
        const store = transaction.objectStore(FOLDERS_STORE);
        const request = store.put(folder);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } else {
      const folders = getFoldersFromLocalStorage();
      const index = folders.findIndex((f) => f.id === id);
      if (index >= 0) {
        folders[index] = folder;
        saveFoldersToLocalStorage(folders);
      }
    }

    console.log(`[Saved Projects] Folder moved: ${folder.name}`);
    return { success: true };
  } catch (error) {
    console.error('[Saved Projects] Error moving folder:', error);
    return { success: false, error: error.message || 'Failed to move folder' };
  }
}

/**
 * Get folder tree structure with nested children
 * @returns {Promise<Array>} Tree of folders with children property
 */
export async function getFolderTree() {
  try {
    const folders = await listFolders();
    const projects = await listSavedProjects();

    // Build a map for quick lookup
    const folderMap = new Map();
    folders.forEach((f) => {
      folderMap.set(f.id, { ...f, children: [], projects: [] });
    });

    // Assign projects to their folders
    projects.forEach((p) => {
      if (p.folderId && folderMap.has(p.folderId)) {
        folderMap.get(p.folderId).projects.push(p);
      }
    });

    // Build tree structure
    const roots = [];
    const rootProjects = projects.filter((p) => !p.folderId);

    folderMap.forEach((folder) => {
      if (folder.parentId && folderMap.has(folder.parentId)) {
        folderMap.get(folder.parentId).children.push(folder);
      } else if (!folder.parentId) {
        roots.push(folder);
      }
    });

    // Sort folders and projects by name
    const sortByName = (a, b) => a.name.localeCompare(b.name);
    roots.sort(sortByName);
    folderMap.forEach((f) => {
      f.children.sort(sortByName);
      f.projects.sort(sortByName);
    });
    rootProjects.sort(sortByName);

    return { folders: roots, rootProjects };
  } catch (error) {
    console.error('[Saved Projects] Error getting folder tree:', error);
    return { folders: [], rootProjects: [] };
  }
}

/**
 * Get folder breadcrumb path
 * @param {string} folderId - Folder ID
 * @returns {Promise<Array>} Array of folders from root to current
 */
export async function getFolderBreadcrumbs(folderId) {
  try {
    const breadcrumbs = [];
    let currentId = folderId;

    while (currentId) {
      const folder = await getFolder(currentId);
      if (folder) {
        breadcrumbs.unshift(folder);
        currentId = folder.parentId;
      } else {
        break;
      }
    }

    return breadcrumbs;
  } catch (error) {
    console.error('[Saved Projects] Error getting breadcrumbs:', error);
    return [];
  }
}

// localStorage helpers for folders
function getFoldersFromLocalStorage() {
  try {
    const data = localStorage.getItem('openscad-saved-folders');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error(
      '[Saved Projects] Error reading folders from localStorage:',
      error
    );
    return [];
  }
}

function saveFoldersToLocalStorage(folders) {
  try {
    localStorage.setItem('openscad-saved-folders', JSON.stringify(folders));
  } catch (error) {
    console.error(
      '[Saved Projects] Error saving folders to localStorage:',
      error
    );
  }
}

// ============================================================================
// Project-Folder Operations (v2)
// ============================================================================

/**
 * Move a project to a folder
 * @param {string} projectId - Project ID
 * @param {string|null} folderId - Target folder ID (null = root)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function moveProject(projectId, folderId) {
  try {
    await ensureInitialized();

    const project = await getProject(projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    // Verify target folder exists if specified
    if (folderId) {
      const folder = await getFolder(folderId);
      if (!folder) {
        return { success: false, error: 'Target folder not found' };
      }
    }

    project.folderId = folderId;

    // Prepare project for storage
    const projectToSave = { ...project };
    if (
      projectToSave.projectFiles &&
      typeof projectToSave.projectFiles === 'object'
    ) {
      projectToSave.projectFiles = JSON.stringify(projectToSave.projectFiles);
    }

    if (storageType === 'indexeddb' && db) {
      await saveToIndexedDB(projectToSave);
    }

    // Also update localStorage
    const lsProjects = getFromLocalStorage();
    const index = lsProjects.findIndex((p) => p.id === projectId);
    if (index >= 0) {
      lsProjects[index].folderId = folderId;
      saveToLocalStorage(lsProjects);
    }

    console.log(
      `[Saved Projects] Project moved: ${project.name} to folder ${folderId || 'root'}`
    );
    return { success: true };
  } catch (error) {
    console.error('[Saved Projects] Error moving project:', error);
    return { success: false, error: error.message || 'Failed to move project' };
  }
}

/**
 * Get all projects in a specific folder
 * @param {string|null} folderId - Folder ID (null = root level projects)
 * @returns {Promise<Array>}
 */
export async function getProjectsInFolder(folderId = null) {
  try {
    const projects = await listSavedProjects();
    return projects.filter((p) => (p.folderId || null) === folderId);
  } catch (error) {
    console.error('[Saved Projects] Error getting projects in folder:', error);
    return [];
  }
}

// ============================================================================
// Project Files Operations (v2) - Files within projects
// ============================================================================

/**
 * Add a file to a project
 * @param {Object} options - File details
 * @param {string} options.projectId - Parent project ID
 * @param {string} options.path - File path within project (e.g., 'presets/foo.json', 'overlays/ref.png')
 * @param {string} options.kind - File type: 'scad', 'json', 'image', 'binary'
 * @param {string|null} [options.textContent] - Text content (for scad/json)
 * @param {string|null} [options.assetId] - Asset ID (for binaries stored in Assets store)
 * @param {string|null} [options.mimeType] - MIME type
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function addProjectFile({
  projectId,
  path,
  kind,
  textContent = null,
  assetId = null,
  mimeType = null,
}) {
  try {
    await ensureInitialized();

    // Verify project exists
    const project = await getProject(projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    const fileRecord = {
      id: generateId('file'),
      projectId,
      path,
      kind,
      textContent,
      assetId,
      mimeType,
      updatedAt: Date.now(),
    };

    if (storageType === 'indexeddb' && db) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([PROJECT_FILES_STORE], 'readwrite');
        const store = transaction.objectStore(PROJECT_FILES_STORE);
        const request = store.put(fileRecord);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    console.log(`[Saved Projects] File added to project: ${path}`);
    return { success: true, id: fileRecord.id };
  } catch (error) {
    console.error('[Saved Projects] Error adding project file:', error);
    return { success: false, error: error.message || 'Failed to add file' };
  }
}

/**
 * Get all files in a project
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>}
 */
export async function getProjectFiles(projectId) {
  try {
    await ensureInitialized();

    if (storageType === 'indexeddb' && db) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([PROJECT_FILES_STORE], 'readonly');
        const store = transaction.objectStore(PROJECT_FILES_STORE);
        const index = store.index('projectId');
        const request = index.getAll(projectId);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    }

    return [];
  } catch (error) {
    console.error('[Saved Projects] Error getting project files:', error);
    return [];
  }
}

/**
 * Get a specific file from a project by path
 * @param {string} projectId - Project ID
 * @param {string} path - File path
 * @returns {Promise<Object|null>}
 */
export async function getProjectFileByPath(projectId, path) {
  try {
    const files = await getProjectFiles(projectId);
    return files.find((f) => f.path === path) || null;
  } catch (error) {
    console.error('[Saved Projects] Error getting project file:', error);
    return null;
  }
}

/**
 * Delete a file from a project
 * @param {string} fileId - File ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteProjectFile(fileId) {
  try {
    await ensureInitialized();

    if (storageType === 'indexeddb' && db) {
      // Get the file first to check if it has an asset
      const file = await new Promise((resolve, reject) => {
        const transaction = db.transaction([PROJECT_FILES_STORE], 'readonly');
        const store = transaction.objectStore(PROJECT_FILES_STORE);
        const request = store.get(fileId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Delete the asset if present
      if (file && file.assetId) {
        await deleteAsset(file.assetId);
      }

      // Delete the file record
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([PROJECT_FILES_STORE], 'readwrite');
        const store = transaction.objectStore(PROJECT_FILES_STORE);
        const request = store.delete(fileId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    console.log(`[Saved Projects] File deleted: ${fileId}`);
    return { success: true };
  } catch (error) {
    console.error('[Saved Projects] Error deleting project file:', error);
    return { success: false, error: error.message || 'Failed to delete file' };
  }
}

/**
 * Delete all files for a project
 * @param {string} projectId - Project ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteAllProjectFiles(projectId) {
  try {
    const files = await getProjectFiles(projectId);
    for (const file of files) {
      await deleteProjectFile(file.id);
    }
    return { success: true };
  } catch (error) {
    console.error('[Saved Projects] Error deleting all project files:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Asset Operations (v2) - Binary storage for overlays and large files
// ============================================================================

/**
 * Store a binary asset
 * @param {Object} options - Asset details
 * @param {Blob|ArrayBuffer} options.data - Binary data
 * @param {string} options.mimeType - MIME type
 * @param {string} [options.fileName] - Original file name
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function storeAsset({ data, mimeType, fileName = null }) {
  try {
    await ensureInitialized();

    const asset = {
      id: generateId('asset'),
      data: data instanceof Blob ? data : new Blob([data], { type: mimeType }),
      mimeType,
      fileName,
      size: data instanceof Blob ? data.size : data.byteLength,
      createdAt: Date.now(),
    };

    if (storageType === 'indexeddb' && db) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([ASSETS_STORE], 'readwrite');
        const store = transaction.objectStore(ASSETS_STORE);
        const request = store.put(asset);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    console.log(
      `[Saved Projects] Asset stored: ${asset.id} (${asset.size} bytes)`
    );
    return { success: true, id: asset.id };
  } catch (error) {
    console.error('[Saved Projects] Error storing asset:', error);
    return { success: false, error: error.message || 'Failed to store asset' };
  }
}

/**
 * Get an asset by ID
 * @param {string} id - Asset ID
 * @returns {Promise<Object|null>}
 */
export async function getAsset(id) {
  try {
    await ensureInitialized();

    if (storageType === 'indexeddb' && db) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([ASSETS_STORE], 'readonly');
        const store = transaction.objectStore(ASSETS_STORE);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    }

    return null;
  } catch (error) {
    console.error('[Saved Projects] Error getting asset:', error);
    return null;
  }
}

/**
 * Delete an asset by ID
 * @param {string} id - Asset ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteAsset(id) {
  try {
    await ensureInitialized();

    if (storageType === 'indexeddb' && db) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([ASSETS_STORE], 'readwrite');
        const store = transaction.objectStore(ASSETS_STORE);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    console.log(`[Saved Projects] Asset deleted: ${id}`);
    return { success: true };
  } catch (error) {
    console.error('[Saved Projects] Error deleting asset:', error);
    return { success: false, error: error.message || 'Failed to delete asset' };
  }
}

// ============================================================================
// Overlay Storage (v2) - Store overlay images as project assets
// ============================================================================

/**
 * Save an overlay to a project
 * @param {string} projectId - Project ID
 * @param {Object} options - Overlay details
 * @param {string} options.fileName - File name
 * @param {Blob|ArrayBuffer} options.data - Image data
 * @param {string} options.mimeType - MIME type
 * @param {number} [options.aspectRatio] - Aspect ratio
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function saveOverlayToProject(
  projectId,
  { fileName, data, mimeType, aspectRatio = null }
) {
  try {
    await ensureInitialized();

    const project = await getProject(projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    // Store the binary data as an asset
    const assetResult = await storeAsset({ data, mimeType, fileName });
    if (!assetResult.success) {
      return assetResult;
    }

    // Add a project file record pointing to the asset
    const fileResult = await addProjectFile({
      projectId,
      path: `overlays/${fileName}`,
      kind: 'image',
      assetId: assetResult.id,
      mimeType,
    });
    if (!fileResult.success) {
      return fileResult;
    }

    // Update project overlay metadata
    project.overlayFiles = project.overlayFiles || {};
    project.overlayFiles[fileName] = {
      assetId: assetResult.id,
      fileId: fileResult.id,
      mimeType,
      aspectRatio,
      addedAt: Date.now(),
    };

    // Save updated project
    const projectToSave = { ...project };
    if (
      projectToSave.projectFiles &&
      typeof projectToSave.projectFiles === 'object'
    ) {
      projectToSave.projectFiles = JSON.stringify(projectToSave.projectFiles);
    }

    if (storageType === 'indexeddb' && db) {
      await saveToIndexedDB(projectToSave);
    }

    console.log(`[Saved Projects] Overlay saved to project: ${fileName}`);
    return { success: true, assetId: assetResult.id };
  } catch (error) {
    console.error('[Saved Projects] Error saving overlay to project:', error);
    return { success: false, error: error.message || 'Failed to save overlay' };
  }
}

/**
 * Get overlays from a project
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>} Array of overlay metadata with asset data
 */
export async function getProjectOverlays(projectId) {
  try {
    const project = await getProject(projectId);
    if (!project || !project.overlayFiles) {
      return [];
    }

    const overlays = [];
    for (const [fileName, metadata] of Object.entries(project.overlayFiles)) {
      const asset = await getAsset(metadata.assetId);
      overlays.push({
        fileName,
        ...metadata,
        data: asset?.data || null,
      });
    }

    return overlays;
  } catch (error) {
    console.error('[Saved Projects] Error getting project overlays:', error);
    return [];
  }
}

// ============================================================================
// Preset Storage (v2) - Store presets as project files
// ============================================================================

/**
 * Save a preset to a project
 * @param {string} projectId - Project ID
 * @param {Object} preset - Preset data
 * @param {string} preset.name - Preset name
 * @param {Object} preset.parameters - Parameter values
 * @param {string} [preset.description] - Optional description
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function savePresetToProject(
  projectId,
  { name, parameters, description = '' }
) {
  try {
    await ensureInitialized();

    const project = await getProject(projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    // Create preset file content
    const presetContent = JSON.stringify(
      {
        name,
        parameters,
        description,
        created: Date.now(),
      },
      null,
      2
    );

    // Sanitize filename
    const safeFileName = name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
    const path = `presets/${safeFileName}`;

    // Check if preset already exists
    const existingFile = await getProjectFileByPath(projectId, path);
    if (existingFile) {
      // Update existing file
      existingFile.textContent = presetContent;
      existingFile.updatedAt = Date.now();

      if (storageType === 'indexeddb' && db) {
        await new Promise((resolve, reject) => {
          const transaction = db.transaction(
            [PROJECT_FILES_STORE],
            'readwrite'
          );
          const store = transaction.objectStore(PROJECT_FILES_STORE);
          const request = store.put(existingFile);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }
    } else {
      // Add new file
      await addProjectFile({
        projectId,
        path,
        kind: 'json',
        textContent: presetContent,
        mimeType: 'application/json',
      });
    }

    // Update project preset metadata
    project.presets = project.presets || [];
    const existingIndex = project.presets.findIndex((p) => p.name === name);
    const presetMeta = { name, path, addedAt: Date.now() };

    if (existingIndex >= 0) {
      project.presets[existingIndex] = presetMeta;
    } else {
      project.presets.push(presetMeta);
    }

    // Save updated project
    const projectToSave = { ...project };
    if (
      projectToSave.projectFiles &&
      typeof projectToSave.projectFiles === 'object'
    ) {
      projectToSave.projectFiles = JSON.stringify(projectToSave.projectFiles);
    }

    if (storageType === 'indexeddb' && db) {
      await saveToIndexedDB(projectToSave);
    }

    console.log(`[Saved Projects] Preset saved to project: ${name}`);
    return { success: true };
  } catch (error) {
    console.error('[Saved Projects] Error saving preset to project:', error);
    return { success: false, error: error.message || 'Failed to save preset' };
  }
}

/**
 * Get presets from a project
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>} Array of preset objects
 */
export async function getPresetsFromProject(projectId) {
  try {
    const project = await getProject(projectId);
    if (!project || !project.presets) {
      return [];
    }

    const presets = [];
    for (const presetMeta of project.presets) {
      const file = await getProjectFileByPath(projectId, presetMeta.path);
      if (file && file.textContent) {
        try {
          const presetData = JSON.parse(file.textContent);
          presets.push({
            ...presetData,
            path: presetMeta.path,
          });
        } catch (_e) {
          console.warn(
            `[Saved Projects] Failed to parse preset: ${presetMeta.path}`
          );
        }
      }
    }

    return presets;
  } catch (error) {
    console.error('[Saved Projects] Error getting project presets:', error);
    return [];
  }
}
