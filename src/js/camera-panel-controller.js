/**
 * Camera Panel Controller
 * Right-side collapsible drawer for camera controls (desktop).
 * Mobile camera drawer for portrait/mobile view.
 * Mirrors the Customizer panel behavior on the left side.
 *
 * STATE CONVENTION: Additive close — `collapsed` class = closed.
 * This is the opposite of the Customizer drawer which uses
 * additive open (`drawer-open` class = open). See UI_STANDARDS.md.
 * @license GPL-3.0-or-later
 */

import { announceImmediate } from './announcer.js';
import { getDrawerStateKey, safeGetItem, safeSetItem } from './storage-keys.js';
import { CAMERA_ZOOM_STEP } from './preview.js';

// Storage keys using standardized naming convention
const STORAGE_KEY_COLLAPSED = getDrawerStateKey('camera');
const STORAGE_KEY_MOBILE_COLLAPSED = getDrawerStateKey('camera-mobile');

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
  let shortcutsPopout = null;

  /**
   * Load collapsed state from localStorage (defaults to collapsed)
   */
  function loadCollapsedState() {
    const saved = safeGetItem(STORAGE_KEY_COLLAPSED);
    return saved === null ? true : saved === 'true';
  }

  /**
   * Save collapsed state to localStorage
   */
  function saveCollapsedState(collapsed) {
    safeSetItem(STORAGE_KEY_COLLAPSED, String(collapsed));
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
    shortcutsPopout?.close();
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
    // Same step as the 3D view toolbar and the View menu
    const zoomSpeed = CAMERA_ZOOM_STEP;

    // Helper to get the current preview manager
    const getPM = () => options.previewManager;

    /**
     * Optional hook: allow callers to override pan D-pad behavior.
     * Return value meanings:
     * - false/undefined: not handled -> proceed with normal pan
     * - true: handled -> skip normal pan (no announcement)
     * - string: handled -> skip normal pan and announce this message
     */
    const maybeHandlePanOverride = (direction, source, event) => {
      if (typeof options.onPanControl !== 'function') return false;
      try {
        const result = options.onPanControl({
          direction,
          source,
          shiftKey: !!event?.shiftKey,
        });
        if (typeof result === 'string') {
          announceAction(result);
          return true;
        }
        return result === true;
      } catch (e) {
        console.warn('[CameraPanel] onPanControl hook error:', e);
        return false;
      }
    };

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
    document.getElementById('cameraPanLeft')?.addEventListener('click', (e) => {
      if (maybeHandlePanOverride('left', 'desktop', e)) return;
      const pm = getPM();
      if (pm?.panCamera) {
        pm.panCamera(-panSpeed, 0);
        announceAction('Pan left');
      }
    });

    document
      .getElementById('cameraPanRight')
      ?.addEventListener('click', (e) => {
        if (maybeHandlePanOverride('right', 'desktop', e)) return;
        const pm = getPM();
        if (pm?.panCamera) {
          pm.panCamera(panSpeed, 0);
          announceAction('Pan right');
        }
      });

    document.getElementById('cameraPanUp')?.addEventListener('click', (e) => {
      if (maybeHandlePanOverride('up', 'desktop', e)) return;
      const pm = getPM();
      if (pm?.panCamera) {
        pm.panCamera(0, panSpeed);
        announceAction('Pan up');
      }
    });

    document.getElementById('cameraPanDown')?.addEventListener('click', (e) => {
      if (maybeHandlePanOverride('down', 'desktop', e)) return;
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

    // Desktop reset view button. Restores the default pose rather than fitting
    // the model, so its announcement is true and the control means the same
    // thing as View ▸ Reset View everywhere.
    document
      .getElementById('cameraResetView')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.resetCamera) {
          pm.resetCamera();
          announceAction('View reset to default');
        } else {
          announceAction('Load a model first');
        }
      });

    /**
     * Make both projection buttons say the projection that is showing: the
     * camera panel's shows its icon (data-projection), and each one's pressed
     * state and title follow. Called after a press of either button and on
     * every projection change, whichever control made it (the View menu, the
     * P key, Classic's buttons).
     * @param {string} mode - 'perspective' or 'orthographic'
     */
    function syncProjectionToggles(mode) {
      if (mode !== 'perspective' && mode !== 'orthographic') return;
      const isPerspective = mode === 'perspective';
      const desktop = document.getElementById('projectionToggle');
      if (desktop) {
        desktop.dataset.projection = mode;
        desktop.setAttribute('aria-pressed', isPerspective ? 'false' : 'true');
        desktop.title = isPerspective
          ? 'Switch to Orthographic (P)'
          : 'Switch to Perspective (P)';
      }
      const mobile = document.getElementById('mobileProjectionToggle');
      if (mobile) {
        mobile.setAttribute('aria-pressed', isPerspective ? 'false' : 'true');
        mobile.title = isPerspective
          ? 'Switch to Orthographic'
          : 'Switch to Perspective';
        const labelSpan = mobile.querySelector('span');
        if (labelSpan) {
          labelSpan.textContent = isPerspective
            ? 'Perspective'
            : 'Orthographic';
        }
      }
    }

    document.addEventListener('preview-projection-change', (event) => {
      syncProjectionToggles(event.detail?.mode);
    });

    for (const id of ['projectionToggle', 'mobileProjectionToggle']) {
      document.getElementById(id)?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.toggleProjection) {
          syncProjectionToggles(pm.toggleProjection());
        }
      });
    }

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
      ?.addEventListener('click', (e) => {
        if (maybeHandlePanOverride('left', 'mobile', e)) return;
        const pm = getPM();
        if (pm?.panCamera) {
          pm.panCamera(-panSpeed, 0);
          announceAction('Pan left');
        }
      });

    document
      .getElementById('mobileCameraPanRight')
      ?.addEventListener('click', (e) => {
        if (maybeHandlePanOverride('right', 'mobile', e)) return;
        const pm = getPM();
        if (pm?.panCamera) {
          pm.panCamera(panSpeed, 0);
          announceAction('Pan right');
        }
      });

    document
      .getElementById('mobileCameraPanUp')
      ?.addEventListener('click', (e) => {
        if (maybeHandlePanOverride('up', 'mobile', e)) return;
        const pm = getPM();
        if (pm?.panCamera) {
          pm.panCamera(0, panSpeed);
          announceAction('Pan up');
        }
      });

    document
      .getElementById('mobileCameraPanDown')
      ?.addEventListener('click', (e) => {
        if (maybeHandlePanOverride('down', 'mobile', e)) return;
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

    // Mobile reset view button — same command as its desktop twin
    document
      .getElementById('mobileCameraResetView')
      ?.addEventListener('click', () => {
        const pm = getPM();
        if (pm?.resetCamera) {
          pm.resetCamera();
          announceAction('View reset to default');
        } else {
          announceAction('Load a model first');
        }
      });

    // View All beside Reset View, in the panel and the drawer: Reset View
    // keeps the default pose, as desktop OpenSCAD does, and this one frames
    // the model, as View ▸ View All does.
    const viewAll = () => {
      const pm = getPM();
      if (pm?.mesh && pm.viewAllCamera) {
        pm.viewAllCamera();
        announceAction('View fitted to model');
      } else {
        announceAction('Load a model first');
      }
    };
    document
      .getElementById('cameraViewAll')
      ?.addEventListener('click', viewAll);
    document
      .getElementById('mobileCameraViewAll')
      ?.addEventListener('click', viewAll);

    // Standard view buttons for consistent viewing angles
    // These are in both desktop camera panel and mobile camera drawer
    const viewButtons = document.querySelectorAll('.camera-view-btn');
    viewButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const pm = getPM();
        const viewName = btn.dataset.view;
        if (viewName && pm?.setCameraView) {
          pm.setCameraView(viewName);
        } else if (!pm?.mesh) {
          announceAction('Load a model first');
        }
      });
    });
  }

  /**
   * Announce camera action to screen readers
   * Uses centralized announcer for consistent behavior
   */
  function announceAction(message) {
    announceImmediate(message);
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
  shortcutsPopout = initCameraShortcutsPopout();

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
 * The camera panel's keyboard shortcuts pop-out. Its button opens and closes
 * it; Escape on the button or inside the pop-out closes it and leaves focus on
 * the button; a press anywhere outside the two closes it.
 * @returns {{close: Function}|null}
 */
function initCameraShortcutsPopout() {
  const button = document.getElementById('cameraShortcutsBtn');
  const popout = document.getElementById('cameraShortcutsPanel');
  if (!button || !popout) return null;

  const isOpen = () => button.getAttribute('aria-expanded') === 'true';

  function onPointerDown(event) {
    if (button.contains(event.target) || popout.contains(event.target)) {
      return;
    }
    close();
  }

  function open() {
    if (isOpen()) return;
    popout.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onPointerDown, true);
  }

  function close({ focusButton = false } = {}) {
    if (!isOpen()) return;
    popout.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onPointerDown, true);
    if (focusButton) button.focus();
  }

  button.addEventListener('click', () => {
    if (isOpen()) {
      close();
    } else {
      open();
    }
  });

  for (const el of [button, popout]) {
    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !isOpen()) return;
      // Spent here, so a page-wide Escape (leaving focus mode) does not fire
      // on the same press.
      event.preventDefault();
      event.stopPropagation();
      close({ focusButton: true });
    });
  }

  return { close };
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

  // Load saved state from localStorage (defaults to collapsed)
  const savedMobileState = safeGetItem(STORAGE_KEY_MOBILE_COLLAPSED);
  let isMobileCollapsed =
    savedMobileState === null ? true : savedMobileState === 'true';

  /**
   * Save collapsed state to localStorage
   */
  function saveState(collapsed) {
    safeSetItem(STORAGE_KEY_MOBILE_COLLAPSED, String(collapsed));
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

    // Mobile portrait: close actions drawer first (mutual exclusion)
    const actionsDrawer = document.getElementById('actionsDrawer');
    const actionsToggle = document.getElementById('actionsDrawerToggle');
    if (actionsDrawer && !actionsDrawer.classList.contains('collapsed')) {
      actionsDrawer.classList.add('collapsed');
      if (actionsToggle) {
        actionsToggle.setAttribute('aria-expanded', 'false');
        actionsToggle.setAttribute('aria-label', 'Expand actions menu');
      }
    }

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
