/**
 * 3D Preview using Three.js (Lazy Loaded for Performance)
 * @license GPL-3.0-or-later
 */

// Lazy-loaded Three.js modules - loaded on demand to reduce initial bundle size
let THREE = null;
let OrbitControls = null;
let STLLoader = null;
let threeJsLoaded = false;
let threeJsLoading = null;

/**
 * Lazy load Three.js and its dependencies
 * @returns {Promise<{THREE: object, OrbitControls: Function, STLLoader: Function}>}
 */
async function loadThreeJS() {
  if (threeJsLoaded) {
    return { THREE, OrbitControls, STLLoader };
  }

  // If already loading, wait for that promise
  if (threeJsLoading) {
    return threeJsLoading;
  }

  console.log('[Preview] Loading Three.js modules...');
  const startTime = performance.now();

  threeJsLoading = (async () => {
    try {
      // Parallel loading of all Three.js modules
      const [threeModule, controlsModule, loaderModule] = await Promise.all([
        import('three'),
        import('three/examples/jsm/controls/OrbitControls.js'),
        import('three/examples/jsm/loaders/STLLoader.js'),
      ]);

      THREE = threeModule;
      OrbitControls = controlsModule.OrbitControls;
      STLLoader = loaderModule.STLLoader;
      threeJsLoaded = true;

      const loadTime = Math.round(performance.now() - startTime);
      console.log(`[Preview] Three.js loaded in ${loadTime}ms`);

      return { THREE, OrbitControls, STLLoader };
    } catch (error) {
      console.error('[Preview] Failed to load Three.js:', error);
      threeJsLoading = null;
      throw error;
    }
  })();

  return threeJsLoading;
}

/**
 * Check if Three.js is loaded
 * @returns {boolean}
 */
export function isThreeJsLoaded() {
  return threeJsLoaded;
}

/**
 * LOD (Level of Detail) configuration
 */
const LOD_CONFIG = {
  vertexWarningThreshold: 100000, // Warn above 100K vertices
  vertexCriticalThreshold: 500000, // Critical warning above 500K vertices
  showWarning: true,
};

/**
 * Theme-aware color scheme for 3D preview
 */
const PREVIEW_COLORS = {
  light: {
    background: 0xf5f5f5,
    gridPrimary: 0xcccccc,
    gridSecondary: 0xe0e0e0,
    model: 0x2196f3,
    ambientLight: 0xffffff,
  },
  dark: {
    background: 0x1a1a1a,
    gridPrimary: 0x404040,
    gridSecondary: 0x2d2d2d,
    model: 0x4d9fff,
    ambientLight: 0xffffff,
  },
  'light-hc': {
    background: 0xffffff,
    gridPrimary: 0x000000,
    gridSecondary: 0x666666,
    model: 0x0052cc,
    ambientLight: 0xffffff,
  },
  'dark-hc': {
    background: 0x000000,
    gridPrimary: 0xffffff,
    gridSecondary: 0x999999,
    model: 0x66b3ff,
    ambientLight: 0xffffff,
  },
};

function normalizeHexColor(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return /^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized : null;
}

/**
 * Preview manager class
 */
export class PreviewManager {
  constructor(container, options = {}) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.mesh = null;
    this.gridHelper = null;
    this.animationId = null;
    this.currentTheme = options.theme || 'light';
    this.highContrast = options.highContrast || false;
    this.colorOverride = null;

    // Measurements
    this.measurementsEnabled = this.loadMeasurementPreference();
    this.measurementHelpers = null; // Group containing all measurement visuals
    this.dimensions = null; // { x, y, z, volume }

    // Grid visibility
    this.gridEnabled = this.loadGridPreference();
  }

  /**
   * Initialize Three.js scene (async - loads Three.js on demand)
   * @returns {Promise<void>}
   */
  async init() {
    // Show loading state
    this.container.innerHTML =
      '<div class="preview-loading" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-secondary)">Loading 3D preview...</div>';

    // Lazy load Three.js
    await loadThreeJS();

    // Clear container
    this.container.innerHTML = '';

    // Detect initial theme
    this.currentTheme = this.detectTheme();
    const colors = PREVIEW_COLORS[this.currentTheme];

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(colors.background);

    // Create camera with OpenSCAD-compatible Z-up coordinate system
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);

    // Set Z as the up axis (OpenSCAD uses Z-up, Three.js defaults to Y-up)
    this.camera.up.set(0, 0, 1);

    // Position camera for OpenSCAD-style diagonal view (looking at origin from front-right-above)
    // This mimics OpenSCAD's default "Diagonal" view orientation
    this.camera.position.set(150, -150, 100);

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('tabindex', '0');
    this.renderer.domElement.setAttribute('aria-label', '3D preview canvas');
    this.renderer.domElement.addEventListener('click', () => {
      this.renderer.domElement.focus();
    });

    // Add lights (store references for potential theme updates)
    this.ambientLight = new THREE.AmbientLight(colors.ambientLight, 0.6);
    this.scene.add(this.ambientLight);

    this.directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    this.directionalLight1.position.set(1, 1, 1);
    this.scene.add(this.directionalLight1);

    this.directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    this.directionalLight2.position.set(-1, -1, -1);
    this.scene.add(this.directionalLight2);

    // Add grid helper on XY plane (OpenSCAD's ground plane)
    // GridHelper by default creates a grid on XZ plane (Y-up), so we rotate it for Z-up
    this.gridHelper = new THREE.GridHelper(
      200,
      20,
      colors.gridPrimary,
      colors.gridSecondary
    );
    // Rotate grid from XZ plane to XY plane (Z-up coordinate system)
    this.gridHelper.rotation.x = Math.PI / 2;
    // Apply saved grid visibility preference
    this.gridHelper.visible = this.gridEnabled;
    this.scene.add(this.gridHelper);

    // Add orbit controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 1000;

    // WCAG 2.2 SC 2.5.7: Add keyboard controls for camera (non-drag alternatives)
    this.setupKeyboardControls();
    this.setupCameraControls();

    // Handle window resize
    this.handleResize = () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    };
    window.addEventListener('resize', this.handleResize);

    // Add ResizeObserver for container size changes (e.g., split panel resize)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.container);
    }

    // Start animation loop
    this.animate();

    console.log(
      `[Preview] Three.js scene initialized (theme: ${this.currentTheme})`
    );
  }

  /**
   * Detect current theme from document
   * @returns {string} 'light', 'dark', 'light-hc', or 'dark-hc'
   */
  detectTheme() {
    const root = document.documentElement;
    const dataTheme = root.getAttribute('data-theme');
    const highContrast = root.getAttribute('data-high-contrast') === 'true';

    let baseTheme;
    if (dataTheme === 'dark') {
      baseTheme = 'dark';
    } else if (dataTheme === 'light') {
      baseTheme = 'light';
    } else {
      // Auto mode - check system preference
      baseTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }

    return highContrast ? `${baseTheme}-hc` : baseTheme;
  }

  /**
   * Update preview colors for theme change
   * @param {string} theme - 'light', 'dark', 'light-hc', or 'dark-hc'
   * @param {boolean} highContrast - High contrast mode enabled
   */
  updateTheme(theme, highContrast = false) {
    // Determine theme key
    let themeKey = theme;
    if (highContrast && !theme.endsWith('-hc')) {
      themeKey = `${theme}-hc`;
    }

    if (!this.scene || themeKey === this.currentTheme) return;

    this.currentTheme = themeKey;
    this.highContrast = highContrast;
    const colors = PREVIEW_COLORS[themeKey] || PREVIEW_COLORS.light;

    // Update scene background
    this.scene.background.setHex(colors.background);

    // Update grid colors
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      // Use thicker grid lines in high contrast mode
      const gridSize = highContrast ? 3 : 2;
      this.gridHelper = new THREE.GridHelper(
        200,
        20,
        colors.gridPrimary,
        colors.gridSecondary
      );
      this.gridHelper.material.linewidth = gridSize;
      // Rotate grid from XZ plane to XY plane (Z-up coordinate system)
      this.gridHelper.rotation.x = Math.PI / 2;
      this.scene.add(this.gridHelper);
    }

    // Update model color if mesh exists
    if (this.mesh && this.mesh.material) {
      const themeHex = `#${colors.model.toString(16).padStart(6, '0')}`;
      const appliedHex = this.colorOverride || themeHex;
      this.mesh.material.color.setHex(parseInt(appliedHex.slice(1), 16));
    }

    // Refresh measurements if they're visible
    if (this.measurementsEnabled && this.mesh) {
      this.showMeasurements();
    }

    console.log(`[Preview] Theme updated to ${themeKey}`);
  }

  /**
   * Set a color override for the model material
   * @param {string|null} hexColor
   */
  setColorOverride(hexColor) {
    this.colorOverride = normalizeHexColor(hexColor);
    if (this.mesh && this.mesh.material) {
      const colors = PREVIEW_COLORS[this.currentTheme] || PREVIEW_COLORS.light;
      const themeHex = `#${colors.model.toString(16).padStart(6, '0')}`;
      const appliedHex = this.colorOverride || themeHex;
      this.mesh.material.color.setHex(parseInt(appliedHex.slice(1), 16));
    }
  }

  /**
   * Animation loop
   */
  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Setup keyboard controls for camera manipulation (WCAG 2.2 SC 2.5.7)
   * Provides non-drag alternatives for orbit/pan/zoom operations
   */
  setupKeyboardControls() {
    const rotationSpeed = 0.05;
    const panSpeed = 5;
    const zoomSpeed = 10;

    this.keyboardHandler = (event) => {
      // Ignore if focus is in an input field
      if (
        event.target.tagName === 'INPUT' ||
        event.target.tagName === 'TEXTAREA' ||
        event.target.tagName === 'SELECT' ||
        event.target.isContentEditable
      ) {
        return;
      }

      // Check if preview container or canvas has focus
      if (
        !this.container.contains(document.activeElement) &&
        document.activeElement !== this.renderer.domElement
      ) {
        return;
      }

      let handled = false;

      // Rotation (arrow keys without modifiers)
      if (
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        switch (event.key) {
          case 'ArrowLeft':
            this.controls.object.position.applyAxisAngle(
              new THREE.Vector3(0, 0, 1),
              rotationSpeed
            );
            this.controls.update();
            handled = true;
            break;
          case 'ArrowRight':
            this.controls.object.position.applyAxisAngle(
              new THREE.Vector3(0, 0, 1),
              -rotationSpeed
            );
            this.controls.update();
            handled = true;
            break;
          case 'ArrowUp': {
            // Orbit vertically
            const currentDist = this.controls.object.position.length();
            const horizontalAngle = Math.atan2(
              this.controls.object.position.y,
              this.controls.object.position.x
            );
            const verticalAngle = Math.asin(
              this.controls.object.position.z / currentDist
            );
            const newVerticalAngle = verticalAngle + rotationSpeed;

            this.controls.object.position.x =
              currentDist *
              Math.cos(newVerticalAngle) *
              Math.cos(horizontalAngle);
            this.controls.object.position.y =
              currentDist *
              Math.cos(newVerticalAngle) *
              Math.sin(horizontalAngle);
            this.controls.object.position.z =
              currentDist * Math.sin(newVerticalAngle);
            this.controls.update();
            handled = true;
            break;
          }
          case 'ArrowDown': {
            // Orbit vertically (down)
            const currentDist2 = this.controls.object.position.length();
            const horizontalAngle2 = Math.atan2(
              this.controls.object.position.y,
              this.controls.object.position.x
            );
            const verticalAngle2 = Math.asin(
              this.controls.object.position.z / currentDist2
            );
            const newVerticalAngle2 = verticalAngle2 - rotationSpeed;

            this.controls.object.position.x =
              currentDist2 *
              Math.cos(newVerticalAngle2) *
              Math.cos(horizontalAngle2);
            this.controls.object.position.y =
              currentDist2 *
              Math.cos(newVerticalAngle2) *
              Math.sin(horizontalAngle2);
            this.controls.object.position.z =
              currentDist2 * Math.sin(newVerticalAngle2);
            this.controls.update();
            handled = true;
            break;
          }
        }
      }

      // Pan (Shift + arrow keys)
      if (event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        switch (event.key) {
          case 'ArrowLeft':
            this.panCamera(-panSpeed, 0);
            handled = true;
            break;
          case 'ArrowRight':
            this.panCamera(panSpeed, 0);
            handled = true;
            break;
          case 'ArrowUp':
            this.panCamera(0, panSpeed);
            handled = true;
            break;
          case 'ArrowDown':
            this.panCamera(0, -panSpeed);
            handled = true;
            break;
        }
      }

      // Zoom (+/- keys or = key for +)
      if (event.key === '+' || event.key === '=' || event.key === '-') {
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        const zoomAmount = (event.key === '-' ? -1 : 1) * zoomSpeed;
        this.camera.position.addScaledVector(direction, zoomAmount);
        this.controls.update();
        handled = true;
      }

      if (handled) {
        event.preventDefault();
        event.stopPropagation();
        // Announce camera action to screen readers
        this.announceCameraAction(event.key, event.shiftKey);
      }
    };

    document.addEventListener('keydown', this.keyboardHandler);
  }

  /**
   * Setup on-screen camera controls (WCAG 2.2 SC 2.5.7)
   * Adds visible buttons for camera manipulation
   * Note: On desktop (>= 768px), the camera panel drawer handles controls,
   * so we only create floating controls for mobile.
   */
  setupCameraControls() {
    // Check if the camera panel drawer exists (desktop view)
    // If it does, skip creating floating controls as they're redundant
    const cameraPanelDrawer = document.getElementById('cameraPanel');
    if (cameraPanelDrawer && window.innerWidth >= 768) {
      console.log(
        '[Preview] Camera panel drawer exists - skipping floating controls'
      );
      return;
    }

    // Create control panel (for mobile or when drawer doesn't exist)
    const controlPanel = document.createElement('div');
    controlPanel.className = 'camera-controls';
    controlPanel.setAttribute('role', 'group');
    controlPanel.setAttribute('aria-label', 'Camera controls');

    // Persisted preferences: collapsed + position (keyboard-accessible “move”)
    const collapsedKey = 'openscad-camera-controls-collapsed';
    const positionKey = 'openscad-camera-controls-position';
    const isCollapsed = localStorage.getItem(collapsedKey) === 'true';
    const position = localStorage.getItem(positionKey) || 'bottom-right'; // bottom-right | bottom-left | top-right | top-left
    controlPanel.dataset.collapsed = isCollapsed ? 'true' : 'false';
    controlPanel.dataset.position = position;

    // Header with collapse + move controls (a11y: clear labels, aria-expanded)
    const header = document.createElement('div');
    header.className = 'camera-controls-header';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'camera-controls-toggle';
    toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    toggleBtn.setAttribute('aria-controls', 'cameraControlsBody');
    toggleBtn.setAttribute(
      'aria-label',
      isCollapsed ? 'Expand camera controls' : 'Collapse camera controls'
    );
    toggleBtn.title = isCollapsed
      ? 'Show camera controls'
      : 'Hide camera controls';
    toggleBtn.textContent = 'Camera controls';

    const moveBtn = document.createElement('button');
    moveBtn.type = 'button';
    moveBtn.className = 'camera-controls-move';
    moveBtn.setAttribute(
      'aria-label',
      'Move camera controls to a different corner'
    );
    moveBtn.title = 'Move camera controls';
    moveBtn.textContent = 'Move';

    header.appendChild(toggleBtn);
    header.appendChild(moveBtn);
    controlPanel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'camera-controls-body';
    body.id = 'cameraControlsBody';

    // Rotation controls
    const rotateGroup = document.createElement('div');
    rotateGroup.className = 'camera-control-group';
    rotateGroup.innerHTML = `
      <button type="button" class="camera-control-btn" id="cameraRotateLeft" aria-label="Rotate view left" title="Rotate left (Arrow Left)">
        ◀
      </button>
      <button type="button" class="camera-control-btn" id="cameraRotateUp" aria-label="Rotate view up" title="Rotate up (Arrow Up)">
        ▲
      </button>
      <button type="button" class="camera-control-btn" id="cameraRotateDown" aria-label="Rotate view down" title="Rotate down (Arrow Down)">
        ▼
      </button>
      <button type="button" class="camera-control-btn" id="cameraRotateRight" aria-label="Rotate view right" title="Rotate right (Arrow Right)">
        ▶
      </button>
    `;

    // Pan controls
    const panGroup = document.createElement('div');
    panGroup.className = 'camera-control-group camera-pan-group';
    panGroup.innerHTML = `
      <button type="button" class="camera-control-btn" id="cameraPanLeft" aria-label="Pan view left" title="Pan left (Shift + Arrow Left)">
        ⟵
      </button>
      <button type="button" class="camera-control-btn" id="cameraPanUp" aria-label="Pan view up" title="Pan up (Shift + Arrow Up)">
        ⟰
      </button>
      <button type="button" class="camera-control-btn" id="cameraPanDown" aria-label="Pan view down" title="Pan down (Shift + Arrow Down)">
        ⟱
      </button>
      <button type="button" class="camera-control-btn" id="cameraPanRight" aria-label="Pan view right" title="Pan right (Shift + Arrow Right)">
        ⟶
      </button>
    `;

    // Zoom controls
    const zoomGroup = document.createElement('div');
    zoomGroup.className = 'camera-control-group camera-zoom-group';
    zoomGroup.innerHTML = `
      <button type="button" class="camera-control-btn" id="cameraZoomIn" aria-label="Zoom in" title="Zoom in (+)">
        +
      </button>
      <button type="button" class="camera-control-btn" id="cameraZoomOut" aria-label="Zoom out" title="Zoom out (-)">
        −
      </button>
      <button type="button" class="camera-control-btn" id="cameraResetView" aria-label="Reset camera to default view" title="Reset view (Home)">
        ⌂
      </button>
    `;

    body.appendChild(rotateGroup);
    body.appendChild(panGroup);
    body.appendChild(zoomGroup);
    controlPanel.appendChild(body);
    this.container.appendChild(controlPanel);

    // Apply initial collapsed state (hide body if collapsed)
    if (isCollapsed) {
      body.hidden = true;
    }

    const setCollapsed = (nextCollapsed) => {
      controlPanel.dataset.collapsed = nextCollapsed ? 'true' : 'false';
      body.hidden = !!nextCollapsed;
      toggleBtn.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
      toggleBtn.setAttribute(
        'aria-label',
        nextCollapsed ? 'Expand camera controls' : 'Collapse camera controls'
      );
      toggleBtn.title = nextCollapsed
        ? 'Show camera controls'
        : 'Hide camera controls';
      localStorage.setItem(collapsedKey, nextCollapsed ? 'true' : 'false');
    };

    const positions = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
    const cyclePosition = () => {
      const current = controlPanel.dataset.position || 'bottom-right';
      const idx = positions.indexOf(current);
      const next = positions[(idx + 1 + positions.length) % positions.length];
      controlPanel.dataset.position = next;
      localStorage.setItem(positionKey, next);
    };

    toggleBtn.addEventListener('click', () => {
      setCollapsed(controlPanel.dataset.collapsed !== 'true' ? true : false);
    });
    moveBtn.addEventListener('click', () => {
      cyclePosition();
    });

    // Wire up button events
    this.setupCameraControlButtons();
  }

  /**
   * Setup camera control button event handlers
   */
  setupCameraControlButtons() {
    const rotationSpeed = 0.1;
    const panSpeed = 6;
    const zoomSpeed = 15;

    // Rotation buttons
    document
      .getElementById('cameraRotateLeft')
      ?.addEventListener('click', () => {
        this.controls.object.position.applyAxisAngle(
          new THREE.Vector3(0, 0, 1),
          rotationSpeed
        );
        this.controls.update();
        this.announceCameraAction('Rotate left');
      });

    document
      .getElementById('cameraRotateRight')
      ?.addEventListener('click', () => {
        this.controls.object.position.applyAxisAngle(
          new THREE.Vector3(0, 0, 1),
          -rotationSpeed
        );
        this.controls.update();
        this.announceCameraAction('Rotate right');
      });

    document.getElementById('cameraRotateUp')?.addEventListener('click', () => {
      const currentDist = this.controls.object.position.length();
      const horizontalAngle = Math.atan2(
        this.controls.object.position.y,
        this.controls.object.position.x
      );
      const verticalAngle = Math.asin(
        this.controls.object.position.z / currentDist
      );
      const newVerticalAngle = Math.min(
        verticalAngle + rotationSpeed,
        Math.PI / 2 - 0.01
      );

      this.controls.object.position.x =
        currentDist * Math.cos(newVerticalAngle) * Math.cos(horizontalAngle);
      this.controls.object.position.y =
        currentDist * Math.cos(newVerticalAngle) * Math.sin(horizontalAngle);
      this.controls.object.position.z =
        currentDist * Math.sin(newVerticalAngle);
      this.controls.update();
      this.announceCameraAction('Rotate up');
    });

    document
      .getElementById('cameraRotateDown')
      ?.addEventListener('click', () => {
        const currentDist = this.controls.object.position.length();
        const horizontalAngle = Math.atan2(
          this.controls.object.position.y,
          this.controls.object.position.x
        );
        const verticalAngle = Math.asin(
          this.controls.object.position.z / currentDist
        );
        const newVerticalAngle = Math.max(
          verticalAngle - rotationSpeed,
          -Math.PI / 2 + 0.01
        );

        this.controls.object.position.x =
          currentDist * Math.cos(newVerticalAngle) * Math.cos(horizontalAngle);
        this.controls.object.position.y =
          currentDist * Math.cos(newVerticalAngle) * Math.sin(horizontalAngle);
        this.controls.object.position.z =
          currentDist * Math.sin(newVerticalAngle);
        this.controls.update();
        this.announceCameraAction('Rotate down');
      });

    // Pan buttons
    document.getElementById('cameraPanLeft')?.addEventListener('click', () => {
      this.panCamera(-panSpeed, 0);
      this.announceCameraAction('Pan left');
    });

    document.getElementById('cameraPanRight')?.addEventListener('click', () => {
      this.panCamera(panSpeed, 0);
      this.announceCameraAction('Pan right');
    });

    document.getElementById('cameraPanUp')?.addEventListener('click', () => {
      this.panCamera(0, panSpeed);
      this.announceCameraAction('Pan up');
    });

    document.getElementById('cameraPanDown')?.addEventListener('click', () => {
      this.panCamera(0, -panSpeed);
      this.announceCameraAction('Pan down');
    });

    // Zoom buttons
    document.getElementById('cameraZoomIn')?.addEventListener('click', () => {
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      this.camera.position.addScaledVector(direction, zoomSpeed);
      this.controls.update();
      this.announceCameraAction('Zoom in');
    });

    document.getElementById('cameraZoomOut')?.addEventListener('click', () => {
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      this.camera.position.addScaledVector(direction, -zoomSpeed);
      this.controls.update();
      this.announceCameraAction('Zoom out');
    });

    // Reset view button
    document
      .getElementById('cameraResetView')
      ?.addEventListener('click', () => {
        if (this.mesh) {
          this.fitCameraToModel();
          this.announceCameraAction('Reset view');
        }
      });
  }

  /**
   * Announce camera actions to screen readers
   * @param {string} action - Action description or key pressed
   * @param {boolean} shiftKey - Whether shift key was pressed
   */
  announceCameraAction(action, shiftKey = false) {
    const srAnnouncer = document.getElementById('srAnnouncer');
    if (!srAnnouncer) return;

    let message = '';
    if (action === 'ArrowLeft') {
      message = shiftKey ? 'Panning left' : 'Rotating left';
    } else if (action === 'ArrowRight') {
      message = shiftKey ? 'Panning right' : 'Rotating right';
    } else if (action === 'ArrowUp') {
      message = shiftKey ? 'Panning up' : 'Rotating up';
    } else if (action === 'ArrowDown') {
      message = shiftKey ? 'Panning down' : 'Rotating down';
    } else if (action === '+' || action === '=') {
      message = 'Zooming in';
    } else if (action === '-') {
      message = 'Zooming out';
    } else {
      message = action; // For button clicks with descriptive names
    }

    srAnnouncer.textContent = message;
    setTimeout(() => {
      if (srAnnouncer.textContent === message) {
        srAnnouncer.textContent = '';
      }
    }, 1000);
  }

  /**
   * Load and display STL from ArrayBuffer
   * @param {ArrayBuffer} stlData - Binary STL data
   */
  loadSTL(stlData) {
    return new Promise((resolve, reject) => {
      try {
        console.log(
          '[Preview] Loading STL, size:',
          stlData.byteLength,
          'bytes'
        );

        // Remove any existing LOD warning
        this.hideLODWarning();

        // Remove existing mesh
        if (this.mesh) {
          this.scene.remove(this.mesh);
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
          this.mesh = null;
        }

        // Load STL
        const loader = new STLLoader();
        const geometry = loader.parse(stlData);

        const vertexCount = geometry.attributes.position.count;
        const triangleCount = vertexCount / 3;
        console.log(
          '[Preview] STL parsed, vertices:',
          vertexCount,
          'triangles:',
          triangleCount
        );

        // Store vertex count for LOD info
        this.lastVertexCount = vertexCount;
        this.lastTriangleCount = triangleCount;

        // Check for large model and show warning
        if (
          LOD_CONFIG.showWarning &&
          vertexCount > LOD_CONFIG.vertexWarningThreshold
        ) {
          const isCritical = vertexCount > LOD_CONFIG.vertexCriticalThreshold;
          this.showLODWarning(vertexCount, triangleCount, isCritical);
        }

        // Compute normals and center geometry
        geometry.computeVertexNormals();
        geometry.center();

        // Create material with theme-aware color
        const colors = PREVIEW_COLORS[this.currentTheme];
        const themeHex = `#${colors.model.toString(16).padStart(6, '0')}`;
        const appliedHex = this.colorOverride || themeHex;
        const material = new THREE.MeshPhongMaterial({
          color: parseInt(appliedHex.slice(1), 16),
          specular: 0x111111,
          shininess: 30,
          flatShading: false,
        });

        // Create mesh
        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);

        // Auto-fit camera to model
        this.fitCameraToModel();

        // Show measurements if enabled
        if (this.measurementsEnabled) {
          this.showMeasurements();
        }

        // Update screen reader model summary (WCAG 2.2)
        this.updateModelSummary();

        console.log('[Preview] STL loaded and displayed');
        resolve();
      } catch (error) {
        console.error('[Preview] Failed to load STL:', error);
        reject(error);
      }
    });
  }

  /**
   * Show LOD (Level of Detail) warning for large models
   * @param {number} vertexCount - Number of vertices
   * @param {number} triangleCount - Number of triangles
   * @param {boolean} isCritical - Whether the model is critically large
   */
  showLODWarning(vertexCount, triangleCount, isCritical = false) {
    // Remove any existing warning first
    this.hideLODWarning();

    const warningLevel = isCritical ? 'critical' : 'warning';
    const warningTitle = isCritical
      ? 'Very Large Model Detected'
      : 'Large Model Detected';
    const warningMessage = isCritical
      ? 'This model may cause your browser to become unresponsive.'
      : 'Preview performance may be affected on some devices.';

    const warningDiv = document.createElement('div');
    warningDiv.className = `lod-warning lod-warning--${warningLevel}`;
    warningDiv.id = 'lodWarning';
    warningDiv.setAttribute('role', 'alert');
    warningDiv.setAttribute('aria-live', 'polite');

    warningDiv.innerHTML = `
      <div class="lod-warning-header">
        <span class="lod-warning-icon" aria-hidden="true">${isCritical ? '🔴' : '⚠️'}</span>
        <strong class="lod-warning-title">${warningTitle}</strong>
      </div>
      <div class="lod-warning-content">
        <p class="lod-warning-message">${warningMessage}</p>
        <p class="lod-warning-stats">
          <strong>${vertexCount.toLocaleString()}</strong> vertices
          · <strong>${triangleCount.toLocaleString()}</strong> triangles
        </p>
      </div>
      <div class="lod-warning-actions">
        <button type="button" class="btn btn-sm btn-outline" id="lodWarningDismiss" aria-label="Dismiss warning">
          Got it
        </button>
      </div>
    `;

    this.container.appendChild(warningDiv);

    // Add event listener to dismiss button
    const dismissBtn = warningDiv.querySelector('#lodWarningDismiss');
    dismissBtn?.addEventListener('click', () => {
      this.hideLODWarning();
    });

    console.log(
      `[Preview] LOD warning shown: ${vertexCount} vertices (${warningLevel})`
    );
  }

  /**
   * Hide the LOD warning if visible
   */
  hideLODWarning() {
    const existingWarning = this.container?.querySelector('#lodWarning');
    if (existingWarning) {
      existingWarning.remove();
    }
  }

  /**
   * Get current LOD statistics
   * @returns {Object} LOD stats { vertexCount, triangleCount, isLarge, isCritical }
   */
  getLODStats() {
    const vertexCount = this.lastVertexCount || 0;
    const triangleCount = this.lastTriangleCount || 0;

    return {
      vertexCount,
      triangleCount,
      isLarge: vertexCount > LOD_CONFIG.vertexWarningThreshold,
      isCritical: vertexCount > LOD_CONFIG.vertexCriticalThreshold,
    };
  }

  /**
   * Fit camera to model bounds (Z-up coordinate system, OpenSCAD-style diagonal view)
   */
  fitCameraToModel() {
    if (!this.mesh) return;

    // Compute bounding box
    const box = new THREE.Box3().setFromObject(this.mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Get the max side of the bounding box
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2));

    // Add some padding
    cameraDistance *= 1.8;

    // Position camera for OpenSCAD-style diagonal view (Z-up coordinate system)
    // Camera looks from front-right-above toward the center
    // Using roughly 45° elevation and 45° azimuth for a nice isometric-like view
    const angle = Math.PI / 4; // 45 degrees
    const elevation = Math.PI / 6; // 30 degrees above XY plane

    const horizontalDist = cameraDistance * Math.cos(elevation);
    const verticalDist = cameraDistance * Math.sin(elevation);

    this.camera.position.set(
      center.x + horizontalDist * Math.cos(angle), // X: front-right
      center.y - horizontalDist * Math.sin(angle), // Y: front (negative Y in OpenSCAD view)
      center.z + verticalDist // Z: above (Z-up)
    );
    this.camera.lookAt(center);

    // Update controls target
    this.controls.target.copy(center);
    this.controls.update();

    console.log(
      '[Preview] Camera fitted to model (Z-up), size:',
      size,
      'distance:',
      cameraDistance
    );
  }

  /**
   * Calculate dimensions from the current mesh
   * @returns {Object} Dimensions { x, y, z, volume, triangles }
   */
  calculateDimensions() {
    if (!this.mesh) return null;

    const box = new THREE.Box3().setFromObject(this.mesh);
    const size = box.getSize(new THREE.Vector3());
    const volume = size.x * size.y * size.z;
    const triangles = this.mesh.geometry.index
      ? this.mesh.geometry.index.count / 3
      : this.mesh.geometry.attributes.position.count / 3;

    return {
      x: Math.round(size.x * 100) / 100, // Round to 2 decimal places
      y: Math.round(size.y * 100) / 100,
      z: Math.round(size.z * 100) / 100,
      volume: Math.round(volume * 100) / 100,
      triangles: Math.round(triangles),
    };
  }

  /**
   * Update the screen reader accessible model summary (WCAG 2.2)
   * This provides non-visual users with model dimensions
   */
  updateModelSummary() {
    const summaryEl = document.getElementById('previewModelSummary');
    if (!summaryEl) return;

    if (!this.mesh) {
      summaryEl.textContent =
        'No model loaded. Upload an OpenSCAD file and generate an STL to see the 3D preview.';
      return;
    }

    const dims = this.calculateDimensions();
    if (!dims) {
      summaryEl.textContent = '3D model loaded. Dimensions unavailable.';
      return;
    }

    // Format dimensions for screen readers in a clear, natural way
    summaryEl.textContent = `3D model preview. Dimensions: ${dims.x} millimeters wide (X), ${dims.y} millimeters deep (Y), ${dims.z} millimeters tall (Z). Contains approximately ${dims.triangles.toLocaleString()} triangles. Use arrow keys to rotate, Shift plus arrow keys to pan, and plus or minus to zoom. On-screen camera controls are also available.`;
  }

  /**
   * Pan camera and target in world space (Z-up)
   * @param {number} deltaRight - Right/left movement
   * @param {number} deltaUp - Up/down movement
   */
  panCamera(deltaRight, deltaUp) {
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 0, 1);
    this.camera.getWorldDirection(right);
    right.cross(up).normalize();

    this.controls.target.addScaledVector(right, deltaRight);
    this.controls.target.addScaledVector(up, deltaUp);
    this.camera.position.addScaledVector(right, deltaRight);
    this.camera.position.addScaledVector(up, deltaUp);
    this.controls.update();
  }

  /**
   * Rotate camera horizontally around the target (Z-up)
   * @param {number} angle - Rotation angle in radians (positive = left, negative = right)
   */
  rotateHorizontal(angle) {
    if (!this.controls) return;
    this.controls.object.position.applyAxisAngle(
      new THREE.Vector3(0, 0, 1),
      angle
    );
    this.controls.update();
  }

  /**
   * Rotate camera vertically around the target
   * @param {number} angle - Rotation angle in radians (positive = up, negative = down)
   */
  rotateVertical(angle) {
    if (!this.controls) return;
    const currentDist = this.controls.object.position.length();
    const horizontalAngle = Math.atan2(
      this.controls.object.position.y,
      this.controls.object.position.x
    );
    const verticalAngle = Math.asin(
      this.controls.object.position.z / currentDist
    );

    // Clamp to prevent flipping over the poles
    const newVerticalAngle = Math.max(
      -Math.PI / 2 + 0.01,
      Math.min(Math.PI / 2 - 0.01, verticalAngle + angle)
    );

    this.controls.object.position.x =
      currentDist * Math.cos(newVerticalAngle) * Math.cos(horizontalAngle);
    this.controls.object.position.y =
      currentDist * Math.cos(newVerticalAngle) * Math.sin(horizontalAngle);
    this.controls.object.position.z = currentDist * Math.sin(newVerticalAngle);
    this.controls.update();
  }

  /**
   * Zoom camera in or out
   * @param {number} amount - Zoom amount (positive = in, negative = out)
   */
  zoomCamera(amount) {
    if (!this.camera || !this.controls) return;
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    this.camera.position.addScaledVector(direction, amount);
    this.controls.update();
  }

  /**
   * Toggle measurement display
   * @param {boolean} enabled - Show or hide measurements
   */
  toggleMeasurements(enabled) {
    this.measurementsEnabled = enabled;
    this.saveMeasurementPreference(enabled);

    if (enabled && this.mesh) {
      this.showMeasurements();
    } else {
      this.hideMeasurements();
    }

    console.log(`[Preview] Measurements ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Show measurement overlays on the model
   */
  showMeasurements() {
    if (!this.mesh) return;

    // Remove existing measurements
    this.hideMeasurements();

    // Calculate dimensions
    this.dimensions = this.calculateDimensions();
    if (!this.dimensions) return;

    // Create group for all measurement visuals
    this.measurementHelpers = new THREE.Group();
    this.measurementHelpers.name = 'measurements';

    // Get bounding box
    const box = new THREE.Box3().setFromObject(this.mesh);
    const min = box.min;
    const max = box.max;

    // Choose color based on theme
    const lineColor = this.currentTheme.includes('dark') ? 0xff6b6b : 0xff0000;

    // Create bounding box edges
    const boxHelper = new THREE.BoxHelper(this.mesh, lineColor);
    boxHelper.material.linewidth = this.highContrast ? 3 : 2;
    this.measurementHelpers.add(boxHelper);

    // Add dimension lines and labels (we'll render text as sprites)
    this.addDimensionLine(
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(max.x, min.y, min.z),
      `${this.dimensions.x} mm`,
      'X',
      lineColor
    );

    this.addDimensionLine(
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(min.x, max.y, min.z),
      `${this.dimensions.y} mm`,
      'Y',
      lineColor
    );

    this.addDimensionLine(
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(min.x, min.y, max.z),
      `${this.dimensions.z} mm`,
      'Z',
      lineColor
    );

    this.scene.add(this.measurementHelpers);
    console.log('[Preview] Measurements displayed:', this.dimensions);
  }

  /**
   * Add a dimension line with label
   * @param {THREE.Vector3} start - Start point
   * @param {THREE.Vector3} end - End point
   * @param {string} label - Dimension label
   * @param {string} axis - Axis name (X, Y, Z)
   * @param {number} color - Line color
   */
  addDimensionLine(start, end, label, axis, color) {
    // Create line geometry
    const points = [start, end];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: color,
      linewidth: this.highContrast ? 3 : 2,
    });
    const line = new THREE.Line(geometry, material);
    this.measurementHelpers.add(line);

    // Create text sprite for label
    const midpoint = new THREE.Vector3().lerpVectors(start, end, 0.5);
    const sprite = this.createTextSprite(label, color);

    // Offset sprite slightly from the line
    const offset = 5;
    if (axis === 'X') midpoint.y -= offset;
    if (axis === 'Y') midpoint.x -= offset;
    if (axis === 'Z') midpoint.x -= offset;

    sprite.position.copy(midpoint);
    this.measurementHelpers.add(sprite);
  }

  /**
   * Create a text sprite for dimension labels
   * @param {string} text - Text content
   * @param {number} _color - Text color (unused, determined by theme)
   * @returns {THREE.Sprite} Text sprite
   */
  createTextSprite(text, _color) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSize = this.highContrast ? 48 : 32;

    // Set canvas size
    canvas.width = 256;
    canvas.height = 64;

    // Configure text rendering
    context.font = `bold ${fontSize}px Arial`;
    context.fillStyle = this.currentTheme.includes('dark')
      ? '#ffffff'
      : '#000000';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Draw background for better visibility
    const bgColor = this.currentTheme.includes('dark')
      ? 'rgba(0, 0, 0, 0.8)'
      : 'rgba(255, 255, 255, 0.8)';
    context.fillStyle = bgColor;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw text
    context.fillStyle = this.currentTheme.includes('dark')
      ? '#ffffff'
      : '#000000';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Create sprite
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(20, 5, 1);

    return sprite;
  }

  /**
   * Hide measurement overlays
   */
  hideMeasurements() {
    if (this.measurementHelpers) {
      // Dispose of geometries and materials
      this.measurementHelpers.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });

      this.scene.remove(this.measurementHelpers);
      this.measurementHelpers = null;
    }
  }

  /**
   * Load measurement preference from localStorage
   * @returns {boolean} Preference value
   */
  loadMeasurementPreference() {
    try {
      const pref = localStorage.getItem('openscad-customizer-measurements');
      return pref === 'true';
    } catch (error) {
      console.warn('[Preview] Could not load measurement preference:', error);
      return false;
    }
  }

  /**
   * Save measurement preference to localStorage
   * @param {boolean} enabled - Measurement enabled state
   */
  saveMeasurementPreference(enabled) {
    try {
      localStorage.setItem(
        'openscad-customizer-measurements',
        enabled ? 'true' : 'false'
      );
    } catch (error) {
      console.warn('[Preview] Could not save measurement preference:', error);
    }
  }

  /**
   * Toggle grid visibility
   * @param {boolean} enabled - Show or hide grid
   */
  toggleGrid(enabled) {
    this.gridEnabled = enabled;
    this.saveGridPreference(enabled);

    if (this.gridHelper) {
      this.gridHelper.visible = enabled;
    }

    console.log(`[Preview] Grid ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Load grid preference from localStorage
   * @returns {boolean} Preference value (defaults to true)
   */
  loadGridPreference() {
    try {
      const pref = localStorage.getItem('openscad-customizer-grid');
      // Default to true (grid visible) if not set
      return pref === null ? true : pref === 'true';
    } catch (error) {
      console.warn('[Preview] Could not load grid preference:', error);
      return true;
    }
  }

  /**
   * Save grid preference to localStorage
   * @param {boolean} enabled - Grid enabled state
   */
  saveGridPreference(enabled) {
    try {
      localStorage.setItem(
        'openscad-customizer-grid',
        enabled ? 'true' : 'false'
      );
    } catch (error) {
      console.warn('[Preview] Could not save grid preference:', error);
    }
  }

  /**
   * Clear the preview
   */
  clear() {
    this.hideMeasurements();
    this.dimensions = null;

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    this.renderer.render(this.scene, this.camera);

    // Update screen reader model summary (WCAG 2.2)
    this.updateModelSummary();
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.handleResize) {
      window.removeEventListener('resize', this.handleResize);
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Clean up keyboard controls
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }

    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    this.container.innerHTML = '';

    console.log('[Preview] Resources disposed');
  }
}
