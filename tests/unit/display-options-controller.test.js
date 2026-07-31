/**
 * Regression tests for show-edges overlay refresh behavior.
 *
 * Bug 1: when "Show Edges" was enabled, the edge overlay stayed at its
 * original geometry after parameter changes or project switches because
 * refreshOverlays() was never called after model loads in non-HFM paths.
 *
 * Bug 2 (desync): the overlay used to be scene-parented with a one-time
 * copied transform, so any later mesh movement left it floating in the
 * wrong place. It is now parented to the mesh itself.
 *
 * Bug 3 (never attached): init() runs during app startup but the
 * PreviewManager is not constructed until the first model loads, so the
 * one-shot listener registration silently no-opped and nothing ever
 * refreshed. connectPreviewManager() is now public and idempotent, and
 * file-handler.js calls it once the manager exists.
 *
 * These tests verify that:
 *  1. refreshOverlays() rebuilds the edges overlay from the current mesh
 *  2. _applyEdges() disposes the old overlay before creating a new one
 *  3. Toggling edges off properly removes the overlay
 *  4. init() registers a post-load listener so overlays auto-refresh
 *  5. dispose() unregisters the post-load listener
 *  6. The overlay is a child of the mesh and uses the theme edge color
 *  7. refreshThemeSensitiveOverlays() rebuilds the overlay on theme change
 *  8. Edges default on, but a saved 'false' preference still wins
 *  9. connectPreviewManager() late-binds, is idempotent, and re-targets
 * 10. The edge budget clips to the longest segments and persists
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DisplayOptionsController,
  resetDisplayOptionsController,
} from '../../src/js/display-options-controller.js';

vi.mock('../../src/js/storage-keys.js', () => ({
  getAppPrefKey: (key) => `test-${key}`,
  safeGetItem: (key) => localStorage.getItem(key),
  safeSetItem: (key, value) => {
    localStorage.setItem(key, value);
    return true;
  },
}));

vi.mock('../../src/js/announcer.js', () => ({
  announceImmediate: vi.fn(),
}));

function createMockGeometry() {
  return { dispose: vi.fn() };
}

function createMockMaterial() {
  return { dispose: vi.fn(), wireframe: false };
}

function createMockThree() {
  return {
    EdgesGeometry: vi.fn(function () {
      Object.assign(this, createMockGeometry());
    }),
    LineBasicMaterial: vi.fn(function (opts = {}) {
      Object.assign(this, opts, createMockMaterial());
    }),
    LineSegments: vi.fn(function (geo, mat) {
      this.geometry = geo;
      this.material = mat;
      this.name = '';
      this.parent = null;
      this.position = { copy: vi.fn() };
      this.rotation = { copy: vi.fn() };
      this.scale = { copy: vi.fn() };
    }),
    AxesHelper: vi.fn(function () {
      this.name = '';
    }),
  };
}

/** Mesh mock with Object3D-style child management (edges parent here). */
function createMockMesh() {
  const mesh = {
    geometry: createMockGeometry(),
    material: createMockMaterial(),
    children: [],
    position: { copy: vi.fn(), x: 0, y: 0, z: 0 },
    rotation: { copy: vi.fn(), x: 0, y: 0, z: 0 },
    scale: { copy: vi.fn(), x: 1, y: 1, z: 1 },
  };
  mesh.add = vi.fn((obj) => {
    mesh.children.push(obj);
    obj.parent = mesh;
  });
  mesh.remove = vi.fn((obj) => {
    const idx = mesh.children.indexOf(obj);
    if (idx >= 0) mesh.children.splice(idx, 1);
    obj.parent = null;
  });
  return mesh;
}

function createMockPreviewManager(mesh = null) {
  const children = [];
  const listeners = [];
  return {
    mesh,
    currentTheme: 'light',
    getThemeEdgeColor: vi.fn(() => 0x020617),
    scene: {
      add: vi.fn((obj) => children.push(obj)),
      remove: vi.fn((obj) => {
        const idx = children.indexOf(obj);
        if (idx >= 0) children.splice(idx, 1);
      }),
      getObjectByName: vi.fn(() => null),
      children,
    },
    addPostLoadListener: vi.fn((fn) => listeners.push(fn)),
    removePostLoadListener: vi.fn((fn) => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
    _testListeners: listeners,
  };
}

describe('DisplayOptionsController — edge overlay refresh', () => {
  let ctrl;
  let mockThree;
  let mockPm;
  let mockMesh;

  beforeEach(() => {
    resetDisplayOptionsController();
    localStorage.clear();
    document.body.innerHTML = '';
    mockThree = createMockThree();
    mockMesh = createMockMesh();
    mockPm = createMockPreviewManager(mockMesh);

    ctrl = new DisplayOptionsController({
      getPreviewManager: () => mockPm,
      getThree: () => mockThree,
    });
  });

  it('refreshOverlays() rebuilds the edges overlay when edges are enabled', () => {
    ctrl.state.edges = true;
    ctrl.refreshOverlays();

    expect(mockThree.EdgesGeometry).toHaveBeenCalledWith(mockMesh.geometry, 15);
    expect(ctrl._edgesOverlay).not.toBeNull();
    expect(mockMesh.add).toHaveBeenCalledWith(ctrl._edgesOverlay);
  });

  it('parents the overlay to the mesh, not the scene (desync fix)', () => {
    ctrl.state.edges = true;
    ctrl.refreshOverlays();

    expect(ctrl._edgesOverlay.parent).toBe(mockMesh);
    expect(mockMesh.children).toContain(ctrl._edgesOverlay);
    expect(mockPm.scene.add).not.toHaveBeenCalledWith(ctrl._edgesOverlay);
    // No transform copying: the overlay inherits the mesh transform.
    expect(ctrl._edgesOverlay.position.copy).not.toHaveBeenCalled();
    expect(ctrl._edgesOverlay.rotation.copy).not.toHaveBeenCalled();
    expect(ctrl._edgesOverlay.scale.copy).not.toHaveBeenCalled();
  });

  it('uses the theme edge color from the preview manager', () => {
    ctrl.state.edges = true;
    ctrl.refreshOverlays();

    expect(mockPm.getThemeEdgeColor).toHaveBeenCalled();
    expect(mockThree.LineBasicMaterial).toHaveBeenCalledWith({
      color: 0x020617,
    });
  });

  it('falls back to a fixed color when the pm lacks getThemeEdgeColor', () => {
    delete mockPm.getThemeEdgeColor;
    ctrl.state.edges = true;
    ctrl.refreshOverlays();

    expect(mockThree.LineBasicMaterial).toHaveBeenCalledWith({
      color: 0x333333,
    });
  });

  it('refreshOverlays() removes old overlay before creating a new one', () => {
    ctrl.state.edges = true;

    ctrl.refreshOverlays();
    const firstOverlay = ctrl._edgesOverlay;

    ctrl.refreshOverlays();
    const secondOverlay = ctrl._edgesOverlay;

    expect(firstOverlay.geometry.dispose).toHaveBeenCalled();
    expect(firstOverlay.material.dispose).toHaveBeenCalled();
    expect(firstOverlay.parent).toBeNull();
    expect(mockMesh.children).not.toContain(firstOverlay);
    expect(secondOverlay).not.toBe(firstOverlay);
  });

  it('refreshOverlays() is a no-op when edges are disabled', () => {
    ctrl.state.edges = false;
    ctrl.refreshOverlays();

    expect(ctrl._edgesOverlay).toBeNull();
    expect(mockThree.EdgesGeometry).not.toHaveBeenCalled();
  });

  it('skips the overlay for group meshes without their own geometry', () => {
    mockPm.mesh = { children: [], add: vi.fn() }; // debug-highlight Group
    ctrl.state.edges = true;

    expect(() => ctrl.refreshOverlays()).not.toThrow();
    expect(ctrl._edgesOverlay).toBeNull();
    expect(mockThree.EdgesGeometry).not.toHaveBeenCalled();
  });

  it('refreshOverlays() picks up a new mesh geometry after model change', () => {
    ctrl.state.edges = true;
    ctrl.refreshOverlays();

    const newMesh = createMockMesh();
    mockPm.mesh = newMesh;

    ctrl.refreshOverlays();

    expect(mockThree.EdgesGeometry).toHaveBeenLastCalledWith(
      newMesh.geometry,
      15
    );
    expect(ctrl._edgesOverlay.parent).toBe(newMesh);
  });

  it('refreshThemeSensitiveOverlays() rebuilds the overlay with the new theme color', () => {
    ctrl.state.edges = true;
    ctrl.refreshOverlays();
    const firstOverlay = ctrl._edgesOverlay;

    mockPm.getThemeEdgeColor.mockReturnValue(0x0d1117);
    ctrl.refreshThemeSensitiveOverlays();

    expect(ctrl._edgesOverlay).not.toBe(firstOverlay);
    expect(mockThree.LineBasicMaterial).toHaveBeenLastCalledWith({
      color: 0x0d1117,
    });
  });

  it('refreshThemeSensitiveOverlays() does not build edges when disabled', () => {
    ctrl.state.edges = false;
    ctrl.refreshThemeSensitiveOverlays();
    expect(ctrl._edgesOverlay).toBeNull();
    expect(mockThree.EdgesGeometry).not.toHaveBeenCalled();
  });

  it('dispose() detaches the overlay from the mesh', () => {
    ctrl.state.edges = true;
    ctrl.refreshOverlays();
    const overlay = ctrl._edgesOverlay;

    ctrl.dispose();

    expect(overlay.parent).toBeNull();
    expect(mockMesh.children).not.toContain(overlay);
    expect(ctrl._edgesOverlay).toBeNull();
  });
});

describe('DisplayOptionsController — post-load listener registration', () => {
  let mockThree;
  let mockPm;
  let mockMesh;

  beforeEach(() => {
    resetDisplayOptionsController();
    localStorage.clear();
    document.body.innerHTML = '';
    mockThree = createMockThree();
    mockMesh = createMockMesh();
    mockPm = createMockPreviewManager(mockMesh);
  });

  it('init() registers a post-load listener on the preview manager', () => {
    const ctrl = new DisplayOptionsController({
      getPreviewManager: () => mockPm,
      getThree: () => mockThree,
    });
    ctrl.init();

    expect(mockPm.addPostLoadListener).toHaveBeenCalledTimes(1);
    expect(typeof mockPm.addPostLoadListener.mock.calls[0][0]).toBe(
      'function'
    );
  });

  it('post-load listener rebuilds edges overlay when edges are enabled', () => {
    const ctrl = new DisplayOptionsController({
      getPreviewManager: () => mockPm,
      getThree: () => mockThree,
    });
    ctrl.init();
    ctrl.state.edges = true;

    const listener = mockPm._testListeners[0];
    listener();

    expect(mockThree.EdgesGeometry).toHaveBeenCalledWith(mockMesh.geometry, 15);
    expect(ctrl._edgesOverlay).not.toBeNull();
  });

  it('post-load listener picks up new geometry after model swap', () => {
    const ctrl = new DisplayOptionsController({
      getPreviewManager: () => mockPm,
      getThree: () => mockThree,
    });
    ctrl.init();
    ctrl.state.edges = true;

    const listener = mockPm._testListeners[0];
    listener();
    const firstOverlay = ctrl._edgesOverlay;

    const newMesh = createMockMesh();
    mockPm.mesh = newMesh;

    listener();

    expect(firstOverlay.geometry.dispose).toHaveBeenCalled();
    expect(mockThree.EdgesGeometry).toHaveBeenLastCalledWith(
      newMesh.geometry,
      15
    );
    expect(ctrl._edgesOverlay).not.toBe(firstOverlay);
  });

  it('dispose() removes the post-load listener', () => {
    const ctrl = new DisplayOptionsController({
      getPreviewManager: () => mockPm,
      getThree: () => mockThree,
    });
    ctrl.init();
    const listener = mockPm._testListeners[0];

    ctrl.dispose();

    expect(mockPm.removePostLoadListener).toHaveBeenCalledWith(listener);
    expect(mockPm._testListeners).toHaveLength(0);
  });

  it('init() is safe when preview manager lacks addPostLoadListener', () => {
    const legacyPm = {
      mesh: mockMesh,
      currentTheme: 'light',
      scene: {
        add: vi.fn(),
        remove: vi.fn(),
        getObjectByName: vi.fn(() => null),
        children: [],
      },
    };
    const ctrl = new DisplayOptionsController({
      getPreviewManager: () => legacyPm,
      getThree: () => mockThree,
    });

    expect(() => ctrl.init()).not.toThrow();
  });
});

// ============================================================================
// F20 — axis distance markings overlay
// ============================================================================

function makeFatThreeMock() {
  // Extends the slim mock used above with the classes axis-tick-overlay
  // needs (Group, BufferGeometry, sprite plumbing).
  const base = createMockThree();
  class MockGroup {
    constructor() {
      this.children = [];
      this.name = '';
      this.userData = {};
      this.renderOrder = 0;
    }
    add(o) {
      this.children.push(o);
    }
    remove(o) {
      this.children = this.children.filter((c) => c !== o);
    }
  }
  class MockBufferGeometry {
    constructor() {
      this.attributes = {};
      this.dispose = vi.fn();
    }
    setAttribute(name, attr) {
      this.attributes[name] = attr;
    }
  }
  class MockFloat32BufferAttribute {
    constructor(array, itemSize) {
      this.array = Float32Array.from(array);
      this.itemSize = itemSize;
    }
  }
  class MockLineBasicMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
      this.dispose = vi.fn();
    }
  }
  class MockLineSegmentsPair {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.name = '';
    }
  }
  class MockSpriteMaterial {
    constructor(opts = {}) {
      Object.assign(this, opts);
      this.dispose = vi.fn();
    }
  }
  class MockSprite {
    constructor(material) {
      this.material = material;
      this.position = {
        x: 0,
        y: 0,
        z: 0,
        set(x, y, z) {
          this.x = x;
          this.y = y;
          this.z = z;
        },
      };
      this.scale = {
        x: 1,
        y: 1,
        z: 1,
        set(x, y, z) {
          this.x = x;
          this.y = y;
          this.z = z;
        },
      };
      this.userData = {};
      this.geometry = { dispose: vi.fn() };
    }
  }
  class MockCanvasTexture {
    constructor(canvas) {
      this.image = canvas;
      this.needsUpdate = false;
      this.dispose = vi.fn();
    }
  }
  return {
    ...base,
    Group: MockGroup,
    BufferGeometry: MockBufferGeometry,
    Float32BufferAttribute: MockFloat32BufferAttribute,
    LineBasicMaterial: MockLineBasicMaterial,
    LineSegments: MockLineSegmentsPair,
    SpriteMaterial: MockSpriteMaterial,
    Sprite: MockSprite,
    CanvasTexture: MockCanvasTexture,
  };
}

function makePreviewManagerWithThemeListeners(mesh) {
  const base = createMockPreviewManager(mesh);
  const themeListeners = [];
  return {
    ...base,
    addThemeChangeListener: vi.fn((fn) => themeListeners.push(fn)),
    removeThemeChangeListener: vi.fn((fn) => {
      const i = themeListeners.indexOf(fn);
      if (i >= 0) themeListeners.splice(i, 1);
    }),
    _testThemeListeners: themeListeners,
  };
}

describe('DisplayOptionsController — axis distance markings (F20)', () => {
  let ctrl;
  let mockThree;
  let mockPm;
  let mockMesh;

  beforeEach(() => {
    resetDisplayOptionsController();
    localStorage.clear();
    document.body.innerHTML = '';
    mockThree = makeFatThreeMock();
    mockMesh = createMockMesh();
    mockPm = makePreviewManagerWithThemeListeners(mockMesh);
    ctrl = new DisplayOptionsController({
      getPreviewManager: () => mockPm,
      getThree: () => mockThree,
    });
    ctrl.init();
  });

  it('starts with axisMarks disabled by default', () => {
    expect(ctrl.get('axisMarks')).toBe(false);
    expect(ctrl._axisTickOverlay).toBeNull();
  });

  it('enabling axisMarks builds the tick overlay group and adds it to the scene', () => {
    ctrl.set('axisMarks', true);
    expect(ctrl._axisTickOverlay).not.toBeNull();
    const group = ctrl._axisTickOverlay.group;
    expect(group.name).toBe('__axisTickOverlay');
    expect(mockPm.scene.add).toHaveBeenCalledWith(group);
  });

  it('disabling axisMarks tears the overlay back down', () => {
    ctrl.set('axisMarks', true);
    const group = ctrl._axisTickOverlay.group;
    ctrl.set('axisMarks', false);
    expect(ctrl._axisTickOverlay).toBeNull();
    expect(mockPm.scene.remove).toHaveBeenCalledWith(group);
  });

  it('toggling persists state to localStorage just like the other display options', () => {
    ctrl.set('axisMarks', true);
    expect(localStorage.getItem('test-display-axisMarks')).toBe('true');
    ctrl.set('axisMarks', false);
    expect(localStorage.getItem('test-display-axisMarks')).toBe('false');
  });

  it('refreshThemeSensitiveOverlays rebuilds the overlay so labels pick up new theme color', () => {
    ctrl.set('axisMarks', true);
    const firstOverlay = ctrl._axisTickOverlay;
    expect(firstOverlay).not.toBeNull();

    ctrl.refreshThemeSensitiveOverlays();
    const secondOverlay = ctrl._axisTickOverlay;
    expect(secondOverlay).not.toBeNull();
    expect(secondOverlay).not.toBe(firstOverlay);
  });

  it('refreshThemeSensitiveOverlays is a no-op when axisMarks is off', () => {
    expect(ctrl.get('axisMarks')).toBe(false);
    expect(() => ctrl.refreshThemeSensitiveOverlays()).not.toThrow();
    expect(ctrl._axisTickOverlay).toBeNull();
  });

  it('init() registers a theme-change listener on the preview manager', () => {
    expect(mockPm.addThemeChangeListener).toHaveBeenCalledTimes(1);
    expect(mockPm._testThemeListeners.length).toBe(1);
  });

  it('theme-change listener triggers a rebuild when axisMarks is on', () => {
    ctrl.set('axisMarks', true);
    const listener = mockPm._testThemeListeners[0];
    const firstOverlay = ctrl._axisTickOverlay;

    listener();

    expect(ctrl._axisTickOverlay).not.toBeNull();
    expect(ctrl._axisTickOverlay).not.toBe(firstOverlay);
  });

  it('dispose() removes the axis tick overlay from the scene', () => {
    ctrl.set('axisMarks', true);
    const group = ctrl._axisTickOverlay.group;

    ctrl.dispose();

    expect(mockPm.scene.remove).toHaveBeenCalledWith(group);
    expect(ctrl._axisTickOverlay).toBeNull();
  });

  it('dispose() unsubscribes the theme-change listener', () => {
    const listener = mockPm._testThemeListeners[0];
    ctrl.dispose();
    expect(mockPm.removeThemeChangeListener).toHaveBeenCalledWith(listener);
    expect(mockPm._testThemeListeners).toHaveLength(0);
  });
});

// ============================================================================
// Edges on by default
// ============================================================================

describe('DisplayOptionsController — edges default state', () => {
  let pm;
  let three;

  function makeCtrl() {
    return new DisplayOptionsController({
      getPreviewManager: () => pm,
      getThree: () => three,
    });
  }

  beforeEach(() => {
    resetDisplayOptionsController();
    localStorage.clear();
    document.body.innerHTML = '';
    three = makeFatThreeMock();
    pm = makePreviewManagerWithThemeListeners(createMockMesh());
  });

  it('turns edges on when nothing has been saved', () => {
    const ctrl = makeCtrl();
    ctrl.init();
    expect(ctrl.get('edges')).toBe(true);
  });

  it('honors a saved "false" preference over the new default', () => {
    localStorage.setItem('test-display-edges', 'false');
    const ctrl = makeCtrl();
    ctrl.init();
    expect(ctrl.get('edges')).toBe(false);
  });

  it('honors a saved "true" preference', () => {
    localStorage.setItem('test-display-edges', 'true');
    const ctrl = makeCtrl();
    ctrl.init();
    expect(ctrl.get('edges')).toBe(true);
  });

  it('leaves the other helpers off by default', () => {
    const ctrl = makeCtrl();
    ctrl.init();
    expect(ctrl.get('axes')).toBe(false);
    expect(ctrl.get('crosshairs')).toBe(false);
    expect(ctrl.get('wireframe')).toBe(false);
    expect(ctrl.get('axisMarks')).toBe(false);
  });
});

// ============================================================================
// Late binding to the PreviewManager
// ============================================================================

describe('DisplayOptionsController — connectPreviewManager()', () => {
  let mockThree;
  let mockMesh;

  beforeEach(() => {
    resetDisplayOptionsController();
    localStorage.clear();
    document.body.innerHTML = '';
    mockThree = makeFatThreeMock();
    mockMesh = createMockMesh();
  });

  it('subscribes both the post-load and theme-change listeners', () => {
    const pm = makePreviewManagerWithThemeListeners(mockMesh);
    const ctrl = new DisplayOptionsController({
      getPreviewManager: () => pm,
      getThree: () => mockThree,
    });

    expect(ctrl.connectPreviewManager()).toBe(true);
    expect(pm._testListeners).toHaveLength(1);
    expect(pm._testThemeListeners).toHaveLength(1);
  });

  it('is idempotent when called repeatedly with the same manager', () => {
    const pm = makePreviewManagerWithThemeListeners(mockMesh);
    const ctrl = new DisplayOptionsController({
      getPreviewManager: () => pm,
      getThree: () => mockThree,
    });

    ctrl.init();
    expect(ctrl.connectPreviewManager()).toBe(false);
    ctrl.connectPreviewManager(pm);

    expect(pm.addPostLoadListener).toHaveBeenCalledTimes(1);
    expect(pm.addThemeChangeListener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from a previous manager before attaching to a new one', () => {
    const first = makePreviewManagerWithThemeListeners(mockMesh);
    const second = makePreviewManagerWithThemeListeners(createMockMesh());
    let current = first;
    const ctrl = new DisplayOptionsController({
      getPreviewManager: () => current,
      getThree: () => mockThree,
    });

    ctrl.connectPreviewManager();
    const postLoad = first._testListeners[0];
    const themeChange = first._testThemeListeners[0];

    current = second;
    expect(ctrl.connectPreviewManager()).toBe(true);

    expect(first.removePostLoadListener).toHaveBeenCalledWith(postLoad);
    expect(first.removeThemeChangeListener).toHaveBeenCalledWith(themeChange);
    expect(first._testListeners).toHaveLength(0);
    expect(first._testThemeListeners).toHaveLength(0);
    expect(second._testListeners).toHaveLength(1);
    expect(second._testThemeListeners).toHaveLength(1);
  });

  it('applies the persisted state to the newly connected scene', () => {
    localStorage.setItem('test-display-axes', 'true');
    const pm = makePreviewManagerWithThemeListeners(mockMesh);
    let current = null;
    const ctrl = new DisplayOptionsController({
      getPreviewManager: () => current,
      getThree: () => mockThree,
    });

    ctrl.init();
    expect(mockThree.EdgesGeometry).not.toHaveBeenCalled();

    current = pm;
    ctrl.connectPreviewManager(pm);

    expect(mockThree.EdgesGeometry).toHaveBeenCalledWith(mockMesh.geometry, 15);
    expect(pm.scene.add).toHaveBeenCalledWith(ctrl._axesHelper);
  });

  it('a controller initialized before the PreviewManager exists still auto-refreshes (regression)', () => {
    let current = null;
    const ctrl = new DisplayOptionsController({
      getPreviewManager: () => current,
      getThree: () => mockThree,
    });

    // App startup: init() runs long before the first model load.
    ctrl.init();

    // First SCAD file loads and file-handler.js builds the PreviewManager.
    current = makePreviewManagerWithThemeListeners(mockMesh);
    ctrl.connectPreviewManager(current);
    expect(current._testListeners).toHaveLength(1);

    // Parameter change produces new geometry and fires the post-load event.
    const newMesh = createMockMesh();
    current.mesh = newMesh;
    current._testListeners[0]();

    expect(mockThree.EdgesGeometry).toHaveBeenLastCalledWith(
      newMesh.geometry,
      15
    );
    expect(ctrl._edgesOverlay.parent).toBe(newMesh);
  });

  it('self-heals when a manager appears through an unexpected path', () => {
    let current = null;
    const ctrl = new DisplayOptionsController({
      getPreviewManager: () => current,
      getThree: () => mockThree,
    });
    ctrl.init();

    current = makePreviewManagerWithThemeListeners(mockMesh);
    ctrl.refreshOverlays();

    expect(current._testListeners).toHaveLength(1);
    expect(ctrl._edgesOverlay).not.toBeNull();
  });

  it('dispose() detaches from the connected manager even if the getter moved on', () => {
    const pm = makePreviewManagerWithThemeListeners(mockMesh);
    let current = pm;
    const ctrl = new DisplayOptionsController({
      getPreviewManager: () => current,
      getThree: () => mockThree,
    });
    ctrl.connectPreviewManager();

    current = null;
    ctrl.dispose();

    expect(pm._testListeners).toHaveLength(0);
    expect(pm._testThemeListeners).toHaveLength(0);
  });
});

// ============================================================================
// Edge budget (prominence-based clipping)
// ============================================================================

/**
 * Three.js mock whose EdgesGeometry returns a fixed set of segments so the
 * budget selection can be inspected. Each entry is [x1,y1,z1,x2,y2,z2].
 * @param {number[][]} segments
 */
function makeEdgeBudgetThree(segments) {
  const array = new Float32Array(segments.length * 6);
  segments.forEach((seg, i) => array.set(seg, i * 6));

  const fullEdges = {
    attributes: {
      position: { array, count: segments.length * 2, itemSize: 3 },
    },
    dispose: vi.fn(),
  };

  const T = makeFatThreeMock();
  T.EdgesGeometry = vi.fn(function () {
    return fullEdges;
  });
  T._fullEdges = fullEdges;
  return T;
}

/** Segments of length 1, 2, 3, … n laid along the X axis. */
function segmentsOfLength(n) {
  return Array.from({ length: n }, (_, i) => [0, 0, 0, i + 1, 0, 0]);
}

/** Read back the X extent of every segment in a built overlay. */
function overlaySegmentLengths(ctrl) {
  const { array } = ctrl._edgesOverlay.geometry.attributes.position;
  const lengths = [];
  for (let i = 0; i < array.length; i += 6) lengths.push(array[i + 3]);
  return lengths;
}

describe('DisplayOptionsController — edge budget', () => {
  let mockMesh;
  let mockPm;

  beforeEach(() => {
    resetDisplayOptionsController();
    localStorage.clear();
    document.body.innerHTML = '';
    mockMesh = createMockMesh();
    mockPm = makePreviewManagerWithThemeListeners(mockMesh);
  });

  function makeCtrl(three) {
    return new DisplayOptionsController({
      getPreviewManager: () => mockPm,
      getThree: () => three,
    });
  }

  it('defaults to the balanced 75,000-segment budget', () => {
    const ctrl = makeCtrl(makeEdgeBudgetThree(segmentsOfLength(5)));
    ctrl.init();
    expect(ctrl.getEdgeBudget()).toBe(75000);
  });

  it('leaves the geometry untouched when the model is under budget', () => {
    const three = makeEdgeBudgetThree(segmentsOfLength(5));
    const ctrl = makeCtrl(three);
    ctrl.init();

    expect(ctrl._edgesOverlay.geometry).toBe(three._fullEdges);
    expect(three._fullEdges.dispose).not.toHaveBeenCalled();
    expect(ctrl._edgeStats).toEqual({ total: 5, shown: 5 });
  });

  it('keeps the longest segments when over budget', () => {
    const three = makeEdgeBudgetThree(segmentsOfLength(5));
    const ctrl = makeCtrl(three);
    ctrl.init();
    ctrl.setEdgeBudget(2);

    expect(overlaySegmentLengths(ctrl).sort()).toEqual([4, 5]);
    expect(ctrl._edgeStats).toEqual({ total: 5, shown: 2 });
    expect(three._fullEdges.dispose).toHaveBeenCalled();
  });

  it('respects the cap exactly when segment lengths tie', () => {
    const three = makeEdgeBudgetThree(
      Array.from({ length: 6 }, () => [0, 0, 0, 3, 0, 0])
    );
    const ctrl = makeCtrl(three);
    ctrl.init();
    ctrl.setEdgeBudget(4);

    expect(overlaySegmentLengths(ctrl)).toEqual([3, 3, 3, 3]);
    expect(ctrl._edgeStats).toEqual({ total: 6, shown: 4 });
  });

  it('treats a budget of 0 as unlimited', () => {
    const three = makeEdgeBudgetThree(segmentsOfLength(5));
    const ctrl = makeCtrl(three);
    ctrl.init();
    ctrl.setEdgeBudget(2);
    ctrl.setEdgeBudget(0);

    expect(ctrl.getEdgeBudget()).toBe(0);
    expect(ctrl._edgesOverlay.geometry).toBe(three._fullEdges);
    expect(ctrl._edgeStats).toEqual({ total: 5, shown: 5 });
  });

  it('persists the budget and restores it on the next init', () => {
    const three = makeEdgeBudgetThree(segmentsOfLength(5));
    makeCtrl(three).setEdgeBudget(250000);
    expect(localStorage.getItem('test-display-edgeBudget')).toBe('250000');

    const restored = makeCtrl(makeEdgeBudgetThree(segmentsOfLength(5)));
    restored.init();
    expect(restored.getEdgeBudget()).toBe(250000);
  });

  it('falls back to the default for a corrupt saved value', () => {
    localStorage.setItem('test-display-edgeBudget', 'lots');
    const ctrl = makeCtrl(makeEdgeBudgetThree(segmentsOfLength(5)));
    ctrl.init();
    expect(ctrl.getEdgeBudget()).toBe(75000);
  });

  it('wires the drawer select and reports the resulting counts', () => {
    document.body.innerHTML = `
      <select id="edgeBudgetSelect">
        <option value="0">Unlimited</option>
        <option value="2">Two</option>
        <option value="75000">Balanced</option>
      </select>
      <span id="edgeBudgetStatus"></span>
    `;
    const three = makeEdgeBudgetThree(segmentsOfLength(5));
    const ctrl = makeCtrl(three);
    ctrl.init();

    const select = document.getElementById('edgeBudgetSelect');
    expect(select.value).toBe('75000');
    expect(document.getElementById('edgeBudgetStatus').textContent).toBe(
      'Showing all 5 edges'
    );

    select.value = '2';
    select.dispatchEvent(new Event('change'));

    expect(ctrl.getEdgeBudget()).toBe(2);
    expect(document.getElementById('edgeBudgetStatus').textContent).toBe(
      'Showing 2 of 5 edges'
    );
  });

  it('reports edges as hidden when the overlay is toggled off', () => {
    document.body.innerHTML = '<span id="edgeBudgetStatus"></span>';
    const ctrl = makeCtrl(makeEdgeBudgetThree(segmentsOfLength(5)));
    ctrl.init();
    ctrl.set('edges', false);

    expect(document.getElementById('edgeBudgetStatus').textContent).toBe(
      'Edges hidden'
    );
  });
});
