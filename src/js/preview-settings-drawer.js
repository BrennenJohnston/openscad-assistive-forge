/**
 * Preview Settings Drawer Controller
 * Overlay drawer for preview settings that sits on top of the STL preview.
 * When collapsed, only the toggle button is visible. When expanded, content overlays the preview.
 * The drawer is resizable by dragging the bottom handle.
 */

const STORAGE_KEY_DRAWER_HEIGHT = 'openscad-customizer-drawer-height';
const STORAGE_KEY_DRAWER_COLLAPSED = 'openscad-customizer-drawer-collapsed';
const MIN_DRAWER_HEIGHT = 100; // Minimum height in pixels
const MIN_SAVEABLE_HEIGHT = 200; // Only save heights above this (indicates user intentionally adjusted)
const DEFAULT_EXPANDED_HEIGHT = 360; // Default height when expanded (shows most settings)
const HEADER_HEIGHT = 44; // Height of the toggle button header

/**
 * Initialize the preview settings drawer controller
 * @param {Object} options - Configuration options
 * @param {Function} options.onResize - Callback when drawer is resized (for preview manager)
 */
export function initPreviewSettingsDrawer(options = {}) {
  const toggleBtn = document.getElementById('previewDrawerToggle');
  const previewInfoSection = document.getElementById('previewInfoSection');
  const previewPanel = document.querySelector('.preview-panel');
  const previewContent = document.getElementById('previewContent');
  const resizeHandle = document.getElementById('previewDrawerResizeHandle');

  if (!toggleBtn || !previewInfoSection) {
    return;
  }

  let isExpanded = false; // Start collapsed, expand() will set proper state
  let currentHeight = null; // Current drawer height in pixels (null = auto/default)
  let isDragging = false;
  let startY = 0;
  let startHeight = 0;

  /**
   * Get the maximum height the drawer can expand to
   * (container height minus a small margin for the actions bar visibility)
   */
  const getMaxHeight = () => {
    if (!previewContent) return 400;
    const containerHeight = previewContent.getBoundingClientRect().height;
    // Leave at least 8px above the actions bar
    return Math.max(MIN_DRAWER_HEIGHT, containerHeight - 8);
  };

  /**
   * Get saved drawer height from localStorage
   * Only returns saved height if it's above MIN_SAVEABLE_HEIGHT
   * (indicating user intentionally adjusted it)
   */
  const loadSavedHeight = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DRAWER_HEIGHT);
      if (saved) {
        const height = parseInt(saved, 10);
        // Only return saved heights that are meaningfully large
        // Small heights indicate the user didn't intentionally set a preference
        if (!isNaN(height) && height >= MIN_SAVEABLE_HEIGHT) {
          return height;
        }
      }
    } catch (e) {
      console.warn('Could not load drawer height:', e);
    }
    return null;
  };

  /**
   * Save drawer height to localStorage
   * Only saves heights above MIN_SAVEABLE_HEIGHT (user intentionally adjusted)
   */
  const saveHeight = (height) => {
    // Only save meaningful heights - small heights shouldn't override the default
    if (height < MIN_SAVEABLE_HEIGHT) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY_DRAWER_HEIGHT, String(height));
    } catch (e) {
      console.warn('Could not save drawer height:', e);
    }
  };

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
   * Try to expand only after layout is ready (preview area has height).
   * Returns true if expansion happened.
   */
  const tryExpandWhenReady = () => {
    if (!previewContent) {
      expand();
      return true;
    }

    const containerHeight = previewContent.getBoundingClientRect().height;
    if (containerHeight <= MIN_DRAWER_HEIGHT + 8) {
      return false;
    }

    expand();
    return true;
  };

  /**
   * Update the resize handle's ARIA values
   */
  const updateResizeHandleAria = () => {
    if (!resizeHandle || !previewContent) return;

    const containerHeight = previewContent.getBoundingClientRect().height;
    if (!containerHeight) return;

    const currentPercent = Math.round(
      (previewInfoSection.offsetHeight / containerHeight) * 100
    );
    const minPercent = Math.round((MIN_DRAWER_HEIGHT / containerHeight) * 100);
    const maxPercent = Math.round((getMaxHeight() / containerHeight) * 100);

    resizeHandle.setAttribute('aria-valuenow', String(currentPercent));
    resizeHandle.setAttribute('aria-valuemin', String(minPercent));
    resizeHandle.setAttribute('aria-valuemax', String(maxPercent));
    resizeHandle.setAttribute(
      'aria-valuetext',
      `Drawer height: ${currentPercent}% of preview area`
    );
  };

  /**
   * Set the drawer height
   */
  const setDrawerHeight = (height, persist = true) => {
    const maxHeight = getMaxHeight();
    const clampedHeight = Math.min(
      Math.max(height, MIN_DRAWER_HEIGHT),
      maxHeight
    );

    currentHeight = clampedHeight;
    previewInfoSection.style.height = `${clampedHeight}px`;
    previewInfoSection.classList.add('preview-drawer-expanded');

    if (persist) {
      saveHeight(clampedHeight);
    }

    updateResizeHandleAria();

    // Notify preview manager to handle resize
    if (options.onResize) {
      options.onResize();
    }
  };


  /**
   * Expand the drawer to show all settings
   */
  const expand = () => {
    if (isExpanded) return;
    isExpanded = true;
    previewInfoSection.classList.remove('preview-drawer-collapsed');
    if (previewPanel) {
      previewPanel.classList.remove('preview-drawer-collapsed');
    }

    // Check if user has manually saved a height preference
    const savedHeight = loadSavedHeight();

    if (savedHeight && savedHeight >= MIN_DRAWER_HEIGHT) {
      // User has a saved preference - use it
      setDrawerHeight(savedHeight, false);
    } else {
      // No saved preference - use default expanded height
      // This ensures the drawer opens large enough to show settings
      const maxHeight = getMaxHeight();
      const defaultHeight = Math.min(DEFAULT_EXPANDED_HEIGHT, maxHeight);
      setDrawerHeight(defaultHeight, false);
    }

    updateToggle(true);
    saveCollapsedState(false); // Persist expanded state

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
    previewInfoSection.style.height = '';

    if (previewPanel) {
      previewPanel.classList.add('preview-drawer-collapsed');
    }
    updateToggle(false);
    saveCollapsedState(true); // Persist collapsed state

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

  // ============================================================================
  // Drag-to-resize functionality
  // ============================================================================

  const handleDragStart = (clientY) => {
    // Only allow resize when drawer is expanded
    // When collapsed, user must click the toggle button to expand first
    if (!isExpanded) {
      return;
    }

    startHeight = previewInfoSection.offsetHeight;
    isDragging = true;
    startY = clientY;

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    // Add dragging class for visual feedback
    previewInfoSection.classList.add('dragging');
  };

  const handleDragMove = (clientY) => {
    if (!isDragging) return;

    const deltaY = clientY - startY;
    const newHeight = startHeight + deltaY;

    // If dragging up past minimum, collapse the drawer
    if (newHeight < MIN_DRAWER_HEIGHT) {
      // Don't collapse during drag, just clamp to minimum
      setDrawerHeight(MIN_DRAWER_HEIGHT, false);
    } else {
      setDrawerHeight(newHeight, false);
    }
  };

  const handleDragEnd = () => {
    if (!isDragging) return;

    isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    previewInfoSection.classList.remove('dragging');

    // If height is at or below header height, collapse
    if (currentHeight && currentHeight <= HEADER_HEIGHT + 10) {
      collapse();
    } else if (currentHeight) {
      // Persist the final height
      saveHeight(currentHeight);
    }

    // Notify preview manager
    if (options.onResize) {
      requestAnimationFrame(() => options.onResize());
    }
  };

  // Mouse events for resize handle
  if (resizeHandle) {
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      handleDragStart(e.clientY);
    });
  }

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      e.preventDefault();
      handleDragMove(e.clientY);
    }
  });

  document.addEventListener('mouseup', () => {
    handleDragEnd();
  });

  // Touch events for resize handle (mobile)
  if (resizeHandle) {
    resizeHandle.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 1) {
          e.preventDefault();
          handleDragStart(e.touches[0].clientY);
        }
      },
      { passive: false }
    );
  }

  document.addEventListener(
    'touchmove',
    (e) => {
      if (isDragging && e.touches.length === 1) {
        e.preventDefault();
        handleDragMove(e.touches[0].clientY);
      }
    },
    { passive: false }
  );

  document.addEventListener('touchend', () => {
    handleDragEnd();
  });

  // Keyboard support for resize handle (only when expanded)
  if (resizeHandle) {
    resizeHandle.addEventListener('keydown', (e) => {
      // Resize handle is only interactive when drawer is expanded
      // (consistent with mouse/touch behavior)
      if (!isExpanded) {
        return;
      }

      const step = e.shiftKey ? 50 : 10; // Larger steps with Shift
      const currentHeightVal = previewInfoSection.offsetHeight;

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          setDrawerHeight(currentHeightVal + step);
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          // If would go below minimum, collapse instead
          if (currentHeightVal - step < MIN_DRAWER_HEIGHT) {
            collapse();
          } else {
            setDrawerHeight(currentHeightVal - step);
          }
          break;
        case 'Home':
          e.preventDefault();
          collapse();
          break;
        case 'End':
          e.preventDefault();
          setDrawerHeight(getMaxHeight());
          break;
      }
    });
  }

  // Attach click handler to toggle button
  toggleBtn.addEventListener('click', toggle);

  // Set initial state - check saved preference first, then default based on screen size
  const isMobile = window.innerWidth < 768;
  const savedCollapsedState = loadCollapsedState();

  // Determine initial collapsed state
  const shouldStartCollapsed = isMobile || savedCollapsedState === true;

  // Apply initial state DIRECTLY (like camera panel does)
  // This avoids the early-return check in collapse()/expand()
  if (shouldStartCollapsed) {
    // Apply collapsed state directly
    isExpanded = false;
    previewInfoSection.classList.add('preview-drawer-collapsed');
    previewInfoSection.classList.remove('preview-drawer-expanded');
    previewInfoSection.style.height = '';
    if (previewPanel) {
      previewPanel.classList.add('preview-drawer-collapsed');
    }
    updateToggle(false);
  } else {
    // Defer expansion until the preview area has a usable height.
    // This prevents clamping to MIN_DRAWER_HEIGHT on first load.
    const expandedNow = tryExpandWhenReady();
    if (!expandedNow) {
      // While waiting, keep the drawer visually collapsed (no resize handle)
      isExpanded = false;
      previewInfoSection.classList.add('preview-drawer-collapsed');
      previewInfoSection.classList.remove('preview-drawer-expanded');
      previewInfoSection.style.height = '';
      if (previewPanel) {
        previewPanel.classList.add('preview-drawer-collapsed');
      }
      updateToggle(false);

      if (previewContent && typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          if (tryExpandWhenReady()) {
            observer.disconnect();
          }
        });
        observer.observe(previewContent);
      } else {
        // Fallback: try a few animation frames if ResizeObserver is unavailable
        let attempts = 0;
        const maxAttempts = 120;
        const tryLater = () => {
          attempts += 1;
          if (tryExpandWhenReady()) {
            return;
          }
          if (attempts < maxAttempts) {
            requestAnimationFrame(tryLater);
          }
        };
        requestAnimationFrame(tryLater);
      }
    }
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

      // Clamp height to new max if needed
      if (isExpanded && currentHeight) {
        const maxHeight = getMaxHeight();
        if (currentHeight > maxHeight) {
          setDrawerHeight(maxHeight, false);
        }
      }

      updateResizeHandleAria();
    }, 150);
  });

  // Return controller methods for external use
  return {
    expand,
    collapse,
    toggle,
    isExpanded: () => isExpanded,
    setHeight: setDrawerHeight,
  };
}
