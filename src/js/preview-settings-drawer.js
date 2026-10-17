/**
 * Preview Settings Drawer Controller
 * Overlay drawer for preview settings that sits on top of the STL preview.
 * When collapsed, only the toggle button is visible. When expanded, content overlays the preview.
 * The drawer auto-sizes to fit content and scrolls if needed.
 * @license GPL-3.0-or-later
 */

import { getDrawerStateKey, safeGetItem, safeSetItem } from './storage-keys.js';
import {
  closeOtherPhoneDrawers,
  isPhoneLayout,
  isSidewaysPhone,
  previewKeepsPx,
  registerPhoneDrawer,
} from './phone-drawers.js';
import { slideDrawer } from './drawer-motion.js';

// Storage key using standardized naming convention
const STORAGE_KEY_DRAWER_COLLAPSED = getDrawerStateKey('preview-settings');

/**
 * Initialize the preview settings drawer controller
 * @param {Object} options - Configuration options
 * @param {Function} options.onResize - Callback when drawer is resized (for preview manager)
 */
export function initPreviewSettingsDrawer(options = {}) {
  const toggleBtn = document.getElementById('previewDrawerToggle');
  const previewInfoSection = document.getElementById('previewInfoSection');
  const previewPanel = document.querySelector('.preview-panel');

  if (!toggleBtn || !previewInfoSection) {
    return;
  }

  let isExpanded = false; // Start collapsed, expand() will set proper state

  // The settings slide down out from under the row with the toggle, keeping
  // their open height, and the drawer's box grows with them: on a phone the
  // preview below gives way as they come; on a desktop the box lies over it.
  const content = previewInfoSection.querySelector('.preview-info-content');
  const row = previewInfoSection.querySelector('.preview-drawer-header');
  const slideParts = () => {
    const height = `${content?.offsetHeight ?? 0}px`;
    return [
      // A flex item: its height alone would shrink with the growing box.
      { el: content, hold: { height, minHeight: height } },
      {
        el: previewInfoSection,
        role: 'space',
        props: {
          height: [row?.offsetHeight ?? 0, previewInfoSection.offsetHeight],
        },
      },
    ];
  };

  /**
   * Load collapsed state from localStorage
   * Returns null if not set (use default behavior)
   */
  const loadCollapsedState = () => {
    const saved = safeGetItem(STORAGE_KEY_DRAWER_COLLAPSED);
    if (saved !== null) {
      return saved === 'true';
    }
    return null; // Not set, use default
  };

  /**
   * Save collapsed state to localStorage
   */
  const saveCollapsedState = (collapsed) => {
    safeSetItem(STORAGE_KEY_DRAWER_COLLAPSED, String(collapsed));
  };

  /**
   * Update the toggle button's ARIA state and label
   */
  const updateToggle = (expanded) => {
    toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggleBtn.setAttribute(
      'aria-label',
      expanded ? 'Collapse preview settings' : 'Expand preview settings'
    );
  };

  /**
   * On an upright phone the drawer drops from its row in the page's flow,
   * as tall as leaves the preview below it half the screen (layout.css
   * reads the height). Measured while it is still closed.
   */
  const placeOnPhone = () => {
    const canvas = document.getElementById('previewCanvasSection');
    if (!canvas || !isPhoneLayout() || isSidewaysPhone()) return;
    const row = previewInfoSection.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    const gap = c.top - row.bottom;
    const height = Math.floor(c.bottom - previewKeepsPx() - gap - row.top);
    document.documentElement.style.setProperty(
      '--phone-settings-height',
      `${Math.max(row.height, height)}px`
    );
  };

  /**
   * Expand the drawer to show all settings (auto-sized)
   */
  const expand = () => {
    if (isExpanded) return;
    // On a phone one drawer is open at a time.
    closeOtherPhoneDrawers('preview-settings');
    placeOnPhone();
    isExpanded = true;
    previewInfoSection.classList.remove('preview-drawer-collapsed');
    previewInfoSection.classList.add('preview-drawer-expanded');

    if (previewPanel) {
      previewPanel.classList.remove('preview-drawer-collapsed');
    }

    updateToggle(true);
    saveCollapsedState(false);

    // Notify preview manager
    if (options.onResize) {
      requestAnimationFrame(() => options.onResize());
    }
    slideDrawer(slideParts(), { from: 'top', open: true });
  };

  /**
   * Collapse the drawer to show only the toggle button
   */
  const collapse = () => {
    if (!isExpanded) return;
    isExpanded = false;
    updateToggle(false);
    saveCollapsedState(true);
    slideDrawer(slideParts(), {
      from: 'top',
      open: false,
      inert: [content],
      whenClosed: () => {
        if (isExpanded) return;
        previewInfoSection.classList.add('preview-drawer-collapsed');
        previewInfoSection.classList.remove('preview-drawer-expanded');

        if (previewPanel) {
          previewPanel.classList.add('preview-drawer-collapsed');
        }

        // Notify preview manager
        if (options.onResize) {
          requestAnimationFrame(() => options.onResize());
        }
      },
    });
  };

  /**
   * Toggle between expanded and collapsed states
   */
  const toggle = (event) => {
    if (event) {
      event.preventDefault();
    }
    if (isExpanded) {
      collapse();
    } else {
      expand();
    }
  };

  // Attach click handler to toggle button
  toggleBtn.addEventListener('click', toggle);
  registerPhoneDrawer('preview-settings', {
    isOpen: () => isExpanded,
    close: () => collapse(),
  });

  // Set initial state - check saved preference first, then default based on screen size
  const isMobile = window.innerWidth < 768;
  const savedCollapsedState = loadCollapsedState();

  // Determine initial collapsed state
  const shouldStartCollapsed = isMobile || savedCollapsedState !== false;

  // Apply initial state directly
  if (shouldStartCollapsed) {
    isExpanded = false;
    previewInfoSection.classList.add('preview-drawer-collapsed');
    previewInfoSection.classList.remove('preview-drawer-expanded');
    if (previewPanel) {
      previewPanel.classList.add('preview-drawer-collapsed');
    }
    updateToggle(false);
  } else {
    isExpanded = true;
    previewInfoSection.classList.remove('preview-drawer-collapsed');
    previewInfoSection.classList.add('preview-drawer-expanded');
    if (previewPanel) {
      previewPanel.classList.remove('preview-drawer-collapsed');
    }
    updateToggle(true);
  }

  // ============================================================================
  // On-screen keyboard detection (mobile)
  // ============================================================================
  let keyboardVisible = false;

  /**
   * Detect if on-screen keyboard is visible
   * Compares visual viewport height to window height
   */
  const detectKeyboard = () => {
    if (!('visualViewport' in window) || !window.visualViewport) return;

    const viewportHeight = window.visualViewport.height;
    const windowHeight = window.innerHeight;
    const heightDiff = windowHeight - viewportHeight;

    // Keyboard is likely visible if height difference > 150px
    const isKeyboardVisible = heightDiff > 150;

    if (isKeyboardVisible !== keyboardVisible) {
      keyboardVisible = isKeyboardVisible;

      if (isKeyboardVisible) {
        previewInfoSection.classList.add('keyboard-visible');
      } else {
        previewInfoSection.classList.remove('keyboard-visible');
      }
    }
  };

  // Set up keyboard detection listener
  if ('visualViewport' in window && window.visualViewport) {
    window.visualViewport.addEventListener('resize', detectKeyboard);
    // Initial check
    detectKeyboard();
  }

  // Handle window resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const nowMobile = window.innerWidth < 768;
      if (nowMobile && isExpanded) {
        collapse();
      } else if (!nowMobile && !isExpanded) {
        // Only auto-expand if the user has not explicitly chosen to keep it collapsed.
        // loadCollapsedState() returns true when the user saved a collapsed preference,
        // null when no preference has been saved yet, and false when explicitly expanded.
        if (loadCollapsedState() !== true) {
          expand();
        }
      }
    }, 150);
  });

  // Return controller methods for external use
  return {
    expand,
    collapse,
    toggle,
    isExpanded: () => isExpanded,
  };
}
