/**
 * Three.js world builder for the ASCII City Walk game (CW-3).
 *
 * Turns a parsed city model (see city-data.js) into a static, Z-up scene
 * group: extruded building footprints merged into one mesh, a ground plane,
 * and flat road ribbons. Grey Lambert materials are chosen for the ASCII
 * pipeline, which maps rendered luminance to glyph density — walls lit by
 * the camera headlight read as dense glyph columns, the near-black ground
 * as sparse dots, roads as faint traces (and as the street network in the
 * top-down view).
 *
 * @license GPL-3.0-or-later
 */

import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Fog,
  Group,
  Mesh,
  MeshLambertMaterial,
  Path,
  PlaneGeometry,
  Shape,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Luminance palette (greys; the phosphor tint comes from the ASCII painter).
// Calibrated by eye against the CW-4 screenshots. The ground is EXACT black
// on purpose: the ASCII converter maps any uniformly lit surface to visible
// glyphs (only true black reads as empty cells), so open ground stays empty
// and the street canyons come from the building walls. The road ribbons are
// the map view's street network — the controller shows them only there.
const BUILDING_COLOR = 0x858585;
const GROUND_COLOR = 0x000000;
const ROAD_COLOR = 0x4a4a4a;

// Minor path classes are parsed (city-data keeps them for future rounds)
// but not drawn: dense downtowns carry footpaths everywhere, and under
// first-person perspective compression they merge into a solid glyph
// carpet that drowns the actual street grid.
const UNDRAWN_ROAD_KINDS = new Set([
  'footway',
  'path',
  'cycleway',
  'steps',
  'track',
]);

// Roads float just above the ground plane so they win the depth test.
const ROAD_LIFT_M = 0.08;
const GROUND_MARGIN_M = 200;

/**
 * Extrude one building footprint. Footprint coordinates are meters in the
 * XY plane; extrusion runs along +Z from minHeightM to heightM.
 *
 * @param {{outer: Array<[number,number]>, holes: Array<Array<[number,number]>>, heightM: number, minHeightM: number}} building
 * @returns {ExtrudeGeometry|null}
 */
function extrudeBuilding(building) {
  const shape = new Shape(building.outer.map(([x, y]) => new Vector2(x, y)));
  for (const hole of building.holes) {
    shape.holes.push(new Path(hole.map(([x, y]) => new Vector2(x, y))));
  }

  const depth = building.heightM - building.minHeightM;
  if (!(depth > 0)) return null;

  let geometry;
  try {
    geometry = new ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 1,
    });
  } catch (_) {
    // Malformed polygons that survived parsing must not kill the city.
    return null;
  }
  if (building.minHeightM > 0) {
    geometry.translate(0, 0, building.minHeightM);
  }
  return geometry;
}

/**
 * Build one flat ribbon strip along a road centerline: two triangles per
 * segment, unmitred joins (adjacent quads simply overlap).
 *
 * @param {{points: Array<[number,number]>, widthM: number}} road
 * @param {number[]} positions - flat xyz output array (appended to)
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} [cullBounds]
 *   segments with both endpoints outside are skipped
 */
function appendRoadRibbon(road, positions, cullBounds) {
  const half = road.widthM / 2;
  const inBounds = (x, y) =>
    !cullBounds ||
    (x >= cullBounds.minX &&
      x <= cullBounds.maxX &&
      y >= cullBounds.minY &&
      y <= cullBounds.maxY);
  for (let i = 0; i < road.points.length - 1; i++) {
    const [x1, y1] = road.points[i];
    const [x2, y2] = road.points[i + 1];
    if (!inBounds(x1, y1) && !inBounds(x2, y2)) continue;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const px = (-dy / len) * half;
    const py = (dx / len) * half;

    const a = [x1 + px, y1 + py, ROAD_LIFT_M];
    const b = [x1 - px, y1 - py, ROAD_LIFT_M];
    const c = [x2 - px, y2 - py, ROAD_LIFT_M];
    const d = [x2 + px, y2 + py, ROAD_LIFT_M];
    // Two CCW triangles (normal +Z): a-b-c, a-c-d
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
}

/**
 * Build the static city world group.
 *
 * @param {ReturnType<import('./city-data.js').parseCityExtract>} model
 * @returns {{group: Group, dispose: () => void, stats: {buildingTriangles: number, roadTriangles: number}}}
 */
export function buildCityGroup(model) {
  const group = new Group();
  group.name = 'ascii-city';
  const disposables = [];

  // Buildings — one merged mesh, one draw call.
  const buildingGeoms = [];
  for (const building of model.buildings) {
    const geom = extrudeBuilding(building);
    if (geom) buildingGeoms.push(geom);
  }
  let buildingTriangles = 0;
  if (buildingGeoms.length > 0) {
    const merged = mergeGeometries(buildingGeoms, false);
    for (const geom of buildingGeoms) geom.dispose();
    const material = new MeshLambertMaterial({ color: BUILDING_COLOR });
    const mesh = new Mesh(merged, material);
    mesh.name = 'buildings';
    group.add(mesh);
    disposables.push(merged, material);
    buildingTriangles = merged.getAttribute('position').count / 3;
  }

  // Ground plane (PlaneGeometry lies in XY facing +Z — already our Z-up floor).
  const b = model.boundsM;
  const width = Math.max(b.maxX - b.minX, 1) + GROUND_MARGIN_M * 2;
  const height = Math.max(b.maxY - b.minY, 1) + GROUND_MARGIN_M * 2;
  const groundGeom = new PlaneGeometry(width, height);
  const groundMat = new MeshLambertMaterial({ color: GROUND_COLOR });
  const ground = new Mesh(groundGeom, groundMat);
  ground.name = 'ground';
  ground.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0);
  group.add(ground);
  disposables.push(groundGeom, groundMat);

  // Roads — one merged ribbon mesh. Segments entirely beyond the ground
  // plane are dropped: Overpass returns whole ways, and their far tails
  // would otherwise float over the void past the ground's edge.
  const cullBounds = {
    minX: b.minX - GROUND_MARGIN_M,
    minY: b.minY - GROUND_MARGIN_M,
    maxX: b.maxX + GROUND_MARGIN_M,
    maxY: b.maxY + GROUND_MARGIN_M,
  };
  const roadPositions = [];
  for (const road of model.roads) {
    if (UNDRAWN_ROAD_KINDS.has(road.kind)) continue;
    appendRoadRibbon(road, roadPositions, cullBounds);
  }
  let roadTriangles = 0;
  if (roadPositions.length > 0) {
    const roadGeom = new BufferGeometry();
    roadGeom.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(roadPositions), 3)
    );
    const normals = new Float32Array(roadPositions.length);
    for (let i = 0; i < normals.length; i += 3) normals[i + 2] = 1;
    roadGeom.setAttribute('normal', new BufferAttribute(normals, 3));
    const roadMat = new MeshLambertMaterial({
      color: ROAD_COLOR,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const roads = new Mesh(roadGeom, roadMat);
    roads.name = 'roads';
    group.add(roads);
    disposables.push(roadGeom, roadMat);
    roadTriangles = roadPositions.length / 9;
  }

  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
    stats: { buildingTriangles, roadTriangles },
  };
}

/**
 * Attach the game's lighting: a dim ambient fill plus a headlight parented
 * to the camera (the same view-space arrangement the model preview uses, so
 * walls facing the player read brightest in the ASCII conversion).
 *
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera
 * @returns {() => void} dispose
 */
export function attachCityLighting(scene, camera) {
  const ambient = new AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  // Distance fade to black: building faces dim with depth (near walls
  // dense glyphs, far skyline sparse) and the far field falls to empty —
  // the reference aesthetic's "distant objects fade into the dark".
  // Disabled for the orthographic map view by the controller.
  const fog = new Fog(0x000000, 40, 260);
  const prevFog = scene.fog;
  scene.fog = fog;

  // Camera must be in the scene graph for its child light to render.
  scene.add(camera);
  const headlight = new DirectionalLight(0xffffff, 2.2);
  headlight.position.set(0, 0, 0);
  headlight.target.position.set(0, 0, -1); // straight down the view axis
  camera.add(headlight);
  camera.add(headlight.target);

  return () => {
    camera.remove(headlight);
    camera.remove(headlight.target);
    scene.remove(ambient);
    scene.remove(camera);
    scene.fog = prevFog ?? null;
    ambient.dispose();
    headlight.dispose();
  };
}
