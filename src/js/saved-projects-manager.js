/**
 * Saved Projects Manager
 * Manages persistent saved projects with IndexedDB (preferred) and localStorage fallback
 * @license GPL-3.0-or-later
 */

import {
  validateSavedProject,
  validateSavedProjectsCollection,
  getValidationErrorMessage,
} from './validation-schemas.js';
import { STORAGE_LIMITS } from './validation-constants.js';

const DB_NAME = 'openscad-forge-saved-projects';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const LS_KEY = 'openscad-saved-projects';
const SCHEMA_VERSION = 1;

let db = null;
let storageType = null; // 'indexeddb' or 'localstorage'

/**
 * Generate a simple UUID-like ID
 * @returns {string}
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Initialize IndexedDB database
 * @returns {Promise<{available: boolean, type: string}>}
 */
export async function initSavedProjectsDB() {
  // Check if IndexedDB is available
  if (!window.indexedDB) {
    console.warn('IndexedDB not available, falling back to localStorage');
    storageType = 'localstorage';
    return { available: true, type: 'localstorage' };
  }

  try {
    return await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.warn(
          'IndexedDB open failed, falling back to localStorage:',
          request.error
        );
        storageType = 'localstorage';
        resolve({ available: true, type: 'localstorage' });
      };

      request.onsuccess = () => {
        db = request.result;
        storageType = 'indexeddb';
        console.log('IndexedDB initialized for saved projects');
        resolve({ available: true, type: 'indexeddb' });
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        // Create object store if it doesn't exist
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = database.createObjectStore(STORE_NAME, {
            keyPath: 'id',
          });
          objectStore.createIndex('savedAt', 'savedAt', { unique: false });
          objectStore.createIndex('lastLoadedAt', 'lastLoadedAt', {
            unique: false,
          });
        }
      };
    });
  } catch (error) {
    console.warn(
      'IndexedDB initialization error, falling back to localStorage:',
      error
    );
    storageType = 'localstorage';
    return { available: true, type: 'localstorage' };
  }
}

/**
 * Get all saved projects from IndexedDB
 * @returns {Promise<Array>}
 */
async function getFromIndexedDB() {
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
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
    let projects = [];

    if (storageType === 'indexeddb') {
      projects = await getFromIndexedDB();
    } else {
      projects = getFromLocalStorage();
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
    console.error('Error listing saved projects:', error);
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
}) {
  try {
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

    // Create project record
    const now = Date.now();
    const project = {
      id: generateId(),
      schemaVersion: SCHEMA_VERSION,
      name: name || originalName,
      originalName,
      kind,
      mainFilePath,
      content,
      projectFiles: projectFiles ? JSON.stringify(projectFiles) : null,
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

    // Save to storage
    if (storageType === 'indexeddb') {
      await saveToIndexedDB(project);
    } else {
      const projects = getFromLocalStorage();
      projects.push(project);
      saveToLocalStorage(projects);
    }

    return { success: true, id: project.id };
  } catch (error) {
    console.error('Error saving project:', error);
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
    let projects = [];

    if (storageType === 'indexeddb') {
      projects = await getFromIndexedDB();
    } else {
      projects = getFromLocalStorage();
    }

    const project = projects.find((p) => p.id === id);

    if (
      project &&
      project.projectFiles &&
      typeof project.projectFiles === 'string'
    ) {
      // Parse projectFiles back to object
      try {
        project.projectFiles = JSON.parse(project.projectFiles);
      } catch (e) {
        console.error('Error parsing projectFiles:', e);
        project.projectFiles = null;
      }
    }

    return project || null;
  } catch (error) {
    console.error('Error getting project:', error);
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
    const project = await getProject(id);
    if (!project) return false;

    project.lastLoadedAt = Date.now();

    if (storageType === 'indexeddb') {
      // Re-serialize projectFiles if needed
      if (project.projectFiles && typeof project.projectFiles === 'object') {
        project.projectFiles = JSON.stringify(project.projectFiles);
      }
      await saveToIndexedDB(project);
    } else {
      const projects = getFromLocalStorage();
      const index = projects.findIndex((p) => p.id === id);
      if (index >= 0) {
        projects[index].lastLoadedAt = Date.now();
        saveToLocalStorage(projects);
      }
    }

    return true;
  } catch (error) {
    console.error('Error touching project:', error);
    return false;
  }
}

/**
 * Update project metadata (name and/or notes)
 * @param {Object} options
 * @param {string} options.id - Project ID
 * @param {string} [options.name] - New name
 * @param {string} [options.notes] - New notes
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateProject({ id, name, notes }) {
  try {
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

    // Save updated project
    if (storageType === 'indexeddb') {
      if (project.projectFiles && typeof project.projectFiles === 'object') {
        project.projectFiles = JSON.stringify(project.projectFiles);
      }
      await saveToIndexedDB(project);
    } else {
      const projects = getFromLocalStorage();
      const index = projects.findIndex((p) => p.id === id);
      if (index >= 0) {
        projects[index] = project;
        saveToLocalStorage(projects);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating project:', error);
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
    if (storageType === 'indexeddb') {
      await deleteFromIndexedDB(id);
    } else {
      const projects = getFromLocalStorage();
      const filtered = projects.filter((p) => p.id !== id);
      saveToLocalStorage(filtered);
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting project:', error);
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
    console.error('Error getting saved projects summary:', error);
    return { count: 0, totalApproxBytes: 0 };
  }
}

/**
 * Clear all saved projects
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function clearAllSavedProjects() {
  try {
    if (storageType === 'indexeddb') {
      await clearIndexedDB();
    } else {
      localStorage.removeItem(LS_KEY);
    }

    return { success: true };
  } catch (error) {
    console.error('Error clearing saved projects:', error);
    return {
      success: false,
      error: error.message || 'Failed to clear saved projects',
    };
  }
}
