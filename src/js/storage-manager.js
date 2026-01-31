/**
 * Storage Manager - Data-conscious UX utilities
 * Provides storage estimation, cache clearing, persistence, and backup/restore
 * @license GPL-3.0-or-later
 */

import { isValidServiceWorkerMessage } from './html-utils.js';
import {
  listSavedProjects,
  listFolders,
  getProject,
  getProjectFiles,
  getAsset,
  saveProject,
  createFolder,
  storeAsset,
  addProjectFile,
  clearAllSavedProjects,
  getSavedProjectsSummary,
} from './saved-projects-manager.js';

const FIRST_VISIT_KEY = 'openscad-forge-first-visit-seen';
const STORAGE_PREFS_KEY = 'openscad-forge-storage-prefs';
const PERSISTENCE_KEY = 'openscad-forge-persistence-requested';

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
  // Check user preference first
  const prefs = getStoragePrefs();
  if (prefs.allowLargeDownloads === false) {
    return true;
  }

  // Check network conditions
  const connection = getConnectionInfo();
  if (connection.supported && connection.isMetered) {
    return true;
  }

  // Check Save-Data preference
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
 * Clear all user data (Saved Designs, preferences) - "factory reset"
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
 * Clear cache with optional preservation of Saved Designs
 * @param {Object} options - Clear options
 * @param {boolean} options.clearAppCaches - Clear app caches (default: true)
 * @param {boolean} options.preserveSavedDesigns - Preserve saved designs (default: false - user must opt in)
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
// Backup/Export System (v2)
// ============================================================================

/**
 * Export all projects and folders as a ZIP backup
 * @returns {Promise<{success: boolean, blob?: Blob, fileName?: string, error?: string}>}
 */
export async function exportProjectsBackup() {
  try {
    // Dynamically import JSZip
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // Get all folders and projects
    const folders = await listFolders();
    const projects = await listSavedProjects();

    // Create manifest
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
    };

    // Add each project to the ZIP
    for (const projectSummary of projects) {
      const project = await getProject(projectSummary.id);
      if (!project) continue;

      // Build folder path
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

      // Add project metadata
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

    // Add manifest
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    // Generate ZIP
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
    // Dynamically import JSZip
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(file);

    // Read manifest
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      result.errors.push('Invalid backup file: missing manifest.json');
      return result;
    }

    const manifest = JSON.parse(await manifestFile.async('string'));

    // Validate manifest version
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
          // Single SCAD file
          const mainFile = zip.file(
            `${projectRef.path}/${projectMeta.mainFilePath || 'main.scad'}`
          );
          if (mainFile) {
            content = await mainFile.async('string');
          }
        }

        // Save project
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
