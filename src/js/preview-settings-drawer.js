/**
 * Preview Settings Drawer Controller
 * Overlay drawer for preview settings that sits on top of the STL preview.
 * When collapsed, only the toggle button is visible. When expanded, content overlays the preview.
 * The drawer auto-sizes to fit content and scrolls if needed.
 */

import { getDrawerStateKey } from './storage-keys.js';

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

  /**
   * Load collapsed state from localStorage
   * Returns null if not set (use default behavior)
   */
  const loadCollapsedState = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DRAWER_COLLAPSED);
      if (saved !== null) {
        return saved === 'true';
      }
    } catch (e) {
      console.warn('Could not load drawer state:', e);
    }
    return null; // Not set, use default
  };

  /**
   * Save collapsed state to localStorage
   */
  const saveCollapsedState = (collapsed) => {
    try {
      localStorage.setItem(STORAGE_KEY_DRAWER_COLLAPSED, String(collapsed));
    } catch (e) {
      console.warn('Could not save drawer state:', e);
    }
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
   * Expand the drawer to show all settings (auto-sized)
   */
  const expand = () => {
    if (isExpanded) return;
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
  };

  /**
   * Collapse the drawer to show only the toggle button
   */
  const collapse = () => {
    if (!isExpanded) return;
    isExpanded = false;
    previewInfoSection.classList.add('preview-drawer-collapsed');
    previewInfoSection.classList.remove('preview-drawer-expanded');

    if (previewPanel) {
      previewPanel.classList.add('preview-drawer-collapsed');
    }
    updateToggle(false);
    saveCollapsedState(true);

    // Notify preview manager
    if (options.onResize) {
      requestAnimationFrame(() => options.onResize());
    }
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

  // Set initial state - check saved preference first, then default based on screen size
  const isMobile = window.innerWidth < 768;
  const savedCollapsedState = loadCollapsedState();

  // Determine initial collapsed state
  const shouldStartCollapsed = isMobile || savedCollapsedState === true;

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
        expand();
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
