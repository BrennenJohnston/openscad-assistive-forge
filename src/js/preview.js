/**
 * 3D Preview using Three.js (Lazy Loaded for Performance)
 * @license GPL-3.0-or-later
 */

import {
  AmbientLight,
  AxesHelper,
  Box3,
  BoxHelper,
  BufferGeometry,
  CanvasTexture,
  Color,
  ColorManagement,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { normalizeHexColor } from './color-utils.js';
import {
  announceCameraAction as announceCamera,
  announceImmediate,
} from './announcer.js';
import { getAppPrefKey } from './storage-keys.js';

// Disable Three.js color management to match desktop OpenSCAD's
// non-linear-aware OpenGL pipeline. OpenSCAD passes sRGB colors
// directly through lighting without linearization or gamma correction.
ColorManagement.enabled = false;

// Storage keys using standardized naming convention
const STORAGE_KEY_MEASUREMENTS = getAppPrefKey('measurements');
const STORAGE_KEY_GRID = getAppPrefKey('grid');
const STORAGE_KEY_GRID_SIZE = getAppPrefKey('grid-size');
const STORAGE_KEY_CUSTOM_GRID_PRESETS = getAppPrefKey('custom-grid-presets');
const STORAGE_KEY_GRID_COLOR = getAppPrefKey('grid-color');
const STORAGE_KEY_GRID_OPACITY = getAppPrefKey('grid-opacity');
const STORAGE_KEY_AUTO_BED = getAppPrefKey('auto-bed');
const STORAGE_KEY_CAMERA_COLLAPSED = getAppPrefKey('camera-controls-collapsed');
const STORAGE_KEY_CAMERA_POSITION = getAppPrefKey('camera-controls-position');
const STORAGE_KEY_LOD_WARNING_DISMISSED = getAppPrefKey(
  'lod-warning-dismissed'
);

/** Default grid config — 220×220mm matches popular mid-range FDM printers (Creality K1C, FlashForge Adventurer 5M Pro) */
const DEFAULT_GRID_CONFIG = { widthMm: 220, heightMm: 220 };

export function isThreeJsLoaded() {
  return true;
}

/**
 * @returns {object} Object containing Three.js classes for external consumers
 *                   (e.g. display-options-controller).
 */
export function getThreeModule() {
  return {
    AxesHelper,
    Box3,
    BoxHelper,
    BufferGeometry,
    EdgesGeometry,
    Float32BufferAttribute,
    Group,
    Line,
    LineBasicMaterial,
    LineSegments,
    Vector3,
  };
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
  // Green phosphor (dark theme mono variant)
  mono: {
    background: 0x000000,
    gridPrimary: 0x00ff00,
    gridSecondary: 0x00aa00,
    model: 0x00ff00,
    ambientLight: 0x00ff00,
  },
  // Amber phosphor (light theme mono variant)
  'mono-light': {
    background: 0x000000,
    gridPrimary: 0xffb000,
    gridSecondary: 0xcc8c00,
    model: 0xffb000,
    ambientLight: 0xffb000,
  },
  // Green phosphor high-contrast (wider grid contrast ratio)
  'mono-hc': {
    background: 0x000000,
    gridPrimary: 0x00ff00,
    gridSecondary: 0x003300,
    model: 0x33ff33,
    ambientLight: 0x00ff00,
  },
  // Amber phosphor high-contrast (wider grid contrast ratio)
  'mono-light-hc': {
    background: 0x000000,
    gridPrimary: 0xffb000,
    gridSecondary: 0x4d3500,
    model: 0xffc233,
    ambientLight: 0xffb000,
  },
};

// RENDER_STATE_COLORS was removed: it applied fabricated amber/red tints
// that do not correspond to any desktop OpenSCAD behavior. Desktop OpenSCAD
// uses the same colorscheme colors for both F5 preview and F6 render — it
// does NOT tint models differently based on render quality or laser mode.
// Model color is now: colorOverride (SCAD-derived) > PREVIEW_COLORS[theme].model.

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
    this.colorOverrideEnabled = false;
    this.appearanceOverrideEnabled = false;

    // Measurements
    this.measurementsEnabled = this.loadMeasurementPreference();
    this.measurementHelpers = null; // Group containing all measurement visuals
    this.dimensions = null; // { x, y, z, volume }

    // Grid visibility
    this.gridEnabled = this.loadGridPreference();

    // Grid size (mm) — configurable to match printer bed
    this.gridConfig = this.loadGridSizePreference();

    // Custom grid color override (null = use theme default)
    this.gridColorOverride = this.loadGridColorPreference();

    // Grid line opacity (10–100, default 100 = fully opaque)
    this.gridOpacity = this.loadGridOpacityPreference();

    // Camera projection mode (perspective or orthographic)
    this.projectionMode = 'perspective';
    this.orthoCamera = null; // Lazy-created orthographic camera

    // Auto-bed: place object on Z=0 build plate
    this.autoBedEnabled = this.loadAutoBedPreference();

    // Rotation centering: temporarily center object at origin for better rotation
    this.autoBedOffset = 0; // Z offset applied by auto-bed
    this.rotationCenteringEnabled = false; // Whether rotation centering is active

    // 2D preview mode (native SVG display vs Three.js 3D canvas)
    this._is2DPreviewActive = false;

    // Render hooks for extensibility
    this._renderOverride = null;
    this._resizeHook = null;
    this._postLoadHook = null; // Called after STL is loaded

    // Reference overlay (screenshot/SVG image plane under the model)
    this.referenceOverlay = null; // THREE.Mesh for the overlay plane
    this.referenceTexture = null; // THREE.Texture for the image
    this.overlayConfig = {
      enabled: false,
      opacity: 1.0,
      offsetX: 0, // mm
      offsetY: 0, // mm
      rotationDeg: 0,
      width: 200, // mm (default; replaced by SVG physical size or explicit sizing)
      height: 150, // mm
      zPosition: -0.25, // Slightly below Z=0 build plate (avoid z-fighting with grid)
      lockAspect: true,
      intrinsicAspect: null, // Width/height ratio from source image
      sourceFileName: null, // Name of the file used as overlay source
      svgColor: null, // Recolor SVG strokes/fills (null = original colors)
    };

    // Overlay measurements (dimension lines on the overlay)
    this.overlayMeasurementsEnabled = false;
    this.overlayMeasurementHelpers = null; // Group containing overlay measurement visuals

    // Resize state tracking for view preservation
    this._lastAspect = null; // Previous aspect ratio for comparison
    this._lastContainerWidth = 0; // Track container dimensions
    this._lastContainerHeight = 0;
    this._resizeDebounceId = null; // Debounce timer for resize handling

    // Configuration for resize behavior
    this._resizeConfig = {
      // Threshold for "significant" aspect ratio change (0.15 = 15%)
      aspectChangeThreshold: 0.15,
      // Debounce delay for resize stabilization (ms)
      debounceDelay: 100,
      // Whether to adjust camera distance on aspect changes
      adjustCameraOnResize: true,
    };
  }

  /**
   * Initialize Three.js scene
   * @returns {Promise<void>}
   */
  async init() {
    // Clear container (preserving/recreating #rendered2dPreview for 2D SVG display)
    this.container.innerHTML = '';

    // Recreate the 2D SVG preview surface that init() just destroyed
    if (!document.getElementById('rendered2dPreview')) {
      const preview2d = document.createElement('div');
      preview2d.id = 'rendered2dPreview';
      preview2d.className = 'rendered-2d-preview hidden';
      preview2d.setAttribute('role', 'img');
      preview2d.setAttribute('aria-label', 'Rendered 2D SVG preview');
      this.container.appendChild(preview2d);
    }

    // Detect initial theme
    this.currentTheme = this.detectTheme();
    const colors = PREVIEW_COLORS[this.currentTheme];

    // Create scene
    this.scene = new Scene();
    this.scene.background = new Color(colors.background);

    // Create camera with OpenSCAD-compatible Z-up coordinate system
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera = new PerspectiveCamera(45, width / height, 0.1, 10000);

    // Initialize resize tracking state
    this._lastAspect = width / height;
    this._lastContainerWidth = width;
    this._lastContainerHeight = height;

    // Set Z as the up axis (OpenSCAD uses Z-up, Three.js defaults to Y-up)
    this.camera.up.set(0, 0, 1);

    // Position camera for OpenSCAD-style diagonal view (looking at origin from front-right-above)
    // This mimics OpenSCAD's default "Diagonal" view orientation
    this.camera.position.set(150, -150, 100);

    // Create renderer — WebGL may be unavailable in headless browsers.
    // When that happens, geometry parsing (loadOFF / loadSTL) still works;
    // only the visual canvas is disabled.
    try {
      this.renderer = new WebGLRenderer({ antialias: true });
      this.renderer.outputColorSpace = LinearSRGBColorSpace;
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.container.appendChild(this.renderer.domElement);
      this.renderer.domElement.setAttribute('tabindex', '0');
      this.renderer.domElement.setAttribute('aria-label', '3D preview canvas');
      this.renderer.domElement.addEventListener('click', () => {
        this.renderer.domElement.focus();
      });
    } catch (webglError) {
      console.warn(
        '[Preview] WebGL renderer unavailable — 3D canvas disabled:',
        webglError.message
      );
      this.renderer = null;
    }

    // Lighting matched to desktop OpenSCAD's GLView::setupLight().
    // OpenSCAD sets light positions AFTER the camera (modelview) transform,
    // so they are in view space — they move with the camera like headlights.
    // We replicate this by parenting directional lights to the camera.
    //
    // Three.js MeshPhongMaterial uses BRDF_Lambert which divides diffuse by π.
    // OpenSCAD's OpenGL pipeline has no such divisor (simple color * NdotL).
    // All intensities are scaled by π to cancel the BRDF divisor and match
    // desktop brightness: ambient 0.2*π ≈ 0.628, directional 1.0*π ≈ 3.14.
    const piAmbient = 0.2 * Math.PI;
    const piDirectional = 1.0 * Math.PI;

    this.ambientLight = new AmbientLight(colors.ambientLight, piAmbient);
    this.scene.add(this.ambientLight);

    // Camera must be in the scene graph for child lights to render
    this.scene.add(this.camera);

    this.directionalLight1 = new DirectionalLight(
      0xffffff,
      piDirectional
    );
    this.directionalLight1.position.set(-1, 1, 1);
    this.camera.add(this.directionalLight1);
    this.camera.add(this.directionalLight1.target);

    this.directionalLight2 = new DirectionalLight(
      0xffffff,
      piDirectional
    );
    this.directionalLight2.position.set(1, -1, 1);
    this.camera.add(this.directionalLight2);
    this.camera.add(this.directionalLight2.target);

    // Store base intensities for brightness/contrast controls
    this.baseLightIntensities = {
      ambient: piAmbient,
      dir1: piDirectional,
      dir2: piDirectional,
    };
    this._brightnessScale = 1;
    this._contrastFactor = 1;

    // Add grid helper on XY plane (OpenSCAD's ground plane)
    // GridHelper by default creates a grid on XZ plane (Y-up), so we rotate it for Z-up
    const gridColors = this._resolveGridColors();
    this.gridHelper = this._createGridHelper(gridColors);
    // Rotate grid from XZ plane to XY plane (Z-up coordinate system)
    this.gridHelper.rotation.x = Math.PI / 2;
    // Apply saved grid visibility preference
    this.gridHelper.visible = this.gridEnabled;
    this._applyGridOpacity();
    this.scene.add(this.gridHelper);

    // Add orbit controls (OpenSCAD-style) — requires a renderer DOM element
    if (this.renderer) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.screenSpacePanning = true;
      this.controls.minDistance = 10;
      this.controls.maxDistance = 1000;

      this.setupKeyboardControls();
      this.setupCameraControls();
    }

    // Handle window resize with view preservation
    this.handleResize = () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;

      // Skip if dimensions are invalid or unchanged
      if (width <= 0 || height <= 0) return;
      if (
        width === this._lastContainerWidth &&
        height === this._lastContainerHeight
      ) {
        return;
      }

      const newAspect = width / height;
      const previousAspect = this._lastAspect || newAspect;

      // Update perspective camera aspect (always kept current for projection toggling)
      this.camera.aspect = newAspect;
      this.camera.updateProjectionMatrix();

      // Update orthographic camera frustum if it exists
      if (this.orthoCamera) {
        const frustumHeight =
          (this.orthoCamera.top - this.orthoCamera.bottom) /
          (this.orthoCamera.zoom || 1);
        this.orthoCamera.left = (frustumHeight * newAspect) / -2;
        this.orthoCamera.right = (frustumHeight * newAspect) / 2;
        this.orthoCamera.updateProjectionMatrix();
      }

      if (this.renderer) this.renderer.setSize(width, height);

      // Adjust camera to maintain model's relative position when aspect changes significantly
      if (
        this.mesh &&
        this._resizeConfig.adjustCameraOnResize &&
        this._lastAspect !== null
      ) {
        const aspectRatioChange =
          Math.abs(newAspect - previousAspect) / previousAspect;

        // Only adjust for significant changes (configurable threshold)
        if (aspectRatioChange > this._resizeConfig.aspectChangeThreshold) {
          this._adjustCameraForAspectChange(previousAspect, newAspect);
        }
      }

      // Store current state for next comparison
      this._lastAspect = newAspect;
      this._lastContainerWidth = width;
      this._lastContainerHeight = height;

      // Call resize hook if set (for alternate renderers)
      this._resizeHook?.({ width, height });
    };

    // Debounced resize handler for smoother performance
    this._debouncedResize = () => {
      if (this._resizeDebounceId) {
        cancelAnimationFrame(this._resizeDebounceId);
      }
      this._resizeDebounceId = requestAnimationFrame(() => {
        this.handleResize();
        this._resizeDebounceId = null;
      });
    };

    window.addEventListener('resize', this._debouncedResize);

    // Add ResizeObserver for container size changes (e.g., split panel resize)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this._debouncedResize();
      });
      this.resizeObserver.observe(this.container);
    }

    // Start animation loop
    this.animate();

    const rendererStatus = this.renderer ? 'WebGL' : 'no-renderer (headless)';
    console.log(
      `[Preview] Three.js scene initialized (theme: ${this.currentTheme}, renderer: ${rendererStatus})`
    );
  }

  /**
   * Detect current theme from document
   * @returns {string} 'light' | 'dark' | 'light-hc' | 'dark-hc' | 'mono' | 'mono-light' | 'mono-hc' | 'mono-light-hc'
   */
  detectTheme() {
    const root = document.documentElement;
    const highContrast = root.getAttribute('data-high-contrast') === 'true';
    const dataTheme = root.getAttribute('data-theme');

    // Check for variant override (takes precedence)
    const uiVariant = root.getAttribute('data-ui-variant');
    if (uiVariant === 'mono') {
      let base;
      if (dataTheme === 'light') {
        base = 'mono-light';
      } else if (dataTheme === 'dark') {
        base = 'mono';
      } else {
        base = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'mono'
          : 'mono-light';
      }
      return highContrast ? `${base}-hc` : base;
    }

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

    // Update grid colors (custom override takes precedence over theme)
    if (this.gridHelper) {
      this._rebuildGrid();
    }

    // Keep mesh materials aligned with the current override/theme rules.
    if (this.mesh) {
      this._syncColorOverride();
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
    if (this.colorOverrideEnabled) {
      this.applyColorToMesh();
    }
  }

  /**
   * Enable or disable the color override. When disabled, COFF per-face
   * vertex colors display naturally; when enabled, the user's solid color
   * is forced onto the mesh by turning off Three.js vertex coloring.
   * @param {boolean} enabled
   */
  setColorOverrideEnabled(enabled) {
    this.colorOverrideEnabled = enabled;
    this._syncColorOverride();
  }

  /**
   * Synchronise mesh material state with the current colorOverrideEnabled
   * flag. Toggles vertex coloring on/off to switch between COFF per-face
   * colors and a solid user-chosen color without re-rendering geometry.
   */
  _syncColorOverride() {
    if (!this.mesh) return;

    const applyToMaterial = (material, geometry) => {
      if (this.colorOverrideEnabled && this.colorOverride) {
        material.vertexColors = false;
        material.color.setHex(parseInt(this.colorOverride.slice(1), 16));
        material.needsUpdate = true;
      } else {
        const hasVertexColors = geometry?.attributes?.color != null;
        if (hasVertexColors) {
          material.vertexColors = true;
          material.color.setHex(0xffffff);
          material.needsUpdate = true;
        } else {
          material.vertexColors = false;
          const themeColors =
            PREVIEW_COLORS[this.currentTheme] || PREVIEW_COLORS.light;
          material.color.setHex(themeColors.model);
          material.needsUpdate = true;
        }
      }
    };

    if (this.mesh.isGroup) {
      this.mesh.children.forEach((child) => {
        if (child.material && !child.userData.isHighlightOverlay) {
          applyToMaterial(child.material, child.geometry);
        }
      });
    } else if (this.mesh.material) {
      applyToMaterial(this.mesh.material, this.mesh.geometry);
    }
  }

  /**
   * Set the current render state. Retained for API compatibility.
   * Previously applied fabricated amber/red tints; now a no-op since
   * model color is determined by COFF per-face data or the theme default.
   * @param {'preview'|'laser'|null} _state
   */
  setRenderState(_state) {}

  /**
   * Resolve the model color to apply, respecting the priority chain:
   *   1. colorOverride (user manual pick or SCAD-derived) — only when enabled
   *   2. PREVIEW_COLORS[theme].model (theme default)
   *
   * @returns {string} 6-digit hex color string with leading '#'
   */
  _resolveModelColor() {
    if (this.colorOverrideEnabled && this.colorOverride)
      return this.colorOverride;

    const themeColors =
      PREVIEW_COLORS[this.currentTheme] || PREVIEW_COLORS.light;
    return `#${themeColors.model.toString(16).padStart(6, '0')}`;
  }

  /**
   * Apply the current color (override or theme default) to the mesh.
   * Safe to call even if mesh doesn't exist yet.
   */
  applyColorToMesh() {
    if (!this.mesh) return;
    if (!this.colorOverrideEnabled) return;

    const appliedHex = this._resolveModelColor();
    const hex = parseInt(appliedHex.slice(1), 16);
    if (this.mesh.isGroup) {
      this.mesh.children.forEach((child) => {
        if (child.material && !child.userData.isHighlightOverlay) {
          child.material.vertexColors = false;
          child.material.color.setHex(hex);
          child.material.needsUpdate = true;
        }
      });
    } else if (this.mesh.material) {
      this.mesh.material.vertexColors = false;
      this.mesh.material.color.setHex(hex);
      this.mesh.material.needsUpdate = true;
    }
  }

  /**
   * Dispose geometry and material for this.mesh, handling both
   * single Mesh and Group (dual-render) cases.
   */
  _disposeMeshResources() {
    if (!this.mesh) return;
    if (this.mesh.isGroup) {
      this.mesh.children.forEach((child) => {
        child.geometry?.dispose();
        child.material?.dispose();
      });
    } else {
      this.mesh.geometry?.dispose();
      this.mesh.material?.dispose();
    }
  }

  /**
   * Return the BufferGeometry used for stats/dimensions.
   * For a Group (dual-render) returns the first child's geometry.
   */
  _getPrimaryGeometry() {
    if (!this.mesh) return null;
    if (this.mesh.isGroup) {
      return this.mesh.children[0]?.geometry ?? null;
    }
    return this.mesh.geometry ?? null;
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    if (this.controls) this.controls.update();
    if (!this.renderer) return;
    if (this._renderOverride) {
      this._renderOverride();
    } else {
      this.renderer.render(this.scene, this.getActiveCamera());
    }
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
        document.activeElement !== this.renderer?.domElement
      ) {
        return;
      }

      let handled = false;

      // Rotation (arrow keys without modifiers)
      // Delegates to shared rotateHorizontal/rotateVertical which correctly
      // orbit around controls.target (not the world origin).
      if (
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        switch (event.key) {
          case 'ArrowLeft':
            this.rotateHorizontal(rotationSpeed);
            handled = true;
            break;
          case 'ArrowRight':
            this.rotateHorizontal(-rotationSpeed);
            handled = true;
            break;
          case 'ArrowUp':
            this.rotateVertical(rotationSpeed);
            handled = true;
            break;
          case 'ArrowDown':
            this.rotateVertical(-rotationSpeed);
            handled = true;
            break;
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
      // Delegates to shared zoomCamera() which handles both perspective and orthographic.
      if (event.key === '+' || event.key === '=' || event.key === '-') {
        const zoomAmount = (event.key === '-' ? -1 : 1) * zoomSpeed;
        this.zoomCamera(zoomAmount);
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
   * Note: On desktop (>= 768px), the camera panel drawer handles controls.
   * On mobile, the camera drawer in the actions bar handles controls.
   * Floating controls are only created as a fallback if neither exists.
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

    // Check if the mobile camera drawer exists (mobile view)
    // If it does, skip creating floating controls
    const mobileCameraDrawer = document.getElementById('cameraDrawer');
    if (mobileCameraDrawer && window.innerWidth < 768) {
      console.log(
        '[Preview] Mobile camera drawer exists - skipping floating controls'
      );
      return;
    }

    // Create control panel (for mobile or when drawer doesn't exist)
    const controlPanel = document.createElement('div');
    controlPanel.className = 'camera-controls';
    controlPanel.setAttribute('role', 'group');
    controlPanel.setAttribute('aria-label', 'Camera controls');

    // Persisted preferences: collapsed + position (keyboard-accessible “move”)
    const isCollapsed =
      localStorage.getItem(STORAGE_KEY_CAMERA_COLLAPSED) === 'true';
    const position =
      localStorage.getItem(STORAGE_KEY_CAMERA_POSITION) || 'bottom-right'; // bottom-right | bottom-left | top-right | top-left
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
      localStorage.setItem(
        STORAGE_KEY_CAMERA_COLLAPSED,
        nextCollapsed ? 'true' : 'false'
      );
    };

    const positions = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
    const cyclePosition = () => {
      const current = controlPanel.dataset.position || 'bottom-right';
      const idx = positions.indexOf(current);
      const next = positions[(idx + 1 + positions.length) % positions.length];
      controlPanel.dataset.position = next;
      localStorage.setItem(STORAGE_KEY_CAMERA_POSITION, next);
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

    // Rotation buttons — delegate to shared methods that correctly
    // orbit around controls.target and work with both camera types.
    document
      .getElementById('cameraRotateLeft')
      ?.addEventListener('click', () => {
        this.rotateHorizontal(rotationSpeed);
        this.announceCameraAction('Rotate left');
      });

    document
      .getElementById('cameraRotateRight')
      ?.addEventListener('click', () => {
        this.rotateHorizontal(-rotationSpeed);
        this.announceCameraAction('Rotate right');
      });

    document.getElementById('cameraRotateUp')?.addEventListener('click', () => {
      this.rotateVertical(rotationSpeed);
      this.announceCameraAction('Rotate up');
    });

    document
      .getElementById('cameraRotateDown')
      ?.addEventListener('click', () => {
        this.rotateVertical(-rotationSpeed);
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

    // Zoom buttons — delegate to shared zoomCamera() which handles
    // both perspective (translate) and orthographic (adjust zoom property).
    document.getElementById('cameraZoomIn')?.addEventListener('click', () => {
      this.zoomCamera(zoomSpeed);
      this.announceCameraAction('Zoom in');
    });

    document.getElementById('cameraZoomOut')?.addEventListener('click', () => {
      this.zoomCamera(-zoomSpeed);
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

    // Standard view buttons for consistent viewing angles
    const viewButtons = document.querySelectorAll('.camera-view-btn');
    viewButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const viewName = btn.dataset.view;
        if (viewName) {
          this.setCameraView(viewName);
        }
      });
    });
  }

  /**
   * Announce camera actions to screen readers
   * Uses centralized announcer for consistent behavior
   * @param {string} action - Action description or key pressed
   * @param {boolean} shiftKey - Whether shift key was pressed
   */
  announceCameraAction(action, shiftKey = false) {
    // Delegate to centralized announcer which handles message formatting
    announceCamera(action, { shiftKey });
  }

  /**
   * Load and display STL from ArrayBuffer
   * @param {ArrayBuffer} stlData - Binary STL data
   * @param {Object} [options] - Load options
   * @param {boolean} [options.preserveCamera=false] - If true, preserve current camera position instead of auto-fitting
   * @returns {Promise<{parseMs: number}>} Parse timing info
   */
  loadSTL(stlData, options = {}) {
    this.hide2DPreview();
    const { preserveCamera = false } = options;
    return new Promise((resolve, reject) => {
      try {
        const parseStartTime = performance.now();

        console.log(
          '[Preview] Loading STL, size:',
          stlData.byteLength,
          'bytes'
        );

        this.hideLODWarning();

        if (this.mesh) {
          this.scene.remove(this.mesh);
          this._disposeMeshResources();
          this.mesh = null;
        }

        const loader = new STLLoader();
        const geometry = loader.parse(stlData);

        const vertexCount = geometry.attributes.position
          ? geometry.attributes.position.count
          : 0;
        const triangleCount = vertexCount / 3;
        const parseMs = Math.round(performance.now() - parseStartTime);
        console.log(
          `[Preview] STL parsed in ${parseMs}ms, vertices:`,
          vertexCount,
          'triangles:',
          triangleCount
        );

        if (vertexCount === 0) {
          console.warn('[Preview] Empty STL — no geometry produced');
          this.clear();
          resolve({ parseMs, empty: true });
          return;
        }

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

        // Apply auto-bed if enabled (place object on Z=0 build plate)
        if (this.autoBedEnabled) {
          this.applyAutoBed(geometry);
        }

        // Create material using render-state-aware color resolution
        const material = new MeshPhongMaterial({
          color: parseInt(this._resolveModelColor().slice(1), 16),
          specular: 0x000000,
          shininess: 30,
          flatShading: false,
        });

        this.mesh = new Mesh(geometry, material);
        this.scene.add(this.mesh);

        if (this.colorOverrideEnabled && this.colorOverride) {
          this.applyColorToMesh();
        }

        // Reset rotation centering state (new mesh needs fresh application)
        this.rotationCenteringEnabled = false;

        // Auto-fit camera to model (unless preserveCamera is set)
        if (!preserveCamera) {
          this.fitCameraToModel();
        }

        // Call post-load hook (e.g., for re-applying rotation centering)
        if (this._postLoadHook) {
          this._postLoadHook();
        }

        if (this.measurementsEnabled) {
          this.showMeasurements();
        }

        // Update screen reader model summary (WCAG 2.2)
        this.updateModelSummary();

        console.log('[Preview] STL loaded and displayed');
        resolve({ parseMs });
      } catch (error) {
        console.error('[Preview] Failed to load STL:', error);
        reject(error);
      }
    });
  }

  /**
   * Load and display a model from OFF or COFF (Color OFF) text data.
   *
   * OFF format:
   *   OFF
   *   numVertices numFaces 0
   *   x y z          ← one line per vertex
   *   3 v0 v1 v2     ← per face: vertex count + indices
   *
   * COFF (Color OFF) — OpenSCAD color() passthrough:
   *   COFF
   *   numVertices numFaces 0
   *   x y z
   *   3 v0 v1 v2 r g b a   ← r/g/b/a are floats 0–1
   *
   * If no color data is present (plain OFF), the preview falls back to the
   * standard theme/override color exactly like loadSTL().
   *
   * @param {ArrayBuffer|string} offData - OFF/COFF file content (text or ArrayBuffer)
   * @param {Object} [options]
   * @param {boolean} [options.preserveCamera=false]
   * @param {Object|null} [options.debugHighlight=null] Desktop `#` modifier override.
   *   When set, COFF face colors are replaced with the fixed highlight color
   *   to match desktop OpenSCAD behavior: `{255,81,81,128}` overrides `color()`.
   * @param {string} options.debugHighlight.hex  Highlight hex color (#RRGGBB)
   * @param {number} options.debugHighlight.opacity Highlight opacity (0–1)
   * @returns {Promise<{parseMs: number, hasColors: boolean}>}
   */
  loadOFF(offData, options = {}) {
    this.hide2DPreview();
    const { preserveCamera = false, debugHighlight = null } = options;
    return new Promise((resolve, reject) => {
      try {
        const parseStartTime = performance.now();

        const text =
          typeof offData === 'string'
            ? offData
            : new TextDecoder().decode(offData);

        const lines = text
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && !l.startsWith('#'));

        if (lines.length === 0) {
          throw new Error('OFF data is empty');
        }

        const firstLine = lines[0].toUpperCase();
        const isCOFF = firstLine.startsWith('COFF');
        const isOFF = firstLine.startsWith('OFF');
        if (!isOFF && !isCOFF) {
          throw new Error(`Not a valid OFF file (header: "${lines[0]}")`);
        }

        // OFF/COFF format allows counts on the header line ("OFF 100 200 0")
        // or on a separate second line. Detect which format we have.
        const headerParts = lines[0].split(/\s+/);
        let countLineIdx;
        if (headerParts.length >= 3 && !isNaN(Number(headerParts[1]))) {
          countLineIdx = 0;
        } else {
          countLineIdx = 1;
        }
        const countParts =
          countLineIdx === 0
            ? headerParts.slice(1)
            : lines[countLineIdx].split(/\s+/);
        const numVerts = Number(countParts[0]);
        const numFaces = Number(countParts[1]);
        const dataStartLine = countLineIdx + 1;
        console.log(
          `[Preview] Loading ${isCOFF ? 'COFF' : 'OFF'} — ${numVerts} verts, ${numFaces} faces`
        );

        // Parse vertices
        const vertices = [];
        for (let i = 0; i < numVerts; i++) {
          const [x, y, z] = lines[dataStartLine + i].split(/\s+/).map(Number);
          vertices.push(x, y, z);
        }

        // Parse faces + detect colors.
        // OpenSCAD export_off.cc writes colors inline after face vertex indices
        // with an "OFF" header (not "COFF"). Colors are integer 0-255 values.
        // COFF files from other tools use float 0-1 values. We auto-detect.
        const positions = [];
        const colors = [];
        const rawColors = [];
        let hasColors = false;
        let colorScale = 1;
        let rawColorMax = 0;

        const faceStart = dataStartLine + numVerts;
        for (let i = 0; i < numFaces; i++) {
          const parts = lines[faceStart + i].split(/\s+/).map(Number);
          const n = parts[0]; // vertex count for this face
          if (n < 3) continue;

          // RGB only — per-face alpha (parts[n+4]) intentionally not read;
          // transparency is controlled via debugHighlight overlay material.
          const hasInlineColor = parts.length >= n + 4;

          // Fan-triangulate the face
          const v0 = parts[1];
          for (let t = 1; t < n - 1; t++) {
            const va = parts[1 + t];
            const vb = parts[1 + t + 1];
            positions.push(
              vertices[v0 * 3],
              vertices[v0 * 3 + 1],
              vertices[v0 * 3 + 2],
              vertices[va * 3],
              vertices[va * 3 + 1],
              vertices[va * 3 + 2],
              vertices[vb * 3],
              vertices[vb * 3 + 1],
              vertices[vb * 3 + 2]
            );
            if (hasInlineColor) {
              const rawR = parts[n + 1];
              const rawG = parts[n + 2];
              const rawB = parts[n + 3];
              rawColorMax = Math.max(rawColorMax, rawR, rawG, rawB);
              rawColors.push(
                rawR,
                rawG,
                rawB,
                rawR,
                rawG,
                rawB,
                rawR,
                rawG,
                rawB
              );
              hasColors = true;
            }
          }
        }
        if (hasColors && rawColors.length > 0) {
          // Use global max across all inline colors to avoid first-face-black misdetection.
          colorScale = rawColorMax > 1 ? 1 / 255 : 1;
          for (let i = 0; i < rawColors.length; i += 3) {
            const r = rawColors[i] * colorScale;
            const g = rawColors[i + 1] * colorScale;
            const b = rawColors[i + 2] * colorScale;
            colors.push(r, g, b);
          }
        }

        if (positions.length === 0) {
          console.warn('[Preview] OFF has no triangulated geometry');
          this.clear();
          resolve({
            parseMs: Math.round(performance.now() - parseStartTime),
            hasColors: false,
          });
          return;
        }

        const geometry = new BufferGeometry();
        geometry.setAttribute(
          'position',
          new Float32BufferAttribute(positions, 3)
        );
        if (hasColors && colors.length === positions.length) {
          geometry.setAttribute(
            'color',
            new Float32BufferAttribute(colors, 3)
          );
        }
        geometry.computeVertexNormals();
        geometry.center();

        if (this.autoBedEnabled) {
          this.applyAutoBed(geometry);
        }

        if (this.mesh) {
          this.scene.remove(this.mesh);
          this._disposeMeshResources();
          this.mesh = null;
        }

        if (debugHighlight) {
          // Dual-render: normal mesh + semi-transparent highlight overlay.
          // Desktop OpenSCAD F5 renders #-marked geometry at full color with
          // a pink {255,81,81,128} overlay on top.
          const normalMaterial = hasColors
            ? new MeshPhongMaterial({
                vertexColors: true,
                specular: 0x000000,
                shininess: 30,
                flatShading: false,
              })
            : new MeshPhongMaterial({
                color: parseInt(this._resolveModelColor().slice(1), 16),
                specular: 0x000000,
                shininess: 30,
                flatShading: false,
              });

          const highlightGeometry = geometry.clone();
          const highlightMaterial = new MeshPhongMaterial({
            color: parseInt(debugHighlight.hex.replace('#', ''), 16),
            specular: 0x000000,
            shininess: 30,
            flatShading: false,
            transparent: true,
            opacity: debugHighlight.opacity,
            depthWrite: false,
          });

          const normalMesh = new Mesh(geometry, normalMaterial);
          const highlightMesh = new Mesh(
            highlightGeometry,
            highlightMaterial
          );
          highlightMesh.userData.isHighlightOverlay = true;
          highlightMesh.renderOrder = 1;

          this.mesh = new Group();
          this.mesh.add(normalMesh);
          this.mesh.add(highlightMesh);
        } else {
          const useVertexColors =
            hasColors && !(this.colorOverrideEnabled && this.colorOverride);
          const material = useVertexColors
            ? new MeshPhongMaterial({
                vertexColors: true,
                specular: 0x000000,
                shininess: 30,
                flatShading: false,
              })
            : new MeshPhongMaterial({
                color: parseInt(this._resolveModelColor().slice(1), 16),
                specular: 0x000000,
                shininess: 30,
                flatShading: false,
              });
          this.mesh = new Mesh(geometry, material);
        }
        this.scene.add(this.mesh);

        const vertexCount = positions.length / 3;
        const triangleCount = vertexCount / 3;
        this.lastVertexCount = vertexCount;
        this.lastTriangleCount = triangleCount;

        if (!hasColors && this.colorOverrideEnabled && this.colorOverride) {
          this.applyColorToMesh();
        }

        this.rotationCenteringEnabled = false;
        if (!preserveCamera) {
          this.fitCameraToModel();
        }
        if (this._postLoadHook) {
          this._postLoadHook();
        }
        if (this.measurementsEnabled) {
          this.showMeasurements();
        }
        this.updateModelSummary();

        const parseMs = Math.round(performance.now() - parseStartTime);
        console.log(
          `[Preview] OFF loaded in ${parseMs}ms — ${triangleCount} triangles, hasColors=${hasColors}`
        );
        resolve({ parseMs, hasColors });
      } catch (error) {
        console.error('[Preview] Failed to load OFF:', error);
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
    if (this.isLODWarningPermanentlyDismissed()) return;

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
        <button type="button" class="btn btn-sm btn-ghost" id="lodWarningDismissPermanent" aria-label="Don't show this warning again">
          Don't show again
        </button>
        <button type="button" class="btn btn-sm btn-outline" id="lodWarningDismiss" aria-label="Dismiss warning">
          Got it
        </button>
      </div>
    `;

    this.container.appendChild(warningDiv);

    warningDiv
      .querySelector('#lodWarningDismiss')
      ?.addEventListener('click', () => {
        this.hideLODWarning();
      });

    warningDiv
      .querySelector('#lodWarningDismissPermanent')
      ?.addEventListener('click', () => {
        this.dismissLODWarningPermanently();
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
   * Permanently dismiss the LOD warning so it never reappears across renders.
   * The preference is stored in localStorage and survives page reloads.
   */
  dismissLODWarningPermanently() {
    try {
      localStorage.setItem(STORAGE_KEY_LOD_WARNING_DISMISSED, 'true');
    } catch {
      /* private browsing / quota — fall back silently */
    }
    this.hideLODWarning();
    console.log('[Preview] LOD warning permanently dismissed by user');
  }

  /**
   * @returns {boolean} Whether the user has permanently dismissed LOD warnings.
   */
  isLODWarningPermanentlyDismissed() {
    try {
      return localStorage.getItem(STORAGE_KEY_LOD_WARNING_DISMISSED) === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Re-enable LOD warnings after a previous permanent dismiss.
   */
  resetLODWarningDismissal() {
    try {
      localStorage.removeItem(STORAGE_KEY_LOD_WARNING_DISMISSED);
    } catch {
      /* ignore */
    }
    console.log('[Preview] LOD warning dismissal reset');
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
   * Show a color legend overlay when the SCAD model defines multiple color
   * parameters. Gives the user visual confirmation of their color choices even
   * though the 3D mesh is rendered in a single color (STL limitation).
   *
   * @param {Array<{name: string, value: string}>} colorParams - Color
   *   parameter entries, each with a human-readable name and hex value.
   */
  showColorLegend(colorParams) {
    this.hideColorLegend();
    if (
      !this.container ||
      !Array.isArray(colorParams) ||
      colorParams.length === 0
    )
      return;

    const panel = document.createElement('div');
    panel.id = 'colorLegend';
    panel.className = 'color-legend';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-label', 'Model color parameters');

    const heading = document.createElement('span');
    heading.className = 'color-legend-title';
    heading.textContent = 'Color parameters';
    panel.appendChild(heading);

    for (const { name, value } of colorParams) {
      const row = document.createElement('div');
      row.className = 'color-legend-row';

      const swatch = document.createElement('span');
      swatch.className = 'color-legend-swatch';
      swatch.style.backgroundColor = value || '#888';
      swatch.setAttribute('aria-hidden', 'true');

      const label = document.createElement('span');
      label.className = 'color-legend-label';
      const displayName = name.replace(/_/g, ' ');
      label.textContent = `${displayName}: ${value || '(none)'}`;

      row.appendChild(swatch);
      row.appendChild(label);
      panel.appendChild(row);
    }

    this.container.appendChild(panel);
  }

  /**
   * Remove the color legend overlay.
   */
  hideColorLegend() {
    const existing = this.container?.querySelector('#colorLegend');
    if (existing) existing.remove();
  }

  /**
   * Fit camera to model bounds (Z-up coordinate system, OpenSCAD-style diagonal view)
   *
   * Matches OpenSCAD desktop's default $vpr = [55, 0, 25]:
   *   azimuth  = 25° from front (-Y) toward right (+X)
   *   elevation = 35° above the XY plane
   *
   * Works correctly in both perspective and orthographic projection modes.
   * Also resets the camera up vector to Z-up (important after standard views
   * like Top/Bottom which change the up vector).
   */
  fitCameraToModel() {
    if (!this.mesh) return;

    // Compute bounding box
    const box = new Box3().setFromObject(this.mesh);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraDistance *= 1.8; // Padding

    // OpenSCAD default diagonal: $vpr = [55, 0, 25]
    // azimuth 25° from front, elevation 35° above XY plane
    const azimuth = 25 * (Math.PI / 180); // 25° - OpenSCAD default
    const elevation = 35 * (Math.PI / 180); // 35° (= 90° - 55°) above XY plane

    const horizontalDist = cameraDistance * Math.cos(elevation);
    const verticalDist = cameraDistance * Math.sin(elevation);

    const camera = this.getActiveCamera();

    // Reset up vector to Z-up (standard views like Top change this)
    camera.up.set(0, 0, 1);

    camera.position.set(
      center.x + horizontalDist * Math.sin(azimuth), // X: slightly right
      center.y - horizontalDist * Math.cos(azimuth), // Y: mostly front (negative Y)
      center.z + verticalDist // Z: above
    );
    camera.lookAt(center);

    // Update controls target
    if (this.controls) this.controls.target.copy(center);

    // Update orthographic frustum to fit the model
    if (this.projectionMode === 'orthographic' && this.orthoCamera) {
      const aspect = this.container.clientWidth / this.container.clientHeight;
      const frustumHeight = maxDim * 1.8;
      this.orthoCamera.left = (frustumHeight * aspect) / -2;
      this.orthoCamera.right = (frustumHeight * aspect) / 2;
      this.orthoCamera.top = frustumHeight / 2;
      this.orthoCamera.bottom = frustumHeight / -2;
      this.orthoCamera.zoom = 1;
      this.orthoCamera.updateProjectionMatrix();
    }

    if (this.controls) this.controls.update();

    // Store initial aspect for resize tracking
    this._lastAspect = this.camera.aspect;

    console.log(
      '[Preview] Camera fitted to model (Z-up), size:',
      size,
      'distance:',
      cameraDistance
    );
  }

  /**
   * Standard camera views for OpenSCAD-style viewing (Z-up coordinate system)
   *
   * direction: unit-ish vector FROM the model center TOWARD the camera.
   * up:        which direction is "up" on screen.
   *
   * The diagonal view matches OpenSCAD's default $vpr = [55, 0, 25]:
   *   azimuth 25° from front (-Y) toward right (+X), elevation 35° above XY plane.
   *   direction ≈ [sin(25°)cos(35°), -cos(25°)cos(35°), sin(35°)]
   *            ≈ [0.346, -0.742, 0.574]
   */
  static CAMERA_VIEWS = {
    top: { name: 'Top', direction: [0, 0, 1], up: [0, 1, 0] },
    bottom: { name: 'Bottom', direction: [0, 0, -1], up: [0, -1, 0] },
    front: { name: 'Front', direction: [0, -1, 0], up: [0, 0, 1] },
    back: { name: 'Back', direction: [0, 1, 0], up: [0, 0, 1] },
    left: { name: 'Left', direction: [-1, 0, 0], up: [0, 0, 1] },
    right: { name: 'Right', direction: [1, 0, 0], up: [0, 0, 1] },
    diagonal: {
      name: 'Diagonal',
      direction: [0.346, -0.742, 0.574],
      up: [0, 0, 1],
    },
  };

  /**
   * Set camera to a standard view angle.
   * Works correctly in both perspective and orthographic projection modes.
   * @param {string} viewName - Name of the view (top, bottom, front, back, left, right, diagonal)
   */
  setCameraView(viewName) {
    const view = PreviewManager.CAMERA_VIEWS[viewName];
    if (!view) {
      console.warn(`[Preview] Unknown camera view: ${viewName}`);
      return;
    }

    if (!this.mesh) {
      console.warn('[Preview] No mesh loaded, cannot set camera view');
      announceImmediate('Load a model first to use camera views');
      return;
    }

    // Compute bounding box to get center and appropriate distance
    const box = new Box3().setFromObject(this.mesh);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    // Always use the perspective camera FOV for distance calculation
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraDistance *= 1.8; // Padding

    // Use whichever camera is currently active
    const camera = this.getActiveCamera();
    const direction = new Vector3(...view.direction).normalize();

    // Position camera along the direction vector from center
    camera.position.copy(center).addScaledVector(direction, cameraDistance);

    // Set up vector for the active camera
    camera.up.set(...view.up);

    // Look at center
    camera.lookAt(center);

    // Update controls target
    if (this.controls) this.controls.target.copy(center);

    // Update orthographic frustum to fit the model at the new view
    if (this.projectionMode === 'orthographic' && this.orthoCamera) {
      const aspect = this.container.clientWidth / this.container.clientHeight;
      const frustumHeight = maxDim * 1.8;
      this.orthoCamera.left = (frustumHeight * aspect) / -2;
      this.orthoCamera.right = (frustumHeight * aspect) / 2;
      this.orthoCamera.top = frustumHeight / 2;
      this.orthoCamera.bottom = frustumHeight / -2;
      this.orthoCamera.zoom = 1;
      this.orthoCamera.updateProjectionMatrix();
    }

    if (this.controls) this.controls.update();

    // Announce to screen readers
    this.announceCameraAction(`${view.name} view`);

    console.log(`[Preview] Camera set to ${view.name} view`);
  }

  /**
   * Toggle between perspective and orthographic projection.
   *
   * The key insight: the orthographic frustum must match the visible area that
   * the perspective camera sees at the controls.target distance. This is:
   *   frustumHeight = 2 * distance * tan(fov / 2)
   *
   * @returns {string} The new projection mode ('perspective' or 'orthographic')
   */
  toggleProjection() {
    if (!this.controls) return this.projectionMode;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / height;

    if (this.projectionMode === 'perspective') {
      // ------ Switch to orthographic ------
      this.projectionMode = 'orthographic';

      // Calculate frustum from perspective FOV at the current target distance
      const distance = this.camera.position.distanceTo(this.controls.target);
      const fovRad = this.camera.fov * (Math.PI / 180);
      const frustumHeight = 2 * distance * Math.tan(fovRad / 2);

      if (!this.orthoCamera) {
        this.orthoCamera = new OrthographicCamera(
          (frustumHeight * aspect) / -2,
          (frustumHeight * aspect) / 2,
          frustumHeight / 2,
          frustumHeight / -2,
          0.1,
          10000
        );
        this.orthoCamera.up.set(0, 0, 1);
      } else {
        this.orthoCamera.left = (frustumHeight * aspect) / -2;
        this.orthoCamera.right = (frustumHeight * aspect) / 2;
        this.orthoCamera.top = frustumHeight / 2;
        this.orthoCamera.bottom = frustumHeight / -2;
      }

      // Transfer pose from perspective camera
      this.orthoCamera.position.copy(this.camera.position);
      this.orthoCamera.up.copy(this.camera.up);
      this.orthoCamera.quaternion.copy(this.camera.quaternion);
      this.orthoCamera.zoom = 1;
      this.orthoCamera.updateProjectionMatrix();

      // Switch controls to orthographic camera
      this.controls.object = this.orthoCamera;
      this.controls.update();
    } else {
      // ------ Switch to perspective ------
      this.projectionMode = 'perspective';

      if (this.orthoCamera) {
        // Transfer pose back from orthographic camera
        this.camera.position.copy(this.orthoCamera.position);
        this.camera.up.copy(this.orthoCamera.up);
        this.camera.quaternion.copy(this.orthoCamera.quaternion);
      }

      this.camera.updateProjectionMatrix();

      // Switch controls back to perspective camera
      this.controls.object = this.camera;
      this.controls.update();
    }

    // Announce change to screen readers
    const modeName =
      this.projectionMode === 'perspective' ? 'Perspective' : 'Orthographic';
    this.announceCameraAction(`${modeName} projection`);

    console.log(`[Preview] Switched to ${this.projectionMode} projection`);
    return this.projectionMode;
  }

  /**
   * Get current projection mode
   * @returns {string} 'perspective' or 'orthographic'
   */
  getProjectionMode() {
    return this.projectionMode;
  }

  /**
   * Get the currently active camera (perspective or orthographic)
   * @returns {THREE.Camera}
   */
  getActiveCamera() {
    return this.projectionMode === 'orthographic' && this.orthoCamera
      ? this.orthoCamera
      : this.camera;
  }

  /**
   * Adjust camera distance to maintain model's relative visual position
   * when the viewport aspect ratio changes significantly.
   *
   * This uses a compensation strategy based on how perspective projection
   * responds to aspect ratio changes:
   * - When going narrower (portrait): horizontal FOV shrinks, zoom out to fit
   * - When going wider (landscape): horizontal FOV expands, zoom in to maintain presence
   *
   * @param {number} previousAspect - Previous aspect ratio (width/height)
   * @param {number} newAspect - New aspect ratio (width/height)
   */
  _adjustCameraForAspectChange(previousAspect, newAspect) {
    if (!this.mesh || !this.controls) return;

    // Calculate the relative change in aspect ratio
    const aspectRatio = newAspect / previousAspect;

    const camera = this.getActiveCamera();

    // For orthographic cameras, adjust frustum instead of distance
    if (this.projectionMode === 'orthographic' && this.orthoCamera) {
      const frustumHeight =
        (this.orthoCamera.top - this.orthoCamera.bottom) /
        (this.orthoCamera.zoom || 1);
      this.orthoCamera.left = (frustumHeight * newAspect) / -2;
      this.orthoCamera.right = (frustumHeight * newAspect) / 2;
      this.orthoCamera.updateProjectionMatrix();
      this.controls.update();
      return;
    }

    const currentDistance = camera.position.distanceTo(this.controls.target);

    // Calculate adjustment factor
    // The idea: when aspect gets narrower, we need to zoom out (increase distance)
    // to keep the model from being horizontally clipped.
    // When aspect gets wider, we can zoom in slightly to maintain visual presence.
    //
    // Using square root provides a smoother, less aggressive adjustment that
    // works well across common aspect ratio transitions (e.g., 16:9 to 9:16)
    const adjustmentFactor = 1 / Math.sqrt(aspectRatio);

    // Apply a damping factor to prevent over-correction
    // This makes the adjustment less aggressive (70% of calculated adjustment)
    const dampedFactor = 1.0 + (adjustmentFactor - 1.0) * 0.7;

    // Calculate new distance with bounds checking
    const newDistance = currentDistance * dampedFactor;

    // Clamp to control limits with some margin
    const minDist = this.controls.minDistance * 1.2;
    const maxDist = this.controls.maxDistance * 0.9;
    const clampedDistance = Math.max(minDist, Math.min(maxDist, newDistance));

    // Only adjust if the change is meaningful (> 1% difference)
    if (Math.abs(clampedDistance - currentDistance) / currentDistance < 0.01) {
      return;
    }

    // Calculate direction vector from target to camera
    const direction = new Vector3()
      .subVectors(camera.position, this.controls.target)
      .normalize();

    camera.position
      .copy(this.controls.target)
      .addScaledVector(direction, clampedDistance);

    this.controls.update();

    console.log(
      `[Preview] Camera adjusted for aspect change: ${previousAspect.toFixed(2)} → ${newAspect.toFixed(2)}, distance: ${currentDistance.toFixed(1)} → ${clampedDistance.toFixed(1)}`
    );
  }

  /**
   * Set resize behavior configuration
   * @param {Object} config - Configuration options
   * @param {number} config.aspectChangeThreshold - Threshold for aspect change detection (0-1)
   * @param {boolean} config.adjustCameraOnResize - Whether to adjust camera on resize
   */
  setResizeConfig(config) {
    if (typeof config.aspectChangeThreshold === 'number') {
      this._resizeConfig.aspectChangeThreshold = Math.max(
        0.01,
        Math.min(0.5, config.aspectChangeThreshold)
      );
    }
    if (typeof config.adjustCameraOnResize === 'boolean') {
      this._resizeConfig.adjustCameraOnResize = config.adjustCameraOnResize;
    }
  }

  /**
   * Calculate dimensions from the current mesh
   * @returns {Object} Dimensions { x, y, z, volume, triangles }
   */
  calculateDimensions() {
    if (!this.mesh) return null;

    const box = new Box3().setFromObject(this.mesh);
    const size = box.getSize(new Vector3());
    const volume = size.x * size.y * size.z;
    const geo = this._getPrimaryGeometry();
    const triangles = geo
      ? geo.index
        ? geo.index.count / 3
        : geo.attributes.position.count / 3
      : 0;

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

    summaryEl.textContent = `3D model loaded. ${dims.x} mm wide, ${dims.y} mm deep, ${dims.z} mm tall. ${dims.triangles.toLocaleString()} triangles.`;
  }

  /**
   * Pan camera and target in screen space
   * Uses the camera's own right/up axes so panning feels natural at any viewing angle,
   * including Top and Bottom views where the old world-up cross product was degenerate.
   * @param {number} deltaRight - Right/left movement in screen space
   * @param {number} deltaUp - Up/down movement in screen space
   */
  panCamera(deltaRight, deltaUp) {
    if (!this.controls) return;

    const camera = this.getActiveCamera();
    const right = new Vector3().setFromMatrixColumn(
      camera.matrixWorld,
      0
    );
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);

    const panOffset = new Vector3()
      .addScaledVector(right, deltaRight)
      .addScaledVector(up, deltaUp);

    this.controls.target.add(panOffset);
    camera.position.add(panOffset);
    this.controls.update();
  }

  /**
   * Rotate camera horizontally around the target (Z-up)
   * Orbits around controls.target, not the world origin.
   * @param {number} angle - Rotation angle in radians (positive = left, negative = right)
   */
  rotateHorizontal(angle) {
    if (!this.controls) return;
    const camera = this.getActiveCamera();
    // Compute offset from the orbit target (NOT world origin)
    const offset = camera.position.clone().sub(this.controls.target);
    // Rotate offset around the Z-axis (world up)
    offset.applyAxisAngle(new Vector3(0, 0, 1), angle);
    // Reposition camera at target + rotated offset
    camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }

  /**
   * Rotate camera vertically around the target (Z-up)
   * Orbits around controls.target, not the world origin.
   * @param {number} angle - Rotation angle in radians (positive = up, negative = down)
   */
  rotateVertical(angle) {
    if (!this.controls) return;
    const camera = this.getActiveCamera();
    // Compute offset from the orbit target (NOT world origin)
    const offset = camera.position.clone().sub(this.controls.target);
    const currentDist = offset.length();
    if (currentDist < 1e-6) return; // Degenerate case

    const horizontalAngle = Math.atan2(offset.y, offset.x);
    const verticalAngle = Math.asin(
      Math.max(-1, Math.min(1, offset.z / currentDist))
    );

    // Clamp to prevent flipping over the poles
    const newVerticalAngle = Math.max(
      -Math.PI / 2 + 0.01,
      Math.min(Math.PI / 2 - 0.01, verticalAngle + angle)
    );

    offset.x =
      currentDist * Math.cos(newVerticalAngle) * Math.cos(horizontalAngle);
    offset.y =
      currentDist * Math.cos(newVerticalAngle) * Math.sin(horizontalAngle);
    offset.z = currentDist * Math.sin(newVerticalAngle);

    camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }

  /**
   * Zoom camera in or out
   * @param {number} amount - Zoom amount (positive = in, negative = out)
   */
  zoomCamera(amount) {
    if (!this.controls) return;
    if (this.projectionMode === 'orthographic' && this.orthoCamera) {
      // Orthographic: adjust zoom property (position changes don't affect apparent size)
      const factor = 1 + Math.abs(amount) * 0.02;
      this.orthoCamera.zoom *= amount > 0 ? factor : 1 / factor;
      this.orthoCamera.zoom = Math.max(0.01, this.orthoCamera.zoom);
      this.orthoCamera.updateProjectionMatrix();
    } else {
      // Perspective: translate camera along view direction
      const camera = this.getActiveCamera();
      const direction = new Vector3();
      camera.getWorldDirection(direction);
      camera.position.addScaledVector(direction, amount);
    }
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

    this.hideMeasurements();

    this.dimensions = this.calculateDimensions();
    if (!this.dimensions) return;

    this.measurementHelpers = new Group();
    this.measurementHelpers.name = 'measurements';

    const box = new Box3().setFromObject(this.mesh);
    const min = box.min;
    const max = box.max;

    const lineColor = this.currentTheme.includes('dark') ? 0xff6b6b : 0xff0000;

    const boxHelper = new BoxHelper(this.mesh, lineColor);
    // Note: linewidth is ignored in WebGL, relying on color contrast instead
    this.measurementHelpers.add(boxHelper);

    // Add dimension lines and labels (we'll render text as sprites)
    this.addDimensionLine(
      new Vector3(min.x, min.y, min.z),
      new Vector3(max.x, min.y, min.z),
      `${this.dimensions.x} mm`,
      'X',
      lineColor
    );

    this.addDimensionLine(
      new Vector3(min.x, min.y, min.z),
      new Vector3(min.x, max.y, min.z),
      `${this.dimensions.y} mm`,
      'Y',
      lineColor
    );

    this.addDimensionLine(
      new Vector3(min.x, min.y, min.z),
      new Vector3(min.x, min.y, max.z),
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
    const geometry = new BufferGeometry().setFromPoints(points);
    // Note: linewidth is ignored in WebGL, relying on color contrast instead
    const material = new LineBasicMaterial({
      color: color,
    });
    const line = new Line(geometry, material);
    this.measurementHelpers.add(line);

    // Create text sprite for label
    const midpoint = new Vector3().lerpVectors(start, end, 0.5);
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
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Create sprite
    const spriteMaterial = new SpriteMaterial({ map: texture });
    const sprite = new Sprite(spriteMaterial);
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
      const pref = localStorage.getItem(STORAGE_KEY_MEASUREMENTS);
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
        STORAGE_KEY_MEASUREMENTS,
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
      const pref = localStorage.getItem(STORAGE_KEY_GRID);
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
      localStorage.setItem(STORAGE_KEY_GRID, enabled ? 'true' : 'false');
    } catch (error) {
      console.warn('[Preview] Could not save grid preference:', error);
    }
  }

  /**
   * Set a custom grid color, deriving the secondary color automatically.
   * @param {string} hexColor - CSS hex color (e.g. '#ff0000')
   */
  setGridColor(hexColor) {
    const hex = normalizeHexColor(hexColor);
    if (!hex) return;

    this.gridColorOverride = hex;
    this.saveGridColorPreference(hex);
    this._rebuildGrid();
  }

  /**
   * Remove the custom grid color, reverting to the current theme default.
   */
  resetGridColor() {
    this.gridColorOverride = null;
    this.saveGridColorPreference(null);
    this._rebuildGrid();
  }

  /**
   * @returns {string|null} The current grid color override, or null for theme default.
   */
  getGridColor() {
    return this.gridColorOverride;
  }

  /**
   * Return the resolved grid colors (override or theme default).
   * @returns {{ gridPrimary: number, gridSecondary: number }}
   */
  _resolveGridColors() {
    if (this.gridColorOverride) {
      const primary = parseInt(this.gridColorOverride.slice(1), 16);
      const secondary = PreviewManager._deriveSecondaryGridColor(
        primary,
        PREVIEW_COLORS[this.currentTheme]?.background ??
          PREVIEW_COLORS.light.background
      );
      return { gridPrimary: primary, gridSecondary: secondary };
    }
    const theme = PREVIEW_COLORS[this.currentTheme] || PREVIEW_COLORS.light;
    return {
      gridPrimary: theme.gridPrimary,
      gridSecondary: theme.gridSecondary,
    };
  }

  /**
   * Blend the primary grid color 50% toward the scene background to
   * produce a softer secondary grid line color.
   * @param {number} primary - 0xRRGGBB primary grid color
   * @param {number} background - 0xRRGGBB scene background color
   * @returns {number} 0xRRGGBB secondary color
   */
  static _deriveSecondaryGridColor(primary, background) {
    const blend = (a, b, t) => Math.round(a + (b - a) * t);
    const pR = (primary >> 16) & 0xff;
    const pG = (primary >> 8) & 0xff;
    const pB = primary & 0xff;
    const bR = (background >> 16) & 0xff;
    const bG = (background >> 8) & 0xff;
    const bB = background & 0xff;
    const r = blend(pR, bR, 0.5);
    const g = blend(pG, bG, 0.5);
    const b = blend(pB, bB, 0.5);
    return (r << 16) | (g << 8) | b;
  }

  /**
   * Load persisted grid color preference.
   * @returns {string|null}
   */
  loadGridColorPreference() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_GRID_COLOR);
      if (raw && /^#[0-9a-f]{6}$/i.test(raw)) return raw;
    } catch (_) {
      // fall through
    }
    return null;
  }

  /**
   * Persist grid color preference.
   * @param {string|null} hex
   */
  saveGridColorPreference(hex) {
    try {
      if (hex) {
        localStorage.setItem(STORAGE_KEY_GRID_COLOR, hex);
      } else {
        localStorage.removeItem(STORAGE_KEY_GRID_COLOR);
      }
    } catch (error) {
      console.warn('[Preview] Could not save grid color preference:', error);
    }
  }

  /**
   * Set grid line opacity (10–100). Values outside the range are clamped.
   * @param {number} percent - Opacity percentage
   */
  setGridOpacity(percent) {
    const clamped = Math.max(10, Math.min(100, Math.round(Number(percent))));
    if (Number.isNaN(clamped)) return;
    this.gridOpacity = clamped;
    this.saveGridOpacityPreference(clamped);
    this._applyGridOpacity();
  }

  /**
   * @returns {number} Current grid opacity (10–100).
   */
  getGridOpacity() {
    return this.gridOpacity;
  }

  /**
   * Reset grid opacity to 100% (fully opaque).
   */
  resetGridOpacity() {
    this.gridOpacity = 100;
    this.saveGridOpacityPreference(null);
    this._applyGridOpacity();
  }

  /**
   * Load persisted grid opacity preference.
   * @returns {number} 10–100 (default 100)
   */
  loadGridOpacityPreference() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_GRID_OPACITY);
      if (raw !== null) {
        const val = parseInt(raw, 10);
        if (!Number.isNaN(val) && val >= 10 && val <= 100) return val;
      }
    } catch (_) {
      // fall through
    }
    return 100;
  }

  /**
   * Persist grid opacity preference.
   * @param {number|null} value - null removes the key (revert to default 100)
   */
  saveGridOpacityPreference(value) {
    try {
      if (value !== null && value !== undefined && value !== 100) {
        localStorage.setItem(STORAGE_KEY_GRID_OPACITY, String(value));
      } else {
        localStorage.removeItem(STORAGE_KEY_GRID_OPACITY);
      }
    } catch (error) {
      console.warn('[Preview] Could not save grid opacity preference:', error);
    }
  }

  /**
   * Apply the current gridOpacity to the grid helper material.
   * @private
   */
  _applyGridOpacity() {
    if (!this.gridHelper) return;
    const opacity = this.gridOpacity / 100;
    const mat = this.gridHelper.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => {
        m.transparent = opacity < 1;
        m.opacity = opacity;
      });
    } else if (mat) {
      mat.transparent = opacity < 1;
      mat.opacity = opacity;
    }
  }

  /**
   * Rebuild the grid using current config, color override, and theme.
   * @private
   */
  _rebuildGrid() {
    if (!this.scene || !this.gridHelper) return;

    this.scene.remove(this.gridHelper);
    if (this.gridHelper.geometry) this.gridHelper.geometry.dispose();
    if (this.gridHelper.material) {
      if (Array.isArray(this.gridHelper.material)) {
        this.gridHelper.material.forEach((m) => m.dispose());
      } else {
        this.gridHelper.material.dispose();
      }
    }

    const colors = this._resolveGridColors();
    this.gridHelper = this._createGridHelper(colors);
    this.gridHelper.rotation.x = Math.PI / 2;
    this.gridHelper.visible = this.gridEnabled;
    this._applyGridOpacity();
    this.scene.add(this.gridHelper);
  }

  /**
   * Create a GridHelper using the current gridConfig dimensions.
   * Divisions are auto-calculated at 1 per 10mm for a clean appearance.
   * @param {Object} colors - Theme color object with gridPrimary/gridSecondary
   * @returns {THREE.GridHelper}
   */
  _createGridHelper(colors) {
    const { widthMm, heightMm } = this.gridConfig;
    // Use the larger dimension as the GridHelper size (it's square), and scale
    // height via geometry scaling so rectangular beds are represented correctly.
    const size = Math.max(widthMm, heightMm);
    const divisions = Math.round(size / 10);
    const helper = new GridHelper(
      size,
      divisions,
      colors.gridPrimary,
      colors.gridSecondary
    );
    // Stretch non-square beds by scaling the shorter axis
    helper.scale.set(widthMm / size, 1, heightMm / size);
    return helper;
  }

  /**
   * Load grid size from localStorage
   * @returns {{ widthMm: number, heightMm: number }}
   */
  loadGridSizePreference() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_GRID_SIZE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed.widthMm === 'number' &&
          typeof parsed.heightMm === 'number'
        ) {
          return { widthMm: parsed.widthMm, heightMm: parsed.heightMm };
        }
      }
    } catch (_) {
      // Fall through to default
    }
    return { ...DEFAULT_GRID_CONFIG };
  }

  /**
   * Save grid size to localStorage
   * @param {{ widthMm: number, heightMm: number }} config
   */
  saveGridSizePreference(config) {
    try {
      localStorage.setItem(STORAGE_KEY_GRID_SIZE, JSON.stringify(config));
    } catch (error) {
      console.warn('[Preview] Could not save grid size:', error);
    }
  }

  /**
   * Return a copy of the current grid config
   * @returns {{ widthMm: number, heightMm: number }}
   */
  getGridSize() {
    return { ...this.gridConfig };
  }

  /**
   * Update the grid to new printer-bed dimensions and persist the preference.
   * @param {number} widthMm - Bed width in mm (50–500)
   * @param {number} heightMm - Bed height in mm (50–500)
   */
  setGridSize(widthMm, heightMm) {
    const clamp = (v) => Math.min(500, Math.max(50, Number(v) || 220));
    this.gridConfig = { widthMm: clamp(widthMm), heightMm: clamp(heightMm) };
    this.saveGridSizePreference(this.gridConfig);

    if (!this.scene || !this.gridHelper) return;

    // Remove and dispose old grid
    this.scene.remove(this.gridHelper);
    if (this.gridHelper.geometry) this.gridHelper.geometry.dispose();
    if (this.gridHelper.material) {
      if (Array.isArray(this.gridHelper.material)) {
        this.gridHelper.material.forEach((m) => m.dispose());
      } else {
        this.gridHelper.material.dispose();
      }
    }

    // Recreate with new size using resolved colors (custom override or theme)
    const gridColors = this._resolveGridColors();
    this.gridHelper = this._createGridHelper(gridColors);
    this.gridHelper.rotation.x = Math.PI / 2;
    this.gridHelper.visible = this.gridEnabled;
    this.scene.add(this.gridHelper);

    console.log(
      `[Preview] Grid size updated: ${this.gridConfig.widthMm}×${this.gridConfig.heightMm}mm`
    );
  }

  /**
   * Load user-saved custom grid presets from localStorage.
   * @returns {Array<{name: string, widthMm: number, heightMm: number}>}
   */
  loadCustomGridPresets() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_GRID_PRESETS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {
      // fall through
    }
    return [];
  }

  /**
   * Save a new custom grid preset. Validates bounds and name uniqueness.
   *
   * @param {string} name - User-provided preset name (non-empty, non-whitespace-only)
   * @param {number} widthMm - Width in mm (integer, 50–500)
   * @param {number} heightMm - Height in mm (integer, 50–500)
   * @returns {{ success: boolean, error?: string }}
   */
  saveCustomGridPreset(name, widthMm, heightMm) {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return { success: false, error: 'Preset name cannot be empty.' };
    }

    const w = Math.round(Number(widthMm));
    const h = Math.round(Number(heightMm));

    if (!Number.isFinite(w) || w < 50 || w > 500) {
      return {
        success: false,
        error: `Width must be an integer between 50 and 500 mm (got ${widthMm}).`,
      };
    }
    if (!Number.isFinite(h) || h < 50 || h > 500) {
      return {
        success: false,
        error: `Height must be an integer between 50 and 500 mm (got ${heightMm}).`,
      };
    }

    const existing = this.loadCustomGridPresets();

    if (existing.some((p) => p.name === trimmedName)) {
      return {
        success: false,
        error: `A custom preset named "${trimmedName}" already exists.`,
      };
    }

    existing.push({ name: trimmedName, widthMm: w, heightMm: h });

    try {
      localStorage.setItem(
        STORAGE_KEY_CUSTOM_GRID_PRESETS,
        JSON.stringify(existing)
      );
    } catch (error) {
      return {
        success: false,
        error: `Could not save preset: ${error.message}`,
      };
    }

    return { success: true };
  }

  /**
   * Delete a user custom grid preset by name.
   * @param {string} name - Exact preset name to remove
   * @returns {boolean} True if a preset was removed
   */
  deleteCustomGridPreset(name) {
    const existing = this.loadCustomGridPresets();
    const next = existing.filter((p) => p.name !== name);
    if (next.length === existing.length) return false;

    try {
      localStorage.setItem(
        STORAGE_KEY_CUSTOM_GRID_PRESETS,
        JSON.stringify(next)
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Toggle auto-bed feature (place object on Z=0 build plate)
   * @param {boolean} enabled - Enable or disable auto-bed
   */
  toggleAutoBed(enabled) {
    this.autoBedEnabled = enabled;
    this.saveAutoBedPreference(enabled);
    console.log(`[Preview] Auto-bed ${enabled ? 'enabled' : 'disabled'}`);

    // If we have a mesh, we need to reload to apply the change
    // Return true to indicate the model should be re-rendered
    return this.mesh !== null;
  }

  /**
   * Load auto-bed preference from localStorage
   * @returns {boolean} Preference value (defaults to true - most users want this)
   */
  loadAutoBedPreference() {
    try {
      const pref = localStorage.getItem(STORAGE_KEY_AUTO_BED);
      // Default to true (auto-bed enabled) if not set
      return pref === null ? true : pref === 'true';
    } catch (error) {
      console.warn('[Preview] Could not load auto-bed preference:', error);
      return true;
    }
  }

  /**
   * Save auto-bed preference to localStorage
   * @param {boolean} enabled - Auto-bed enabled state
   */
  saveAutoBedPreference(enabled) {
    try {
      localStorage.setItem(STORAGE_KEY_AUTO_BED, enabled ? 'true' : 'false');
    } catch (error) {
      console.warn('[Preview] Could not save auto-bed preference:', error);
    }
  }

  /**
   * Apply auto-bed transformation to geometry
   * Moves the geometry so its lowest Z point sits on Z=0 (the build plate)
   * @param {THREE.BufferGeometry} geometry - The geometry to transform
   */
  applyAutoBed(geometry) {
    // Reset offset tracking
    this.autoBedOffset = 0;

    if (!geometry || !geometry.attributes.position) {
      return;
    }

    const positions = geometry.attributes.position;
    const positionArray = positions.array;

    // Find minimum Z value
    let minZ = Infinity;
    for (let i = 2; i < positionArray.length; i += 3) {
      if (positionArray[i] < minZ) {
        minZ = positionArray[i];
      }
    }

    // If minZ is already 0 or very close, no need to translate
    if (Math.abs(minZ) < 0.0001) {
      console.log('[Preview] Auto-bed: Object already on build plate');
      return;
    }

    // Translate all Z coordinates up by -minZ (so minZ becomes 0)
    const offset = -minZ;
    for (let i = 2; i < positionArray.length; i += 3) {
      positionArray[i] += offset;
    }

    // Store the offset for rotation centering feature
    this.autoBedOffset = offset;

    // Mark the position attribute as needing update
    positions.needsUpdate = true;

    // Recompute the bounding box/sphere since we modified positions
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    console.log(
      `[Preview] Auto-bed applied: translated Z by ${offset.toFixed(3)} mm`
    );
  }

  /**
   * Enable rotation centering for better auto-rotate viewing
   * Temporarily moves the object so its center is at the origin (0,0,0)
   * This makes rotation around the center look better in the view
   */
  enableRotationCentering() {
    if (!this.mesh || this.rotationCenteringEnabled) {
      return;
    }

    // Only apply if auto-bed was used (offset > 0)
    if (this.autoBedOffset === 0 || !this.autoBedEnabled) {
      console.log(
        '[Preview] Rotation centering: No offset to apply (auto-bed not active)'
      );
      return;
    }

    // Move mesh down to center around origin
    // After geometry.center() + applyAutoBed(), the geometry center is at Z = autoBedOffset
    // (because center() puts it at 0, then auto-bed shifts it up by autoBedOffset)
    // We want the center at Z = 0, so we move the mesh down by autoBedOffset
    const centeringOffset = -this.autoBedOffset;
    this.mesh.position.z += centeringOffset;

    this.rotationCenteringEnabled = true;

    // Adjust both camera position AND orbit controls target by the same offset
    // This preserves the exact same view while the mesh moves
    if (this.controls) {
      const camera = this.getActiveCamera();
      camera.position.z += centeringOffset;
      this.controls.target.z += centeringOffset;
      this.controls.update();
    }

    // Adjust reference overlay position to stay aligned with the model
    if (this.referenceOverlay) {
      this.referenceOverlay.position.z =
        this.overlayConfig.zPosition + centeringOffset;
    }

    console.log(
      `[Preview] Rotation centering enabled: mesh moved by ${centeringOffset.toFixed(3)} mm on Z`
    );
  }

  /**
   * Disable rotation centering and restore the object to its auto-bed position
   */
  disableRotationCentering() {
    if (!this.mesh || !this.rotationCenteringEnabled) {
      return;
    }

    // Restore mesh position (undo the centeringOffset applied in enableRotationCentering)
    const restorationOffset = this.autoBedOffset;
    this.mesh.position.z += restorationOffset;

    this.rotationCenteringEnabled = false;

    // Adjust both camera position AND orbit controls target by the same offset
    // This preserves the exact same view while the mesh moves back
    if (this.controls) {
      const camera = this.getActiveCamera();
      camera.position.z += restorationOffset;
      this.controls.target.z += restorationOffset;
      this.controls.update();
    }

    // Restore reference overlay position
    if (this.referenceOverlay) {
      this.referenceOverlay.position.z = this.overlayConfig.zPosition;
    }

    console.log(
      `[Preview] Rotation centering disabled: mesh restored by ${restorationOffset.toFixed(3)} mm on Z`
    );
  }

  /**
   * Check if rotation centering is currently enabled
   * @returns {boolean} Whether rotation centering is active
   */
  isRotationCenteringEnabled() {
    return this.rotationCenteringEnabled;
  }

  /**
   * Enable auto-rotation of the model
   * Uses Three.js OrbitControls built-in autoRotate feature
   * @param {boolean} enabled - Whether auto-rotate should be enabled
   */
  setAutoRotate(enabled) {
    if (this.controls) {
      this.controls.autoRotate = enabled;
      console.log(`[Preview] Auto-rotate ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Check if auto-rotation is currently enabled
   * @returns {boolean} Whether auto-rotate is active
   */
  isAutoRotateEnabled() {
    return this.controls?.autoRotate ?? false;
  }

  /**
   * Set the auto-rotation speed
   * @param {number} speed - Rotation speed in degrees per second (0.1 to 3)
   */
  setAutoRotateSpeed(speed) {
    // Clamp to reasonable range: 0.1 to 3 degrees/second
    const clampedSpeed = Math.max(0.1, Math.min(3, speed));
    if (this.controls) {
      this.controls.autoRotateSpeed = clampedSpeed;
      console.log(`[Preview] Auto-rotate speed set to ${clampedSpeed} deg/s`);
    }
  }

  /**
   * Get the current auto-rotation speed
   * @returns {number} Current rotation speed in degrees per second
   */
  getAutoRotateSpeed() {
    // Default is 0.5 for a gentle rotation
    return this.controls?.autoRotateSpeed ?? 0.5;
  }

  // ============================================================================
  // Reference Overlay System
  // ============================================================================

  /**
   * Set the reference overlay source from an image/SVG
   * @param {Object} source - Source configuration
   * @param {string} source.kind - 'raster' (PNG/JPG) or 'svg'
   * @param {string} source.name - Source file name for display
   * @param {string} source.dataUrlOrText - Data URL for rasters, SVG text for SVG
   * @returns {Promise<void>}
   */
  async setReferenceOverlaySource({ kind, name, dataUrlOrText }) {
    // Dispose of existing texture
    if (this.referenceTexture) {
      this.referenceTexture.dispose();
      this.referenceTexture = null;
    }

    if (!dataUrlOrText) {
      console.log('[Preview] Overlay source cleared');
      this.overlayConfig.sourceFileName = null;
      this.overlayConfig.intrinsicAspect = null;
      this._lastSvgContent = null;
      this.removeReferenceOverlay();
      return;
    }

    try {
      if (kind === 'svg') {
        this._lastSvgContent = dataUrlOrText;
        const { texture, aspect, widthMm, heightMm } =
          await this.svgTextToCanvasTexture(
            dataUrlOrText,
            this.overlayConfig.svgColor
          );
        this.referenceTexture = texture;
        this.overlayConfig.intrinsicAspect = aspect;

        // Use the SVG's physical mm dimensions (computed via the same 96 DPI
        // convention that OpenSCAD desktop uses for SVG import). This ensures
        // the overlay is sized identically to how OpenSCAD interprets the file.
        if (widthMm && heightMm) {
          this.overlayConfig.width = widthMm;
          this.overlayConfig.height = heightMm;
        } else if (this.overlayConfig.lockAspect && aspect) {
          this.overlayConfig.height = this.overlayConfig.width / aspect;
        }
      } else {
        this._lastSvgContent = null;
        const { texture, aspect } =
          await this.rasterDataUrlToTexture(dataUrlOrText);
        this.referenceTexture = texture;
        this.overlayConfig.intrinsicAspect = aspect;

        // Raster images have no inherent physical size — keep current width
        // and derive height from aspect ratio
        if (this.overlayConfig.lockAspect && aspect) {
          this.overlayConfig.height = this.overlayConfig.width / aspect;
        }
      }

      this.overlayConfig.sourceFileName = name;

      // Create/update the overlay if enabled
      if (this.overlayConfig.enabled) {
        this.createOrUpdateReferenceOverlay();
      }

      console.log(
        `[Preview] Overlay source set: ${name} (${kind}, ` +
          `${this.overlayConfig.width.toFixed(1)} × ${this.overlayConfig.height.toFixed(1)} mm, ` +
          `aspect: ${this.overlayConfig.intrinsicAspect?.toFixed(2) || 'unknown'})`
      );
    } catch (error) {
      console.error('[Preview] Failed to load overlay source:', error);
      throw error;
    }
  }

  /**
   * Parse an SVG length value (e.g. "200", "200px", "175.6mm", "2in") and
   * return the equivalent size in millimeters using the same 96 DPI default
   * that OpenSCAD desktop uses for SVG import.
   *
   * @param {string|null} raw - Raw attribute value (may include unit suffix)
   * @returns {number|null} Size in mm, or null if unparseable
   */
  static svgLengthToMm(raw) {
    if (!raw) return null;
    const str = String(raw).trim();
    if (!str) return null;

    // OpenSCAD default: 96 user-units per inch (CSS reference pixel)
    const OPENSCAD_DPI = 96;
    const MM_PER_INCH = 25.4;

    // CSS absolute-length units → mm conversion factors
    const unitFactors = {
      mm: 1,
      cm: 10,
      in: MM_PER_INCH,
      pt: MM_PER_INCH / 72, // 1pt = 1/72 inch
      pc: MM_PER_INCH / 6, // 1pc = 1/6 inch
      px: MM_PER_INCH / OPENSCAD_DPI, // 1px = 1/96 inch
    };

    const match = str.match(
      /^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|pc|px)?$/i
    );
    if (!match) return null;

    const value = parseFloat(match[1]);
    if (!isFinite(value) || value <= 0) return null;

    const unit = (match[2] || '').toLowerCase();

    // Unitless values are treated as user-units at 96 DPI (same as px)
    const factor = unitFactors[unit] || unitFactors.px;
    return value * factor;
  }

  /**
   * Convert SVG text to a Three.js CanvasTexture.
   * When recolorHex is provided, all non-transparent pixels are replaced
   * with that colour — making dark SVGs visible on dark backgrounds.
   *
   * Also computes the physical mm dimensions of the SVG using the same
   * 96 DPI convention that OpenSCAD desktop uses for SVG import, so the
   * overlay can be sized to match the real-world measurements the SVG
   * was saved with.
   *
   * @param {string} svgContent - SVG markup
   * @param {string|null} [recolorHex=null] - CSS hex colour (e.g. '#ffffff')
   * @param {{ targetCanvasSize?: number }} [opts] - Optional overrides
   * @returns {Promise<{texture: THREE.CanvasTexture, aspect: number, widthMm: number|null, heightMm: number|null}>}
   */
  async svgTextToCanvasTexture(svgContent, recolorHex = null, opts = {}) {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgEl = svgDoc.querySelector('svg');

    if (!svgEl) {
      throw new Error('Invalid SVG: no <svg> element found');
    }

    // --- Determine pixel dimensions for canvas rendering ---
    let intrinsicWidth, intrinsicHeight;

    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      const [, , vbWidth, vbHeight] = viewBox.split(/[\s,]+/).map(parseFloat);
      intrinsicWidth = vbWidth;
      intrinsicHeight = vbHeight;
    } else {
      intrinsicWidth =
        parseFloat(svgEl.getAttribute('width')) ||
        parseFloat(svgEl.style.width) ||
        200;
      intrinsicHeight =
        parseFloat(svgEl.getAttribute('height')) ||
        parseFloat(svgEl.style.height) ||
        150;
    }

    const aspect = intrinsicWidth / intrinsicHeight;

    // --- Compute physical mm size (OpenSCAD 96 DPI convention) ---
    // Priority: explicit width/height with units → viewBox at 96 DPI
    const rawW = svgEl.getAttribute('width');
    const rawH = svgEl.getAttribute('height');
    let widthMm = PreviewManager.svgLengthToMm(rawW);
    let heightMm = PreviewManager.svgLengthToMm(rawH);

    // If width/height are missing or unparseable, fall back to viewBox
    // dimensions treated as user-units at 96 DPI (OpenSCAD default).
    if (widthMm === null && viewBox) {
      const OPENSCAD_DPI = 96;
      const [, , vbW] = viewBox.split(/[\s,]+/).map(parseFloat);
      widthMm = (vbW * 25.4) / OPENSCAD_DPI;
    }
    if (heightMm === null && viewBox) {
      const OPENSCAD_DPI = 96;
      const [, , , vbH] = viewBox.split(/[\s,]+/).map(parseFloat);
      heightMm = (vbH * 25.4) / OPENSCAD_DPI;
    }

    // Determine canvas resolution (bounded to avoid memory spikes).
    // When targetCanvasSize is specified, scale the canvas so the longest
    // edge reaches that size — producing crisp textures for SVG content
    // that has small viewBox dimensions (e.g. 246×170 from OpenSCAD).
    const maxDim = opts.targetCanvasSize || this.getMaxTextureResolution();
    let canvasWidth, canvasHeight;

    if (opts.targetCanvasSize) {
      if (intrinsicWidth >= intrinsicHeight) {
        canvasWidth = maxDim;
        canvasHeight = maxDim / aspect;
      } else {
        canvasHeight = maxDim;
        canvasWidth = maxDim * aspect;
      }
    } else if (intrinsicWidth >= intrinsicHeight) {
      canvasWidth = Math.min(intrinsicWidth, maxDim);
      canvasHeight = canvasWidth / aspect;
    } else {
      canvasHeight = Math.min(intrinsicHeight, maxDim);
      canvasWidth = canvasHeight * aspect;
    }

    // Create canvas at the computed resolution
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(canvasWidth);
    canvas.height = Math.ceil(canvasHeight);

    // Create Image from SVG blob
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    try {
      const img = await this.loadImage(url);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Recolor: replace all non-transparent pixels with the chosen colour.
      // Uses 'source-in' compositing so alpha/shape is preserved.
      if (recolorHex) {
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = recolorHex;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
      }
    } finally {
      URL.revokeObjectURL(url);
    }

    // Create Three.js texture from canvas
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;

    return { texture, aspect, widthMm, heightMm };
  }

  /**
   * Load a raster image (PNG/JPG) from a data URL to a Three.js texture
   * @param {string} dataUrl - Data URL of the image
   * @returns {Promise<{texture: THREE.Texture, aspect: number}>}
   */
  async rasterDataUrlToTexture(dataUrl) {
    const img = await this.loadImage(dataUrl);
    const aspect = img.width / img.height;

    // Resize if needed to avoid memory issues
    const maxDim = this.getMaxTextureResolution();
    let canvas;

    if (img.width > maxDim || img.height > maxDim) {
      canvas = document.createElement('canvas');
      if (img.width >= img.height) {
        canvas.width = maxDim;
        canvas.height = maxDim / aspect;
      } else {
        canvas.height = maxDim;
        canvas.width = maxDim * aspect;
      }
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const texture = new CanvasTexture(canvas);
      texture.needsUpdate = true;
      return { texture, aspect };
    }

    // Use TextureLoader for full-res images
    const texture = new Texture(img);
    texture.needsUpdate = true;
    return { texture, aspect };
  }

  /**
   * Load an image from a URL
   * @param {string} url - URL to load
   * @returns {Promise<HTMLImageElement>}
   */
  loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  }

  /**
   * Get the maximum texture resolution based on device capability
   * @returns {number} Maximum dimension in pixels
   */
  getMaxTextureResolution() {
    // Mobile devices get lower resolution to avoid memory issues
    const isMobile = window.innerWidth < 768 || navigator.maxTouchPoints > 0;
    return isMobile ? 1024 : 2048;
  }

  /**
   * Create or update the reference overlay plane mesh
   */
  createOrUpdateReferenceOverlay() {
    if (!this.scene || !this.referenceTexture) {
      return;
    }

    const { width, height, opacity, offsetX, offsetY, rotationDeg, zPosition } =
      this.overlayConfig;

    if (!this.referenceOverlay) {
      const geometry = new PlaneGeometry(width, height);
      const material = new MeshBasicMaterial({
        map: this.referenceTexture,
        transparent: true,
        opacity: opacity,
        depthWrite: false, // Prevent overlay from occluding other objects
        side: DoubleSide,
      });

      this.referenceOverlay = new Mesh(geometry, material);
      this.referenceOverlay.name = 'referenceOverlay';

      // Position on XY plane (normal +Z) for Z-up coordinate system
      this.referenceOverlay.rotation.x = 0; // Already on XY plane
      this.scene.add(this.referenceOverlay);

      console.log('[Preview] Reference overlay created');
    } else {
      // Update geometry if size changed
      const geo = this.referenceOverlay.geometry;
      if (geo.parameters.width !== width || geo.parameters.height !== height) {
        geo.dispose();
        this.referenceOverlay.geometry = new PlaneGeometry(width, height);
      }

      this.referenceOverlay.material.map = this.referenceTexture;
      this.referenceOverlay.material.opacity = opacity;
      this.referenceOverlay.material.needsUpdate = true;
    }

    this.referenceOverlay.position.set(offsetX, offsetY, zPosition);
    this.referenceOverlay.rotation.z = (rotationDeg * Math.PI) / 180;

    // Apply rotation centering offset if active
    if (this.rotationCenteringEnabled) {
      this.referenceOverlay.position.z = zPosition - this.autoBedOffset;
    }

    this.referenceOverlay.visible = this.overlayConfig.enabled;
  }

  /**
   * Fit the overlay size to match the current model's XY bounding box
   */
  fitOverlayToModelXY() {
    if (!this.mesh) {
      console.log('[Preview] No mesh to fit overlay to');
      return;
    }

    const box = new Box3().setFromObject(this.mesh);
    const size = box.getSize(new Vector3());

    // Update overlay dimensions to match model XY
    this.overlayConfig.width = size.x;
    this.overlayConfig.height = size.y;

    // If aspect is locked and we have an intrinsic aspect, adjust to fit within bounds
    if (this.overlayConfig.lockAspect && this.overlayConfig.intrinsicAspect) {
      const modelAspect = size.x / size.y;
      const imageAspect = this.overlayConfig.intrinsicAspect;

      if (imageAspect > modelAspect) {
        // Image is wider than model, fit to width
        this.overlayConfig.width = size.x;
        this.overlayConfig.height = size.x / imageAspect;
      } else {
        // Image is taller than model, fit to height
        this.overlayConfig.height = size.y;
        this.overlayConfig.width = size.y * imageAspect;
      }
    }

    // Center the overlay under the model
    this.overlayConfig.offsetX = 0;
    this.overlayConfig.offsetY = 0;

    if (this.overlayConfig.enabled) {
      this.createOrUpdateReferenceOverlay();
    }

    console.log(
      `[Preview] Overlay fitted to model XY: ${this.overlayConfig.width.toFixed(1)} x ${this.overlayConfig.height.toFixed(1)} mm`
    );
  }

  /**
   * Resize the reference overlay to match explicit physical screen dimensions (mm).
   * Use this to snap the overlay to a known tablet screen size selected from the
   * tablet database (public/data/tablets.json) or from SCAD parameters.
   *
   * @param {number} widthMm - Screen width in mm
   * @param {number} heightMm - Screen height in mm
   */
  fitOverlayToScreenDimensions(widthMm, heightMm) {
    if (
      typeof widthMm !== 'number' ||
      typeof heightMm !== 'number' ||
      widthMm <= 0 ||
      heightMm <= 0
    ) {
      console.warn(
        '[Preview] fitOverlayToScreenDimensions: invalid dimensions',
        widthMm,
        heightMm
      );
      return;
    }

    this.overlayConfig.width = widthMm;
    this.overlayConfig.height = heightMm;
    this.overlayConfig.offsetX = 0;
    this.overlayConfig.offsetY = 0;

    if (this.overlayConfig.enabled) {
      this.createOrUpdateReferenceOverlay();
    }

    console.log(
      `[Preview] Overlay sized to screen dimensions: ${widthMm} x ${heightMm} mm`
    );
  }

  /**
   * Enable or disable the reference overlay visibility
   * @param {boolean} enabled - Whether the overlay should be visible
   */
  setOverlayEnabled(enabled) {
    this.overlayConfig.enabled = enabled;

    if (enabled && this.referenceTexture) {
      this.createOrUpdateReferenceOverlay();
      // Refresh overlay measurements if they're enabled
      if (this.overlayMeasurementsEnabled) {
        this.showOverlayMeasurements();
      }
    } else if (this.referenceOverlay) {
      this.referenceOverlay.visible = false;
      // Hide overlay measurements when overlay is disabled
      this.hideOverlayMeasurements();
    }

    console.log(`[Preview] Overlay ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set the overlay opacity (0-1)
   * @param {number} opacity01 - Opacity value from 0 to 1
   */
  setOverlayOpacity(opacity01) {
    this.overlayConfig.opacity = Math.max(0, Math.min(1, opacity01));

    if (this.referenceOverlay && this.referenceOverlay.material) {
      this.referenceOverlay.material.opacity = this.overlayConfig.opacity;
    }
  }

  /**
   * Set the SVG recolor hex and re-rasterise the current overlay if it is SVG.
   * Pass null to revert to original SVG colours.
   * @param {string|null} hexColor - CSS hex colour (e.g. '#ffffff') or null
   */
  async setOverlaySvgColor(hexColor) {
    this.overlayConfig.svgColor = hexColor || null;

    // Re-rasterise if the current source is SVG
    if (this._lastSvgContent) {
      if (this.referenceTexture) {
        this.referenceTexture.dispose();
        this.referenceTexture = null;
      }
      const { texture, aspect } = await this.svgTextToCanvasTexture(
        this._lastSvgContent,
        this.overlayConfig.svgColor
      );
      this.referenceTexture = texture;
      this.overlayConfig.intrinsicAspect = aspect;

      if (this.overlayConfig.enabled) {
        this.createOrUpdateReferenceOverlay();
      }
    }
  }

  /**
   * Set the overlay transform (position and rotation)
   * @param {Object} transform - Transform configuration
   * @param {number} [transform.offsetX] - X offset in mm
   * @param {number} [transform.offsetY] - Y offset in mm
   * @param {number} [transform.rotationDeg] - Rotation in degrees
   */
  setOverlayTransform({ offsetX, offsetY, rotationDeg }) {
    if (typeof offsetX === 'number') {
      this.overlayConfig.offsetX = offsetX;
    }
    if (typeof offsetY === 'number') {
      this.overlayConfig.offsetY = offsetY;
    }
    if (typeof rotationDeg === 'number') {
      this.overlayConfig.rotationDeg = rotationDeg;
    }

    if (this.overlayConfig.enabled) {
      this.createOrUpdateReferenceOverlay();
      // Refresh measurements if enabled
      if (this.overlayMeasurementsEnabled) {
        this.showOverlayMeasurements();
      }
    }
  }

  /**
   * Set the overlay size
   * @param {Object} size - Size configuration
   * @param {number} [size.width] - Width in mm
   * @param {number} [size.height] - Height in mm
   */
  setOverlaySize({ width, height }) {
    if (typeof width === 'number') {
      this.overlayConfig.width = width;
      // Adjust height if aspect is locked
      if (this.overlayConfig.lockAspect && this.overlayConfig.intrinsicAspect) {
        this.overlayConfig.height = width / this.overlayConfig.intrinsicAspect;
      }
    }
    if (typeof height === 'number') {
      this.overlayConfig.height = height;
      // Adjust width if aspect is locked
      if (this.overlayConfig.lockAspect && this.overlayConfig.intrinsicAspect) {
        this.overlayConfig.width = height * this.overlayConfig.intrinsicAspect;
      }
    }

    if (this.overlayConfig.enabled) {
      this.createOrUpdateReferenceOverlay();
      // Refresh measurements if enabled
      if (this.overlayMeasurementsEnabled) {
        this.showOverlayMeasurements();
      }
    }
  }

  /**
   * Set whether aspect ratio is locked for the overlay
   * @param {boolean} locked - Whether to lock aspect ratio
   */
  setOverlayAspectLock(locked) {
    this.overlayConfig.lockAspect = locked;
  }

  /**
   * Remove and dispose the reference overlay
   */
  removeReferenceOverlay() {
    // Hide overlay measurements first
    this.hideOverlayMeasurements();

    if (this.referenceOverlay) {
      this.scene.remove(this.referenceOverlay);
      this.referenceOverlay.geometry.dispose();
      this.referenceOverlay.material.dispose();
      this.referenceOverlay = null;
      console.log('[Preview] Reference overlay removed');
    }

    if (this.referenceTexture) {
      this.referenceTexture.dispose();
      this.referenceTexture = null;
    }
  }

  /**
   * Get the current overlay configuration
   * @returns {Object} Copy of the overlay configuration
   */
  getOverlayConfig() {
    return { ...this.overlayConfig };
  }

  /**
   * Toggle overlay measurement display
   * @param {boolean} enabled - Show or hide overlay measurements
   */
  toggleOverlayMeasurements(enabled) {
    this.overlayMeasurementsEnabled = enabled;

    if (enabled && this.referenceOverlay && this.overlayConfig.enabled) {
      this.showOverlayMeasurements();
    } else {
      this.hideOverlayMeasurements();
    }

    console.log(
      `[Preview] Overlay measurements ${enabled ? 'enabled' : 'disabled'}`
    );
  }

  /**
   * Show measurement overlays on the reference overlay plane
   */
  showOverlayMeasurements() {
    if (!this.referenceOverlay || !this.overlayConfig.enabled) return;

    // Remove existing overlay measurements
    this.hideOverlayMeasurements();

    // Create group for overlay measurement visuals
    this.overlayMeasurementHelpers = new Group();
    this.overlayMeasurementHelpers.name = 'overlayMeasurements';

    const { width, height, offsetX, offsetY, zPosition, rotationDeg } =
      this.overlayConfig;

    // Calculate corners of the overlay (accounting for rotation centering)
    const z = this.rotationCenteringEnabled
      ? zPosition - this.autoBedOffset
      : zPosition;
    const zLabel = z + 0.1; // Just slightly above overlay plane

    // Center point
    const cx = offsetX;
    const cy = offsetY;

    // Half dimensions
    const hw = width / 2;
    const hh = height / 2;

    // Label offset distance from overlay edge (mm) - far enough to be visible
    const labelOffset = Math.max(15, Math.max(width, height) * 0.1);

    // Rotation in radians
    const rot = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    // Helper to rotate a point around center
    const rotatePoint = (x, y) => ({
      x: cx + (x - cx) * cos - (y - cy) * sin,
      y: cy + (x - cx) * sin + (y - cy) * cos,
    });

    // Calculate corners (after rotation)
    const corners = [
      rotatePoint(cx - hw, cy - hh), // bottom-left
      rotatePoint(cx + hw, cy - hh), // bottom-right
      rotatePoint(cx + hw, cy + hh), // top-right
      rotatePoint(cx - hw, cy + hh), // top-left
    ];

    // Choose color - use a different color than model measurements (cyan/teal)
    const lineColor = this.currentTheme.includes('dark') ? 0x00ffff : 0x008b8b;

    // Create outline edges
    for (let i = 0; i < 4; i++) {
      const start = corners[i];
      const end = corners[(i + 1) % 4];
      const points = [
        new Vector3(start.x, start.y, zLabel),
        new Vector3(end.x, end.y, zLabel),
      ];
      const geometry = new BufferGeometry().setFromPoints(points);
      const material = new LineBasicMaterial({ color: lineColor });
      const line = new Line(geometry, material);
      this.overlayMeasurementHelpers.add(line);
    }

    // Calculate label positions OUTSIDE the overlay bounds
    // Width label: below the bottom edge
    const bottomMid = {
      x: (corners[0].x + corners[1].x) / 2,
      y: (corners[0].y + corners[1].y) / 2,
    };
    // Offset perpendicular to bottom edge (outward)
    const bottomDir = {
      x: -(corners[1].y - corners[0].y),
      y: corners[1].x - corners[0].x,
    };
    const bottomLen = Math.sqrt(
      bottomDir.x * bottomDir.x + bottomDir.y * bottomDir.y
    );
    const widthLabelPos = {
      x: bottomMid.x - (bottomDir.x / bottomLen) * labelOffset,
      y: bottomMid.y - (bottomDir.y / bottomLen) * labelOffset,
    };

    // Height label: left of the left edge
    const leftMid = {
      x: (corners[0].x + corners[3].x) / 2,
      y: (corners[0].y + corners[3].y) / 2,
    };
    // Offset perpendicular to left edge (outward)
    const leftDir = {
      x: -(corners[3].y - corners[0].y),
      y: corners[3].x - corners[0].x,
    };
    const leftLen = Math.sqrt(leftDir.x * leftDir.x + leftDir.y * leftDir.y);
    const heightLabelPos = {
      x: leftMid.x - (leftDir.x / leftLen) * labelOffset,
      y: leftMid.y - (leftDir.y / leftLen) * labelOffset,
    };

    // Create flat text labels (lying on XY plane)
    const widthLabel = this.createFlatTextLabel(
      `${Math.round(width)} mm`,
      lineColor,
      rotationDeg
    );
    widthLabel.position.set(widthLabelPos.x, widthLabelPos.y, zLabel);
    this.overlayMeasurementHelpers.add(widthLabel);

    const heightLabel = this.createFlatTextLabel(
      `${Math.round(height)} mm`,
      lineColor,
      rotationDeg + 90 // Rotate 90° for height label
    );
    heightLabel.position.set(heightLabelPos.x, heightLabelPos.y, zLabel);
    this.overlayMeasurementHelpers.add(heightLabel);

    // Add dimension lines from label to edge
    this.addDimensionExtensionLine(widthLabelPos, bottomMid, zLabel, lineColor);
    this.addDimensionExtensionLine(heightLabelPos, leftMid, zLabel, lineColor);

    this.scene.add(this.overlayMeasurementHelpers);
    console.log(
      `[Preview] Overlay measurements displayed: ${Math.round(width)} x ${Math.round(height)} mm`
    );
  }

  /**
   * Create a flat text label that lies on the XY plane
   * @param {string} text - Text content
   * @param {number} color - Text color
   * @param {number} rotationDeg - Rotation in degrees
   * @returns {THREE.Mesh} Text mesh lying flat
   */
  createFlatTextLabel(text, color, rotationDeg) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSize = 48;

    // Set canvas size
    canvas.width = 256;
    canvas.height = 64;

    // Draw background for better visibility
    const bgColor = this.currentTheme.includes('dark')
      ? 'rgba(0, 0, 0, 0.85)'
      : 'rgba(255, 255, 255, 0.85)';
    context.fillStyle = bgColor;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Configure text rendering
    context.font = `bold ${fontSize}px Arial`;
    context.fillStyle = this.currentTheme.includes('dark')
      ? '#00ffff'
      : '#008b8b';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    // Create texture from canvas
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Create a plane geometry lying flat on XY
    // Size the plane proportionally to the text (roughly 20mm wide for readability)
    const planeWidth = 30;
    const planeHeight = planeWidth * (canvas.height / canvas.width);
    const geometry = new PlaneGeometry(planeWidth, planeHeight);

    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: DoubleSide,
      depthTest: true,
      depthWrite: false,
    });

    const mesh = new Mesh(geometry, material);

    // Rotate to lie flat on XY plane (facing up, +Z)
    // PlaneGeometry faces +Z by default, so no X rotation needed
    // Apply the overlay's rotation around Z axis
    mesh.rotation.z = (rotationDeg * Math.PI) / 180;

    return mesh;
  }

  /**
   * Add a thin extension line from label to edge
   * @param {Object} from - Start position {x, y}
   * @param {Object} to - End position {x, y}
   * @param {number} z - Z position
   * @param {number} color - Line color
   */
  addDimensionExtensionLine(from, to, z, color) {
    const points = [
      new Vector3(from.x, from.y, z),
      new Vector3(to.x, to.y, z),
    ];
    const geometry = new BufferGeometry().setFromPoints(points);
    const material = new LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.5,
    });
    const line = new Line(geometry, material);
    this.overlayMeasurementHelpers.add(line);
  }

  /**
   * Hide overlay measurement overlays
   */
  hideOverlayMeasurements() {
    if (this.overlayMeasurementHelpers) {
      // Dispose of geometries and materials
      this.overlayMeasurementHelpers.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });

      this.scene.remove(this.overlayMeasurementHelpers);
      this.overlayMeasurementHelpers = null;
    }
  }

  /**
   * Check if overlay measurements are enabled
   * @returns {boolean}
   */
  isOverlayMeasurementsEnabled() {
    return this.overlayMeasurementsEnabled;
  }

  /**
   * Clear the preview
   */
  clear() {
    this.hide2DPreview();
    this.hideMeasurements();
    this.dimensions = null;

    // Reset rotation centering state
    this.rotationCenteringEnabled = false;
    this.autoBedOffset = 0;

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this._disposeMeshResources();
      this.mesh = null;
    }

    // Keep the overlay when clearing the model (user may want to reference it for alignment)
    // But update its Z position since auto-bed offset is reset
    if (this.referenceOverlay) {
      this.referenceOverlay.position.z = this.overlayConfig.zPosition;
    }

    if (this.renderer) this.renderer.render(this.scene, this.getActiveCamera());

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

    // Cancel any pending debounced resize
    if (this._resizeDebounceId) {
      cancelAnimationFrame(this._resizeDebounceId);
      this._resizeDebounceId = null;
    }

    if (this._debouncedResize) {
      window.removeEventListener('resize', this._debouncedResize);
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
      this._disposeMeshResources();
    }

    // Clean up reference overlay
    this.removeReferenceOverlay();

    if (this.renderer) {
      this.renderer.dispose();
    }

    // Clear any render/resize hooks
    this._renderOverride = null;
    this._resizeHook = null;

    // Clear resize tracking state
    this._lastAspect = null;
    this._lastContainerWidth = 0;
    this._lastContainerHeight = 0;

    this.container.innerHTML = '';

    console.log('[Preview] Resources disposed');
  }

  /**
   * Set an optional render override function
   * When set, this function is called instead of the default renderer.render()
   * @param {Function|null} fn - Override function or null to clear
   */
  setRenderOverride(fn) {
    this._renderOverride = typeof fn === 'function' ? fn : null;
  }

  /**
   * Clear the render override, restoring default rendering
   */
  clearRenderOverride() {
    this._renderOverride = null;
  }

  /**
   * Set an optional resize hook function
   * Called after the default resize handling completes
   * @param {Function|null} fn - Hook function receiving ({ width, height }) or null to clear
   */
  setResizeHook(fn) {
    this._resizeHook = typeof fn === 'function' ? fn : null;
  }

  /**
   * Clear the resize hook
   */
  clearResizeHook() {
    this._resizeHook = null;
  }

  /**
   * Set an optional post-load hook function
   * Called after an STL is successfully loaded
   * Useful for re-applying rotation centering after model reload
   * @param {Function|null} fn - Hook function or null to clear
   */
  setPostLoadHook(fn) {
    this._postLoadHook = typeof fn === 'function' ? fn : null;
  }

  /**
   * Clear the post-load hook
   */
  clearPostLoadHook() {
    this._postLoadHook = null;
  }

  // --- Model Appearance Controls ---

  setModelOpacity(percent) {
    if (!this.appearanceOverrideEnabled) return;
    if (!this.mesh) return;
    const val = Math.max(10, Math.min(100, percent));
    const opacity = val / 100;

    const applyOpacity = (mat, meshObj) => {
      mat.transparent = opacity < 1;
      mat.opacity = opacity;
      mat.depthWrite = true;
      if (opacity < 1) meshObj.renderOrder = 1;
      mat.needsUpdate = true;
    };

    if (this.mesh.isGroup) {
      this.mesh.children.forEach((child) => {
        if (child.material) applyOpacity(child.material, child);
      });
    } else if (this.mesh.material) {
      applyOpacity(this.mesh.material, this.mesh);
    }
  }

  setBrightness(percent) {
    if (!this.appearanceOverrideEnabled) return;
    this._brightnessScale = percent / 100;
    this._applyLighting();
  }

  setContrast(percent) {
    if (!this.appearanceOverrideEnabled) return;
    this._contrastFactor = percent / 100;
    this._applyLighting();
  }

  _applyLighting() {
    if (!this.ambientLight) return;
    const bs = this._brightnessScale;
    const cf = this._contrastFactor;
    // Brightness scales all base intensities; contrast shifts ambient/directional ratio
    this.ambientLight.intensity =
      this.baseLightIntensities.ambient * bs * (2 - cf);
    this.directionalLight1.intensity = this.baseLightIntensities.dir1 * bs * cf;
    this.directionalLight2.intensity = this.baseLightIntensities.dir2 * bs * cf;
  }

  setAppearanceOverrideEnabled(enabled) {
    this.appearanceOverrideEnabled = enabled;
    this._syncAppearance();
  }

  _syncAppearance() {
    if (this.appearanceOverrideEnabled) {
      return;
    }
    // Reset to defaults when disabled — bypass the guard in setModelOpacity
    if (this.mesh) {
      const applyOpacity = (mat, meshObj) => {
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        meshObj.renderOrder = 0;
        mat.needsUpdate = true;
      };
      if (this.mesh.isGroup) {
        this.mesh.children.forEach((child) => {
          if (child.material) applyOpacity(child.material, child);
        });
      } else if (this.mesh.material) {
        applyOpacity(this.mesh.material, this.mesh);
      }
    }
    this._brightnessScale = 1;
    this._contrastFactor = 1;
    this._applyLighting();
  }

  resetAppearance() {
    if (!this.appearanceOverrideEnabled) return;
    this.setModelOpacity(100);
    this._brightnessScale = 1;
    this._contrastFactor = 1;
    this._applyLighting();
  }

  // ── Rendered 2D Preview ───────────────────────────────────────────────────
  //
  // Displays worker-produced SVG output in a native browser SVG surface
  // inside the same preview container used by the 3D viewer.  This is
  // distinct from the reference overlay which is a Three.js texture plane.

  /**
   * Show a rendered 2D SVG preview, hiding the 3D canvas.
   *
   * The SVG is sanitized (scripts/event-handlers stripped) and inserted
   * into the dedicated #rendered2dPreview element.  When the SVG carries
   * only bare geometry (no fill/stroke), a desktop-parity stylesheet is
   * injected whose colors depend on the display mode:
   *
   *  - **draft** (F5-equivalent): muted sage green fill (#7A9F7A), no
   *    prominent outlines — matches desktop OpenSCAD's F5 Preview for 2D.
   *  - **rendered** (F6-equivalent): bright teal fill (#07D0A7) with red
   *    outlines (#FF0603) — matches desktop OpenSCAD's F6 Render for 2D.
   *
   * @param {string} svgText - Raw SVG markup from the worker
   * @param {{ mode?: 'draft'|'rendered' }} [options]
   */
  show2DPreview(svgText, options = {}) {
    const mode = options.mode || 'draft';
    const previewEl = document.getElementById('rendered2dPreview');
    if (!previewEl) return;

    const sanitized = PreviewManager.sanitizeSVG(svgText);

    previewEl.innerHTML = sanitized;

    const svgEl = previewEl.querySelector('svg');
    if (svgEl) {
      svgEl.removeAttribute('width');
      svgEl.removeAttribute('height');
      svgEl.style.maxWidth = '100%';
      svgEl.style.maxHeight = '100%';
      svgEl.style.width = 'auto';
      svgEl.style.height = 'auto';

      if (PreviewManager.svgLacksVisualStyling(svgEl)) {
        PreviewManager.injectDesktopParityStyling(svgEl, mode);
      }
    }

    previewEl.classList.remove('hidden');
    this._set2DPreviewActive(true);

    const summary = document.getElementById('previewModelSummary');
    if (summary) {
      summary.textContent =
        mode === 'rendered'
          ? 'Full-quality rendered 2D SVG preview is displayed.'
          : 'Draft 2D SVG preview is displayed.';
    }
  }

  /**
   * Display a 2D SVG as a flat plane inside the Three.js 3D viewport.
   *
   * Instead of hiding the 3D canvas and showing a flat HTML overlay,
   * this converts the SVG to a texture, creates a PlaneGeometry sized
   * to the SVG's physical mm dimensions, and adds it to the scene as
   * `this.mesh`.  The camera fits to the plane automatically and all
   * orbit/zoom/pan controls remain active — matching how desktop
   * OpenSCAD shows 2D geometry in its 3D viewport.
   *
   * @param {string} svgText - Raw (or pre-styled) SVG markup
   * @param {{ mode?: 'draft'|'rendered' }} [options]
   * @returns {Promise<void>}
   */
  async show2DPreviewAs3DPlane(svgText, options = {}) {
    if (!this.scene || !this.renderer) return;

    // Ensure any previous flat HTML 2D preview is dismissed
    this.hide2DPreview();

    // Remove existing 3D mesh
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this._disposeMeshResources();
      this.mesh = null;
    }

    // Render SVG to a high-resolution canvas texture (4096px longest edge)
    // while preserving the original SVG width/height attributes for correct
    // mm dimension extraction. The PlaneGeometry is then sized in mm to
    // guarantee 1:1 scale fidelity with the 3D mesh.
    const { texture, widthMm, heightMm } = await this.svgTextToCanvasTexture(
      svgText,
      null,
      { targetCanvasSize: 4096 }
    );

    const planeW = widthMm || 200;
    const planeH = heightMm || 150;

    const geometry = new PlaneGeometry(planeW, planeH);
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: DoubleSide,
      depthWrite: true,
    });

    this.mesh = new Mesh(geometry, material);
    this.mesh.name = '2dPreviewPlane';
    this.scene.add(this.mesh);

    this.fitCameraToModel();
    if (this.renderer) this.renderer.render(this.scene, this.getActiveCamera());

    // Update ARIA summary
    const summary = document.getElementById('previewModelSummary');
    if (summary) {
      const mode = options.mode || 'draft';
      summary.textContent =
        mode === 'rendered'
          ? 'Full-quality rendered 2D SVG preview displayed in 3D viewport.'
          : 'Draft 2D SVG preview displayed in 3D viewport.';
    }
  }

  /**
   * Hide the rendered 2D preview, restoring the 3D canvas.
   */
  hide2DPreview() {
    const previewEl = document.getElementById('rendered2dPreview');
    if (!previewEl) return;
    previewEl.classList.add('hidden');
    previewEl.innerHTML = '';
    this._set2DPreviewActive(false);
  }

  /**
   * Toggle visibility of 3D canvas vs 2D preview surface.
   * @param {boolean} is2D
   */
  _set2DPreviewActive(is2D) {
    this._is2DPreviewActive = is2D;

    // Hide 3D canvas when 2D is active, show when 3D
    if (this.renderer?.domElement) {
      this.renderer.domElement.style.display = is2D ? 'none' : '';
    }

    // Hide placeholder when any content is active
    const placeholder = this.container?.querySelector('.preview-placeholder');
    if (placeholder) {
      placeholder.style.display = is2D || this.mesh ? 'none' : '';
    }

    // Update container ARIA label
    if (this.container) {
      this.container.setAttribute(
        'aria-label',
        is2D ? 'Rendered 2D SVG preview' : '3D model preview and controls'
      );
    }
  }

  /**
   * Sanitize SVG to prevent XSS — strips scripts, event handlers,
   * and external references while preserving geometry and styling.
   * @param {string} svgText
   * @returns {string}
   */
  static sanitizeSVG(svgText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svg = doc.documentElement;

    // Remove elements that can embed arbitrary HTML or external content
    for (const el of [
      ...svg.querySelectorAll(
        'script, foreignObject, iframe, embed, object'
      ),
    ]) {
      el.remove();
    }

    // Block <use> elements with external references (SSRF / data exfiltration)
    for (const useEl of [...svg.querySelectorAll('use')]) {
      const href =
        useEl.getAttribute('href') ||
        useEl.getAttribute('xlink:href') ||
        '';
      const val = href.trim().toLowerCase();
      if (
        val.startsWith('http:') ||
        val.startsWith('https:') ||
        val.startsWith('//')
      ) {
        useEl.remove();
      }
    }

    // Remove event-handler attributes and dangerous URI schemes from all elements
    const allEls = svg.querySelectorAll('*');
    for (const el of allEls) {
      for (const attr of [...el.attributes]) {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
        if (attr.name === 'href' || attr.name === 'xlink:href') {
          const val = attr.value.trim().toLowerCase();
          if (val.startsWith('javascript:') || val.startsWith('data:')) {
            el.removeAttribute(attr.name);
          }
        }
      }
    }

    return svg.outerHTML;
  }

  /**
   * Detect whether an SVG element's geometry paths lack explicit
   * fill/stroke styling (geometry-only export from OpenSCAD).
   * @param {SVGElement} svgEl
   * @returns {boolean}
   */
  static svgLacksVisualStyling(svgEl) {
    const shapes = svgEl.querySelectorAll(
      'path, polygon, polyline, line, circle, ellipse, rect'
    );
    if (shapes.length === 0) return false;

    let unstyled = 0;
    for (const shape of shapes) {
      const fill = shape.getAttribute('fill');
      const stroke = shape.getAttribute('stroke');
      const style = shape.getAttribute('style') || '';
      const hasFill = fill && fill !== 'none';
      const hasStroke = stroke && stroke !== 'none';
      const hasStyleFill =
        style.includes('fill:') && !style.includes('fill:none');
      const hasStyleStroke =
        style.includes('stroke:') && !style.includes('stroke:none');
      if (!hasFill && !hasStroke && !hasStyleFill && !hasStyleStroke) {
        unstyled++;
      }
    }
    return unstyled > shapes.length / 2;
  }

  /**
   * Inject a preview-only <style> element that approximates desktop
   * OpenSCAD's 2D viewport appearance.  Colors are selected per mode:
   *
   *  - **draft** (F5 Preview): #7A9F7A sage green fill, subtle edges.
   *  - **rendered** (F6 Render): #07D0A7 teal fill, #FF0603 red outlines.
   *
   * Reference: Testing Round 7 color-codes.json — desktop 2021.01 observations.
   *
   * @param {SVGElement} svgEl
   * @param {'draft'|'rendered'} [mode='draft']
   */
  static injectDesktopParityStyling(svgEl, mode = 'draft') {
    const ns = 'http://www.w3.org/2000/svg';
    const existing = svgEl.querySelector('style[data-forge-preview]');
    if (existing) return;

    const palette =
      mode === 'rendered'
        ? {
            fill: '#07D0A7',
            stroke: '#FF0603',
            strokeWidth: '0.5',
            fillOpacity: '1',
          }
        : {
            fill: '#7A9F7A',
            stroke: '#7A9F7A',
            strokeWidth: '0.25',
            fillOpacity: '0.9',
          };

    const styleEl = document.createElementNS(ns, 'style');
    styleEl.setAttribute('data-forge-preview', 'true');
    styleEl.textContent = [
      'path, polygon, polyline, circle, ellipse, rect {',
      `  fill: ${palette.fill};`,
      `  stroke: ${palette.stroke};`,
      `  stroke-width: ${palette.strokeWidth};`,
      `  fill-opacity: ${palette.fillOpacity};`,
      '}',
      'line {',
      `  stroke: ${palette.stroke};`,
      `  stroke-width: ${palette.strokeWidth};`,
      '}',
    ].join('\n');
    svgEl.insertBefore(styleEl, svgEl.firstChild);
  }
}
