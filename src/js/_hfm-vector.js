/**
 * @license GPL-3.0-or-later
 */
// The Alt View's vector look. Below its smallest characters the model is
// drawn as its edges, as a vector monitor's beam drew lines: fat lines in
// the look's color over the model's faces, faint by default and solid at
// Surfaces 100 %, lit as the main preview lights a model. The lines are the
// creases (the Edges slider's angle), the
// silhouette for the camera's place, bright as the creases, and a dim
// wireframe of the rounded parts, which the creases leave out
// (`_hfm-edges.js`). Each frame is rendered to the preview's WebGL canvas;
// the look's overlay then shows it (`_hfm.js`). The phosphor looks add a
// soft dwell where the beam turns, in the line's own color; the DOS look
// draws at one pixel per CSS pixel with no smoothing, as a raster card did.

import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
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
import {
  buildEdgeTable,
  silhouetteSegments,
  wireframeSegments,
} from './_hfm-edges.js';

const _EDGE_PARTS = { BufferGeometry, EdgesGeometry, Float32BufferAttribute };

// The beam's dwell at a line's end, as wide as this many line widths.
const _DWELL_SCALE = 2.2;
// Another crease angle than the worker's is built on the page for a model of
// up to this many triangles (about 200 ms at most).
const _CREASE_BUILD_MAX_TRIANGLES = 100_000;
// The edge table, for the silhouette and the dim wireframe, is built on the
// page for a model of up to this many triangles (about 250 ms at most); a
// bigger one keeps its creases alone.
const _EDGE_TABLE_MAX_TRIANGLES = 100_000;
// The dim wireframe against the lines: its share of their brightness and
// of their width.
const _FACET_OPACITY = 0.4;
const _FACET_WIDTH = 0.5;
// The faces' color against the lines' (a face fully lit stays under a
// line), the backs' and cavities' against the faces', and the Surfaces
// setting from which the faces are solid: they write depth and hide what
// is behind them.
const _FACE_SHADE = 0.75;
const _BACK_SHADE = 0.45;
const _SOLID_FROM = 0.995;
// The main preview's lights, as preview.js sets them: an ambient and two
// lights that ride with the camera, their strengths scaled by pi to cancel
// the shading's divisor, the pair 1.5 times that, measured against the
// desktop OpenSCAD.
const _AMBIENT = 0.2 * Math.PI;
const _LIGHT = 1.5 * Math.PI;

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

  // The faces: the preview's own shading in the look's color, a little
  // under the lines, cavities and the backs of faces darker, as the main
  // preview tints them (its shader, so the tint reads the same `aIsInner`
  // flag). Under 100 % the faces blend and write no depth, so every line
  // shows through; at 100 % they are solid. The offset keeps a line on a
  // face in front of it.
  const surfaceMaterial = new MeshPhongMaterial({
    specular: 0x000000,
    shininess: 30,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  previewManager._applyBackfaceColoring?.(surfaceMaterial, 0x000000);
  const surface = new Mesh(new BufferGeometry(), surfaceMaterial);
  surface.matrixAutoUpdate = false;
  let solid = false;

  const lineMaterial = new LineMaterial({ linewidth: 1, worldUnits: false });
  let lineGeometry = new LineSegmentsGeometry();
  const lines = new LineSegments2(lineGeometry, lineMaterial);
  lines.matrixAutoUpdate = false;

  // The silhouette for the camera's place, as bright as the creases, and
  // the dim wireframe of the rounded parts under them.
  const outlineMaterial = new LineMaterial({ linewidth: 1, worldUnits: false });
  let outlineGeometry = new LineSegmentsGeometry();
  const outline = new LineSegments2(outlineGeometry, outlineMaterial);
  outline.matrixAutoUpdate = false;
  const facetMaterial = new LineMaterial({
    linewidth: 1,
    worldUnits: false,
    transparent: true,
    opacity: _FACET_OPACITY,
  });
  let facetGeometry = new LineSegmentsGeometry();
  const facets = new LineSegments2(facetGeometry, facetMaterial);
  facets.matrixAutoUpdate = false;

  const dwellMaterial = new PointsMaterial({
    map: _dwellTexture(),
    sizeAttenuation: false,
    transparent: true,
    depthWrite: false,
  });
  const dwell = new Points(new BufferGeometry(), dwellMaterial);
  dwell.matrixAutoUpdate = false;

  // The lights ride with the camera, as the main preview's do: a rig that
  // takes the camera's place each frame carries them.
  const ambient = new AmbientLight(0xffffff, _AMBIENT);
  const rig = new Group();
  rig.matrixAutoUpdate = false;
  const lightA = new DirectionalLight(0xffffff, _LIGHT);
  lightA.position.set(-1, 1, 1);
  const lightB = new DirectionalLight(0xffffff, _LIGHT);
  lightB.position.set(1, -1, -1);
  rig.add(lightA, lightA.target, lightB, lightB.target);
  scene.add(surface, facets, lines, outline, dwell, ambient, rig);

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
  const faceColor = new Color();
  // The edge table for the model drawn, the wireframe built from it for the
  // crease angle, and the eye the silhouette was last found for.
  let table = null;
  let tableKey = '';
  let facetKey = '';
  let facetCount = 0;
  let outlineCount = 0;
  const eye = new Vector3();
  const lastEye = new Vector3(NaN, NaN, NaN);
  let lastEyeMode = '';
  const intoLocal = new Matrix4();
  scene.background = new Color();

  function _syncTable(mesh, creaseDeg) {
    const geometry = mesh?.geometry ?? null;
    const key = geometry?.uuid ?? '';
    if (key !== tableKey) {
      tableKey = key;
      table = null;
      const position = geometry?.getAttribute('position');
      const triangles = Math.floor(
        (geometry?.index?.count ?? position?.count ?? 0) / 3
      );
      if (position && triangles > 0 && triangles <= _EDGE_TABLE_MAX_TRIANGLES) {
        table = buildEdgeTable(position.array, geometry.index?.array ?? null);
      }
    }
    const wanted = table ? `${key}|${creaseDeg}` : '';
    if (wanted === facetKey) return;
    facetKey = wanted;
    facetGeometry.dispose();
    facetGeometry = new LineSegmentsGeometry();
    facetCount = 0;
    if (table) {
      const segments = wireframeSegments(table, { creaseDeg });
      if (segments.length) {
        facetGeometry.setPositions(segments);
        facetCount = segments.length / 6;
      }
    }
    facets.geometry = facetGeometry;
    // The silhouette leaves the creases out, so it follows the angle too.
    lastEye.set(NaN, NaN, NaN);
  }

  // The silhouette is found again only when the eye has moved against the
  // model (a perspective camera's place, an orthographic one's direction,
  // in the model's own space).
  function _syncOutline(mesh, camera, creaseDeg) {
    if (!table || !mesh) {
      outline.visible = false;
      outlineCount = 0;
      return;
    }
    const mode = camera.isOrthographicCamera ? 'direction' : 'eye';
    intoLocal.copy(mesh.matrixWorld).invert();
    if (mode === 'eye') {
      eye.copy(camera.position).applyMatrix4(intoLocal);
    } else {
      camera.getWorldDirection(eye).transformDirection(intoLocal);
    }
    if (mode === lastEyeMode && eye.distanceToSquared(lastEye) <= 1e-12) {
      return;
    }
    lastEye.copy(eye);
    lastEyeMode = mode;
    const place = [eye.x, eye.y, eye.z];
    const segments = silhouetteSegments(
      table,
      mode === 'eye' ? { eye: place } : { direction: place },
      { creaseDeg }
    );
    outlineGeometry.dispose();
    outlineGeometry = new LineSegmentsGeometry();
    outlineCount = segments.length / 6;
    if (outlineCount) outlineGeometry.setPositions(segments);
    outline.geometry = outlineGeometry;
    outline.visible = outlineCount > 0;
  }

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
    for (const part of [surface, lines, dwell, outline, facets]) {
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
      _syncTable(mesh, creaseDeg);
      _syncOutline(mesh, camera, creaseDeg);
      facets.visible = facets.visible && facetCount > 0;

      scene.background.set(background);
      solid = surfaceOpacity >= _SOLID_FROM;
      faceColor.set(line);
      surfaceMaterial.color.copy(faceColor).multiplyScalar(_FACE_SHADE);
      const back = surfaceMaterial.userData.backfaceColorUniform;
      if (back) back.value.copy(faceColor).multiplyScalar(_BACK_SHADE);
      surfaceMaterial.opacity = solid ? 1 : surfaceOpacity;
      surfaceMaterial.transparent = !solid;
      surfaceMaterial.depthWrite = solid;
      rig.matrix.copy(camera.matrixWorld);
      lineMaterial.color.set(line);
      lineMaterial.linewidth = widthPx;
      lineMaterial.resolution.set(width, height);
      outlineMaterial.color.set(line);
      outlineMaterial.linewidth = widthPx;
      outlineMaterial.resolution.set(width, height);
      facetMaterial.color.set(line);
      facetMaterial.linewidth = Math.max(1, widthPx * _FACET_WIDTH);
      facetMaterial.resolution.set(width, height);
      surface.visible = surface.visible && surfaceOpacity > 0;
      dwell.visible = dwell.visible && !crisp;
      dwellMaterial.color.set(line);
      dwellMaterial.size = widthPx * _DWELL_SCALE;

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
    /**
     * The lines drawn last: the creases, the silhouette, the wireframe; and
     * whether the faces were solid or blended.
     */
    lineCounts: () => ({
      creases: edgeCount,
      outline: outlineCount,
      facets: facetCount,
      surfaces: solid ? 'solid' : 'clear',
    }),
    dispose() {
      lineGeometry.dispose();
      lineMaterial.dispose();
      outlineGeometry.dispose();
      outlineMaterial.dispose();
      facetGeometry.dispose();
      facetMaterial.dispose();
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
