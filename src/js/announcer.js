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

// Per politeness level: the debounce timer, the timer that empties the
// region after a message, and the sentences waiting to be written (one per
// source, in the order they came).
const levels = {
  polite: { timeout: null, clearTimeout: null, pending: [] },
  assertive: { timeout: null, clearTimeout: null, pending: [] },
};

// The source of a sentence that names none. Such sentences replace one
// another, so a slider dragged says only its last value.
const DEFAULT_SOURCE = 'default';

// Default configuration
const DEFAULT_DEBOUNCE_MS = 350;
const DEFAULT_CLEAR_DELAY_MS = 1500;

// When the same words are still in the region, emptying it and writing them
// again one frame later is too quick for the accessibility tree to see a
// change, and the screen reader says nothing (a six-key braille cell that
// repeats the one before it would go unsaid). A repeat waits this long
// after the clear.
const REPEAT_GAP_MS = 100;

// Politeness levels
export const POLITENESS = {
  POLITE: 'polite',
  ASSERTIVE: 'assertive',
};

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
 * @param {string} [options.source] - What is speaking (the status line, the
 *   console, a menu). A newer sentence replaces a waiting one only from the
 *   same source; sentences from different sources that come together are
 *   said as one message, in order. Sentences that name no source replace
 *   one another, as one control's values do.
 */
export function announce(message, options = {}) {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    clearDelayMs = DEFAULT_CLEAR_DELAY_MS,
    immediate = false,
    politeness = POLITENESS.POLITE,
    source = DEFAULT_SOURCE,
  } = options;

  // Route to the appropriate live region
  const announcerId =
    politeness === POLITENESS.ASSERTIVE
      ? 'srAnnouncerAssertive'
      : 'srAnnouncer';
  const srAnnouncer = document.getElementById(announcerId);
  if (!srAnnouncer) return;

  const level =
    politeness === POLITENESS.ASSERTIVE ? levels.assertive : levels.polite;

  // A newer sentence replaces a waiting one from the same source; one from
  // another source waits beside it, to be said with it.
  const waiting = level.pending.find((entry) => entry.source === source);
  if (waiting) waiting.text = message;
  else level.pending.push({ source, text: message });

  if (level.timeout) {
    window.clearTimeout(level.timeout);
    level.timeout = null;
  }
  // Cancel pending clear to avoid clearing a newer message
  if (level.clearTimeout) {
    window.clearTimeout(level.clearTimeout);
    level.clearTimeout = null;
  }

  const flush = () => {
    level.timeout = null;
    const batch = level.pending.splice(0);
    if (batch.length === 0) return;
    writeToRegion(
      srAnnouncer,
      joinSentences(batch.map((entry) => entry.text)),
      level,
      clearDelayMs
    );
  };

  if (immediate || debounceMs === 0) {
    flush();
  } else {
    level.timeout = window.setTimeout(flush, debounceMs);
  }
}

/**
 * Sentences said as one message: each but the last ends with a full stop
 * when it has no closing punctuation of its own.
 * @param {string[]} texts
 * @returns {string}
 */
function joinSentences(texts) {
  return texts
    .map((text, i) =>
      i < texts.length - 1 && !/[.!?…:]["'”]?$/.test(text) ? `${text}.` : text
    )
    .join(' ');
}

/**
 * Write a message to a live region so a screen reader says it, and empty
 * the region again after a while.
 * @param {HTMLElement} srAnnouncer
 * @param {string} message
 * @param {{timeout: number|null, clearTimeout: number|null}} level
 * @param {number} clearDelayMs
 */
function writeToRegion(srAnnouncer, message, level, clearDelayMs) {
  const repeat = srAnnouncer.textContent === message;

  // Clear first so repeated strings are re-announced reliably
  // (ARIA live regions may not re-announce identical content)
  srAnnouncer.textContent = '';

  const write = () => {
    srAnnouncer.textContent = message;

    // Schedule clearing the live region
    level.clearTimeout = window.setTimeout(() => {
      // Only clear if the content hasn't changed
      if (srAnnouncer.textContent === message) {
        srAnnouncer.textContent = '';
      }
      level.clearTimeout = null;
    }, clearDelayMs);
  };

  if (repeat) {
    // Held in the debounce slot, so a newer announcement cancels the wait
    level.timeout = window.setTimeout(() => {
      level.timeout = null;
      write();
    }, REPEAT_GAP_MS);
  } else {
    // Use requestAnimationFrame to ensure the clear is processed
    // before setting the new content
    requestAnimationFrame(write);
  }
}

/**
 * Take back a sentence that is no longer true before it is said.
 * @param {string} source - The source it was announced with
 * @param {string} [politeness='polite']
 */
export function withdrawAnnouncement(source, politeness = POLITENESS.POLITE) {
  const level =
    politeness === POLITENESS.ASSERTIVE ? levels.assertive : levels.polite;
  level.pending = level.pending.filter((entry) => entry.source !== source);
  if (level.pending.length === 0 && level.timeout) {
    window.clearTimeout(level.timeout);
    level.timeout = null;
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
 * @param {Object} [options] - As announce() takes them
 */
export function announceChange(message, options = {}) {
  // Parameter changes use debouncing to batch rapid slider adjustments
  announce(message, options);
}

/**
 * Cancel any pending announcements.
 * Use when the context changes and pending announcements are no longer relevant.
 *
 * @param {string} [politeness] - Optional: only cancel for specific politeness level
 */
export function cancelPendingAnnouncements(politeness) {
  const cancelForLevel = (politenessLevel) => {
    const level =
      politenessLevel === POLITENESS.ASSERTIVE
        ? levels.assertive
        : levels.polite;
    if (level.timeout) {
      window.clearTimeout(level.timeout);
      level.timeout = null;
    }
    if (level.clearTimeout) {
      window.clearTimeout(level.clearTimeout);
      level.clearTimeout = null;
    }
    level.pending.length = 0;
  };

  if (politeness) {
    cancelForLevel(politeness);
  } else {
    // Cancel both levels
    cancelForLevel(POLITENESS.POLITE);
    cancelForLevel(POLITENESS.ASSERTIVE);
  }
}
