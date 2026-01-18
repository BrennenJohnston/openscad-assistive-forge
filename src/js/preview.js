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
      center.x + horizontalDist * Math.cos(angle),  // X: front-right
      center.y - horizontalDist * Math.sin(angle),  // Y: front (negative Y in OpenSCAD view)
      center.z + verticalDist                        // Z: above (Z-up)
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
