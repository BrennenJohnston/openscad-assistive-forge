/**
 * Camera Panel Controller
 * Right-side collapsible drawer for camera controls (desktop).
 * Mobile camera drawer for portrait/mobile view.
 * Mirrors the Parameters panel behavior on the left side.
 */

const STORAGE_KEY_COLLAPSED = 'openscad-customizer-camera-panel-collapsed';
const STORAGE_KEY_MOBILE_COLLAPSED = 'openscad-customizer-camera-drawer-collapsed';

/**
 * Initialize the camera panel controller
 * @param {Object} options - Configuration options
 * @param {Object} options.previewManager - Reference to the PreviewManager instance
 * @returns {Object} Controller API
 */
export function initCameraPanelController(options = {}) {
  const panel = document.getElementById('cameraPanel');
  const toggleBtn = document.getElementById('cameraPanelToggle');

  if (!panel || !toggleBtn) {
    console.warn('[CameraPanel] Required elements not found');
    return null;
  }

  let isCollapsed = loadCollapsedState();

  /**
   * Load collapsed state from localStorage
   */
  function loadCollapsedState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COLLAPSED);
      // Default to collapsed (true) if not set
      return saved === null ? true : saved === 'true';
    } catch (e) {
      console.warn('[CameraPanel] Could not load state:', e);
      return true;
    }
  }

  /**
   * Save collapsed state to localStorage
   */
  function saveCollapsedState(collapsed) {
    try {
      localStorage.setItem(STORAGE_KEY_COLLAPSED, String(collapsed));
    } catch (e) {
      console.warn('[CameraPanel] Could not save state:', e);
    }
  }

  /**
   * Update toggle button ARIA attributes
   */
  function updateToggleAria(collapsed) {
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggleBtn.setAttribute(
      'aria-label',
      collapsed
        ? 'Expand camera controls panel'
        : 'Collapse camera controls panel'
    );
    toggleBtn.title = collapsed
      ? 'Expand camera controls'
      : 'Collapse camera controls';
  }

  /**
   * Expand the panel
   */
  function expand() {
    if (!isCollapsed) return;
    isCollapsed = false;
    panel.classList.remove('collapsed');
    updateToggleAria(false);
    saveCollapsedState(false);
  }

  /**
   * Collapse the panel
   */
  function collapse() {
    if (isCollapsed) return;
    isCollapsed = true;
    panel.classList.add('collapsed');
    updateToggleAria(true);
    saveCollapsedState(true);
  }

  /**
   * Toggle between expanded and collapsed states
   */
  function toggle(event) {
    if (event) {
      event.preventDefault();
    }
    if (isCollapsed) {
      expand();
    } else {
      collapse();
    }
  }

  /**
   * Setup camera control button event handlers
   * Uses PreviewManager's helper methods for camera operations
   * Handles both desktop panel and mobile drawer buttons
   */
  function setupCameraControlButtons() {
    const rotationSpeed = 0.1;
    const panSpeed = 6;
    const zoomSpeed = 15;

    // Helper to get the current preview manager
    const getPM = () => options.previewManager;

    // Desktop rotation buttons
    document
      .getElementById('cameraRotateLeft')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.rotateHorizontal) {
          pm.rotateHorizontal(rotationSpeed);
          announceAction('Rotate left');
        }
      });

    document
      .getElementById('cameraRotateRight')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.rotateHorizontal) {
          pm.rotateHorizontal(-rotationSpeed);
          announceAction('Rotate right');
        }
      });

    document.getElementById('cameraRotateUp')?.addEventListener('click', () => {
      const pm = getPM();
      if (pm?.rotateVertical) {
        pm.rotateVertical(rotationSpeed);
        announceAction('Rotate up');
      }
    });

    document
      .getElementById('cameraRotateDown')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.rotateVertical) {
          pm.rotateVertical(-rotationSpeed);
          announceAction('Rotate down');
        }
      });

    // Desktop pan buttons
    document.getElementById('cameraPanLeft')?.addEventListener('click', () => {
      const pm = getPM();
      if (pm?.panCamera) {
        pm.panCamera(-panSpeed, 0);
        announceAction('Pan left');
      }
    });

    document.getElementById('cameraPanRight')?.addEventListener('click', () => {
      const pm = getPM();
      if (pm?.panCamera) {
        pm.panCamera(panSpeed, 0);
        announceAction('Pan right');
      }
    });

    document.getElementById('cameraPanUp')?.addEventListener('click', () => {
      const pm = getPM();
      if (pm?.panCamera) {
        pm.panCamera(0, panSpeed);
        announceAction('Pan up');
      }
    });

    document.getElementById('cameraPanDown')?.addEventListener('click', () => {
      const pm = getPM();
      if (pm?.panCamera) {
        pm.panCamera(0, -panSpeed);
        announceAction('Pan down');
      }
    });

    // Desktop zoom buttons
    document.getElementById('cameraZoomIn')?.addEventListener('click', () => {
      const pm = getPM();
      if (pm?.zoomCamera) {
        pm.zoomCamera(zoomSpeed);
        announceAction('Zoom in');
      }
    });

    document.getElementById('cameraZoomOut')?.addEventListener('click', () => {
      const pm = getPM();
      if (pm?.zoomCamera) {
        pm.zoomCamera(-zoomSpeed);
        announceAction('Zoom out');
      }
    });

    // Desktop reset view button
    document
      .getElementById('cameraResetView')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.fitCameraToModel && pm?.mesh) {
          pm.fitCameraToModel();
          announceAction('View reset to default');
        }
      });

    // Mobile rotation buttons
    document
      .getElementById('mobileCameraRotateLeft')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.rotateHorizontal) {
          pm.rotateHorizontal(rotationSpeed);
          announceAction('Rotate left');
        }
      });

    document
      .getElementById('mobileCameraRotateRight')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.rotateHorizontal) {
          pm.rotateHorizontal(-rotationSpeed);
          announceAction('Rotate right');
        }
      });

    document
      .getElementById('mobileCameraRotateUp')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.rotateVertical) {
          pm.rotateVertical(rotationSpeed);
          announceAction('Rotate up');
        }
      });

    document
      .getElementById('mobileCameraRotateDown')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.rotateVertical) {
          pm.rotateVertical(-rotationSpeed);
          announceAction('Rotate down');
        }
      });

    // Mobile pan buttons
    document
      .getElementById('mobileCameraPanLeft')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.panCamera) {
          pm.panCamera(-panSpeed, 0);
          announceAction('Pan left');
        }
      });

    document
      .getElementById('mobileCameraPanRight')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.panCamera) {
          pm.panCamera(panSpeed, 0);
          announceAction('Pan right');
        }
      });

    document
      .getElementById('mobileCameraPanUp')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.panCamera) {
          pm.panCamera(0, panSpeed);
          announceAction('Pan up');
        }
      });

    document
      .getElementById('mobileCameraPanDown')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.panCamera) {
          pm.panCamera(0, -panSpeed);
          announceAction('Pan down');
        }
      });

    // Mobile zoom buttons
    document
      .getElementById('mobileCameraZoomIn')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.zoomCamera) {
          pm.zoomCamera(zoomSpeed);
          announceAction('Zoom in');
        }
      });

    document
      .getElementById('mobileCameraZoomOut')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.zoomCamera) {
          pm.zoomCamera(-zoomSpeed);
          announceAction('Zoom out');
        }
      });

    // Mobile reset view button
    document
      .getElementById('mobileCameraResetView')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.fitCameraToModel && pm?.mesh) {
          pm.fitCameraToModel();
          announceAction('View reset to default');
        }
      });
  }

  /**
   * Announce camera action to screen readers
   */
  function announceAction(message) {
    const srAnnouncer = document.getElementById('srAnnouncer');
    if (srAnnouncer) {
      srAnnouncer.textContent = message;
      setTimeout(() => {
        if (srAnnouncer.textContent === message) {
          srAnnouncer.textContent = '';
        }
      }, 1000);
    }
  }

  // Initialize desktop panel
  // Apply initial state
  if (isCollapsed) {
    panel.classList.add('collapsed');
  } else {
    panel.classList.remove('collapsed');
  }
  updateToggleAria(isCollapsed);

  // Attach click handler to toggle button
  toggleBtn.addEventListener('click', toggle);

  // Setup camera control buttons (desktop and mobile)
  setupCameraControlButtons();

  // Initialize mobile camera drawer
  initMobileCameraDrawer();

  // Return controller API
  return {
    expand,
    collapse,
    toggle,
    isCollapsed: () => isCollapsed,
    /**
     * Update the preview manager reference (call after preview is initialized)
     */
    setPreviewManager: (pm) => {
      options.previewManager = pm;
    },
  };
}

/**
 * Initialize the mobile camera drawer toggle functionality
 */
function initMobileCameraDrawer() {
  const drawer = document.getElementById('cameraDrawer');
  const toggleBtn = document.getElementById('cameraDrawerToggle');
  const drawerBody = document.getElementById('cameraDrawerBody');
  const previewPanel = document.querySelector('.preview-panel');

  if (!drawer || !toggleBtn || !drawerBody) {
    return;
  }

  // Load saved state from localStorage
  let isMobileCollapsed = true;
  try {
    const saved = localStorage.getItem(STORAGE_KEY_MOBILE_COLLAPSED);
    // Default to collapsed (true) if not set
    isMobileCollapsed = saved === null ? true : saved === 'true';
  } catch (e) {
    console.warn('[CameraDrawer] Could not load state:', e);
  }

  /**
   * Save collapsed state to localStorage
   */
  function saveState(collapsed) {
    try {
      localStorage.setItem(STORAGE_KEY_MOBILE_COLLAPSED, String(collapsed));
    } catch (e) {
      console.warn('[CameraDrawer] Could not save state:', e);
    }
  }

  /**
   * Update ARIA attributes on toggle button
   */
  function updateAria(collapsed) {
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggleBtn.setAttribute(
      'aria-label',
      collapsed ? 'Expand camera controls' : 'Collapse camera controls'
    );
    toggleBtn.title = collapsed
      ? 'Expand camera controls'
      : 'Collapse camera controls';
  }

  /**
   * Update preview panel padding to accommodate camera drawer
   */
  function updatePreviewPanelPadding(expanded) {
    if (previewPanel) {
      if (expanded) {
        previewPanel.classList.add('camera-drawer-open');
      } else {
        previewPanel.classList.remove('camera-drawer-open');
      }
    }
  }

  /**
   * Expand the mobile drawer
   */
  function expandDrawer() {
    if (!isMobileCollapsed) return;
    isMobileCollapsed = false;
    drawer.classList.remove('collapsed');
    updateAria(false);
    updatePreviewPanelPadding(true);
    saveState(false);
  }

  /**
   * Collapse the mobile drawer
   */
  function collapseDrawer() {
    if (isMobileCollapsed) return;
    isMobileCollapsed = true;
    drawer.classList.add('collapsed');
    updateAria(true);
    updatePreviewPanelPadding(false);
    saveState(true);
  }

  /**
   * Toggle drawer state
   */
  function toggleDrawer(event) {
    if (event) {
      event.preventDefault();
    }
    if (isMobileCollapsed) {
      expandDrawer();
    } else {
      collapseDrawer();
    }
  }

  // Apply initial state
  if (isMobileCollapsed) {
    drawer.classList.add('collapsed');
    updatePreviewPanelPadding(false);
  } else {
    drawer.classList.remove('collapsed');
    updatePreviewPanelPadding(true);
  }
  updateAria(isMobileCollapsed);

  // Attach event listener
  toggleBtn.addEventListener('click', toggleDrawer);

  // Handle window resize - remove padding class on desktop
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (window.innerWidth >= 768) {
        // On desktop, ensure the class is removed
        if (previewPanel) {
          previewPanel.classList.remove('camera-drawer-open');
        }
      } else if (!isMobileCollapsed && previewPanel) {
        // On mobile with drawer open, ensure class is present
        previewPanel.classList.add('camera-drawer-open');
      }
    }, 150);
  });
}
