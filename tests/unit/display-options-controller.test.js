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
 * These tests verify that:
 *  1. refreshOverlays() rebuilds the edges overlay from the current mesh
 *  2. _applyEdges() disposes the old overlay before creating a new one
 *  3. Toggling edges off properly removes the overlay
 *  4. init() registers a post-load listener so overlays auto-refresh
 *  5. dispose() unregisters the post-load listener
 *  6. The overlay is a child of the mesh and uses the theme edge color
 *  7. refreshThemeSensitiveOverlays() rebuilds the overlay on theme change
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
