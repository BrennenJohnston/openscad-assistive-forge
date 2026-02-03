/**
 * Memory Monitor
 *
 * Monitors memory usage and implements graceful degradation
 * following the memory-management-design.md specification.
 *
 * @license GPL-3.0-or-later
 */

import { isEnabled } from './feature-flags.js';

/**
 * Memory state levels
 * @readonly
 * @enum {string}
 */
export const MemoryState = {
  NORMAL: 'normal',
  WARNING: 'warning',
  CRITICAL: 'critical',
  EMERGENCY: 'emergency',
};

/**
 * Memory usage sample
 * @typedef {Object} MemorySample
 * @property {number} timestamp - Sample timestamp
 * @property {number} heapMB - WASM heap size in MB
 * @property {number} heapLimitMB - Heap limit in MB
 * @property {number} heapPercent - Percentage of limit used
 */

/**
 * Memory monitor configuration
 * @typedef {Object} MemoryMonitorOptions
 * @property {number} [warningMB=400] - Warning threshold in MB
 * @property {number} [criticalMB=800] - Critical threshold in MB
 * @property {number} [emergencyMB=1200] - Emergency threshold in MB
 * @property {Function} [onWarning] - Callback when entering warning state
 * @property {Function} [onCritical] - Callback when entering critical state
 * @property {Function} [onEmergency] - Callback when entering emergency state
 * @property {Function} [onRecovery] - Callback when returning to normal
 */

/**
 * Memory Monitor class
 * Tracks WASM heap usage and triggers state transitions
 */
export class MemoryMonitor {
  /**
   * @param {MemoryMonitorOptions} options
   */
  constructor(options = {}) {
    this.thresholds = {
      warning: options.warningMB || 400,
      critical: options.criticalMB || 800,
      emergency: options.emergencyMB || 1200,
    };

    this.callbacks = {
      onWarning: options.onWarning || (() => {}),
      onCritical: options.onCritical || (() => {}),
      onEmergency: options.onEmergency || (() => {}),
      onRecovery: options.onRecovery || (() => {}),
    };

    /** @type {MemorySample[]} */
    this.history = [];
    this.maxHistorySize = 100;

    /** @type {MemoryState} */
    this.currentState = MemoryState.NORMAL;

    /** @type {number|null} */
    this.pollInterval = null;

    /** @type {Object|null} Reference to WASM worker memory interface */
    this.wasmMemoryInterface = null;

    // Bind methods for event handlers
    this.check = this.check.bind(this);
  }

  /**
   * Set the WASM memory interface
   * Called when worker is initialized
   * @param {Object} memInterface - Object with getMemoryUsage method
   */
  setWasmInterface(memInterface) {
    this.wasmMemoryInterface = memInterface;
  }

  /**
   * Get current memory usage from available sources
   * @returns {MemorySample}
   */
  getCurrentUsage() {
    // Try WASM heap first
    if (this.wasmMemoryInterface?.getMemoryUsage) {
      const wasmMem = this.wasmMemoryInterface.getMemoryUsage();
      return {
        timestamp: Date.now(),
        heapMB: Math.round(wasmMem.used / 1024 / 1024),
        heapLimitMB: Math.round(wasmMem.limit / 1024 / 1024),
        heapPercent: wasmMem.percent || 0,
      };
    }

    // Fallback: Check Chrome's performance.memory (deprecated but useful)
    if (
      typeof performance !== 'undefined' &&
      'memory' in performance &&
      performance.memory
    ) {
      const mem = performance.memory;
      return {
        timestamp: Date.now(),
        heapMB: Math.round(mem.usedJSHeapSize / 1024 / 1024),
        heapLimitMB: Math.round(mem.jsHeapSizeLimit / 1024 / 1024),
        heapPercent: Math.round(
          (mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100
        ),
      };
    }

    // No memory info available - return unknown state
    return {
      timestamp: Date.now(),
      heapMB: 0,
      heapLimitMB: this.thresholds.emergency,
      heapPercent: 0,
    };
  }

  /**
   * Update memory usage from worker message
   * Called when worker sends memory stats with render result
   * @param {Object} memoryInfo - Memory info from worker
   */
  updateFromWorker(memoryInfo) {
    if (!memoryInfo) return;

    const sample = {
      timestamp: Date.now(),
      heapMB: Math.round((memoryInfo.used || 0) / 1024 / 1024),
      heapLimitMB: Math.round(
        (memoryInfo.limit || this.thresholds.emergency * 1024 * 1024) /
          1024 /
          1024
      ),
      heapPercent: memoryInfo.percent || 0,
    };

    this.addSample(sample);
    return this.evaluateState(sample);
  }

  /**
   * Add a sample to history
   * @param {MemorySample} sample
   */
  addSample(sample) {
    this.history.push(sample);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Poll memory usage and update state
   * @returns {MemoryState} Current memory state
   */
  check() {
    const sample = this.getCurrentUsage();
    this.addSample(sample);
    return this.evaluateState(sample);
  }

  /**
   * Evaluate memory state based on usage
   * @param {MemorySample} usage - Current usage sample
   * @returns {MemoryState} New state
   */
  evaluateState(usage) {
    const prevState = this.currentState;
    let newState = MemoryState.NORMAL;

    if (usage.heapMB >= this.thresholds.emergency) {
      newState = MemoryState.EMERGENCY;
    } else if (usage.heapMB >= this.thresholds.critical) {
      newState = MemoryState.CRITICAL;
    } else if (usage.heapMB >= this.thresholds.warning) {
      newState = MemoryState.WARNING;
    }

    // State changed - trigger callbacks
    if (newState !== prevState) {
      this.currentState = newState;
      this.onStateChange(prevState, newState, usage);
    }

    return newState;
  }

  /**
   * Handle state transitions
   * @param {MemoryState} from - Previous state
   * @param {MemoryState} to - New state
   * @param {MemorySample} usage - Current usage
   */
  onStateChange(from, to, usage) {
    console.log(`[Memory] State change: ${from} → ${to} (${usage.heapMB}MB)`);

    // Dispatch custom event for UI updates
    document.dispatchEvent(
      new CustomEvent('memory-state-change', {
        detail: { from, to, usage },
      })
    );

    // Recovery (returning to normal from any elevated state)
    if (to === MemoryState.NORMAL) {
      this.callbacks.onRecovery(usage);
      return;
    }

    // Elevated states
    switch (to) {
      case MemoryState.WARNING:
        this.callbacks.onWarning(usage);
        break;
      case MemoryState.CRITICAL:
        this.callbacks.onCritical(usage);
        break;
      case MemoryState.EMERGENCY:
        this.callbacks.onEmergency(usage);
        break;
    }
  }

  /**
   * Calculate memory growth rate (MB per second)
   * @returns {number} Growth rate or 0 if insufficient data
   */
  getGrowthRate() {
    if (this.history.length < 2) return 0;

    const recent = this.history.slice(-10);
    const first = recent[0];
    const last = recent[recent.length - 1];

    const timeDelta = (last.timestamp - first.timestamp) / 1000; // seconds
    if (timeDelta === 0) return 0;

    const memDelta = last.heapMB - first.heapMB;
    return memDelta / timeDelta; // MB per second
  }

  /**
   * Get current state
   * @returns {MemoryState}
   */
  getState() {
    return this.currentState;
  }

  /**
   * Get latest memory sample
   * @returns {MemorySample|null}
   */
  getLatestSample() {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  /**
   * Get memory statistics
   * @returns {Object}
   */
  getStats() {
    const latest = this.getLatestSample();
    return {
      state: this.currentState,
      currentMB: latest?.heapMB || 0,
      limitMB: latest?.heapLimitMB || this.thresholds.emergency,
      percent: latest?.heapPercent || 0,
      growthRate: this.getGrowthRate(),
      thresholds: { ...this.thresholds },
      samplesCount: this.history.length,
    };
  }

  /**
   * Start periodic polling
   * @param {number} intervalMs - Poll interval in milliseconds
   */
  startPolling(intervalMs = 5000) {
    if (this.pollInterval) {
      this.stopPolling();
    }
    this.pollInterval = setInterval(this.check, intervalMs);
    console.log(`[Memory] Polling started (${intervalMs}ms interval)`);
  }

  /**
   * Stop periodic polling
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[Memory] Polling stopped');
    }
  }

  /**
   * Reset monitor state
   */
  reset() {
    this.history = [];
    this.currentState = MemoryState.NORMAL;
  }
}

// Singleton instance
let monitorInstance = null;

/**
 * Get or create the memory monitor singleton
 * @param {MemoryMonitorOptions} [options] - Options for initial creation
 * @returns {MemoryMonitor}
 */
export function getMemoryMonitor(options) {
  if (!monitorInstance) {
    monitorInstance = new MemoryMonitor(options);
  }
  return monitorInstance;
}

/**
 * Initialize memory monitoring
 * Sets up callbacks and starts polling if enabled
 * @param {Object} [callbacks] - State change callbacks
 */
export function initMemoryMonitor(callbacks = {}) {
  if (!isEnabled('memory_monitoring')) {
    console.log('[Memory] Monitoring disabled via feature flag');
    return null;
  }

  const monitor = getMemoryMonitor(callbacks);

  // Start polling in non-blocking way
  // Actual memory updates come from worker messages
  monitor.startPolling(10000); // Check every 10s as backup

  console.log('[Memory] Monitor initialized');
  return monitor;
}

/**
 * Memory recovery utilities
 */
export const MemoryRecovery = {
  /**
   * Get suggestions for reducing memory usage
   * @param {MemoryState} state - Current memory state
   * @returns {Object[]} Array of suggestions
   */
  getSuggestions(state) {
    const suggestions = [];

    if (state === MemoryState.WARNING) {
      suggestions.push({
        id: 'reduce-fn',
        label: 'Reduce quality ($fn)',
        description: 'Lower the $fn value to reduce polygon count',
        priority: 'medium',
      });
    }

    if (state === MemoryState.CRITICAL || state === MemoryState.EMERGENCY) {
      suggestions.push({
        id: 'reduce-fn',
        label: 'Reduce quality ($fn)',
        description: 'Lower the $fn value to reduce polygon count',
        priority: 'high',
      });
      suggestions.push({
        id: 'save-work',
        label: 'Save your work',
        description: 'Export your design before memory runs out',
        priority: 'high',
      });
    }

    if (state === MemoryState.EMERGENCY) {
      suggestions.push({
        id: 'refresh',
        label: 'Refresh page',
        description: 'Refresh to clear memory (your work will be restored)',
        priority: 'critical',
      });
    }

    return suggestions;
  },
};

// Export for testing
export const _internal = {
  monitorInstance: () => monitorInstance,
  resetSingleton: () => {
    if (monitorInstance) {
      monitorInstance.stopPolling();
      monitorInstance = null;
    }
  },
};
