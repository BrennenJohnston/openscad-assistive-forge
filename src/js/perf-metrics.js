/**
 * Performance metrics log — shared localStorage append helper.
 *
 * Extracted from render-controller.js and auto-preview-controller.js,
 * which carried copy-paste identical parse/push/cap/save blocks.
 *
 * @license GPL-3.0-or-later
 */

import {
  STORAGE_KEY_PERF_METRICS,
  STORAGE_KEY_METRICS_LOG,
} from './storage-keys.js';

/**
 * Whether the user has enabled performance metric collection
 * (KI-012 developer toggle).
 * @returns {boolean}
 */
export function isPerfMetricsEnabled() {
  return localStorage.getItem(STORAGE_KEY_PERF_METRICS) === 'true';
}

/**
 * Append one entry to the rolling metrics log in localStorage.
 *
 * @param {Object} entry - Metric record (timestamp, renderMs, ...)
 * @param {Object} [options]
 * @param {number} [options.cap=100] - Maximum entries retained (oldest dropped)
 * @returns {boolean} True on success, false when storage failed
 */
export function appendPerfMetric(entry, { cap = 100 } = {}) {
  try {
    const metrics = JSON.parse(
      localStorage.getItem(STORAGE_KEY_METRICS_LOG) || '[]'
    );
    metrics.push(entry);

    while (metrics.length > cap) {
      metrics.shift();
    }

    localStorage.setItem(STORAGE_KEY_METRICS_LOG, JSON.stringify(metrics));
    return true;
  } catch (error) {
    console.warn('[Perf] Failed to log metrics:', error);
    return false;
  }
}
