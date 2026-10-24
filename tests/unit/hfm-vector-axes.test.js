/**
 * The Alt View's line drawing (_hfm-vector.js) draws the preview's helpers
 * itself: the axis lines, their tick marks and numerals, and the grid, in the
 * look's own color, as the display options and the grid say. They are built
 * again when the camera distance moves the way the display options would
 * rebuild them, and released with the pass. The pass renders a scene of its
 * own, so a helper it does not hold is a helper nobody sees.
 *
 * @license GPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  GridHelper,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { createVectorPass } from '../../src/js/_hfm-vector.js';
import {
  getDisplayOptionsController,
  resetDisplayOptionsController,
} from '../../src/js/display-options-controller.js';

let originalGetContext;

beforeEach(() => {
  // The pass paints its dwell spot on a 2D canvas, which jsdom does not have.
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = () => ({
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
    fillStyle: '',
  });
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  resetDisplayOptionsController();
});

const START = new Vector3(150, -150, 100);

function setUp({ axes = true, axisMarks = true } = {}) {
  const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 10000);
  camera.position.copy(START);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const frames = [];
  const previewManager = {
    renderer: {
      render: vi.fn((scene) => frames.push(scene)),
      setRenderTarget: vi.fn(),
    },
    mesh: new Mesh(new BoxGeometry(20, 20, 20), new MeshBasicMaterial()),
    camera,
    controls: { target: new Vector3(0, 0, 0) },
    getActiveCamera: () => camera,
    gridHelper: new GridHelper(220, 22),
  };
  const options = getDisplayOptionsController();
  options.state.axes = axes;
  options.state.axisMarks = axisMarks;
  const pass = createVectorPass(previewManager);
  // One frame of the look; the scene it drew is the first one rendered (the
  // Blue DOS look renders the same scene into its raster target first).
  const draw = ({ line = '#00ff00', crisp = false } = {}) => {
    frames.length = 0;
    pass.render({
      camera,
      width: 800,
      height: 600,
      line,
      background: '#000000',
      widthPx: 2,
      surfaceOpacity: 0.01,
      creaseDeg: 15,
      crisp,
    });
    return frames[0];
  };
  return { camera, previewManager, options, pass, draw };
}

/** The positive X arm's far end: the camera distance the axes were built for. */
const armLength = (scene) =>
  scene
    .getObjectByName('__displayAxis-xpos')
    .geometry.getAttribute('position')
    .getX(1);

const colorsOf = (group) => {
  const colors = new Set();
  group.traverse((part) => {
    if (part.material) colors.add(part.material.color.getHex());
  });
  return [...colors];
};

describe('the vector look draws the preview helpers', () => {
  it('holds the axes, their marks and the grid in the look color while the options are on', () => {
    const { draw, previewManager } = setUp();
    const scene = draw();
    const axes = scene.getObjectByName('__displayAxes');
    const marks = scene.getObjectByName('__axisTickOverlay');
    expect(axes, 'the axis lines are in the line drawing').toBeTruthy();
    expect(marks, 'the tick marks and numerals are in it').toBeTruthy();
    expect(colorsOf(axes)).toEqual([0x00ff00]);
    expect(colorsOf(marks)).toEqual([0x00ff00]);
    const grid = scene.getObjectByName('__vectorGrid');
    expect(grid?.visible, 'the grid follows the preview grid').toBe(true);
    expect(grid.geometry).toBe(previewManager.gridHelper.geometry);
    expect(grid.material.color.getHex()).toBe(0x00ff00);
  });

  it('draws them in the Blue DOS look as well, in its own color', () => {
    const { draw, previewManager } = setUp();
    const scene = draw({ line: '#ffff55', crisp: true });
    expect(previewManager.renderer.setRenderTarget).toHaveBeenCalled();
    expect(colorsOf(scene.getObjectByName('__displayAxes'))).toEqual([
      0xffff55,
    ]);
    expect(colorsOf(scene.getObjectByName('__axisTickOverlay'))).toEqual([
      0xffff55,
    ]);
  });

  it('leaves out what the options leave out', () => {
    const { draw, options, previewManager } = setUp();
    draw();
    options.state.axes = false;
    let scene = draw();
    expect(scene.getObjectByName('__displayAxes')).toBeUndefined();
    expect(scene.getObjectByName('__axisTickOverlay')).toBeTruthy();
    options.state.axisMarks = false;
    previewManager.gridHelper.visible = false;
    scene = draw();
    expect(scene.getObjectByName('__axisTickOverlay')).toBeUndefined();
    expect(scene.getObjectByName('__vectorGrid').visible).toBe(false);
    options.state.axes = true;
    scene = draw();
    expect(scene.getObjectByName('__displayAxes')).toBeTruthy();
  });

  it('builds them again when the camera distance moves as the display options would', () => {
    const { draw, camera } = setUp();
    const first = armLength(draw());
    expect(first).toBeCloseTo(START.length(), 3);
    // Under half a percent the display options keep their overlays.
    camera.position.multiplyScalar(1.004);
    camera.updateMatrixWorld();
    expect(armLength(draw())).toBe(first);
    camera.position.copy(START).multiplyScalar(2);
    camera.updateMatrixWorld();
    expect(armLength(draw())).toBeCloseTo(START.length() * 2, 3);
  });

  it('builds them again in a new look color', () => {
    const { draw } = setUp();
    draw({ line: '#00ff00' });
    const scene = draw({ line: '#ffb000' });
    expect(colorsOf(scene.getObjectByName('__displayAxes'))).toEqual([
      0xffb000,
    ]);
  });

  it('releases what it built with the pass, and never the preview grid', () => {
    const { draw, pass, previewManager } = setUp();
    const scene = draw();
    const spies = [];
    for (const name of ['__displayAxes', '__axisTickOverlay']) {
      scene.getObjectByName(name).traverse((part) => {
        if (part.geometry) spies.push(vi.spyOn(part.geometry, 'dispose'));
      });
    }
    const gridSpy = vi.spyOn(previewManager.gridHelper.geometry, 'dispose');
    pass.dispose();
    expect(spies.length).toBeGreaterThan(0);
    for (const spy of spies) expect(spy).toHaveBeenCalled();
    expect(gridSpy).not.toHaveBeenCalled();
  });
});
