/**
 * Three.js world builder for the ASCII City Walk game (CW-3, expanded in
 * CW-8).
 *
 * Turns a parsed city model (see city-data.js) into a static, Z-up scene
 * group: extruded building footprints merged into one mesh, a ground plane,
 * and flat road ribbons. The ASCII converter maps rendered luminance to
 * glyph density, so everything here is designed around what the sampler can
 * see:
 *
 * - Walls carry a repeating window-grid texture. Three's ExtrudeGeometry
 *   side-wall UVs are WORLD METERS (u = x or y, v = -z), so a RepeatWrapping
 *   texture with repeat = 1/spacing needs no custom UVs — lit windows become
 *   glyph clusters, dark grout becomes seams, and buildings read as the
 *   reference's window arrays instead of uniform glyph slabs.
 * - Each building gets a deterministic tint: a lightness TIER (what the
 *   monochrome modes see as per-building glyph density) plus a HUE aligned
 *   with the high-contrast palettes (what CW-6's color quantization sees).
 *   The tint rides a per-vertex color attribute so all buildings still merge
 *   into one draw call.
 * - Grounded buildings get a brighter 0–3.5 m storefront strip (coplanar
 *   with the wall, pulled forward by polygonOffset) — the reference's lit
 *   ground floor.
 * - The ground is near-black with a sparse deterministic dot texture (the
 *   reference's near-field dither); roads are dim at street level and
 *   brighten in the map view via setMapView().
 *
 * @license GPL-3.0-or-later
 */

import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Path,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Per-view road treatment. Any visible SURFACE tone carpets the lower half
// of the street view — perspective stacks every road between here and the
// horizon into a few cell rows (measured again in CW-8; fog does not save
// it). So at street level the surfaces go exact black and streets are drawn
// the way the reference draws them: as CURB LINES — thin edge ribbons that
// read as dashes nearby and sub-sample away with distance. Overhead, the
// surfaces brighten into the map's street network and the curbs hide.
export const ROAD_TONES = { street: 0x000000, map: 0x4a4a4a };
const CURB_TONE = 0x303030;
const CURB_WIDTH_M = 0.5;

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

// Window grid: 4 m bays, 3 m storeys; the texture tile spans 4×3 bays so a
// deterministic scatter of dark windows repeats every 16 m × 9 m instead of
// every bay.
const WINDOW_BAY_W_M = 4;
const WINDOW_BAY_H_M = 3;
const WINDOW_TILE_BAYS_X = 4;
const WINDOW_TILE_BAYS_Y = 3;

const STOREFRONT_HEIGHT_M = 3.5;
const GROUND_TILE_M = 48;

// Building tint model. TIERS drive luminance (what monochrome sees);
// HUES are the CW-Q5/Q6 palette families (what HC quantization sees).
// The chroma component is constructed luminance-free, so two buildings in
// the same tier read identically bright in mono while quantizing to
// different colors under high contrast.
const TINT_TIERS = [0.5, 0.65, 0.8, 0.95];
const TINT_HUES_DEG = [0, 30, 60, 120, 180, 270, 300, 330];
const TINT_CHROMA = 0.45;
const STOREFRONT_TINT = [0.95, 0.95, 0.95];

/**
 * Deterministic 32-bit hash for building identity (index + name).
 * @param {number} index
 * @param {string} [name]
 * @returns {number} unsigned 32-bit
 */
function hashBuilding(index, name) {
  let h = (index * 2654435761) >>> 0;
  if (typeof name === 'string') {
    for (let i = 0; i < name.length; i++) {
      h = ((h ^ name.charCodeAt(i)) * 16777619) >>> 0;
    }
  }
  h ^= h >>> 16;
  h = (h * 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** Pure hue → RGB (HSL with S=1, L=0.5). */
function hueToRgb(hueDeg) {
  const h = ((hueDeg % 360) + 360) % 360;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

const LUM_R = 0.2126;
const LUM_G = 0.7152;
const LUM_B = 0.0722;

/**
 * Deterministic per-building tint: luminance == tier exactly (pre-clamp),
 * hue carried as a luminance-free chroma offset.
 *
 * @param {number} index - building index in the model
 * @param {string} [name]
 * @returns {[number, number, number]} linear-ish RGB in [0, 1]
 */
export function buildingTint(index, name) {
  const h = hashBuilding(index, name);
  const tier = TINT_TIERS[h % TINT_TIERS.length];
  const hue = TINT_HUES_DEG[(h >>> 3) % TINT_HUES_DEG.length];

  const [hr, hg, hb] = hueToRgb(hue);
  const hueLum = hr * LUM_R + hg * LUM_G + hb * LUM_B;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  return [
    clamp01(tier + (hr - hueLum) * TINT_CHROMA),
    clamp01(tier + (hg - hueLum) * TINT_CHROMA),
    clamp01(tier + (hb - hueLum) * TINT_CHROMA),
  ];
}

// ---------------------------------------------------------------------------
// Procedural textures (deterministic; null in headless test environments)
// ---------------------------------------------------------------------------

/** Tiny LCG so texture randomness is identical on every machine. */
function makeLcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function make2dContext(width, height) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext?.('2d');
  if (!ctx || typeof ctx.fillRect !== 'function') return null;
  return { canvas, ctx };
}

function makeRepeatingTexture(canvas, repeatX, repeatY, offsetY = 0) {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.offset.set(0, offsetY);
  return texture;
}

/**
 * Window-grid wall texture: lit window rectangles on dark grout, one 4×3-bay
 * tile with a deterministic quarter of the windows gone dark.
 * @returns {CanvasTexture|null}
 */
function createWindowTexture() {
  const bayW = 96;
  const bayH = 72;
  const c = make2dContext(bayW * WINDOW_TILE_BAYS_X, bayH * WINDOW_TILE_BAYS_Y);
  if (!c) return null;
  const { canvas, ctx } = c;

  ctx.fillStyle = '#101010';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rand = makeLcg(0xc17b0011);
  for (let by = 0; by < WINDOW_TILE_BAYS_Y; by++) {
    for (let bx = 0; bx < WINDOW_TILE_BAYS_X; bx++) {
      const x0 = bx * bayW;
      const y0 = by * bayH;
      const dark = rand() < 0.25;
      ctx.fillStyle = dark ? '#2c2c2c' : '#dcdcdc';
      ctx.fillRect(x0 + bayW * 0.2, y0 + bayH * 0.2, bayW * 0.6, bayH * 0.56);
      // Center mullion splits each window into two panes.
      ctx.fillStyle = '#101010';
      ctx.fillRect(x0 + bayW * 0.48, y0 + bayH * 0.2, bayW * 0.04, bayH * 0.56);
    }
  }

  const tileWM = WINDOW_BAY_W_M * WINDOW_TILE_BAYS_X;
  const tileHM = WINDOW_BAY_H_M * WINDOW_TILE_BAYS_Y;
  // Side-wall v = 1 - z: the -1/tile offset puts a bay boundary at z = 0 so
  // window rows count up from each building's base.
  return makeRepeatingTexture(canvas, 1 / tileWM, 1 / tileHM, -1 / tileHM);
}

/**
 * Storefront texture: one bright glass band per 4 m bay with a dim sign
 * strip above — the ground floor glow of the reference.
 * @returns {CanvasTexture|null}
 */
function createStorefrontTexture() {
  const c = make2dContext(192, 112);
  if (!c) return null;
  const { canvas, ctx } = c;

  ctx.fillStyle = '#181818';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Glass
  ctx.fillStyle = '#efefef';
  ctx.fillRect(
    canvas.width * 0.08,
    canvas.height * 0.3,
    canvas.width * 0.84,
    canvas.height * 0.62
  );
  // Sign band
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(
    canvas.width * 0.08,
    canvas.height * 0.06,
    canvas.width * 0.84,
    canvas.height * 0.14
  );

  return makeRepeatingTexture(
    canvas,
    1 / WINDOW_BAY_W_M,
    1 / STOREFRONT_HEIGHT_M,
    -1 / STOREFRONT_HEIGHT_M
  );
}

/**
 * Ground dot-noise texture: sparse dim speckles on black for the near-field
 * dither; everything else stays exact black (empty cells).
 * @returns {CanvasTexture|null}
 */
function createGroundTexture() {
  const size = 256;
  const c = make2dContext(size, size);
  if (!c) return null;
  const { canvas, ctx } = c;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  const rand = makeLcg(0x5eed6a0d);
  const dots = 150;
  for (let i = 0; i < dots; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const tone = 0x26 + Math.floor(rand() * 0x14);
    ctx.fillStyle = `rgb(${tone}, ${tone}, ${tone})`;
    ctx.fillRect(x, y, rand() < 0.3 ? 2 : 1, 1);
  }

  return makeRepeatingTexture(canvas, 1 / GROUND_TILE_M, 1 / GROUND_TILE_M);
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * Extrude one building footprint. Footprint coordinates are meters in the
 * XY plane; extrusion runs along +Z from minHeightM to heightM.
 *
 * @param {{outer: Array<[number,number]>, holes: Array<Array<[number,number]>>, heightM: number, minHeightM: number}} building
 * @param {[number, number, number]} tint - per-vertex color for the whole building
 * @param {{depthOverride?: number}} [options]
 * @returns {ExtrudeGeometry|null}
 */
function extrudeBuilding(building, tint, options = {}) {
  const shape = new Shape(building.outer.map(([x, y]) => new Vector2(x, y)));
  for (const hole of building.holes) {
    shape.holes.push(new Path(hole.map(([x, y]) => new Vector2(x, y))));
  }

  const depth = options.depthOverride ?? building.heightM - building.minHeightM;
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
  if (options.depthOverride === undefined && building.minHeightM > 0) {
    geometry.translate(0, 0, building.minHeightM);
  }

  const positionCount = geometry.getAttribute('position').count;
  const colors = new Float32Array(positionCount * 3);
  for (let i = 0; i < positionCount; i++) {
    colors[i * 3] = tint[0];
    colors[i * 3 + 1] = tint[1];
    colors[i * 3 + 2] = tint[2];
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));

  return geometry;
}

/**
 * Build flat ribbon strips along a road centerline: two triangles per
 * segment, unmitred joins (adjacent quads simply overlap). With
 * `edgeOffset`, the ribbon is shifted sideways from the centerline —
 * that is how the curb lines are drawn (one ribbon per side).
 *
 * @param {{points: Array<[number,number]>, widthM: number}} road
 * @param {number[]} positions - flat xyz output array (appended to)
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} [cullBounds]
 *   segments with both endpoints outside are skipped
 * @param {{widthM?: number, offsetM?: number, liftM?: number}} [shape]
 *   ribbon width / sideways offset / z lift overrides
 */
function appendRoadRibbon(road, positions, cullBounds, shape = {}) {
  const half = (shape.widthM ?? road.widthM) / 2;
  const offset = shape.offsetM ?? 0;
  const lift = shape.liftM ?? ROAD_LIFT_M;
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
    const nx = -dy / len;
    const ny = dx / len;
    const cx1 = x1 + nx * offset;
    const cy1 = y1 + ny * offset;
    const cx2 = x2 + nx * offset;
    const cy2 = y2 + ny * offset;
    const px = nx * half;
    const py = ny * half;

    const a = [cx1 + px, cy1 + py, lift];
    const b = [cx1 - px, cy1 - py, lift];
    const c = [cx2 - px, cy2 - py, lift];
    const d = [cx2 + px, cy2 + py, lift];
    // Two CCW triangles (normal +Z): a-b-c, a-c-d
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
}

/**
 * Build the static city world group.
 *
 * @param {ReturnType<import('./city-data.js').parseCityExtract>} model
 * @returns {{
 *   group: Group,
 *   setMapView: (isMap: boolean) => void,
 *   dispose: () => void,
 *   stats: {buildingTriangles: number, storefrontTriangles: number, roadTriangles: number}
 * }}
 */
export function buildCityGroup(model) {
  const group = new Group();
  group.name = 'ascii-city';
  const disposables = [];

  const windowTexture = createWindowTexture();
  const storefrontTexture = createStorefrontTexture();
  const groundTexture = createGroundTexture();
  for (const t of [windowTexture, storefrontTexture, groundTexture]) {
    if (t) disposables.push(t);
  }

  // Buildings — one merged, vertex-tinted, window-textured mesh.
  const buildingGeoms = [];
  const storefrontGeoms = [];
  model.buildings.forEach((building, index) => {
    const tint = buildingTint(index, building.name);
    const geom = extrudeBuilding(building, tint);
    if (!geom) return;
    buildingGeoms.push(geom);

    // Grounded buildings tall enough to have an upstairs get the lit
    // storefront strip; elevated parts (skybridges) do not.
    if (
      building.minHeightM === 0 &&
      building.heightM >= STOREFRONT_HEIGHT_M + 1.5
    ) {
      const strip = extrudeBuilding(building, STOREFRONT_TINT, {
        depthOverride: STOREFRONT_HEIGHT_M,
      });
      if (strip) storefrontGeoms.push(strip);
    }
  });

  let buildingTriangles = 0;
  let buildingsMat = null;
  if (buildingGeoms.length > 0) {
    const merged = mergeGeometries(buildingGeoms, false);
    for (const geom of buildingGeoms) geom.dispose();
    buildingsMat = new MeshLambertMaterial({
      color: 0xffffff,
      map: windowTexture ?? null,
      vertexColors: true,
    });
    const mesh = new Mesh(merged, buildingsMat);
    mesh.name = 'buildings';
    group.add(mesh);
    disposables.push(merged, buildingsMat);
    buildingTriangles = merged.getAttribute('position').count / 3;
  }

  let storefrontTriangles = 0;
  if (storefrontGeoms.length > 0) {
    const merged = mergeGeometries(storefrontGeoms, false);
    for (const geom of storefrontGeoms) geom.dispose();
    const material = new MeshLambertMaterial({
      color: 0xffffff,
      map: storefrontTexture ?? null,
      vertexColors: true,
      // Coplanar with the building wall behind it — pull it forward.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new Mesh(merged, material);
    mesh.name = 'storefronts';
    group.add(mesh);
    disposables.push(merged, material);
    storefrontTriangles = merged.getAttribute('position').count / 3;
  }

  // Ground plane (PlaneGeometry lies in XY facing +Z — already our Z-up
  // floor). Black base + sparse dot texture = near-field dither only.
  const b = model.boundsM;
  const width = Math.max(b.maxX - b.minX, 1) + GROUND_MARGIN_M * 2;
  const height = Math.max(b.maxY - b.minY, 1) + GROUND_MARGIN_M * 2;
  const groundGeom = new PlaneGeometry(width, height);
  const groundMat = new MeshLambertMaterial({
    color: 0xffffff,
    map: groundTexture ?? null,
  });
  if (!groundTexture) groundMat.color.setHex(0x000000);
  const ground = new Mesh(groundGeom, groundMat);
  ground.name = 'ground';
  ground.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0);
  // Texture repeat is per-meter; the plane's UVs span 0..1, so scale them.
  if (groundTexture) {
    groundTexture.repeat.set(width / GROUND_TILE_M, height / GROUND_TILE_M);
  }
  group.add(ground);
  disposables.push(groundGeom, groundMat);

  // Roads — one merged ribbon mesh, dim at street level, bright overhead.
  // Segments entirely beyond the ground plane are dropped: Overpass returns
  // whole ways, and their far tails would otherwise float over the void.
  const cullBounds = {
    minX: b.minX - GROUND_MARGIN_M,
    minY: b.minY - GROUND_MARGIN_M,
    maxX: b.maxX + GROUND_MARGIN_M,
    maxY: b.maxY + GROUND_MARGIN_M,
  };
  const roadPositions = [];
  const curbPositions = [];
  for (const road of model.roads) {
    if (UNDRAWN_ROAD_KINDS.has(road.kind)) continue;
    appendRoadRibbon(road, roadPositions, cullBounds);
    const edgeOffset = (road.widthM - CURB_WIDTH_M) / 2;
    for (const side of [edgeOffset, -edgeOffset]) {
      appendRoadRibbon(road, curbPositions, cullBounds, {
        widthM: CURB_WIDTH_M,
        offsetM: side,
        liftM: ROAD_LIFT_M + 0.02,
      });
    }
  }

  const makeFlatMesh = (positions, material, name) => {
    const geom = new BufferGeometry();
    geom.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(positions), 3)
    );
    const normals = new Float32Array(positions.length);
    for (let i = 0; i < normals.length; i += 3) normals[i + 2] = 1;
    geom.setAttribute('normal', new BufferAttribute(normals, 3));
    const mesh = new Mesh(geom, material);
    mesh.name = name;
    group.add(mesh);
    disposables.push(geom, material);
    return mesh;
  };

  let roadTriangles = 0;
  let roadMat = null;
  let curbMesh = null;
  if (roadPositions.length > 0) {
    roadMat = new MeshLambertMaterial({
      color: ROAD_TONES.street,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    makeFlatMesh(roadPositions, roadMat, 'roads');
    roadTriangles = roadPositions.length / 9;

    const curbMat = new MeshLambertMaterial({
      color: CURB_TONE,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    curbMesh = makeFlatMesh(curbPositions, curbMat, 'curbs');
  }

  return {
    group,
    /**
     * Swap per-view scene treatment. Street view: black road surfaces,
     * streets drawn as curb lines, textured walls and dotted ground. Map
     * view: bright road surfaces (the street network), curbs hidden, and
     * textures stripped — solid tinted roofs on clean black ground keep the
     * overhead blocks readable (roof caps share the wall texture's world
     * UVs, and its dark grout turned the round-1 map to fuzz).
     * @param {boolean} isMap
     */
    setMapView(isMap) {
      if (roadMat) {
        roadMat.color = new Color(isMap ? ROAD_TONES.map : ROAD_TONES.street);
      }
      if (curbMesh) curbMesh.visible = !isMap;
      if (buildingsMat) {
        buildingsMat.map = isMap ? null : (windowTexture ?? null);
        buildingsMat.needsUpdate = true;
      }
      groundMat.map = isMap ? null : (groundTexture ?? null);
      if (!groundTexture || isMap) groundMat.color.setHex(0x000000);
      else groundMat.color.setHex(0xffffff);
      groundMat.needsUpdate = true;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
    stats: { buildingTriangles, storefrontTriangles, roadTriangles },
  };
}

/**
 * Landmark beacons for the map view (CW-10): one slim pillar per landmark,
 * dim by default, the selected one bright white. MeshBasicMaterial ignores
 * lighting, so beacons read the same at every ambient level.
 *
 * @param {Array<{name: string, x: number, y: number}>} landmarks
 * @returns {{group: import('three').Group, setSelected: (index: number|null) => void, dispose: () => void}}
 */
export function buildLandmarkBeacons(landmarks) {
  const group = new Group();
  group.name = 'landmark-beacons';

  const geom = new BoxGeometry(7, 7, 90);
  const dimMat = new MeshBasicMaterial({ color: 0x777777 });
  const brightMat = new MeshBasicMaterial({ color: 0xffffff });

  const meshes = landmarks.map((lm) => {
    const mesh = new Mesh(geom, dimMat);
    mesh.position.set(lm.x, lm.y, 0);
    group.add(mesh);
    return mesh;
  });

  return {
    group,
    setSelected(index) {
      meshes.forEach((mesh, i) => {
        mesh.material = i === index ? brightMat : dimMat;
      });
    },
    dispose() {
      geom.dispose();
      dimMat.dispose();
      brightMat.dispose();
      group.clear();
    },
  };
}

/**
 * Attach the game's lighting: a dim ambient fill plus a headlight parented
 * to the camera (the same view-space arrangement the model preview uses, so
 * walls facing the player read brightest in the ASCII conversion).
 *
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera
 * @returns {{detach: () => void, setMapBoost: (isMap: boolean) => void}}
 */
export function attachCityLighting(scene, camera) {
  // Street 0.55; map 1.3 — the overhead view has no headlight on the roofs,
  // so the boost makes blocks render as dense glyph masses. Multiplicative
  // (not emissive) so per-building tints keep their hue for the HC palette
  // quantizer.
  const AMBIENT_STREET = 0.55;
  const AMBIENT_MAP = 1.3;
  const ambient = new AmbientLight(0xffffff, AMBIENT_STREET);
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

  return {
    setMapBoost(isMap) {
      ambient.intensity = isMap ? AMBIENT_MAP : AMBIENT_STREET;
    },
    detach() {
      camera.remove(headlight);
      camera.remove(headlight.target);
      scene.remove(ambient);
      scene.remove(camera);
      scene.fog = prevFog ?? null;
      ambient.dispose();
      headlight.dispose();
    },
  };
}
