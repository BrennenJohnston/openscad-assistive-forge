/**
 * Movement, collision, and camera-pose math for the ASCII City Walk game
 * (CW-3). Deliberately three.js-free and DOM-free: the controller applies
 * the resulting pose to its cameras, and vitest exercises everything
 * headlessly.
 *
 * Conventions: world is Z-up meters (city-data.js). Heading is a compass
 * bearing in radians — 0 faces north (+Y), increasing clockwise, so the
 * facing direction is (sin h, cos h).
 *
 * @license GPL-3.0-or-later
 */

export const EYE_HEIGHT_M = 1.7;
export const WALK_SPEED_MPS = 1.6;
export const FAST_SPEED_MPS = 4.0;
export const TURN_SPEED_RADPS = (90 * Math.PI) / 180;
export const PLAYER_RADIUS_M = 0.3;

// Integration clamp: a background tab must not teleport the player.
const MAX_STEP_DT_S = 0.1;

/**
 * @param {{x: number, y: number, headingRad?: number}} spawn
 * @returns {{x: number, y: number, headingRad: number}}
 */
export function createWalkState(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    headingRad: normalizeHeading(spawn.headingRad ?? 0),
  };
}

function normalizeHeading(h) {
  const tau = Math.PI * 2;
  return ((h % tau) + tau) % tau;
}

/**
 * Advance the walk state by one frame.
 *
 * @param {{x:number,y:number,headingRad:number}} state - mutated in place
 * @param {{forward?: number, strafe?: number, turn?: number, fast?: boolean}} input
 *   forward: +1 forward / -1 back; strafe: +1 right / -1 left;
 *   turn: +1 clockwise (right) / -1 counter-clockwise
 * @param {number} dtS - seconds since last frame
 * @param {{isBlocked: (x: number, y: number) => boolean}} [collision]
 * @returns {{moved: boolean, turned: boolean}}
 */
export function stepWalk(state, input, dtS, collision) {
  const dt = Math.min(Math.max(dtS, 0), MAX_STEP_DT_S);
  const turn = clampAxis(input.turn);
  const forward = clampAxis(input.forward);
  const strafe = clampAxis(input.strafe);

  let turned = false;
  if (turn !== 0) {
    state.headingRad = normalizeHeading(
      state.headingRad + turn * TURN_SPEED_RADPS * dt
    );
    turned = true;
  }

  if (forward === 0 && strafe === 0) return { moved: false, turned };

  const speed = input.fast ? FAST_SPEED_MPS : WALK_SPEED_MPS;
  const sin = Math.sin(state.headingRad);
  const cos = Math.cos(state.headingRad);
  // Forward along the bearing; strafe 90° clockwise from it.
  let dx = (forward * sin + strafe * cos) * speed * dt;
  let dy = (forward * cos - strafe * sin) * speed * dt;
  const scale = forward !== 0 && strafe !== 0 ? Math.SQRT1_2 : 1;
  dx *= scale;
  dy *= scale;

  const blocked = (x, y) => isCircleBlocked(collision, x, y);

  let moved = false;
  if (!blocked(state.x + dx, state.y + dy)) {
    state.x += dx;
    state.y += dy;
    moved = true;
  } else if (dx !== 0 && !blocked(state.x + dx, state.y)) {
    state.x += dx; // slide along Y-facing wall
    moved = true;
  } else if (dy !== 0 && !blocked(state.x, state.y + dy)) {
    state.y += dy; // slide along X-facing wall
    moved = true;
  }
  return { moved, turned };
}

function clampAxis(v) {
  if (!Number.isFinite(v) || v === 0) return 0;
  return v > 0 ? 1 : -1;
}

/** Player is a small disc, not a point: test center plus four offsets. */
function isCircleBlocked(collision, x, y) {
  if (!collision) return false;
  const r = PLAYER_RADIUS_M;
  return (
    collision.isBlocked(x, y) ||
    collision.isBlocked(x + r, y) ||
    collision.isBlocked(x - r, y) ||
    collision.isBlocked(x, y + r) ||
    collision.isBlocked(x, y - r)
  );
}

/**
 * First-person camera pose for the current state: eye position plus a
 * look-at target one meter ahead along the bearing, gaze level.
 *
 * @param {{x:number,y:number,headingRad:number}} state
 * @returns {{eye: [number,number,number], target: [number,number,number]}}
 */
export function firstPersonPose(state) {
  const sin = Math.sin(state.headingRad);
  const cos = Math.cos(state.headingRad);
  return {
    eye: [state.x, state.y, EYE_HEIGHT_M],
    target: [state.x + sin, state.y + cos, EYE_HEIGHT_M],
  };
}

/**
 * Eight-sector compass label for announcements and the HUD.
 * @param {number} headingRad
 * @returns {string}
 */
export function headingLabel(headingRad) {
  const labels = [
    'north',
    'northeast',
    'east',
    'southeast',
    'south',
    'southwest',
    'west',
    'northwest',
  ];
  const sector = Math.round(normalizeHeading(headingRad) / (Math.PI / 4)) % 8;
  return labels[sector];
}

/**
 * Rasterize building footprints into a 2D occupancy grid for collision.
 * Cells outside the extract bounds count as blocked, which keeps the player
 * on the map.
 *
 * @param {ReturnType<import('./city-data.js').parseCityExtract>} model
 * @param {{cellM?: number, marginM?: number}} [options]
 * @returns {{isBlocked: (x:number, y:number) => boolean, cols: number, rows: number, cellM: number}}
 */
export function buildCollisionGrid(model, options = {}) {
  const cellM = options.cellM ?? 1;
  // Bounds come from the building core (city-data.js); a generous margin
  // keeps the streets past the outermost buildings walkable.
  const marginM = options.marginM ?? 30;
  const b = model.boundsM;
  const originX = b.minX - marginM;
  const originY = b.minY - marginM;
  const cols = Math.max(1, Math.ceil((b.maxX - b.minX + marginM * 2) / cellM));
  const rows = Math.max(1, Math.ceil((b.maxY - b.minY + marginM * 2) / cellM));
  const cells = new Uint8Array(cols * rows);

  for (const building of model.buildings) {
    // Skybridges and elevated parts start above head height — walk under them.
    if (building.minHeightM > EYE_HEIGHT_M + 0.3) continue;
    rasterizePolygon(building, originX, originY, cols, rows, cellM, cells);
  }

  return {
    cols,
    rows,
    cellM,
    isBlocked(x, y) {
      const cx = Math.floor((x - originX) / cellM);
      const cy = Math.floor((y - originY) / cellM);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return true;
      return cells[cy * cols + cx] === 1;
    },
  };
}

function rasterizePolygon(
  building,
  originX,
  originY,
  cols,
  rows,
  cellM,
  cells
) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of building.outer) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const c0 = Math.max(0, Math.floor((minX - originX) / cellM));
  const c1 = Math.min(cols - 1, Math.floor((maxX - originX) / cellM));
  const r0 = Math.max(0, Math.floor((minY - originY) / cellM));
  const r1 = Math.min(rows - 1, Math.floor((maxY - originY) / cellM));

  for (let r = r0; r <= r1; r++) {
    const y = originY + (r + 0.5) * cellM;
    for (let c = c0; c <= c1; c++) {
      const x = originX + (c + 0.5) * cellM;
      if (!pointInRing(x, y, building.outer)) continue;
      let inHole = false;
      for (const hole of building.holes) {
        if (pointInRing(x, y, hole)) {
          inHole = true;
          break;
        }
      }
      if (!inHole) cells[r * cols + c] = 1;
    }
  }
}

/** Even-odd ray cast. Ring is an open polygon (no repeated last point). */
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Choose a spawn point: the road vertex nearest the extract center that is
 * not inside a building, falling back to a spiral probe around the center.
 *
 * @param {ReturnType<import('./city-data.js').parseCityExtract>} model
 * @param {{isBlocked: (x:number, y:number) => boolean}} collision
 * @returns {{x: number, y: number}}
 */
export function findSpawn(model, collision) {
  let best = null;
  let bestDist = Infinity;
  for (const road of model.roads) {
    for (const [x, y] of road.points) {
      const dist = x * x + y * y;
      if (dist < bestDist && !isCircleBlocked(collision, x, y)) {
        best = { x, y };
        bestDist = dist;
      }
    }
  }
  if (best) return best;

  for (let radius = 0; radius <= 200; radius += 2) {
    const steps = Math.max(1, Math.ceil((radius * Math.PI) / 2));
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const x = radius * Math.sin(angle);
      const y = radius * Math.cos(angle);
      if (!isCircleBlocked(collision, x, y)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

/**
 * Orthographic frustum that shows the whole extract from above, north up,
 * preserving the viewport aspect ratio.
 *
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} boundsM
 * @param {number} aspect - viewport width / height
 * @param {number} [marginM=20]
 * @returns {{left:number,right:number,top:number,bottom:number,centerX:number,centerY:number}}
 */
export function fitOrthoToBounds(boundsM, aspect, marginM = 20) {
  const centerX = (boundsM.minX + boundsM.maxX) / 2;
  const centerY = (boundsM.minY + boundsM.maxY) / 2;
  let halfW = (boundsM.maxX - boundsM.minX) / 2 + marginM;
  let halfH = (boundsM.maxY - boundsM.minY) / 2 + marginM;

  if (halfW / halfH > aspect) {
    halfH = halfW / aspect;
  } else {
    halfW = halfH * aspect;
  }

  return {
    left: -halfW,
    right: halfW,
    top: halfH,
    bottom: -halfH,
    centerX,
    centerY,
  };
}
