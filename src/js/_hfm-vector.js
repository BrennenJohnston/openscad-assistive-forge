/**
 * @license GPL-3.0-or-later
 */
// The Alt View's vector look. Below its smallest characters the model is
// drawn as its edges, as a vector monitor's beam drew lines: fat lines in
// the look's color over faint surfaces that write no depth, so every edge
// shows through. Each frame is rendered to the preview's WebGL canvas; the
// look's overlay then shows it (`_hfm.js`). The phosphor looks add a soft
// dwell where the beam turns, in the line's own color; the DOS look draws at
// one pixel per CSS pixel with no smoothing, as a raster card did.

import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {
  buildEdgeGeometry,
  getDisplayOptionsController,
} from './display-options-controller.js';

const _EDGE_PARTS = { BufferGeometry, EdgesGeometry, Float32BufferAttribute };

// The beam's dwell at a line's end, as wide as this many line widths.
const _DWELL_SCALE = 2.2;
// Another crease angle than the worker's is built on the page for a model of
// up to this many triangles (about 200 ms at most).
const _CREASE_BUILD_MAX_TRIANGLES = 100_000;

/**
 * A soft round spot, bright in the middle, for the dwell points.
 * @returns {CanvasTexture}
 */
function _dwellTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/**
 * The mesh a model is drawn from: the model itself, or the first ordinary
 * mesh of a group (a highlighted model is a group of two).
 * @param {Object|null} model
 * @returns {Object|null}
 */
function _modelMesh(model) {
  if (!model) return null;
  if (model.isMesh) return model;
  return (
    model.children?.find(
      (child) => child.isMesh && !child.userData?.isHighlightOverlay
    ) ?? null
  );
}

/**
 * @param {Object} previewManager - the preview, for its renderer and model
 * @returns {{render: Function, edgeCount: () => number, dispose: Function}}
 */
export function createVectorPass(previewManager) {
  const { renderer } = previewManager;
  const scene = new Scene();

  const surfaceMaterial = new MeshLambertMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const surface = new Mesh(new BufferGeometry(), surfaceMaterial);
  surface.matrixAutoUpdate = false;

  const lineMaterial = new LineMaterial({ linewidth: 1, worldUnits: false });
  let lineGeometry = new LineSegmentsGeometry();
  const lines = new LineSegments2(lineGeometry, lineMaterial);
  lines.matrixAutoUpdate = false;

  const dwellMaterial = new PointsMaterial({
    map: _dwellTexture(),
    sizeAttenuation: false,
    transparent: true,
    depthWrite: false,
  });
  const dwell = new Points(new BufferGeometry(), dwellMaterial);
  dwell.matrixAutoUpdate = false;

  // A light from the eye, so a solid surface reads as a shape: a face turned
  // to the eye comes out in the line's own color, one at 60 degrees about two
  // thirds of it (three.js divides a light's strength by pi).
  const ambient = new AmbientLight(0xffffff, 1);
  const headlight = new DirectionalLight(0xffffff, 2.2);
  scene.add(surface, lines, dwell, ambient, headlight, headlight.target);

  // The DOS look renders at one texel per CSS pixel and is shown unsmoothed.
  let raster = null;
  const rasterScene = new Scene();
  const rasterCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const rasterQuad = new Mesh(
    new PlaneGeometry(2, 2),
    new MeshBasicMaterial({ depthTest: false, depthWrite: false })
  );
  rasterScene.add(rasterQuad);

  let edgeKey = '';
  let edgeCount = 0;
  const forward = new Vector3();
  scene.background = new Color();

  function _syncEdges(mesh, creaseDeg) {
    const geometry = mesh?.geometry ?? null;
    const budget = getDisplayOptionsController().getEdgeBudget();
    const key = geometry
      ? `${geometry.uuid}|${geometry.userData?.edgeSegments ? 'w' : 's'}|${creaseDeg}|${budget}`
      : '';
    if (key === edgeKey) return;
    edgeKey = key;
    lineGeometry.dispose();
    lineGeometry = new LineSegmentsGeometry();
    dwell.geometry.dispose();
    dwell.geometry = new BufferGeometry();
    surface.geometry = geometry ?? new BufferGeometry();
    edgeCount = 0;
    if (geometry) {
      const built = buildEdgeGeometry(_EDGE_PARTS, geometry, {
        budget,
        thresholdDeg: creaseDeg,
        buildUpTo: _CREASE_BUILD_MAX_TRIANGLES,
      });
      const positions = built.geometry.getAttribute('position')?.array;
      if (positions?.length) {
        lineGeometry.setPositions(positions);
        dwell.geometry.setAttribute(
          'position',
          new Float32BufferAttribute(positions, 3)
        );
        edgeCount = built.shown;
      }
      built.geometry.dispose();
    }
    lines.geometry = lineGeometry;
  }

  function _place(mesh) {
    for (const part of [surface, lines, dwell]) {
      part.visible = Boolean(mesh);
      if (mesh) part.matrix.copy(mesh.matrixWorld);
    }
  }

  return {
    /**
     * Render one frame of the vector look to the preview's canvas.
     * @param {Object} frame
     * @param {Object} frame.camera
     * @param {number} frame.width - CSS px
     * @param {number} frame.height - CSS px
     * @param {string} frame.line - the line color
     * @param {string} frame.background - the screen's color
     * @param {number} frame.widthPx - line width in CSS px
     * @param {number} frame.surfaceOpacity - 0 to 1
     * @param {number} frame.creaseDeg - the angle at which a crease is an edge
     * @param {boolean} frame.crisp - the DOS look's raster pixels
     */
    render({
      camera,
      width,
      height,
      line,
      background,
      widthPx,
      surfaceOpacity,
      creaseDeg,
      crisp,
    }) {
      const mesh = _modelMesh(previewManager.mesh);
      mesh?.updateWorldMatrix(true, false);
      _syncEdges(mesh, creaseDeg);
      _place(mesh);

      scene.background.set(background);
      lineMaterial.color.set(line);
      lineMaterial.linewidth = widthPx;
      lineMaterial.resolution.set(width, height);
      surfaceMaterial.color.set(line);
      surfaceMaterial.opacity = surfaceOpacity;
      surface.visible = surface.visible && surfaceOpacity > 0;
      dwell.visible = dwell.visible && !crisp;
      dwellMaterial.color.set(line);
      dwellMaterial.size = widthPx * _DWELL_SCALE;

      camera.getWorldDirection(forward);
      headlight.position.copy(camera.position);
      headlight.target.position.copy(camera.position).add(forward);

      if (!crisp) {
        renderer.render(scene, camera);
        return;
      }
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      if (!raster || raster.width !== w || raster.height !== h) {
        raster?.dispose();
        raster = new WebGLRenderTarget(w, h, {
          minFilter: NearestFilter,
          magFilter: NearestFilter,
        });
        rasterQuad.material.map = raster.texture;
        rasterQuad.material.needsUpdate = true;
      }
      renderer.setRenderTarget(raster);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(rasterScene, rasterCamera);
    },
    /** How many edges the last model drew. */
    edgeCount: () => edgeCount,
    dispose() {
      lineGeometry.dispose();
      lineMaterial.dispose();
      surfaceMaterial.dispose();
      dwell.geometry.dispose();
      dwellMaterial.map?.dispose();
      dwellMaterial.dispose();
      raster?.dispose();
      rasterQuad.geometry.dispose();
      rasterQuad.material.dispose();
    },
  };
}
