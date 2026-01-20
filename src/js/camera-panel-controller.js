/**
 * Camera Panel Controller
 * Right-side collapsible drawer for camera controls.
 * Mirrors the Parameters panel behavior on the left side.
 */

const STORAGE_KEY_COLLAPSED = 'openscad-customizer-camera-panel-collapsed';

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
   */
  function setupCameraControlButtons() {
    const rotationSpeed = 0.1;
    const panSpeed = 6;
    const zoomSpeed = 15;

    // Helper to get the current preview manager
    const getPM = () => options.previewManager;

    // Rotation buttons
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

    // Pan buttons
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

    // Zoom buttons
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

    // Reset view button
    document
      .getElementById('cameraResetView')
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

  // Initialize
  // Apply initial state
  if (isCollapsed) {
    panel.classList.add('collapsed');
  } else {
    panel.classList.remove('collapsed');
  }
  updateToggleAria(isCollapsed);

  // Attach click handler to toggle button
  toggleBtn.addEventListener('click', toggle);

  // Setup camera control buttons
  setupCameraControlButtons();

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
