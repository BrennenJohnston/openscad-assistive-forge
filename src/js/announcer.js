/**
 * Centralized Screen Reader Announcer Utility
 *
 * Consolidates announcement logic from:
 * - ui-generator.js (announceChange)
 * - camera-panel-controller.js (announceAction)
 * - preview.js (announceCameraAction)
 * - mode-manager.js (_defaultAnnounce)
 * - state.js (announceChange)
 * - error-translator.js (error announcements)
 * - workflow-progress.js (step announcements)
 * - console-panel.js (console error/warning announcements)
 * - tutorial-sandbox.js (tutorial announcements)
 *
 * Uses dual live regions:
 * - #srAnnouncer (polite) for routine status updates
 * - #srAnnouncerAssertive (assertive) for errors and critical warnings
 *
 * Uses consistent debouncing and clear-then-set pattern for reliable
 * repeat announcements.
 *
 * @license GPL-3.0-or-later
 */

// Debounce timer for announcement batching (per politeness level)
let announceTimeoutPolite = null;
let announceTimeoutAssertive = null;

// Clear timer to reset live region after announcement (per politeness level)
let clearTimeoutPolite = null;
let clearTimeoutAssertive = null;

// Default configuration
const DEFAULT_DEBOUNCE_MS = 350;
const DEFAULT_CLEAR_DELAY_MS = 1500;

// Politeness levels
export const POLITENESS = {
  POLITE: 'polite',
  ASSERTIVE: 'assertive',
};

/**
 * Get the timer refs for a given politeness level.
 * @param {string} politeness - 'polite' or 'assertive'
 * @returns {{ getTimeout: () => number|null, setTimeout: (v: number|null) => void, getClearTimeout: () => number|null, setClearTimeout: (v: number|null) => void }}
 */
function getTimerRefs(politeness) {
  if (politeness === POLITENESS.ASSERTIVE) {
    return {
      getTimeout: () => announceTimeoutAssertive,
      setTimeout: (v) => {
        announceTimeoutAssertive = v;
      },
      getClearTimeout: () => clearTimeoutAssertive,
      setClearTimeout: (v) => {
        clearTimeoutAssertive = v;
      },
    };
  }
  return {
    getTimeout: () => announceTimeoutPolite,
    setTimeout: (v) => {
      announceTimeoutPolite = v;
    },
    getClearTimeout: () => clearTimeoutPolite,
    setClearTimeout: (v) => {
      clearTimeoutPolite = v;
    },
  };
}

/**
 * Announce a message to screen readers via the live region.
 * Uses debouncing to prevent announcement spam from rapid state changes.
 *
 * @param {string} message - The message to announce
 * @param {Object} [options] - Configuration options
 * @param {number} [options.debounceMs=350] - Debounce delay in milliseconds (0 for immediate)
 * @param {number} [options.clearDelayMs=1500] - Delay before clearing the live region
 * @param {boolean} [options.immediate=false] - Skip debounce and announce immediately
 * @param {string} [options.politeness='polite'] - 'polite' for routine status, 'assertive' for errors/critical
 */
export function announce(message, options = {}) {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    clearDelayMs = DEFAULT_CLEAR_DELAY_MS,
    immediate = false,
    politeness = POLITENESS.POLITE,
  } = options;

  // Route to the appropriate live region
  const announcerId =
    politeness === POLITENESS.ASSERTIVE
      ? 'srAnnouncerAssertive'
      : 'srAnnouncer';
  const srAnnouncer = document.getElementById(announcerId);
  if (!srAnnouncer) return;

  const timers = getTimerRefs(politeness);

  // Clear any pending announcements for this politeness level
  if (timers.getTimeout()) {
    window.clearTimeout(timers.getTimeout());
    timers.setTimeout(null);
  }

  // Cancel pending clear to avoid clearing a newer message
  if (timers.getClearTimeout()) {
    window.clearTimeout(timers.getClearTimeout());
    timers.setClearTimeout(null);
  }

  const performAnnouncement = () => {
    // Clear first so repeated strings are re-announced reliably
    // (ARIA live regions may not re-announce identical content)
    srAnnouncer.textContent = '';

    // Use requestAnimationFrame to ensure the clear is processed
    // before setting the new content
    requestAnimationFrame(() => {
      srAnnouncer.textContent = message;

      // Schedule clearing the live region
      const clearId = window.setTimeout(() => {
        // Only clear if the content hasn't changed
        if (srAnnouncer.textContent === message) {
          srAnnouncer.textContent = '';
        }
        timers.setClearTimeout(null);
      }, clearDelayMs);
      timers.setClearTimeout(clearId);
    });
  };

  if (immediate || debounceMs === 0) {
    performAnnouncement();
  } else {
    const timeoutId = window.setTimeout(() => {
      performAnnouncement();
      timers.setTimeout(null);
    }, debounceMs);
    timers.setTimeout(timeoutId);
  }
}

/**
 * Announce immediately without debouncing.
 * Use for discrete user-initiated actions like button clicks.
 *
 * @param {string} message - The message to announce
 * @param {Object} [options] - Configuration options (same as announce, minus debounce)
 * @param {string} [options.politeness='polite'] - 'polite' for routine status, 'assertive' for errors/critical
 */
export function announceImmediate(message, options = {}) {
  announce(message, { ...options, immediate: true });
}

/**
 * Announce an error or critical warning via the assertive live region.
 * Use for error messages that need immediate user attention.
 *
 * @param {string} message - The error message to announce
 * @param {Object} [options] - Configuration options
 * @param {number} [options.clearDelayMs=3000] - Delay before clearing (errors stay longer)
 */
export function announceError(message, options = {}) {
  announce(message, {
    ...options,
    immediate: true,
    politeness: POLITENESS.ASSERTIVE,
    clearDelayMs: options.clearDelayMs ?? 3000, // Errors stay visible longer
  });
}

/**
 * Announce a camera action with standard formatting.
 * Use for camera control feedback (rotate, pan, zoom, etc.)
 *
 * @param {string} action - The action identifier (e.g., 'ArrowLeft', 'zoom-in')
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.shiftKey=false] - Whether shift key was held (modifies pan/rotate)
 */
export function announceCameraAction(action, options = {}) {
  const { shiftKey = false } = options;

  let message = '';

  // Map arrow key actions to descriptive messages
  switch (action) {
    case 'ArrowLeft':
      message = shiftKey ? 'Panning left' : 'Rotating left';
      break;
    case 'ArrowRight':
      message = shiftKey ? 'Panning right' : 'Rotating right';
      break;
    case 'ArrowUp':
      message = shiftKey ? 'Panning up' : 'Rotating up';
      break;
    case 'ArrowDown':
      message = shiftKey ? 'Panning down' : 'Rotating down';
      break;
    case 'zoom-in':
    case '+':
    case '=':
      message = 'Zooming in';
      break;
    case 'zoom-out':
    case '-':
      message = 'Zooming out';
      break;
    case 'reset':
      message = 'View reset to default';
      break;
    default:
      // For custom actions, use the action string directly
      message = action;
  }

  if (message) {
    // Camera actions are immediate (user-initiated discrete events)
    announceImmediate(message);
  }
}

/**
 * Announce a parameter change.
 * Use for form control value changes (sliders, toggles, etc.)
 *
 * @param {string} message - The change description
 */
export function announceChange(message) {
  // Parameter changes use debouncing to batch rapid slider adjustments
  announce(message);
}

/**
 * Cancel any pending announcements.
 * Use when the context changes and pending announcements are no longer relevant.
 *
 * @param {string} [politeness] - Optional: only cancel for specific politeness level
 */
export function cancelPendingAnnouncements(politeness) {
  const cancelForLevel = (level) => {
    const timers = getTimerRefs(level);
    if (timers.getTimeout()) {
      window.clearTimeout(timers.getTimeout());
      timers.setTimeout(null);
    }
    if (timers.getClearTimeout()) {
      window.clearTimeout(timers.getClearTimeout());
      timers.setClearTimeout(null);
    }
  };

  if (politeness) {
    cancelForLevel(politeness);
  } else {
    // Cancel both levels
    cancelForLevel(POLITENESS.POLITE);
    cancelForLevel(POLITENESS.ASSERTIVE);
  }
}
