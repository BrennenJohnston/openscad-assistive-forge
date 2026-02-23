/**
 * Focus Trap Utility
 *
 * Consolidates focus trap implementations from:
 * - modal-manager.js (element-level trap)
 * - drawer-controller.js (document-level capturing trap)
 * - tutorial-sandbox.js (element-level trap)
 *
 * Supports both element-level and document-level patterns with a single API.
 *
 * @license GPL-3.0-or-later
 */

/**
 * Default selector for focusable elements
 * Excludes disabled, hidden, and tabindex="-1" elements
 */
const FOCUSABLE_SELECTOR = [
  'button:not([disabled]):not([tabindex="-1"])',
  'a[href]:not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]:not([tabindex="-1"])',
].join(', ');

/**
 * Get all focusable elements within a container
 * @param {HTMLElement} container - Container to search within
 * @param {Object} [options] - Options
 * @param {boolean} [options.checkVisibility=true] - Filter to visible elements only
 * @param {boolean} [options.checkAriaHidden=true] - Exclude aria-hidden elements
 * @returns {HTMLElement[]} Array of focusable elements
 */
export function getFocusableElements(container, options = {}) {
  const { checkVisibility = true, checkAriaHidden = true } = options;

  const elements = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));

  return elements.filter((el) => {
    // Filter out aria-hidden elements
    if (checkAriaHidden && el.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    // Filter to visible elements only
    if (checkVisibility) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
      // Check if element has layout (offsetWidth/Height or getClientRects)
      // getClientRects catches positioned elements with null offsetParent
      const hasLayout =
        el.offsetWidth > 0 ||
        el.offsetHeight > 0 ||
        el.getClientRects().length > 0;
      if (!hasLayout) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Create an element-level focus trap
 * Attaches a keydown handler to the container element.
 *
 * @param {HTMLElement} container - Container to trap focus within
 * @param {Object} [options] - Options
 * @param {Function} [options.onEscape] - Callback when Escape is pressed (if not provided, Escape is not handled)
 * @returns {Object} Focus trap controller with activate/deactivate methods
 */
export function createFocusTrap(container, options = {}) {
  const { onEscape = null } = options;

  const handleKeydown = (e) => {
    // Handle Escape if callback provided
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault();
      onEscape();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;

    const firstFocusable = focusable[0];
    const lastFocusable = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift + Tab: going backward
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    } else {
      // Tab: going forward
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  };

  let isActive = false;

  return {
    /**
     * Activate the focus trap
     * @param {Object} [activateOptions] - Activation options
     * @param {HTMLElement} [activateOptions.initialFocus] - Element to focus on activation
     */
    activate(activateOptions = {}) {
      if (isActive) return;
      isActive = true;
      container.addEventListener('keydown', handleKeydown);

      // Set initial focus
      if (activateOptions.initialFocus) {
        requestAnimationFrame(() => {
          activateOptions.initialFocus.focus();
        });
      } else {
        const focusable = getFocusableElements(container);
        if (focusable.length > 0) {
          requestAnimationFrame(() => {
            focusable[0].focus();
          });
        }
      }
    },

    /**
     * Deactivate the focus trap
     */
    deactivate() {
      if (!isActive) return;
      isActive = false;
      container.removeEventListener('keydown', handleKeydown);
    },

    /**
     * Check if the trap is currently active
     * @returns {boolean}
     */
    isActive() {
      return isActive;
    },

    /**
     * Get the keydown handler (for backward compatibility)
     * @returns {Function}
     */
    getHandler() {
      return handleKeydown;
    },
  };
}

/**
 * Create a document-level focus trap with focus recovery
 * Attaches a capturing keydown handler to document.
 * Handles focus escaping the container and brings it back.
 *
 * @param {HTMLElement} container - Container to trap focus within
 * @param {Object} [options] - Options
 * @param {Function} [options.onEscape] - Callback when Escape is pressed
 * @param {HTMLElement} [options.fallbackFocus] - Element to focus if no focusables found
 * @returns {Object} Focus trap controller with activate/deactivate methods
 */
export function createDocumentFocusTrap(container, options = {}) {
  const { onEscape = null, fallbackFocus = null } = options;

  const handleKeydown = (e) => {
    // Handle Escape
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault();
      onEscape();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusable = getFocusableElements(container);
    const effectiveFallback = fallbackFocus || container;

    if (focusable.length === 0) {
      // Keep focus on fallback element when nothing else is focusable
      e.preventDefault();
      if (effectiveFallback.focus) {
        effectiveFallback.focus();
      }
      return;
    }

    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];
    const active = document.activeElement;
    const inContainer = active ? container.contains(active) : false;

    // If focus is outside the container, bring it back in
    if (!inContainer) {
      e.preventDefault();
      (e.shiftKey ? lastElement : firstElement).focus();
      return;
    }

    // Cycle within the container
    if (e.shiftKey) {
      if (active === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (active === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  };

  let isActive = false;

  return {
    /**
     * Activate the focus trap
     * @param {Object} [activateOptions] - Activation options
     * @param {HTMLElement} [activateOptions.initialFocus] - Element to focus on activation
     * @param {number} [activateOptions.initialFocusDelay=0] - Delay before setting initial focus
     */
    activate(activateOptions = {}) {
      if (isActive) return;
      isActive = true;
      document.addEventListener('keydown', handleKeydown, true);

      // Set initial focus
      const delay = activateOptions.initialFocusDelay || 0;
      const setFocus = () => {
        if (activateOptions.initialFocus) {
          activateOptions.initialFocus.focus();
        } else {
          const focusable = getFocusableElements(container);
          if (focusable.length > 0) {
            focusable[0].focus();
          } else if (fallbackFocus?.focus) {
            fallbackFocus.focus();
          }
        }
      };

      if (delay > 0) {
        setTimeout(setFocus, delay);
      } else {
        requestAnimationFrame(setFocus);
      }
    },

    /**
     * Deactivate the focus trap
     */
    deactivate() {
      if (!isActive) return;
      isActive = false;
      document.removeEventListener('keydown', handleKeydown, true);
    },

    /**
     * Check if the trap is currently active
     * @returns {boolean}
     */
    isActive() {
      return isActive;
    },
  };
}

/**
 * Simple focus trap function (backward compatible)
 * Returns a keydown handler that can be attached to an element.
 *
 * @param {HTMLElement} container - Container to trap focus within
 * @returns {Function} Keydown handler function
 */
export function trapFocusHandler(container) {
  return createFocusTrap(container).getHandler();
}
