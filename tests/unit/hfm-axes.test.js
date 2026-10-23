/**
 * The Alt View's character look strokes the preview's axis lines, tick marks
 * and numerals over its characters (_hfm-axes.js): a line one pixel wide
 * falls between a cell's sample points, so the converter alone leaves only a
 * few stray characters of it. Clipped at the camera's near plane, projected
 * into the canvas's pixels, dashed where the preview dashes them, and drawn
 * only while the display options keep them in the preview's scene.
 *
 * @license GPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  AXES_OPACITY,
  axesSegments,
  clipToNear,
  strokeAxes,
} from '../../src/js/_hfm-axes.js';
import { buildAxisLinesOverlay } from '../../src/js/axis-lines-overlay.js';

function camera(width = 800, height = 600) {
  const cam = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
  cam.position.set(150, -150, 100);
  cam.up.set(0, 0, 1);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
}

function sceneWithAxes() {
  const scene = new THREE.Scene();
  const axes = buildAxisLinesOverlay(THREE, { distanceMm: 234, colorHex: 0 });
  scene.add(axes.group);
  return { scene, axes };
}

function mockContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    strokeStyle: '',
    lineWidth: 1,
  };
}

describe('clipToNear', () => {
  it('keeps a segment in front of the camera as it is', () => {
    const a = [0, 0, -5];
    const b = [1, 1, -9];
    expect(clipToNear(a, b, 0.1)).toEqual([a, b]);
  });

  it('cuts a segment that crosses the near plane at the plane', () => {
    const [a, b] = clipToNear([0, 0, -2], [0, 4, 2], 1);
    expect(a).toEqual([0, 0, -2]);
    expect(b[2]).toBeCloseTo(-1, 9);
    expect(b[1]).toBeCloseTo(1, 9);
  });

  it('drops a segment wholly behind the camera', () => {
    expect(clipToNear([0, 0, 1], [3, 3, 5], 0.1)).toBeNull();
  });
});

describe('axesSegments', () => {
  it('projects the axes from the origin, at the canvas center, outward', () => {
    const { scene } = sceneWithAxes();
    const parts = axesSegments(scene, camera(), 800, 600);
    expect(parts.length).toBe(6);
    for (const part of parts) {
      expect(part.segments.length).toBe(4);
      expect(part.segments[0]).toBeCloseTo(400, 3);
      expect(part.segments[1]).toBeCloseTo(300, 3);
    }
    expect(parts.filter((part) => part.dashed).length).toBe(3);
  });

  it('finds nothing while the options keep the axes out of the scene', () => {
    expect(axesSegments(new THREE.Scene(), camera(), 800, 600)).toEqual([]);
    const { scene, axes } = sceneWithAxes();
    axes.group.visible = false;
    expect(axesSegments(scene, camera(), 800, 600)).toEqual([]);
  });

  it('asks nothing of a scene or a camera it cannot use', () => {
    expect(axesSegments({}, {}, 800, 600)).toEqual([]);
    expect(axesSegments(sceneWithAxes().scene, {}, 800, 600)).toEqual([]);
  });
});

describe('strokeAxes', () => {
  it('strokes every segment in the look color, dashed where the preview dashes', () => {
    const ctx = mockContext();
    const parts = [
      { dashed: false, segments: [0, 0, 10, 10, 20, 20, 30, 30] },
      { dashed: true, segments: [5, 5, 6, 6] },
    ];
    strokeAxes(ctx, parts, { color: '#00ff00', lineWidth: 2, dash: 8 });
    expect(ctx.strokeStyle).toBe('#00ff00');
    expect(ctx.globalAlpha).toBe(AXES_OPACITY);
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.moveTo).toHaveBeenCalledTimes(3);
    expect(ctx.lineTo).toHaveBeenCalledTimes(3);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(ctx.setLineDash.mock.calls).toEqual([[[]], [[8, 8]]]);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });

  it('leaves the canvas alone with nothing to draw', () => {
    const ctx = mockContext();
    strokeAxes(ctx, [], { color: '#00ff00' });
    expect(ctx.save).not.toHaveBeenCalled();
  });
});

describe('the character look', () => {
  let originalGetContext;
  const contexts = [];

  beforeEach(() => {
    contexts.length = 0;
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function () {
      const ctx = {
        ...mockContext(),
        canvas: this,
        font: '',
        textAlign: '',
        textBaseline: '',
        fillStyle: '',
        imageSmoothingEnabled: true,
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
        createImageData: vi.fn((w, h) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(Math.max(1, w * h) * 4),
        })),
        putImageData: vi.fn(),
        measureText: vi.fn(() => ({
          width: 6,
          actualBoundingBoxAscent: 8,
          actualBoundingBoxDescent: 2,
          actualBoundingBoxLeft: 0,
          actualBoundingBoxRight: 6,
        })),
      };
      contexts.push(ctx);
      return ctx;
    };
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.restoreAllMocks();
  });

  it('strokes the axes over its characters while the scene holds them', async () => {
    vi.resetModules();
    const { initAltView } = await import('../../src/js/_hfm.js');
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 200 });
    Object.defineProperty(container, 'clientHeight', { value: 150 });
    const rendererCanvas = document.createElement('canvas');
    const cam = camera(200, 150);
    const { scene } = sceneWithAxes();
    const previewManager = {
      renderer: { domElement: rendererCanvas, render: vi.fn() },
      scene,
      camera: cam,
      container,
      controls: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
      isAutoRotateEnabled: vi.fn(() => false),
      getActiveCamera: vi.fn(() => cam),
    };
    const api = await initAltView(previewManager);
    vi.spyOn(performance, 'now').mockReturnValue(10000);
    api.enable();
    api.render();

    const overlay = contexts.find((ctx) =>
      ctx.canvas.classList.contains('hfm-overlay-canvas')
    );
    expect(overlay, 'the overlay was drawn').toBeTruthy();
    expect(
      overlay.stroke,
      'the axes are stroked over the characters'
    ).toHaveBeenCalled();
    api.dispose();
  });
});
