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
export const PITCH_SPEED_RADPS = (45 * Math.PI) / 180;
// Gaze limit (CW-13). lookAt() with a fixed world up degenerates when the
// gaze becomes parallel to that up vector; +/-60 degrees keeps a wide margin
// from the +/-90 singularity while still reaching the top of a tower from the
// pavement below it.
export const PITCH_LIMIT_RAD = Math.PI / 3;
export const PLAYER_RADIUS_M = 0.3;

// Integration clamp: a background tab must not teleport the player.
const MAX_STEP_DT_S = 0.1;

/**
 * @param {{x: number, y: number, headingRad?: number, pitchRad?: number}} spawn
 * @returns {{x: number, y: number, headingRad: number, pitchRad: number}}
 */
export function createWalkState(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    headingRad: normalizeHeading(spawn.headingRad ?? 0),
    pitchRad: clampPitch(spawn.pitchRad ?? 0),
  };
}

function normalizeHeading(h) {
  const tau = Math.PI * 2;
  return ((h % tau) + tau) % tau;
}

/**
 * Pitch never wraps: it is a bounded gaze angle, not a bearing. States
 * written before CW-13 (and the test fixtures that build them by hand) carry
 * no pitchRad at all, which reads as level.
 */
function clampPitch(p) {
  if (!Number.isFinite(p)) return 0;
  return Math.min(PITCH_LIMIT_RAD, Math.max(-PITCH_LIMIT_RAD, p));
}

/**
 * Advance the walk state by one frame.
 *
 * @param {{x:number,y:number,headingRad:number,pitchRad?:number}} state - mutated in place
 * @param {{forward?: number, strafe?: number, turn?: number, pitch?: number, fast?: boolean, speedScale?: number}} input
 *   forward: +1 forward / -1 back; strafe: +1 right / -1 left;
 *   turn: +1 clockwise (right) / -1 counter-clockwise;
 *   pitch: +1 look up / -1 look down (CW-13); speedScale: the
 *   CW-Q8 walking-speed multiplier (0.5–3.0, default 1) — Shift sprint
 *   never drops below its 4 m/s floor but scales up past it
 * @param {number} dtS - seconds since last frame
 * @param {{isBlocked: (x: number, y: number) => boolean}} [collision]
 * @returns {{moved: boolean, turned: boolean, pitched: boolean}}
 */
export function stepWalk(state, input, dtS, collision) {
  const dt = Math.min(Math.max(dtS, 0), MAX_STEP_DT_S);
  const turn = clampAxis(input.turn);
  const forward = clampAxis(input.forward);
  const strafe = clampAxis(input.strafe);
  const pitch = clampAxis(input.pitch);

  let turned = false;
  if (turn !== 0) {
    state.headingRad = normalizeHeading(
      state.headingRad + turn * TURN_SPEED_RADPS * dt
    );
    turned = true;
  }

  // A key held against the limit reports no change, so a gaze parked at the
  // top of its travel does not re-convert the whole screen every frame.
  let pitched = false;
  if (pitch !== 0) {
    const next = clampPitch(
      currentPitch(state) + pitch * PITCH_SPEED_RADPS * dt
    );
    if (next !== state.pitchRad) {
      state.pitchRad = next;
      pitched = true;
    }
  }

  if (forward === 0 && strafe === 0) return { moved: false, turned, pitched };

  const userScale = Number.isFinite(input.speedScale)
    ? Math.max(0.5, Math.min(3, input.speedScale))
    : 1;
  const walkSpeed = WALK_SPEED_MPS * userScale;
  const speed = input.fast ? Math.max(FAST_SPEED_MPS, walkSpeed) : walkSpeed;
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
  return { moved, turned, pitched };
}

/** Level for anything built before CW-13 or by a fixture that omits it. */
function currentPitch(state) {
  return Number.isFinite(state.pitchRad) ? state.pitchRad : 0;
}

/**
 * Rotate the gaze by absolute angles rather than by a held-key rate: the
 * drag-look path (CW-13) converts pointer travel straight into radians.
 * Clamping lives here so the controller never re-implements the limit.
 *
 * @param {{headingRad:number, pitchRad?:number}} state - mutated in place
 * @param {number} yawDeltaRad - positive turns right (clockwise)
 * @param {number} pitchDeltaRad - positive looks up
 * @returns {{turned: boolean, pitched: boolean}}
 */
export function applyLookDelta(state, yawDeltaRad, pitchDeltaRad) {
  let turned = false;
  let pitched = false;

  if (Number.isFinite(yawDeltaRad) && yawDeltaRad !== 0) {
    state.headingRad = normalizeHeading(state.headingRad + yawDeltaRad);
    turned = true;
  }

  if (Number.isFinite(pitchDeltaRad) && pitchDeltaRad !== 0) {
    const next = clampPitch(currentPitch(state) + pitchDeltaRad);
    if (next !== state.pitchRad) {
      state.pitchRad = next;
      pitched = true;
    }
  }

  return { turned, pitched };
}

/**
 * Return the gaze to the horizon (CW-13).
 *
 * @param {{pitchRad?: number}} state - mutated in place
 * @returns {boolean} whether anything actually moved
 */
export function levelView(state) {
  const changed = currentPitch(state) !== 0;
  state.pitchRad = 0;
  return changed;
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
 * look-at target one meter along the gaze.
 *
 * The target is a point on the unit sphere around the eye, so the horizontal
 * reach shortens by cos(pitch) as the gaze tips - which is what keeps the
 * bearing unchanged while looking up or down.
 *
 * @param {{x:number,y:number,headingRad:number,pitchRad?:number}} state
 * @returns {{eye: [number,number,number], target: [number,number,number]}}
 */
export function firstPersonPose(state) {
  const pitch = clampPitch(currentPitch(state));
  const cosP = Math.cos(pitch);
  const sin = Math.sin(state.headingRad);
  const cos = Math.cos(state.headingRad);
  return {
    eye: [state.x, state.y, EYE_HEIGHT_M],
    target: [
      state.x + sin * cosP,
      state.y + cos * cosP,
      EYE_HEIGHT_M + Math.sin(pitch),
    ],
  };
}

// Below half a degree the gaze reads as level on screen, and floating-point
// residue from a drag must not leave the HUD claiming otherwise.
const PITCH_LEVEL_EPS_RAD = (0.5 * Math.PI) / 180;

/**
 * Plain word for the HUD and announcements, or null when level.
 *
 * @param {number} pitchRad
 * @returns {'up'|'down'|null}
 */
export function pitchLabel(pitchRad) {
  if (!Number.isFinite(pitchRad)) return null;
  if (pitchRad > PITCH_LEVEL_EPS_RAD) return 'up';
  if (pitchRad < -PITCH_LEVEL_EPS_RAD) return 'down';
  return null;
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

  const blockCell = (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return 0;
    const i = cy * cols + cx;
    if (cells[i] === 1) return 0;
    cells[i] = 1;
    return 1;
  };

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
    /**
     * Block the cells a rotated rectangle covers (CW-16 street props).
     * Returns how many cells this call newly blocked.
     *
     * @param {{x:number, y:number, halfLengthM:number, halfWidthM:number, rotationRad?:number}} rect
     * @returns {number}
     */
    blockRect(rect) {
      const { x, y, halfLengthM, halfWidthM } = rect ?? {};
      if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
      const hl = Math.max(0, halfLengthM ?? 0);
      const hw = Math.max(0, halfWidthM ?? 0);
      const rot = Number.isFinite(rect.rotationRad) ? rect.rotationRad : 0;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);

      let blocked = 0;
      // A parked car is wider than a cell, a tree trunk is far narrower. The
      // cell the prop STANDS in always blocks, or a 0.3 m trunk whose cell
      // center happens to fall outside it would stop nobody.
      blocked += blockCell(
        Math.floor((x - originX) / cellM),
        Math.floor((y - originY) / cellM)
      );

      const extX = Math.abs(cos) * hl + Math.abs(sin) * hw;
      const extY = Math.abs(sin) * hl + Math.abs(cos) * hw;
      const c0 = Math.max(0, Math.floor((x - extX - originX) / cellM));
      const c1 = Math.min(cols - 1, Math.floor((x + extX - originX) / cellM));
      const r0 = Math.max(0, Math.floor((y - extY - originY) / cellM));
      const r1 = Math.min(rows - 1, Math.floor((y + extY - originY) / cellM));

      for (let r = r0; r <= r1; r++) {
        const dy = originY + (r + 0.5) * cellM - y;
        for (let c = c0; c <= c1; c++) {
          const dx = originX + (c + 0.5) * cellM - x;
          // Into the rectangle's own frame: +length along its rotation.
          const lx = dx * cos + dy * sin;
          const ly = -dx * sin + dy * cos;
          if (Math.abs(lx) <= hl && Math.abs(ly) <= hw)
            blocked += blockCell(c, r);
        }
      }
      return blocked;
    },
  };
}

/**
 * Stamp street props into an existing collision grid (CW-16). Cars and tree
 * trunks block; canopies are overhead and never reach this list.
 *
 * Order matters at the call site: the grid must exist before the props are
 * placed (they need it to avoid building footprints), so the stamping is a
 * second pass rather than an argument to buildCollisionGrid.
 *
 * @param {{blockRect: (rect: Object) => number}} collision
 * @param {Array<{x:number, y:number, halfLengthM:number, halfWidthM:number, rotationRad?:number}>} obstacles
 * @returns {number} how many obstacles actually landed on the grid
 */
export function stampObstacles(collision, obstacles = []) {
  if (!collision || typeof collision.blockRect !== 'function') return 0;
  let stamped = 0;
  for (const rect of obstacles) {
    if (collision.blockRect(rect) > 0) stamped++;
  }
  return stamped;
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
export function pointInRing(x, y, ring) {
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

// ---------------------------------------------------------------------------
// Map camera (CW-9): pan / zoom / follow state for the overhead view
// ---------------------------------------------------------------------------

export const MAP_ZOOM_MIN = 0.4;
export const MAP_ZOOM_MAX = 8;
// Exponential zoom: holding the key for one second multiplies by this.
const MAP_ZOOM_RATE_PER_S = 2.2;
// Pan speed as a fraction of the visible half-height per second, so the map
// moves at a constant SCREEN speed at every zoom level.
const MAP_PAN_SCREENS_PER_S = 0.9;

/**
 * Create the overhead camera state: whole-city framing, following the
 * player.
 *
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} boundsM
 * @returns {{zoom:number, centerX:number, centerY:number, follow:boolean}}
 */
export function createMapCamera(boundsM) {
  return {
    zoom: 1,
    centerX: (boundsM.minX + boundsM.maxX) / 2,
    centerY: (boundsM.minY + boundsM.maxY) / 2,
    follow: true,
  };
}

/**
 * Advance the map camera one frame. Any manual pan breaks player-follow;
 * zoom alone keeps it.
 *
 * @param {ReturnType<typeof createMapCamera>} cam - mutated in place
 * @param {{panX?: number, panY?: number, zoom?: number}} input - each axis
 *   -1 | 0 | +1
 * @param {number} dtS
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} boundsM
 * @param {number} aspect - viewport aspect (for the pan screen-speed)
 * @returns {{changed: boolean}}
 */
export function stepMapCamera(cam, input, dtS, boundsM, aspect) {
  const dt = Math.min(Math.max(dtS, 0), 0.1);
  const panX = Math.sign(input.panX ?? 0);
  const panY = Math.sign(input.panY ?? 0);
  const zoomDir = Math.sign(input.zoom ?? 0);
  let changed = false;

  if (zoomDir !== 0) {
    const factor = Math.pow(MAP_ZOOM_RATE_PER_S, zoomDir * dt);
    const next = Math.max(
      MAP_ZOOM_MIN,
      Math.min(MAP_ZOOM_MAX, cam.zoom * factor)
    );
    if (next !== cam.zoom) {
      cam.zoom = next;
      changed = true;
    }
  }

  if (panX !== 0 || panY !== 0) {
    const fit = fitOrthoToBounds(boundsM, Math.max(0.1, aspect));
    const halfH = (fit.top - fit.bottom) / 2 / cam.zoom;
    const step = halfH * MAP_PAN_SCREENS_PER_S * dt;
    cam.centerX = Math.min(
      boundsM.maxX,
      Math.max(boundsM.minX, cam.centerX + panX * step)
    );
    cam.centerY = Math.min(
      boundsM.maxY,
      Math.max(boundsM.minY, cam.centerY + panY * step)
    );
    cam.follow = false;
    changed = true;
  }

  return { changed };
}

/** Snap the map camera to a position and resume player-follow. */
export function recenterMapCamera(cam, x, y) {
  cam.centerX = x;
  cam.centerY = y;
  cam.follow = true;
}

/**
 * The orthographic frustum for the current map-camera state: the whole-city
 * fit scaled by 1/zoom around the camera center.
 *
 * @param {ReturnType<typeof createMapCamera>} cam
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} boundsM
 * @param {number} aspect
 * @returns {{left:number,right:number,top:number,bottom:number,centerX:number,centerY:number}}
 */
export function mapCameraFrustum(cam, boundsM, aspect) {
  const fit = fitOrthoToBounds(boundsM, Math.max(0.1, aspect));
  const halfW = (fit.right - fit.left) / 2 / cam.zoom;
  const halfH = (fit.top - fit.bottom) / 2 / cam.zoom;
  return {
    left: -halfW,
    right: halfW,
    top: halfH,
    bottom: -halfH,
    centerX: cam.centerX,
    centerY: cam.centerY,
  };
}

// ---------------------------------------------------------------------------
// Character size (CW-12): the in-game ASCII glyph scale
// ---------------------------------------------------------------------------
// The floor is MEASURED, not guessed (CW-Q10). At a 1920x993 game viewport the
// converter's auto base font is 21 px, so 10% lands on the renderer's own 3 px
// font floor - the smallest size that still changes anything. 5% and 15% both
// render identically to 10%, which is why the range stops here.
//
// This range belongs to the GAME. The preview's Alt View keeps its own
// 0.5-2.5 slider (_HFM_FONT_SCALE_RANGE in hfm-controller.js); a value seeded
// from that shared preference is clamped and snapped into this range first.

export const CHAR_SCALE_MIN = 0.1;
export const CHAR_SCALE_MAX = 1;
export const CHAR_SCALE_STEP = 0.1;
export const CHAR_SCALE_DEFAULT = 0.5;

/**
 * Clamp a character scale into the game's range and snap it onto the
 * 10-point step grid, so every announced value is a whole ten percent.
 *
 * Snapping matters for seeded values: the shared Alt View preference is a
 * 0.05-step slider, so 0.85 would otherwise start a ladder of 85/95/100 that
 * never lines up with the steps the help text promises.
 *
 * @param {number} scale
 * @returns {number} a value in [CHAR_SCALE_MIN, CHAR_SCALE_MAX] on the grid
 */
export function clampCharScale(scale) {
  const raw = Number.isFinite(scale) ? scale : CHAR_SCALE_DEFAULT;
  const stepped = Math.round(raw / CHAR_SCALE_STEP) * CHAR_SCALE_STEP;
  const bounded = Math.min(CHAR_SCALE_MAX, Math.max(CHAR_SCALE_MIN, stepped));
  // Binary floats: 0.1*3 is 0.30000000000000004, and that reaches the player
  // as "Character size 30.000000000000004 percent" without this.
  return Math.round(bounded * 100) / 100;
}

/**
 * Decide the character scale a session opens at (CW-Q10).
 *
 * Order: the game's own saved value, then the shared Alt View preference
 * clamped into the game's range, then the default. Both stored values are
 * raw strings straight from localStorage and may be absent or junk.
 *
 * @param {string|null|undefined} savedGame - the game's own persisted value
 * @param {string|null|undefined} savedAltView - the shared Alt View preference
 * @returns {number}
 */
export function seedCharScale(savedGame, savedAltView) {
  const game = parseFloat(savedGame ?? '');
  if (Number.isFinite(game)) return clampCharScale(game);
  const altView = parseFloat(savedAltView ?? '');
  if (Number.isFinite(altView)) return clampCharScale(altView);
  return CHAR_SCALE_DEFAULT;
}
