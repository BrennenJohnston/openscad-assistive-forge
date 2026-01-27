/**
 * Storage Manager - Data-conscious UX utilities
 * Provides storage estimation, cache clearing, and network detection
 * @license GPL-3.0-or-later
 */

import { isValidServiceWorkerMessage } from './html-utils.js';

const FIRST_VISIT_KEY = 'openscad-forge-first-visit-seen';
const STORAGE_PREFS_KEY = 'openscad-forge-storage-prefs';

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
