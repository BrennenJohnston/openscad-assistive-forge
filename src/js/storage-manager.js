/**
 * Storage Manager - Data-conscious UX utilities
 * Provides storage estimation, cache clearing, persistence, and backup/restore
 * @license GPL-3.0-or-later
 */

import { isValidServiceWorkerMessage } from './html-utils.js';
import { getAppPrefKey } from './storage-keys.js';
import {
  listSavedProjects,
  listFolders,
  getProject,
  getProjectFiles,
  getAsset,
  saveProject,
  updateProject,
  createFolder,
  storeAsset,
  addProjectFile,
  clearAllSavedProjects,
  getSavedProjectsSummary,
} from './saved-projects-manager.js';

const FIRST_VISIT_KEY = 'openscad-forge-first-visit-seen';
const STORAGE_PREFS_KEY = 'openscad-forge-storage-prefs';
const PERSISTENCE_KEY = 'openscad-forge-persistence-requested';
const CUSTOM_GRID_PRESETS_KEY = getAppPrefKey('custom-grid-presets');

/**
 * Check if this is the user's first visit
 * @returns {boolean}
 */
export function isFirstVisit() {
  const storedValue = localStorage.getItem(FIRST_VISIT_KEY);
  return storedValue !== 'true';
}

/**
 * Mark first visit as complete
 */
export function markFirstVisitComplete() {
  localStorage.setItem(FIRST_VISIT_KEY, 'true');
}

/**
 * Get estimated storage usage
 * @returns {Promise<{usage: number, quota: number, usageFormatted: string, quotaFormatted: string, percentUsed: number, supported: boolean}>}
 */
export async function getStorageEstimate() {
  if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
    return {
      usage: getLocalStorageUsageBytes(),
      quota: 0,
      usageFormatted: 'Unknown',
      quotaFormatted: 'Unknown',
      percentUsed: 0,
      supported: false,
    };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const { usage = 0, quota = 0, usageDetails = {} } = estimate;
    const localStorageUsage = getLocalStorageUsageBytes();
    const detailsTotal = Object.values(usageDetails).reduce((sum, value) => {
      return sum + (typeof value === 'number' ? value : 0);
    }, 0);
    const usageTotal = Math.max(usage, detailsTotal, localStorageUsage);
    return {
      usage: usageTotal,
      quota,
      usageFormatted: formatBytes(usageTotal),
      quotaFormatted: formatBytes(quota),
      percentUsed: quota > 0 ? Math.round((usageTotal / quota) * 100) : 0,
      supported: true,
    };
  } catch (error) {
    console.warn('[StorageManager] Failed to get storage estimate:', error);
    return {
      usage: 0,
      quota: 0,
      usageFormatted: 'Unknown',
      quotaFormatted: 'Unknown',
      percentUsed: 0,
      supported: false,
    };
  }
}

/**
 * Check whether a save of the given size is likely to succeed.
 * Uses the Storage Estimation API when available; otherwise falls back
 * to a conservative heuristic based on localStorage usage.
 *
 * @param {number} bytesToSave - Approximate size of the data to store
 * @returns {Promise<{safe: boolean, remainingBytes: number, percentUsed: number, message: string|null}>}
 */
export async function checkStorageQuota(bytesToSave = 0) {
  const fallback = {
    safe: true,
    remainingBytes: Infinity,
    percentUsed: 0,
    message: null,
  };

  try {
    const estimate = await getStorageEstimate();
    if (!estimate.supported || !estimate.quota) {
      // API not available — assume safe but warn if localStorage looks large
      const lsBytes = getLocalStorageUsageBytes();
      const LS_SOFT_LIMIT = 4.5 * 1024 * 1024; // ~4.5MB typical localStorage limit
      if (lsBytes + bytesToSave > LS_SOFT_LIMIT) {
        return {
          safe: false,
          remainingBytes: Math.max(0, LS_SOFT_LIMIT - lsBytes),
          percentUsed: Math.round((lsBytes / LS_SOFT_LIMIT) * 100),
          message:
            'Storage is nearly full. Consider exporting your presets and clearing old projects to free space.',
        };
      }
      return fallback;
    }

    const remaining = estimate.quota - estimate.usage;
    const percentUsed = estimate.percentUsed;

    if (bytesToSave > remaining) {
      return {
        safe: false,
        remainingBytes: remaining,
        percentUsed,
        message: `Not enough storage space. Need ${formatBytes(bytesToSave)} but only ${formatBytes(remaining)} available.`,
      };
    }

    // Warn when nearing 90% capacity
    if (percentUsed > 90) {
      return {
        safe: true,
        remainingBytes: remaining,
        percentUsed,
        message:
          'Storage is above 90% capacity. Consider exporting your data and clearing unused projects.',
      };
    }

    return {
      safe: true,
      remainingBytes: remaining,
      percentUsed,
      message: null,
    };
  } catch (_error) {
    return fallback;
  }
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes, options = {}) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return 'Unknown';
  }
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const normalizedMaxUnit =
    typeof options.maxUnit === 'string' ? options.maxUnit.toUpperCase() : null;
  const maxIndex = normalizedMaxUnit
    ? sizes.indexOf(normalizedMaxUnit)
    : sizes.length - 1;
  const cappedIndex = maxIndex >= 0 ? maxIndex : sizes.length - 1;
  const i = Math.min(
    Math.max(0, Math.floor(Math.log(bytes) / Math.log(k))),
    cappedIndex
  );
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Estimate localStorage usage in bytes.
 * @returns {number}
 */
export function getLocalStorageUsageBytes() {
  try {
    if (typeof localStorage === 'undefined') {
      return 0;
    }
    let total = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) || '';
      total += key.length + value.length;
    }
    // Approximate UTF-16 storage (2 bytes per char)
    return total * 2;
  } catch (_error) {
    return 0;
  }
}

/**
 * Clear all cached data (via service worker)
 * @returns {Promise<boolean>}
 */
export async function clearCachedData() {
  let cacheCleared = false;
  let storageCleared = false;
  let indexedDbCleared = false;

  const cacheTasks = [];

  // Method 1: Send message to service worker
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    cacheTasks.push(
      new Promise((resolve) => {
        // Repo reality: `public/sw.js` broadcasts {type:'CACHE_CLEARED'} to all clients.
        const onMessage = (event) => {
          // Validate message type against allowlist
          if (!isValidServiceWorkerMessage(event, ['CACHE_CLEARED'])) {
            return; // Ignore invalid messages, keep listening
          }

          if (event.data.type === 'CACHE_CLEARED') {
            navigator.serviceWorker.removeEventListener('message', onMessage);
            resolve(true);
          }
        };
        navigator.serviceWorker.addEventListener('message', onMessage);
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
        // Timeout fallback
        setTimeout(() => {
          navigator.serviceWorker.removeEventListener('message', onMessage);
          resolve(false);
        }, 5000);
      })
    );
  }

  // Method 2: Clear Cache Storage API directly
  if ('caches' in window) {
    cacheTasks.push(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        return true;
      })()
    );
  }

  if (cacheTasks.length > 0) {
    const results = await Promise.allSettled(cacheTasks);
    cacheCleared = results.some(
      (result) => result.status === 'fulfilled' && result.value === true
    );
  }

  // Clear local/session storage
  try {
    localStorage.clear();
    storageCleared = true;
  } catch (_error) {
    storageCleared = false;
  }

  try {
    sessionStorage.clear();
  } catch (_error) {
    // Ignore session storage errors
  }

  // Clear IndexedDB databases when possible
  if ('indexedDB' in window) {
    try {
      if (typeof indexedDB.databases === 'function') {
        const dbs = await indexedDB.databases();
        const deletions = await Promise.all(
          dbs
            .filter((db) => db && db.name)
            .map(
              (db) =>
                new Promise((resolve) => {
                  const request = indexedDB.deleteDatabase(db.name);
                  request.onsuccess = () => resolve(true);
                  request.onerror = () => resolve(false);
                  request.onblocked = () => resolve(false);
                })
            )
        );
        indexedDbCleared = deletions.length === 0 || deletions.every(Boolean);
      }
    } catch (_error) {
      indexedDbCleared = false;
    }
  }

  return cacheCleared || storageCleared || indexedDbCleared;
}

/**
 * Check if user prefers reduced data usage
 * @returns {boolean}
 */
export function prefersReducedData() {
  // Check Save-Data header preference
  if ('connection' in navigator && navigator.connection) {
    const conn = navigator.connection;
    if (conn && conn.saveData) return true;
  }
  return false;
}

/**
 * Check if user is on a metered/cellular connection
 * @returns {{isMetered: boolean, type: string, supported: boolean}}
 */
export function getConnectionInfo() {
  if (!('connection' in navigator) || !navigator.connection) {
    return { isMetered: false, type: 'unknown', supported: false };
  }

  const conn = navigator.connection;
  const type = conn.effectiveType || conn.type || 'unknown';
  const slowTypes = ['slow-2g', '2g', '3g'];
  const isMetered =
    conn.type === 'cellular' ||
    slowTypes.includes(conn.effectiveType) ||
    conn.saveData ||
    false;

  return { isMetered, type, supported: true };
}

/**
 * Get user's storage preferences
 * @returns {{allowLargeDownloads: boolean, seenDisclosure: boolean}}
 */
export function getStoragePrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(STORAGE_PREFS_KEY) || '{}');
    return {
      allowLargeDownloads: prefs.allowLargeDownloads ?? true,
      seenDisclosure: prefs.seenDisclosure ?? false,
    };
  } catch (_error) {
    return { allowLargeDownloads: true, seenDisclosure: false };
  }
}

/**
 * Update storage preferences
 * @param {Partial<{allowLargeDownloads: boolean, seenDisclosure: boolean}>} updates
 */
export function updateStoragePrefs(updates) {
  const current = getStoragePrefs();
  localStorage.setItem(
    STORAGE_PREFS_KEY,
    JSON.stringify({ ...current, ...updates })
  );
}

/**
 * Check if large downloads should be deferred based on connection
 * @returns {boolean}
 */
export function shouldDeferLargeDownloads() {
  const prefs = getStoragePrefs();
  if (prefs.allowLargeDownloads === false) {
    return true;
  }

  const connection = getConnectionInfo();
  if (connection.supported && connection.isMetered) {
    return true;
  }

  if (prefersReducedData()) {
    return true;
  }

  return false;
}

// ============================================================================
// Persistent Storage API (v2)
// ============================================================================

/**
 * Check if persistent storage has been requested/granted
 * @returns {Promise<{supported: boolean, persisted: boolean, requestedBefore: boolean}>}
 */
export async function checkPersistentStorage() {
  const result = {
    supported: false,
    persisted: false,
    requestedBefore: localStorage.getItem(PERSISTENCE_KEY) === 'true',
  };

  if (!navigator.storage?.persisted) {
    return result;
  }

  result.supported = true;

  try {
    result.persisted = await navigator.storage.persisted();
  } catch (error) {
    console.warn('[StorageManager] Error checking persistence:', error);
  }

  return result;
}

/**
 * Request persistent storage from the browser
 * @returns {Promise<{success: boolean, granted: boolean, error?: string}>}
 */
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) {
    return {
      success: false,
      granted: false,
      error: 'Persistent storage not supported in this browser',
    };
  }

  try {
    const granted = await navigator.storage.persist();
    localStorage.setItem(PERSISTENCE_KEY, 'true');

    console.log(
      `[StorageManager] Persistence request: ${granted ? 'granted' : 'denied'}`
    );

    return {
      success: true,
      granted,
    };
  } catch (error) {
    console.error('[StorageManager] Error requesting persistence:', error);
    return {
      success: false,
      granted: false,
      error: error.message || 'Failed to request persistent storage',
    };
  }
}

// ============================================================================
// Smart Cache Clear (v2)
// ============================================================================

/**
 * Clear only app caches (Service Worker, CacheStorage) without touching user data
 * @returns {Promise<boolean>}
 */
export async function clearAppCachesOnly() {
  let cacheCleared = false;

  // Method 1: Clear via Service Worker
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    try {
      await new Promise((resolve) => {
        const onMessage = (event) => {
          if (!isValidServiceWorkerMessage(event, ['CACHE_CLEARED'])) return;
          if (event.data.type === 'CACHE_CLEARED') {
            navigator.serviceWorker.removeEventListener('message', onMessage);
            resolve(true);
          }
        };
        navigator.serviceWorker.addEventListener('message', onMessage);
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
        setTimeout(() => {
          navigator.serviceWorker.removeEventListener('message', onMessage);
          resolve(false);
        }, 5000);
      });
      cacheCleared = true;
    } catch (error) {
      console.warn(
        '[StorageManager] Service Worker cache clear failed:',
        error
      );
    }
  }

  // Method 2: Clear Cache Storage API directly
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      cacheCleared = true;
    } catch (error) {
      console.warn('[StorageManager] CacheStorage clear failed:', error);
    }
  }

  console.log('[StorageManager] App caches cleared:', cacheCleared);
  return cacheCleared;
}

/**
 * Clear all user data (Saved Projects, preferences) - "factory reset"
 * @returns {Promise<boolean>}
 */
export async function clearAllUserData() {
  let success = true;

  // Clear IndexedDB saved projects
  try {
    await clearAllSavedProjects();
  } catch (error) {
    console.error('[StorageManager] Failed to clear saved projects:', error);
    success = false;
  }

  // Clear localStorage
  try {
    localStorage.clear();
    console.log('[StorageManager] localStorage cleared');
  } catch (error) {
    console.warn('[StorageManager] Failed to clear localStorage:', error);
    success = false;
  }

  // Clear sessionStorage
  try {
    sessionStorage.clear();
  } catch (_error) {
    // Ignore session storage errors
  }

  return success;
}

/**
 * Clear cache with optional preservation of Saved Projects
 * @param {Object} options - Clear options
 * @param {boolean} options.clearAppCaches - Clear app caches (default: true)
 * @param {boolean} options.preserveSavedDesigns - Preserve saved projects (default: false - user must opt in)
 * @returns {Promise<{success: boolean, appCachesCleared: boolean, userDataCleared: boolean}>}
 */
export async function clearCacheWithOptions({
  clearAppCaches = true,
  preserveSavedDesigns = false,
}) {
  const result = {
    success: true,
    appCachesCleared: false,
    userDataCleared: false,
  };

  // Clear app caches
  if (clearAppCaches) {
    result.appCachesCleared = await clearAppCachesOnly();
  }

  // Clear user data (unless preservation is opted in)
  if (!preserveSavedDesigns) {
    result.userDataCleared = await clearAllUserData();
  } else {
    // Only clear non-project localStorage items
    try {
      const keysToPreserve = [
        'openscad-saved-projects',
        'openscad-saved-folders',
        PERSISTENCE_KEY,
      ];

      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !keysToPreserve.some((p) => key.includes(p))) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => localStorage.removeItem(key));
      console.log(
        `[StorageManager] Cleared ${keysToRemove.length} preference items, preserved saved designs`
      );
    } catch (error) {
      console.warn('[StorageManager] Error clearing preferences:', error);
    }
  }

  return result;
}

/**
 * Get detailed storage information for the cache clear dialog
 * @returns {Promise<Object>}
 */
export async function getDetailedStorageInfo() {
  const info = {
    appCacheSize: 0,
    appCacheFormatted: 'Unknown',
    savedDesignsSize: 0,
    savedDesignsFormatted: 'Unknown',
    savedDesignsCount: 0,
    foldersCount: 0,
    totalSize: 0,
    totalFormatted: 'Unknown',
    quotaUsed: 0,
    quotaTotal: 0,
    quotaPercent: 0,
  };

  // Get saved designs summary
  try {
    const summary = await getSavedProjectsSummary();
    info.savedDesignsCount = summary.count;
    info.savedDesignsSize = summary.totalApproxBytes;
    info.savedDesignsFormatted = formatBytes(summary.totalApproxBytes);
  } catch (error) {
    console.warn(
      '[StorageManager] Error getting saved designs summary:',
      error
    );
  }

  // Get folders count
  try {
    const folders = await listFolders();
    info.foldersCount = folders.length;
  } catch (error) {
    console.warn('[StorageManager] Error getting folders:', error);
  }

  // Get overall storage estimate
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      info.quotaUsed = estimate.usage || 0;
      info.quotaTotal = estimate.quota || 0;
      info.quotaPercent =
        info.quotaTotal > 0
          ? Math.round((info.quotaUsed / info.quotaTotal) * 100)
          : 0;
      info.totalSize = estimate.usage || 0;
      info.totalFormatted = formatBytes(info.totalSize);

      // Estimate app cache size (total - saved designs)
      info.appCacheSize = Math.max(0, info.totalSize - info.savedDesignsSize);
      info.appCacheFormatted = formatBytes(info.appCacheSize);
    }
  } catch (error) {
    console.warn('[StorageManager] Error getting storage estimate:', error);
  }

  return info;
}

// ============================================================================
// Folder Import (webkitdirectory)
// ============================================================================

/** Companion file extensions accepted alongside .scad source */
const FOLDER_IMPORT_COMPANION_EXTS = new Set([
  '.stl',
  '.dxf',
  '.svg',
  '.dat',
  '.csv',
  '.png',
  '.json',
  '.txt',
]);

/**
 * Import a project from a FileList produced by an `<input webkitdirectory>`.
 * Uses the provided mainFilePath to identify the primary .scad entry point.
 *
 * @param {FileList|File[]} fileList - Files from the folder selection
 * @param {string} mainFilePath - Relative path of the primary .scad file (webkitRelativePath)
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function importProjectFromFiles(fileList, mainFilePath) {
  try {
    const files = Array.from(fileList);
    const mainFile = files.find((f) => f.webkitRelativePath === mainFilePath);
    if (!mainFile) {
      return { success: false, error: `Main file not found: ${mainFilePath}` };
    }

    const mainContent = await mainFile.text();
    const rootDir = mainFilePath.includes('/')
      ? mainFilePath.split('/')[0]
      : '';

    // Collect companion files (non-hidden, allowed extensions)
    const projectFiles = {};
    projectFiles[mainFilePath.replace(`${rootDir}/`, '') || mainFilePath] =
      mainContent;

    for (const f of files) {
      if (f === mainFile) continue;
      const rel = f.webkitRelativePath || f.name;
      const baseName = rel.split('/').pop();

      if (baseName.startsWith('.')) continue; // hidden file

      const ext = baseName.includes('.')
        ? `.${baseName.split('.').pop().toLowerCase()}`
        : '';

      if (!FOLDER_IMPORT_COMPANION_EXTS.has(ext) && ext !== '.scad') continue;

      try {
        const content = await f.text();
        const relPath = rootDir ? rel.replace(`${rootDir}/`, '') : rel;
        projectFiles[relPath] = content;
      } catch {
        // Binary files (e.g. PNG) — skip text reading for now
      }
    }

    const projectName = rootDir || mainFile.name.replace('.scad', '');
    const mainRelPath = rootDir
      ? mainFilePath.replace(`${rootDir}/`, '')
      : mainFilePath;

    const result = await saveProject({
      name: projectName,
      originalName: mainFile.name,
      kind: 'zip',
      mainFilePath: mainRelPath,
      content: mainContent,
      projectFiles,
      notes: '',
    });

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Backup/Export System (v2)
// ============================================================================

/**
 * Export all projects and folders as a ZIP backup
 * @returns {Promise<{success: boolean, blob?: Blob, fileName?: string, error?: string}>}
 */
export async function exportProjectsBackup() {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    const folders = await listFolders();
    const projects = await listSavedProjects();

    // Load custom grid presets for inclusion in backup
    let customGridPresets = [];
    try {
      const raw = localStorage.getItem(CUSTOM_GRID_PRESETS_KEY);
      if (raw) customGridPresets = JSON.parse(raw) || [];
    } catch (_) {
      /* ignore */
    }

    const manifest = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      foldersCount: folders.length,
      projectsCount: projects.length,
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        color: f.color,
        createdAt: f.createdAt,
      })),
      projects: [],
      // Custom grid presets — ignored by standard OpenSCAD desktop
      customGridPresets,
    };

    for (const projectSummary of projects) {
      const project = await getProject(projectSummary.id);
      if (!project) continue;

      const folderPath = await buildFolderPath(project.folderId, folders);
      const projectDir = folderPath
        ? `${folderPath}/${sanitizeFileName(project.name)}`
        : sanitizeFileName(project.name);

      // Add main content
      if (project.kind === 'zip' && project.projectFiles) {
        // For ZIP projects, restore the original ZIP structure
        const parsedFiles =
          typeof project.projectFiles === 'string'
            ? JSON.parse(project.projectFiles)
            : project.projectFiles;

        for (const [filePath, content] of Object.entries(parsedFiles)) {
          zip.file(`${projectDir}/files/${filePath}`, content);
        }
      } else {
        // For single SCAD files
        zip.file(
          `${projectDir}/${project.mainFilePath || 'main.scad'}`,
          project.content
        );
      }

      // Prefer uiPreferences from the project record (authoritative); fall back
      // to the legacy localStorage key for projects saved before this change.
      let uiPreferences = project.uiPreferences ?? null;
      if (uiPreferences == null) {
        try {
          const raw = localStorage.getItem(
            `openscad-forge-ui-prefs-${project.originalName}`
          );
          if (raw) uiPreferences = JSON.parse(raw);
        } catch (_) {
          /* ignore */
        }
      }

      const projectMeta = {
        id: project.id,
        name: project.name,
        originalName: project.originalName,
        kind: project.kind,
        mainFilePath: project.mainFilePath,
        folderId: project.folderId,
        notes: project.notes,
        savedAt: project.savedAt,
        lastLoadedAt: project.lastLoadedAt,
        overlayFiles: project.overlayFiles || {},
        presets: project.presets || [],
        uiPreferences,
      };
      zip.file(
        `${projectDir}/project.json`,
        JSON.stringify(projectMeta, null, 2)
      );

      // Add project files (presets, overlays)
      try {
        const files = await getProjectFiles(project.id);
        for (const file of files) {
          if (file.textContent) {
            zip.file(`${projectDir}/${file.path}`, file.textContent);
          } else if (file.assetId) {
            const asset = await getAsset(file.assetId);
            if (asset && asset.data) {
              zip.file(`${projectDir}/${file.path}`, asset.data);
            }
          }
        }
      } catch (error) {
        console.warn(
          `[StorageManager] Error exporting project files for ${project.name}:`,
          error
        );
      }

      manifest.projects.push({
        id: project.id,
        name: project.name,
        folderId: project.folderId,
        path: projectDir,
      });
    }

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const fileName = `openscad-forge-backup-${new Date().toISOString().split('T')[0]}.zip`;

    console.log(
      `[StorageManager] Backup created: ${fileName} (${formatBytes(blob.size)})`
    );

    return { success: true, blob, fileName };
  } catch (error) {
    console.error('[StorageManager] Error creating backup:', error);
    return {
      success: false,
      error: error.message || 'Failed to create backup',
    };
  }
}

/**
 * Export a single project as a ZIP file
 * @param {string} projectId - The project ID to export
 * @returns {Promise<{success: boolean, blob?: Blob, fileName?: string, error?: string}>}
 */
export async function exportSingleProject(projectId) {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    const project = await getProject(projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    const projectDir = sanitizeFileName(project.name);

    if (project.kind === 'zip' && project.projectFiles) {
      const parsedFiles =
        typeof project.projectFiles === 'string'
          ? JSON.parse(project.projectFiles)
          : project.projectFiles;

      for (const [filePath, content] of Object.entries(parsedFiles)) {
        zip.file(`${projectDir}/files/${filePath}`, content);
      }
    } else {
      zip.file(
        `${projectDir}/${project.mainFilePath || 'main.scad'}`,
        project.content
      );
    }

    // Prefer uiPreferences from the project record (authoritative); fall back
    // to the legacy localStorage key for projects saved before this change.
    let uiPreferences = project.uiPreferences ?? null;
    if (uiPreferences == null) {
      try {
        const raw = localStorage.getItem(
          `openscad-forge-ui-prefs-${project.originalName}`
        );
        if (raw) uiPreferences = JSON.parse(raw);
      } catch (_) {
        /* ignore */
      }
    }

    const projectMeta = {
      id: project.id,
      name: project.name,
      originalName: project.originalName,
      kind: project.kind,
      mainFilePath: project.mainFilePath,
      folderId: project.folderId,
      notes: project.notes,
      savedAt: project.savedAt,
      lastLoadedAt: project.lastLoadedAt,
      overlayFiles: project.overlayFiles || {},
      presets: project.presets || [],
      uiPreferences,
    };

    zip.file(
      `${projectDir}/project.json`,
      JSON.stringify(projectMeta, null, 2)
    );

    // Add project files (presets, overlays)
    try {
      const files = await getProjectFiles(project.id);
      for (const file of files) {
        if (file.textContent) {
          zip.file(`${projectDir}/${file.path}`, file.textContent);
        } else if (file.assetId) {
          const asset = await getAsset(file.assetId);
          if (asset && asset.data) {
            zip.file(`${projectDir}/${file.path}`, asset.data);
          }
        }
      }
    } catch (error) {
      console.warn(
        `[StorageManager] Error exporting project files for ${project.name}:`,
        error
      );
    }

    // Add a minimal manifest so the ZIP is recognisable by importProjectsBackup
    const manifest = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      foldersCount: 0,
      projectsCount: 1,
      folders: [],
      projects: [
        {
          id: project.id,
          name: project.name,
          folderId: null,
          path: projectDir,
        },
      ],
      customGridPresets: [],
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const fileName = `${sanitizeFileName(project.name)}.zip`;

    console.log(
      `[StorageManager] Single-project export: ${fileName} (${formatBytes(blob.size)})`
    );

    return { success: true, blob, fileName };
  } catch (error) {
    console.error('[StorageManager] Error exporting single project:', error);
    return {
      success: false,
      error: error.message || 'Failed to export project',
    };
  }
}

/**
 * Import projects from a backup ZIP file
 * @param {File|Blob} file - The backup ZIP file
 * @returns {Promise<{success: boolean, imported: number, errors: string[]}>}
 */
export async function importProjectsBackup(file) {
  const result = {
    success: false,
    imported: 0,
    errors: [],
  };

  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(file);

    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      result.errors.push('Invalid backup file: missing manifest.json');
      return result;
    }

    const manifest = JSON.parse(await manifestFile.async('string'));

    if (!manifest.version || !manifest.version.startsWith('2.')) {
      console.warn(
        `[StorageManager] Unknown backup version: ${manifest.version}`
      );
    }

    // Create folders first (to maintain hierarchy)
    const folderIdMap = new Map(); // old ID -> new ID
    if (manifest.folders && manifest.folders.length > 0) {
      // Sort folders by parent (null first, then by depth)
      const sortedFolders = sortFoldersByHierarchy(manifest.folders);

      for (const folderMeta of sortedFolders) {
        const newParentId = folderMeta.parentId
          ? folderIdMap.get(folderMeta.parentId) || null
          : null;

        const createResult = await createFolder({
          name: folderMeta.name,
          parentId: newParentId,
          color: folderMeta.color,
        });

        if (createResult.success) {
          folderIdMap.set(folderMeta.id, createResult.id);
        } else {
          result.errors.push(`Failed to create folder: ${folderMeta.name}`);
        }
      }
    }

    // Import projects
    for (const projectRef of manifest.projects) {
      try {
        const projectJsonFile = zip.file(`${projectRef.path}/project.json`);
        if (!projectJsonFile) {
          result.errors.push(`Missing project.json for: ${projectRef.name}`);
          continue;
        }

        const projectMeta = JSON.parse(await projectJsonFile.async('string'));
        const newFolderId = projectMeta.folderId
          ? folderIdMap.get(projectMeta.folderId) || null
          : null;

        // Gather project files
        let content = '';
        let projectFiles = null;

        if (projectMeta.kind === 'zip') {
          // Reconstruct ZIP project files
          projectFiles = {};
          const filesDir = `${projectRef.path}/files/`;
          for (const [path, zipEntry] of Object.entries(zip.files)) {
            if (path.startsWith(filesDir) && !zipEntry.dir) {
              const relativePath = path.substring(filesDir.length);
              projectFiles[relativePath] = await zipEntry.async('string');
            }
          }
          // Get main file content
          content = projectFiles[projectMeta.mainFilePath] || '';
        } else {
          const mainFile = zip.file(
            `${projectRef.path}/${projectMeta.mainFilePath || 'main.scad'}`
          );
          if (mainFile) {
            content = await mainFile.async('string');
          }
        }

        const saveResult = await saveProject({
          name: projectMeta.name,
          originalName: projectMeta.originalName,
          kind: projectMeta.kind,
          mainFilePath: projectMeta.mainFilePath,
          content,
          projectFiles,
          notes: projectMeta.notes || '',
          folderId: newFolderId,
        });

        if (saveResult.success) {
          result.imported++;

          // Import project files (presets, overlays)
          const presetsDir = `${projectRef.path}/presets/`;
          const overlaysDir = `${projectRef.path}/overlays/`;

          for (const [path, zipEntry] of Object.entries(zip.files)) {
            if (
              path.startsWith(presetsDir) &&
              !zipEntry.dir &&
              path.endsWith('.json')
            ) {
              try {
                const presetContent = await zipEntry.async('string');
                await addProjectFile({
                  projectId: saveResult.id,
                  path: `presets/${path.substring(presetsDir.length)}`,
                  kind: 'json',
                  textContent: presetContent,
                  mimeType: 'application/json',
                });
              } catch (_e) {
                console.warn(
                  `[StorageManager] Failed to import preset: ${path}`
                );
              }
            } else if (path.startsWith(overlaysDir) && !zipEntry.dir) {
              try {
                const overlayData = await zipEntry.async('blob');
                const mimeType = path.endsWith('.png')
                  ? 'image/png'
                  : path.endsWith('.svg')
                    ? 'image/svg+xml'
                    : 'application/octet-stream';

                const assetResult = await storeAsset({
                  data: overlayData,
                  mimeType,
                  fileName: path.substring(overlaysDir.length),
                });

                if (assetResult.success) {
                  await addProjectFile({
                    projectId: saveResult.id,
                    path: `overlays/${path.substring(overlaysDir.length)}`,
                    kind: 'image',
                    assetId: assetResult.id,
                    mimeType,
                  });
                }
              } catch (_e) {
                console.warn(
                  `[StorageManager] Failed to import overlay: ${path}`
                );
              }
            }
          }

          // Restore UI preferences: write into the project record (authoritative)
          // and keep the legacy localStorage key in sync for backward compatibility.
          if (projectMeta.uiPreferences != null) {
            try {
              await updateProject({
                id: saveResult.id,
                uiPreferences: projectMeta.uiPreferences,
              });
            } catch (_e) {
              console.warn(
                `[StorageManager] Failed to restore UI preferences to project record for ${projectMeta.name}`
              );
            }
            if (projectMeta.originalName) {
              try {
                localStorage.setItem(
                  `openscad-forge-ui-prefs-${projectMeta.originalName}`,
                  JSON.stringify(projectMeta.uiPreferences)
                );
              } catch (_e) {
                /* localStorage backup is best-effort */
              }
            }
          }
        } else {
          result.errors.push(
            `Failed to save project: ${projectMeta.name} - ${saveResult.error}`
          );
        }
      } catch (error) {
        result.errors.push(
          `Error importing project ${projectRef.name}: ${error.message}`
        );
      }
    }

    // Restore custom grid presets (additive merge — skip duplicates by name)
    if (
      Array.isArray(manifest.customGridPresets) &&
      manifest.customGridPresets.length > 0
    ) {
      try {
        let existing = [];
        const raw = localStorage.getItem(CUSTOM_GRID_PRESETS_KEY);
        if (raw) existing = JSON.parse(raw) || [];

        const existingNames = new Set(existing.map((p) => p.name));
        const toAdd = manifest.customGridPresets.filter(
          (p) =>
            p &&
            typeof p.name === 'string' &&
            typeof p.widthMm === 'number' &&
            typeof p.heightMm === 'number' &&
            !existingNames.has(p.name)
        );

        if (toAdd.length > 0) {
          localStorage.setItem(
            CUSTOM_GRID_PRESETS_KEY,
            JSON.stringify([...existing, ...toAdd])
          );
          console.log(
            `[StorageManager] Restored ${toAdd.length} custom grid preset(s)`
          );
        }
      } catch (err) {
        console.warn(
          '[StorageManager] Failed to restore custom grid presets:',
          err
        );
      }
    }

    result.success = result.imported > 0;
    console.log(
      `[StorageManager] Import complete: ${result.imported} projects, ${result.errors.length} errors`
    );

    return result;
  } catch (error) {
    console.error('[StorageManager] Error importing backup:', error);
    result.errors.push(`Import failed: ${error.message}`);
    return result;
  }
}

// Helper functions

/**
 * Build folder path string from folder ID
 * @param {string|null} folderId - Folder ID
 * @param {Array} folders - All folders
 * @returns {string}
 */
async function buildFolderPath(folderId, folders) {
  if (!folderId) return '';

  const path = [];
  let currentId = folderId;

  while (currentId) {
    const folder = folders.find((f) => f.id === currentId);
    if (folder) {
      path.unshift(sanitizeFileName(folder.name));
      currentId = folder.parentId;
    } else {
      break;
    }
  }

  return path.join('/');
}

/**
 * Sanitize a file/folder name for use in paths
 * @param {string} name - Name to sanitize
 * @returns {string}
 */
function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

/**
 * Sort folders by hierarchy (parents before children)
 * @param {Array} folders - Folders to sort
 * @returns {Array}
 */
function sortFoldersByHierarchy(folders) {
  const result = [];
  const remaining = [...folders];
  const added = new Set();

  // First add root folders
  const roots = remaining.filter((f) => !f.parentId);
  roots.forEach((f) => {
    result.push(f);
    added.add(f.id);
  });

  // Then add children iteratively
  let iterations = 0;
  while (remaining.length > result.length && iterations < 100) {
    for (const folder of remaining) {
      if (
        !added.has(folder.id) &&
        (!folder.parentId || added.has(folder.parentId))
      ) {
        result.push(folder);
        added.add(folder.id);
      }
    }
    iterations++;
  }

  return result;
}
