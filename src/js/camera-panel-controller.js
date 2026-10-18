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
import {
  closeOtherPhoneDrawers,
  isPhoneLayout,
  isSidewaysPhone,
  placeDrawerColumnTop,
  registerPhoneDrawer,
} from './phone-drawers.js';
import {
  drawerPace,
  registerLookDrawer,
  restingRect,
  sidePanelParts,
  slideDrawer,
  stripWidth,
} from './drawer-motion.js';

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
   * @param {import('./drawer-motion.js').DrawerHow} [how]
   * @returns {Promise<boolean>|null|undefined} its slide
   */
  function expand({ instant = false, remember = true } = {}) {
    if (!isCollapsed) return;
    isCollapsed = false;
    panel.classList.remove('collapsed');
    updateToggleAria(false);
    if (remember) saveCollapsedState(false);
    return slideDrawer(sidePanelParts(panel, 'right'), {
      from: 'right',
      open: true,
      keep: stripWidth(),
      instant,
      name: 'camera',
    });
  }

  /**
   * Collapse the panel
   * @param {import('./drawer-motion.js').DrawerHow} [how]
   * @returns {Promise<boolean>|null|undefined} its slide
   */
  function collapse({ instant = false, remember = true } = {}) {
    if (isCollapsed) return;
    isCollapsed = true;
    shortcutsPopout?.close();
    updateToggleAria(true);
    if (remember) saveCollapsedState(true);
    return slideDrawer(sidePanelParts(panel, 'right'), {
      from: 'right',
      open: false,
      keep: stripWidth(),
      instant,
      name: 'camera',
      inert: [panel.querySelector('.camera-panel-body')],
      whenClosed: () => {
        if (isCollapsed) panel.classList.add('collapsed');
      },
    });
  }

  registerLookDrawer('camera', {
    place: () => panel,
    isOpen: () =>
      !isCollapsed &&
      document.body.dataset.uiMode !== 'classic' &&
      panel.offsetWidth > 0,
    open: expand,
    close: collapse,
  });

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
     * Make both projection buttons say the projection that is showing: each
     * shows its icon (data-projection), and each one's pressed state and
     * title follow. Called after a press of either button and on
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
        mobile.dataset.projection = mode;
        mobile.setAttribute('aria-pressed', isPerspective ? 'false' : 'true');
        mobile.title = isPerspective
          ? 'Switch to Orthographic'
          : 'Switch to Perspective';
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
 * A keyboard shortcuts pop-out, the camera panel's or the phone drawer's. Its
 * button opens and closes it; Escape on the button or inside the pop-out
 * closes it and leaves focus on the button; a press anywhere outside the two
 * closes it.
 * @param {string} [buttonId]
 * @param {string} [popoutId]
 * @returns {{close: Function}|null}
 */
function initCameraShortcutsPopout(
  buttonId = 'cameraShortcutsBtn',
  popoutId = 'cameraShortcutsPanel'
) {
  const button = document.getElementById(buttonId);
  const popout = document.getElementById(popoutId);
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
 * One of the phone's bottom drawers: its toggle, its open state (kept across
 * visits when it has a storage key), and its place in the one-at-a-time rule
 * (phone-drawers.js).
 * @param {Object} cfg
 * @param {string} cfg.name - Its name in the one-at-a-time rule
 * @param {string} cfg.drawerId
 * @param {string} cfg.toggleId
 * @param {string} cfg.bodyId
 * @param {string} cfg.label - Its name after "Expand" or "Collapse"
 * @param {string|null} [cfg.storageKey]
 * @param {() => void} [cfg.onCollapse]
 * @param {(opened: boolean) => void} [cfg.onChange]
 * @returns {{drawer: HTMLElement, body: HTMLElement, isOpen: () => boolean}|null}
 */
function initPhoneDrawer({
  name,
  drawerId,
  toggleId,
  bodyId,
  label,
  storageKey = null,
  onCollapse = null,
  onChange = null,
}) {
  const drawer = document.getElementById(drawerId);
  const toggleBtn = document.getElementById(toggleId);
  const body = document.getElementById(bodyId);
  if (!drawer || !toggleBtn || !body) return null;

  const saved = storageKey ? safeGetItem(storageKey) : null;
  let collapsed = saved === null ? true : saved === 'true';

  // No tooltip: one that repeated the name reached a screen reader as a
  // description, and each press was said twice. The word and the arrow show.
  function nameToggle() {
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggleBtn.setAttribute(
      'aria-label',
      `${collapsed ? 'Expand' : 'Collapse'} ${label}`
    );
  }

  function apply() {
    drawer.classList.toggle('collapsed', collapsed);
    nameToggle();
  }

  // Upright, the drawer rises out of the bar; held sideways it is a column
  // at the right edge and comes in from there.
  const edge = () => (isSidewaysPhone() ? 'right' : 'bottom');

  /** @param {import('./drawer-motion.js').DrawerHow} [how] */
  function expand({ instant = false, remember = true } = {}) {
    if (!collapsed) return;
    // Open before the others close, so a drawer opening in another's place
    // is already counted when the preview's room is decided.
    collapsed = false;
    closeOtherPhoneDrawers(name);
    apply();
    if (storageKey && remember) safeSetItem(storageKey, 'false');
    onChange?.(true, { instant });
    return slideDrawer([{ el: body }], {
      from: edge(),
      open: true,
      instant,
      name: `phone-${name}`,
    });
  }

  /** @param {import('./drawer-motion.js').DrawerHow} [how] */
  function collapse({ instant = false, remember = true } = {}) {
    if (collapsed) return;
    collapsed = true;
    onCollapse?.();
    nameToggle();
    if (storageKey && remember) safeSetItem(storageKey, 'true');
    onChange?.(false, { instant });
    return slideDrawer([{ el: body }], {
      from: edge(),
      open: false,
      instant,
      name: `phone-${name}`,
      inert: [body],
      whenClosed: () => {
        if (collapsed) drawer.classList.add('collapsed');
      },
    });
  }

  toggleBtn.addEventListener('click', (event) => {
    event.preventDefault();
    if (collapsed) {
      expand();
    } else {
      collapse();
    }
  });
  registerPhoneDrawer(name, {
    isOpen: () => !collapsed,
    close: () => collapse(),
  });
  registerLookDrawer(`phone-${name}`, {
    place: () => body,
    isOpen: () => !collapsed && body.offsetHeight > 0,
    open: expand,
    close: collapse,
  });
  apply();
  return { drawer, body, isOpen: () => !collapsed };
}

/**
 * The phone's bottom drawers: the camera drawer, and in the Alt View the
 * ASCII drawer beside it, both opening from the bottom bar, one at a time,
 * each as tall as its controls.
 */
function initMobileCameraDrawer() {
  const previewPanel = document.querySelector('.preview-panel');

  // The drawer's shortcuts list is the camera panel's, so the two never
  // say different things.
  const shortcutsList = document.querySelector(
    '#cameraShortcutsPanel .camera-shortcuts-list'
  );
  const mobileShortcuts = document.getElementById('mobileCameraShortcutsPanel');
  if (shortcutsList && mobileShortcuts && !mobileShortcuts.firstElementChild) {
    mobileShortcuts.appendChild(shortcutsList.cloneNode(true));
  }
  const shortcutsPopout = initCameraShortcutsPopout(
    'mobileCameraShortcutsBtn',
    'mobileCameraShortcutsPanel'
  );

  /** @type {Array<{drawer: HTMLElement, body: HTMLElement, isOpen: () => boolean}>} */
  const drawers = [];

  // The preview keeps room above the bar while a drawer is open. In the Alt
  // View's look the room opens and closes with the drawer's slide, so the
  // preview gives way as the drawer rises instead of jumping first; a resize
  // to a desktop width drops it at once (the drawers do not show there).
  let roomOpen = false;
  let roomSizes = [0, 0];
  let roomMove = null;
  const padding = () =>
    parseFloat(getComputedStyle(previewPanel).paddingBottom) || 0;
  const syncPreviewPadding = ({ checkWidth = false, instant = false } = {}) => {
    if (!previewPanel) return;
    const want =
      (!checkWidth || isPhoneLayout()) && drawers.some((d) => d.isOpen());
    if (want === roomOpen) return;
    roomOpen = want;
    // Read with the room closed and open, in the look only (elsewhere the
    // stylesheet's own transition would answer mid-way), and not while it
    // moves: its sizes are then the ones it started from.
    if (!roomMove && drawerPace()) {
      previewPanel.classList.remove('camera-drawer-open');
      const closed = padding();
      previewPanel.classList.add('camera-drawer-open');
      roomSizes = [closed, padding()];
    }
    previewPanel.classList.add('camera-drawer-open');
    const move = slideDrawer(
      [
        {
          el: previewPanel,
          role: 'space',
          props: { paddingBottom: roomSizes },
        },
      ],
      {
        from: 'bottom',
        open: want,
        instant: checkWidth || instant,
        whenClosed: () => {
          if (!roomOpen) previewPanel.classList.remove('camera-drawer-open');
        },
      }
    );
    roomMove = move;
    move?.finally(() => {
      if (roomMove === move) roomMove = null;
    });
  };

  // How far the open drawer reaches up from the screen's foot. In Full
  // Screen the preview runs down to it (layout.css), so a short drawer
  // leaves the preview more than half.
  const syncReach = () => {
    const open = drawers.find((d) => d.isOpen());
    const root = document.documentElement.style;
    if (!open) {
      root.removeProperty('--phone-drawer-reach');
      return;
    }
    // Where the drawer will stand, not where its slide has it this frame.
    const top = restingRect(open.body).top;
    root.setProperty(
      '--phone-drawer-reach',
      `${Math.max(0, Math.round(window.innerHeight - top))}px`
    );
  };
  const scheduleReach = () => requestAnimationFrame(syncReach);

  const onChange = (opened, { instant = false } = {}) => {
    if (opened) placeDrawerColumnTop();
    syncPreviewPadding({ instant });
    scheduleReach();
  };

  for (const cfg of [
    {
      name: 'camera',
      drawerId: 'cameraDrawer',
      toggleId: 'cameraDrawerToggle',
      bodyId: 'cameraDrawerBody',
      label: 'camera controls',
      storageKey: STORAGE_KEY_MOBILE_COLLAPSED,
      onCollapse: () => shortcutsPopout?.close(),
    },
    {
      name: 'ascii',
      drawerId: 'asciiDrawer',
      toggleId: 'asciiDrawerToggle',
      bodyId: 'asciiDrawerBody',
      label: 'ASCII controls',
    },
  ]) {
    const d = initPhoneDrawer({ ...cfg, onChange });
    if (d) drawers.push(d);
  }
  syncPreviewPadding();

  // Full Screen coming or going, and a drawer's controls changing (the Alt
  // View fills its drawer when it starts), move the open drawer's top.
  const mainInterface = document.getElementById('mainInterface');
  if (mainInterface) {
    new MutationObserver(scheduleReach).observe(mainInterface, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }
  if (typeof ResizeObserver === 'function') {
    const bodies = new ResizeObserver(scheduleReach);
    drawers.forEach((d) => bodies.observe(d.body));
  }

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      syncPreviewPadding({ checkWidth: true });
      if (drawers.some((d) => d.isOpen())) placeDrawerColumnTop();
      syncReach();
    }, 150);
  });
}
