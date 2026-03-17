/**
 * Regression test for Phase 7: show-edges overlay not refreshing on model change.
 *
 * The bug: when "Show Edges" was enabled, the edge overlay stayed at its
 * original geometry after parameter changes or project switches because
 * refreshOverlays() was never called from anywhere in the codebase.
 *
 * These tests verify that:
 *  1. refreshOverlays() rebuilds the edges overlay from the current mesh
 *  2. _applyEdges() disposes the old overlay before creating a new one
 *  3. Toggling edges off properly removes the overlay
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
    LineBasicMaterial: vi.fn(function () {
      Object.assign(this, createMockMaterial());
    }),
    LineSegments: vi.fn(function (geo, mat) {
      this.geometry = geo;
      this.material = mat;
      this.name = '';
      this.position = { copy: vi.fn() };
      this.rotation = { copy: vi.fn() };
      this.scale = { copy: vi.fn() };
    }),
    AxesHelper: vi.fn(function () {
      this.name = '';
    }),
  };
}

function createMockPreviewManager(mesh = null) {
  const children = [];
  return {
    mesh,
    currentTheme: 'light',
    scene: {
      add: vi.fn((obj) => children.push(obj)),
      remove: vi.fn((obj) => {
        const idx = children.indexOf(obj);
        if (idx >= 0) children.splice(idx, 1);
      }),
      getObjectByName: vi.fn(() => null),
      children,
    },
  };
}

describe('DisplayOptionsController — edge overlay refresh', () => {
  let ctrl;
  let mockThree;
  let mockPm;
  const mockMesh = {
    geometry: createMockGeometry(),
    material: createMockMaterial(),
    position: { copy: vi.fn(), x: 0, y: 0, z: 0 },
    rotation: { copy: vi.fn(), x: 0, y: 0, z: 0 },
    scale: { copy: vi.fn(), x: 1, y: 1, z: 1 },
  };

  beforeEach(() => {
    resetDisplayOptionsController();
    localStorage.clear();
    document.body.innerHTML = '';
    mockThree = createMockThree();
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
    expect(mockPm.scene.add).toHaveBeenCalled();
    expect(ctrl._edgesOverlay).not.toBeNull();
  });

  it('refreshOverlays() removes old overlay before creating a new one', () => {
    ctrl.state.edges = true;

    ctrl.refreshOverlays();
    const firstOverlay = ctrl._edgesOverlay;

    ctrl.refreshOverlays();
    const secondOverlay = ctrl._edgesOverlay;

    expect(firstOverlay.geometry.dispose).toHaveBeenCalled();
    expect(firstOverlay.material.dispose).toHaveBeenCalled();
    expect(mockPm.scene.remove).toHaveBeenCalledWith(firstOverlay);
    expect(secondOverlay).not.toBe(firstOverlay);
  });

  it('refreshOverlays() is a no-op when edges are disabled', () => {
    ctrl.state.edges = false;
    ctrl.refreshOverlays();

    expect(ctrl._edgesOverlay).toBeNull();
    expect(mockThree.EdgesGeometry).not.toHaveBeenCalled();
  });

  it('refreshOverlays() picks up a new mesh geometry after model change', () => {
    ctrl.state.edges = true;
    ctrl.refreshOverlays();

    const newGeometry = createMockGeometry();
    mockPm.mesh = {
      ...mockMesh,
      geometry: newGeometry,
    };

    ctrl.refreshOverlays();

    expect(mockThree.EdgesGeometry).toHaveBeenLastCalledWith(newGeometry, 15);
  });
});
