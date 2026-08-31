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

// CW-48: the announced percent is a LABEL on a two-slope curve, not a
// multiplier of anything. Two anchors fix the curve: label 100 is the
// default brisk city walk and label 300 is the top of the range. Below the
// default the slope is three times as steep, so the 50-point span down to
// label 50 still reaches a slow stroll instead of crawling toward zero.
export const SPEED_LABEL_MIN = 50;
export const SPEED_LABEL_DEFAULT = 100;
export const SPEED_LABEL_MAX = 300;
export const SPEED_LABEL_STEP = 25;
export const WALK_SPEED_MPS = 4.8;
const SPEED_AT_MAX_LABEL_MPS = 8.0;
const SPEED_AT_MIN_LABEL_MPS = 2.4;

// Shift outruns the CURRENT walk at every label rather than racing a fixed
// floor, which is what let a fast walk overtake sprinting before CW-48.
export const SPRINT_MULTIPLIER = 1.6;
export const SPRINT_MAX_MPS = 9.6;

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

// Collision is tested at the ENDS of a move, so a move longer than the thing
// it crosses can step over it. Before CW-48 that resolution silently depended
// on how fast you walked - 0.16 m per clamped frame at the default, 0.48 m
// for anyone who had turned the speed up - and tripling the default would
// have made the loose case the normal one. Measured on a lone street prop
// (one blocked cell): clean at 0.80 m of travel, thirty pass-throughs at
// 0.96 m, which the top of the new range reaches.
//
// So each move is split into hops of a fixed length instead, and collision
// resolution stops depending on speed at all. Half the player's own radius is
// short enough that no hop can skip a cell the body probe would have caught,
// and it happens to match the resolution the game shipped at its old default.
// Measured cost of the split on the real Seattle grid: stepWalk runs once per
// frame at 0.10-0.14 us, and each extra hop adds about 0.03 us, against a
// 33 ms frame budget.
const MAX_SUBSTEP_M = PLAYER_RADIUS_M / 2;

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

export function normalizeHeading(h) {
  const tau = Math.PI * 2;
  return ((h % tau) + tau) % tau;
}

/**
 * Pitch never wraps: it is a bounded gaze angle, not a bearing. States
 * written before CW-13 (and the test fixtures that build them by hand) carry
 * no pitchRad at all, which reads as level.
 */
export function clampPitch(p) {
  if (!Number.isFinite(p)) return 0;
  return Math.min(PITCH_LIMIT_RAD, Math.max(-PITCH_LIMIT_RAD, p));
}

/**
 * Snap an arbitrary number onto the speed-label grid the controls step by,
 * and hold it inside the range. A label that is not a number at all reads as
 * the default, which is what an absent preference means.
 *
 * @param {number} label
 * @returns {number}
 */
export function clampSpeedLabel(label) {
  if (!Number.isFinite(label)) return SPEED_LABEL_DEFAULT;
  const snapped = Math.round(label / SPEED_LABEL_STEP) * SPEED_LABEL_STEP;
  return Math.max(SPEED_LABEL_MIN, Math.min(SPEED_LABEL_MAX, snapped));
}

/**
 * Metres per second for an announced speed label (CW-48).
 *
 * @param {number} label
 * @returns {number}
 */
export function speedForLabel(label) {
  const l = clampSpeedLabel(label);
  if (l >= SPEED_LABEL_DEFAULT) {
    const t =
      (l - SPEED_LABEL_DEFAULT) / (SPEED_LABEL_MAX - SPEED_LABEL_DEFAULT);
    return WALK_SPEED_MPS + t * (SPEED_AT_MAX_LABEL_MPS - WALK_SPEED_MPS);
  }
  const t = (SPEED_LABEL_DEFAULT - l) / (SPEED_LABEL_DEFAULT - SPEED_LABEL_MIN);
  return WALK_SPEED_MPS - t * (WALK_SPEED_MPS - SPEED_AT_MIN_LABEL_MPS);
}

/**
 * Read a stored walking-speed preference as a label, migrating the value the
 * pre-CW-48 game wrote under the same key (UF-14: the key NAME never moves,
 * the values do). That key held a 0.5–3.0 multiplier of a slower walk; it now
 * holds a 50–300 label. The two ranges do not overlap, so the stored number
 * itself says which vocabulary wrote it. An old multiplier m announced itself
 * as m*100 percent, and the old 300 percent is this scale's 100.
 *
 * @param {string|number|null|undefined} raw
 * @returns {number}
 */
export function speedLabelFromStored(raw) {
  const value = typeof raw === 'string' ? parseFloat(raw) : raw;
  if (!Number.isFinite(value)) return SPEED_LABEL_DEFAULT;
  if (value < SPEED_LABEL_MIN) return clampSpeedLabel(value * 100 - 200);
  return clampSpeedLabel(value);
}

/**
 * Advance the walk state by one frame.
 *
 * @param {{x:number,y:number,headingRad:number,pitchRad?:number}} state - mutated in place
 * @param {{forward?: number, strafe?: number, turn?: number, pitch?: number, fast?: boolean, speedLabel?: number}} input
 *   forward: +1 forward / -1 back; strafe: +1 right / -1 left;
 *   turn: +1 clockwise (right) / -1 counter-clockwise;
 *   pitch: +1 look up / -1 look down (CW-13); speedLabel: the announced
 *   CW-48 speed label (50–300, default 100) — Shift sprint multiplies
 *   whatever that label is currently worth
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

  const walkSpeed = speedForLabel(input.speedLabel);
  const speed = input.fast
    ? Math.min(SPRINT_MAX_MPS, walkSpeed * SPRINT_MULTIPLIER)
    : walkSpeed;
  const sin = Math.sin(state.headingRad);
  const cos = Math.cos(state.headingRad);
  // Forward along the bearing; strafe 90° clockwise from it.
  let dx = (forward * sin + strafe * cos) * speed * dt;
  let dy = (forward * cos - strafe * sin) * speed * dt;
  const scale = forward !== 0 && strafe !== 0 ? Math.SQRT1_2 : 1;
  dx *= scale;
  dy *= scale;

  const blocked = (x, y) => isCircleBlocked(collision, x, y);

  const hops = collision
    ? Math.max(1, Math.ceil(Math.hypot(dx, dy) / MAX_SUBSTEP_M))
    : 1;
  const hopX = dx / hops;
  const hopY = dy / hops;

  let moved = false;
  for (let i = 0; i < hops; i++) {
    if (!blocked(state.x + hopX, state.y + hopY)) {
      state.x += hopX;
      state.y += hopY;
      moved = true;
    } else if (hopX !== 0 && !blocked(state.x + hopX, state.y)) {
      state.x += hopX; // slide along Y-facing wall
      moved = true;
    } else if (hopY !== 0 && !blocked(state.x, state.y + hopY)) {
      state.y += hopY; // slide along X-facing wall
      moved = true;
    } else {
      break; // nose to the wall: the remaining hops go nowhere either
    }
  }
  return { moved, turned, pitched };
}

/** Level for anything built before CW-13 or by a fixture that omits it. */
function currentPitch(state) {
  return Number.isFinite(state.pitchRad) ? state.pitchRad : 0;
}

/**
 * Curb height (CW-50). The common US barrier curb is 6 inches; municipal
 * standard details put it at 0.15 m, which is the number used here.
 *
 * The city is modelled the way it is built: the PAVEMENT is the ground, and
 * the ROADWAY is cut down into it. Cutting down rather than building up is
 * what keeps every prop where it already stood - a tree, a bench and a person
 * are all placed at ground zero, and raising the pavement under them would
 * have buried them to the knee. It also means the eye height on a pavement,
 * which is where most walking happens, is exactly what it always was.
 */
export const CURB_HEIGHT_M = 0.15;

/**
 * How much ground the walker covers while the eye climbs a curb. Short enough
 * to feel like a step up rather than a ramp, long enough that it is not a
 * jolt. Distance rather than time, so the feel does not change with walking
 * speed - the same reasoning that fixed the collision hop in CW-48.
 */
export const CURB_EASE_M = 0.5;

/**
 * Rasterize the PAVEMENT into a grid, so the walker's eye knows what is
 * underfoot. Mirrors buildCollisionGrid deliberately: same origin, same cell
 * size, same out-of-bounds convention, so the two can be reasoned about
 * together.
 *
 * Pavement reads as zero and the roadway as a curb below it, rather than the
 * other way round. That is not arbitrary: every prop in the city is placed at
 * ground zero, so building the pavement UP would have buried trees, benches
 * and people to the knee, while cutting the roadway DOWN leaves all of them
 * exactly where they stand and only moves the surface nobody stands on.
 *
 * What counts as pavement:
 *
 *   - a strip one pavement wide beyond each roadway edge, both sides
 *   - separately-mapped pavement ways, over their own width
 *   - minus every roadway, stamped last, so a crossing street cuts the apron
 *     rather than being paved over by it
 *
 * Open ground away from any street is left at roadway level. In a downtown
 * almost everything walkable is apron, and this is stated rather than hidden.
 *
 * @param {ReturnType<import('./city-data.js').parseCityExtract>} model
 * @param {{cellM?: number, marginM?: number, pavementM?: number}} [options]
 * @returns {{heightAt: (x:number, y:number) => number, cols:number, rows:number, cellM:number}}
 */
export function buildSurfaceGrid(model, options = {}) {
  const cellM = options.cellM ?? 1;
  const marginM = options.marginM ?? 30;
  const pavementM = options.pavementM ?? PAVEMENT_WIDTH_M;
  const b = model.boundsM;
  const originX = b.minX - marginM;
  const originY = b.minY - marginM;
  const cols = Math.max(1, Math.ceil((b.maxX - b.minX + marginM * 2) / cellM));
  const rows = Math.max(1, Math.ceil((b.maxY - b.minY + marginM * 2) / cellM));
  const cells = new Uint8Array(cols * rows);

  /** Stamp every cell whose centre is within `reachM` of the polyline. */
  const stampAlong = (pts, reachM, value) => {
    const reach = Math.ceil(reachM / cellM);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      // Half-cell steps along the segment, stamping a disc at each: cheaper
      // than a true quad rasterizer and, at a metre cell against a strip
      // metres wide, indistinguishable from one.
      const steps = Math.ceil(len / (cellM * 0.5));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = x1 + dx * t;
        const py = y1 + dy * t;
        const c0 = Math.floor((px - originX) / cellM);
        const r0 = Math.floor((py - originY) / cellM);
        for (let r = r0 - reach; r <= r0 + reach; r++) {
          if (r < 0 || r >= rows) continue;
          for (let c = c0 - reach; c <= c0 + reach; c++) {
            if (c < 0 || c >= cols) continue;
            const gx = originX + (c + 0.5) * cellM;
            const gy = originY + (r + 0.5) * cellM;
            if (Math.hypot(gx - px, gy - py) <= reachM) {
              cells[r * cols + c] = value;
            }
          }
        }
      }
    }
  };

  const drawn = (model.roads ?? []).filter(
    (r) => r.sidewalk || !UNPAVED_FOR_SURFACE.has(r.kind)
  );
  // Aprons first...
  for (const road of drawn) {
    const pts = road.points ?? [];
    if (isPavementWay(road)) stampAlong(pts, road.widthM / 2, 1);
    else stampAlong(pts, road.widthM / 2 + pavementM, 1);
  }
  // ...then the roadways, which cut back through them.
  for (const road of drawn) {
    if (isPavementWay(road)) continue;
    stampAlong(road.points ?? [], road.widthM / 2, 0);
  }

  return {
    cols,
    rows,
    cellM,
    heightAt(x, y) {
      const cx = Math.floor((x - originX) / cellM);
      const cy = Math.floor((y - originY) / cellM);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return 0;
      return cells[cy * cols + cx] === 1 ? 0 : -CURB_HEIGHT_M;
    },
  };
}

/**
 * How wide the pavement apron beside a roadway is drawn (CW-50). The same
 * number a separately-mapped pavement uses, so a street with a mapped
 * pavement and one without read alike.
 */
export const PAVEMENT_WIDTH_M = 1.8;

/** Classes the scene never draws, so they never cut a roadway either. */
const UNPAVED_FOR_SURFACE = new Set([
  'footway',
  'path',
  'cycleway',
  'steps',
  'track',
]);

/**
 * Whether a way IS pavement rather than a roadway with pavement beside it
 * (CW-50, CW-Q64). A separately-mapped pavement obviously is one; so is a
 * pedestrianised street, which is pavement end to end - cutting a roadway
 * down the middle of one would invent a road that is not there.
 *
 * The scene and this grid both read it, so the two cannot drift apart about
 * where the ground is: cross-file disagreement about a shared value is this
 * project's most expensive recurring bug.
 *
 * @param {{sidewalk?: boolean, kind?: string}} road
 * @returns {boolean}
 */
export function isPavementWay(road) {
  return Boolean(road?.sidewalk) || road?.kind === 'pedestrian';
}

/**
 * Whether a way is drawn as a ROADWAY - the ribbon a car drives on and a
 * lamp post must not stand in (CW-75).
 *
 * It is the same test the surface grid above makes and the same one
 * `city-scene.js` makes when it lays the road ribbons down, said once so the
 * placement audit cannot disagree with the thing it audits.
 *
 * @param {{sidewalk?: boolean, kind?: string}} road
 * @returns {boolean}
 */
export function isDrawnRoadway(road) {
  return !isPavementWay(road) && !UNPAVED_FOR_SURFACE.has(road?.kind);
}

/** The four corners of one of these rectangles, in order. */
function rectCorners(rect) {
  const c = Math.cos(rect.rotationRad ?? 0);
  const s = Math.sin(rect.rotationRad ?? 0);
  const hl = rect.halfLengthM ?? 0;
  const hw = rect.halfWidthM ?? 0;
  const out = [];
  for (const [u, v] of [
    [hl, hw],
    [hl, -hw],
    [-hl, -hw],
    [-hl, hw],
  ]) {
    out.push(rect.x + u * c - v * s, rect.y + u * s + v * c);
  }
  return out;
}

/**
 * Whether two rotated rectangles overlap - separating axis, exact (CW-75).
 *
 * Touching is NOT overlapping: two cars parked nose to tail with their
 * bumpers on the same line are legal, and the test says so, because the
 * alternative is a floating-point coin toss on every kerb in the city.
 *
 * The one implementation. The placement streams use it to refuse a spot, and
 * `scripts/census-city-walk.mjs` uses it to audit them - two copies of a
 * geometry test is how a census comes to disagree with the build for a reason
 * that is not a bug.
 *
 * @param {{x:number, y:number, halfLengthM:number, halfWidthM:number, rotationRad?:number}} a
 * @param {{x:number, y:number, halfLengthM:number, halfWidthM:number, rotationRad?:number}} b
 * @returns {boolean}
 */
export function rectsOverlap(a, b) {
  const pa = rectCorners(a);
  const pb = rectCorners(b);
  for (const quad of [pa, pb]) {
    for (let i = 0; i < 8; i += 2) {
      const j = (i + 2) % 8;
      const axX = -(quad[j + 1] - quad[i + 1]);
      const axY = quad[j] - quad[i];
      let aMin = Infinity;
      let aMax = -Infinity;
      let bMin = Infinity;
      let bMax = -Infinity;
      for (let k = 0; k < 8; k += 2) {
        const p = pa[k] * axX + pa[k + 1] * axY;
        if (p < aMin) aMin = p;
        if (p > aMax) aMax = p;
        const q = pb[k] * axX + pb[k + 1] * axY;
        if (q < bMin) bMin = q;
        if (q > bMax) bMax = q;
      }
      if (aMax <= bMin || bMax <= aMin) return false;
    }
  }
  return true;
}

/**
 * How far outside a ribbon the index can still answer questions. A segment
 * registers in every bucket its half-width PLUS this reaches, so a query is
 * one bucket lookup and still exact.
 */
const ROADWAY_SLACK_M = 2;

/**
 * ★ THE ROAD-RIBBON INDEX (CW-75).
 *
 * Every placement stream in `buildStreetProps` used to know about exactly one
 * road: its own. Infill trees are planted 1.2 m outside THEIR kerb and never
 * asked whether that spot is in the middle of the street they are crossing,
 * which is how 735 tree trunks came to stand inside Seattle roadways - a side
 * street planting into the ribbon of the street it meets. Lamps ride the same
 * law. A prop cannot be tested against every road by scanning every road, so
 * the roads are bucketed once and every stream asks the same index.
 *
 * The index is pure geometry: no meshes, no model, no random stream. That is
 * what lets `scripts/census-city-walk.mjs` audit placement with the code's own
 * answer rather than a second implementation of it.
 *
 * @param {Array<{points: number[][], widthM: number, kind?: string, name?: string, sidewalk?: boolean}>} roads
 * @param {{cellM?: number}} [options]
 */
export function buildRoadwayIndex(roads, options = {}) {
  const cellM = options.cellM ?? 16;
  /** @type {Map<string, number[]>} */
  const buckets = new Map();
  // Flat segment store: six numbers per segment, then the road it came from.
  /** @type {number[]} */
  const seg = [];
  /** @type {Array<{kind?: string, name?: string, widthM: number}>} */
  const owners = [];
  let count = 0;

  for (const road of roads ?? []) {
    if (!isDrawnRoadway(road)) continue;
    const pts = road?.points ?? [];
    if (pts.length < 2) continue;
    count++;
    const halfW = (road.widthM ?? 0) / 2;
    if (!(halfW > 0)) continue;
    const owner = { kind: road.kind, name: road.name, widthM: road.widthM };
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      if (Math.hypot(x2 - x1, y2 - y1) < 1e-6) continue;
      const index = owners.length;
      owners.push(owner);
      seg.push(x1, y1, x2, y2, halfW, 0);
      const reach = halfW + ROADWAY_SLACK_M;
      const cx0 = Math.floor((Math.min(x1, x2) - reach) / cellM);
      const cx1 = Math.floor((Math.max(x1, x2) + reach) / cellM);
      const cy0 = Math.floor((Math.min(y1, y2) - reach) / cellM);
      const cy1 = Math.floor((Math.max(y1, y2) + reach) / cellM);
      for (let gy = cy0; gy <= cy1; gy++) {
        for (let gx = cx0; gx <= cx1; gx++) {
          const k = gx + ',' + gy;
          const list = buckets.get(k);
          if (list) list.push(index);
          else buckets.set(k, [index]);
        }
      }
    }
  }

  return {
    /** How many drawn roadway ways went in. */
    count,
    /** How many segments went in - the size the buckets index. */
    segments: owners.length,
    /**
     * The roadway a point stands deepest inside, or null.
     *
     * `inside` is metres of ribbon between the point and the nearest kerb:
     * positive means in the road. A NEGATIVE `marginM` asks the wider
     * question "is this within |marginM| of a roadway", which is how a prop
     * with a footprint asks whether its box - not just its centre - reaches
     * the tarmac.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} [marginM] report only hits deeper than this
     * @returns {{kind?: string, name?: string, widthM: number, inside: number,
     *            cx: number, cy: number, nx: number, ny: number}|null}
     */
    insideRoadway(x, y, marginM = 0) {
      if (marginM < -ROADWAY_SLACK_M) {
        throw new RangeError(
          `insideRoadway margin ${marginM} reaches past the index's ` +
            `${ROADWAY_SLACK_M} m slack`
        );
      }
      const list = buckets.get(
        Math.floor(x / cellM) + ',' + Math.floor(y / cellM)
      );
      if (!list) return null;
      let best = null;
      for (let k = 0; k < list.length; k++) {
        const s = list[k] * 6;
        const ax = seg[s];
        const ay = seg[s + 1];
        const dx = seg[s + 2] - ax;
        const dy = seg[s + 3] - ay;
        const halfW = seg[s + 4];
        const l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const px = ax + dx * t;
        const py = ay + dy * t;
        const d = Math.hypot(x - px, y - py);
        const inside = halfW - d;
        if (best && inside <= best.inside) continue;
        // Which way is out: from the centreline toward the point, or the
        // segment's own normal when the point sits exactly on the line.
        let nx = x - px;
        let ny = y - py;
        if (d > 1e-6) {
          nx /= d;
          ny /= d;
        } else {
          const len = Math.hypot(dx, dy) || 1;
          nx = -dy / len;
          ny = dx / len;
        }
        const owner = owners[list[k]];
        best = {
          kind: owner.kind,
          name: owner.name,
          widthM: owner.widthM,
          inside,
          cx: px,
          cy: py,
          nx,
          ny,
        };
      }
      return best && best.inside > marginM ? best : null;
    },
  };
}

/**
 * Move the walker's ground height toward what is underfoot, at a rate fixed
 * per METRE travelled rather than per second (CW-50). Standing still on a
 * changed surface - a teleport, a spawn - snaps, because there is no step to
 * smooth out.
 *
 * @param {{x:number, y:number, groundZ?:number}} state - mutated in place
 * @param {{heightAt: (x:number, y:number) => number}} surface
 * @param {number} travelledM - ground covered since the last call
 * @returns {number} the ground height now in effect
 */
export function easeGroundZ(state, surface, travelledM) {
  const target = surface ? surface.heightAt(state.x, state.y) : 0;
  const current = Number.isFinite(state.groundZ) ? state.groundZ : target;
  if (!(travelledM > 0)) {
    state.groundZ = target;
    return target;
  }
  const step = (CURB_HEIGHT_M / CURB_EASE_M) * travelledM;
  const delta = target - current;
  state.groundZ =
    Math.abs(delta) <= step ? target : current + Math.sign(delta) * step;
  return state.groundZ;
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
  // CW-50: the eye rides whatever is underfoot. A state that carries no
  // ground height - a fixture, anything built before the curb existed - reads
  // as level ground, which is what it was.
  const eyeZ =
    EYE_HEIGHT_M + (Number.isFinite(state.groundZ) ? state.groundZ : 0);
  return {
    eye: [state.x, state.y, eyeZ],
    target: [
      state.x + sin * cosP,
      state.y + cos * cosP,
      eyeZ + Math.sin(pitch),
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
 * CW-78: an optional anchor moves the search - the spawn becomes the clear
 * road vertex nearest the anchor among those within `withinM` of it (the
 * registry's first row, so a city starts in sight of its icon). `minM`
 * keeps a viewing distance: Seattle's nearest clear vertex to the Great
 * Wheel is 18 m away ON the pier, where a 53 m wheel is legs filling the
 * frame rather than a wheel - vertices nearer than minM are passed over
 * while anything in the ring remains. If nothing within the ring is clear,
 * the centre rule stands and the caller's record says so; a silent bad
 * spawn is worse than an honest central one.
 *
 * @param {ReturnType<import('./city-data.js').parseCityExtract>} model
 * @param {{isBlocked: (x:number, y:number) => boolean}} collision
 * @param {{nearX?: number, nearY?: number, withinM?: number, minM?: number}} [anchor]
 * @returns {{x: number, y: number}}
 */
export function findSpawn(model, collision, anchor) {
  if (
    anchor &&
    Number.isFinite(anchor.nearX) &&
    Number.isFinite(anchor.nearY)
  ) {
    const withinM = anchor.withinM ?? 200;
    const minM = anchor.minM ?? 0;
    let best = null;
    let bestDist = Infinity;
    let nearFallback = null;
    let nearFallbackDist = Infinity;
    for (const road of model.roads) {
      for (const [x, y] of road.points) {
        const dist = Math.hypot(x - anchor.nearX, y - anchor.nearY);
        if (dist > withinM || isCircleBlocked(collision, x, y)) continue;
        if (dist >= minM) {
          if (dist < bestDist) {
            best = { x, y };
            bestDist = dist;
          }
        } else if (dist < nearFallbackDist) {
          nearFallback = { x, y };
          nearFallbackDist = dist;
        }
      }
    }
    if (best) return best;
    if (nearFallback) return nearFallback;
  }

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
 * The heading a spawned walker should face: the direction with the longest
 * clear, walkable run, measured with the same collision test the walker
 * uses (CW-44). The old fixed "face north" stood the CW-44 Seattle player
 * 2.5 m from a storefront; CI found it before a person did, because
 * software-rendered frames ride the dt clamp and cover more ground per
 * frame than a live GPU's do. Deterministic: eight compass directions,
 * ties keep the northmost-first order.
 *
 * @param {{isBlocked: (x:number, y:number) => boolean}} collision
 * @param {number} x
 * @param {number} y
 * @param {{stepM?: number, maxM?: number}} [options]
 * @returns {number} heading in radians (0 = north, clockwise)
 */
export function findClearHeading(collision, x, y, options = {}) {
  const stepM = options.stepM ?? 0.5;
  const maxM = options.maxM ?? 30;
  let bestHeading = 0;
  let bestRun = -1;
  for (let i = 0; i < 8; i++) {
    const heading = (i / 8) * Math.PI * 2;
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    let run = 0;
    while (run < maxM) {
      const next = run + stepM;
      if (isCircleBlocked(collision, x + sin * next, y + cos * next)) break;
      run = next;
    }
    if (run > bestRun) {
      bestRun = run;
      bestHeading = heading;
    }
  }
  return bestHeading;
}

/**
 * How far from a picked point the landing may look for a street before it
 * gives up on streets, and how far it may then look for any open ground.
 * Both are owner-reversible in one place (CW-36).
 */
export const LANDING_SNAP_M = 25;
export const LANDING_SEARCH_M = 200;

/** Nearest point on segment a->b to (x, y), and how far along it that is. */
function projectOnSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: ax, y: ay };
  let t = ((x - ax) * dx + (y - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: ax + t * dx, y: ay + t * dy };
}

/**
 * Where a player dropped at (targetX, targetY) should actually land (CW-36).
 *
 * Generalizes findSpawn from "nearest road to the origin" to "nearest road to
 * a point the player picked", with the same isCircleBlocked oracle and the
 * same spiral fallback, so a landing can never be inside a building.
 *
 * It snaps to the nearest point ON a road segment rather than to the nearest
 * road VERTEX the way findSpawn does. OSM digitizes a straight street as two
 * endpoints and nothing between, so a vertex-only snap would miss the middle
 * of every long block — exactly where someone clicking a street aims. The
 * projection also hands back the segment's direction, which is what lets the
 * player arrive looking ALONG the street instead of at a wall.
 *
 * @param {ReturnType<import('./city-data.js').parseCityExtract>} model
 * @param {{isBlocked: (x:number, y:number) => boolean}} collision
 * @param {number} targetX
 * @param {number} targetY
 * @param {{snapM?: number, searchM?: number}} [options]
 * @returns {{x:number, y:number, headingRad: number|null, onRoad: boolean}|null}
 *   null means refuse — every candidate within reach was inside something.
 */
export function findLandingNear(
  model,
  collision,
  targetX,
  targetY,
  options = {}
) {
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return null;
  const snapM = options.snapM ?? LANDING_SNAP_M;
  const searchM = options.searchM ?? LANDING_SEARCH_M;

  // Clamp into the city before searching: a click on the black beyond the
  // extract would otherwise spiral 200 m through cells that are blocked by
  // definition (buildCollisionGrid counts out-of-bounds as blocked) and
  // refuse, when the honest answer is the edge of the city.
  let tx = targetX;
  let ty = targetY;
  const b = model?.boundsM;
  if (b) {
    tx = Math.min(b.maxX, Math.max(b.minX, tx));
    ty = Math.min(b.maxY, Math.max(b.minY, ty));
  }

  let best = null;
  let bestD2 = snapM * snapM;
  for (const road of model?.roads ?? []) {
    const pts = road.points ?? [];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bxx, byy] = pts[i];
      const p = projectOnSegment(tx, ty, ax, ay, bxx, byy);
      const d2 = (p.x - tx) * (p.x - tx) + (p.y - ty) * (p.y - ty);
      if (d2 >= bestD2) continue;
      if (isCircleBlocked(collision, p.x, p.y)) continue;

      // Face along the street toward whichever end has more of it left, so
      // the road stretches away in front rather than stopping at your feet.
      const toA = (ax - p.x) * (ax - p.x) + (ay - p.y) * (ay - p.y);
      const toB = (bxx - p.x) * (bxx - p.x) + (byy - p.y) * (byy - p.y);
      const dx = toB >= toA ? bxx - ax : ax - bxx;
      const dy = toB >= toA ? byy - ay : ay - byy;
      bestD2 = d2;
      best = {
        x: p.x,
        y: p.y,
        headingRad: normalizeHeading(Math.atan2(dx, dy)),
        onRoad: true,
      };
    }
  }
  if (best) return best;

  // Same spiral as findSpawn, centered on the pick instead of the origin.
  for (let radius = 0; radius <= searchM; radius += 2) {
    const steps = Math.max(1, Math.ceil((radius * Math.PI) / 2));
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const x = tx + radius * Math.sin(angle);
      const y = ty + radius * Math.cos(angle);
      if (!isCircleBlocked(collision, x, y)) {
        return { x, y, headingRad: null, onRoad: false };
      }
    }
  }
  return null;
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
 * CW-72 (CW-Q75, signed by the owner at G1): THE ONE DEFAULT CHARACTER SIZE.
 *
 * CW-42 landed every machine on its own calibrated size, so two players saw
 * two different games and no picture either of them described was the picture
 * the other had. This is the size everyone starts at, chosen from the bench
 * rather than from a preference: 45-second scripted walks in heavy rain on an
 * Intel Iris Xe, the owner's signed hardware target.
 *
 *   size   full speed   four times slow (Seattle / Denver)
 *   10%      59.3 fps       29.8  -           fails the bar
 *   30%      52.9-59.8      41.6 / 43.6       the smallest that holds
 *   40%      -              -    / 43.5       holds
 *   50%      59.9           41.6 / -          holds
 *
 * 10% and 20% are the SAME 2x4 pixel cell (the three-pixel font floor), so the
 * ladder is really 10 / 30 / 40 / 50, and 30 is the smallest rung that clears
 * thirty frames a second on a slow machine in BOTH the light city and the
 * heavy one.
 */
export const CITY_DEFAULT_CHAR_SCALE = 0.3;

/**
 * Clamp a character scale into the game's range and snap it onto the
 * 10-point step grid, so every announced value is a whole ten percent.
 *
 * Snapping matters for seeded values: the shared Alt View preference is a
 * 0.05-step slider, so 0.85 would otherwise start a ladder of 85/95/100 that
 * never lines up with the steps the help text promises.
 *
 * CW-42 (CW-Q39): the range's bottom can be raised per machine — the
 * calibrated floor arrives as an argument so this module stays pure. Only
 * ADJUSTMENTS pass it: a stored manual choice below today's floor is
 * grandfathered on seed, never clamped up (auto must not fight it).
 *
 * @param {number} scale
 * @param {number|null} [floorScale] the machine's calibrated floor, if any
 * @returns {number} a value in [floor, CHAR_SCALE_MAX] on the grid
 */
export function clampCharScale(scale, floorScale = null) {
  const raw = Number.isFinite(scale) ? scale : CHAR_SCALE_DEFAULT;
  const stepped = Math.round(raw / CHAR_SCALE_STEP) * CHAR_SCALE_STEP;
  const floor = Number.isFinite(floorScale)
    ? Math.min(CHAR_SCALE_MAX, Math.max(CHAR_SCALE_MIN, floorScale))
    : CHAR_SCALE_MIN;
  const bounded = Math.min(CHAR_SCALE_MAX, Math.max(floor, stepped));
  // Binary floats: 0.1*3 is 0.30000000000000004, and that reaches the player
  // as "Character size 30.000000000000004 percent" without this.
  return Math.round(bounded * 100) / 100;
}

/**
 * Decide the character scale a session opens at (CW-Q10, amended CW-Q39,
 * rewritten CW-72 for CW-Q75).
 *
 * ONE DEFAULT FOR EVERYONE. CW-42 seeded from the machine's own calibrated
 * landing and, failing that, from the main app's Alt View slider - so two
 * players, and even one player on two machines, opened two different games.
 * There are now two inputs and one of them is a floor:
 *
 *   1. The player's own saved size. Their choice, and it sticks.
 *   2. The floor this machine measured for itself, which SEEDS a player who
 *      has never chosen. It does not clamp one who has.
 *
 * The shared Alt View preference no longer seeds the game at all: a slider in
 * the main app deciding how coarse the city looks is exactly the second size
 * this release exists to remove.
 *
 * CW-88 (CW-Q87): the floor used to raise a saved size up to itself, and the
 * owner reversed that half of CW-Q68 - keep 30 per cent as the default, and
 * let a player who wants to adjust go as small as 10 again. Three comments in
 * this codebase already described the behaviour restored here, including
 * `clampCharScale`'s own docblock above ("a stored manual choice below
 * today's floor is grandfathered on seed, never clamped up") and two in the
 * controller; CW-72's `Math.max` is what diverged from them. The DEFAULT half
 * of CW-Q68 stands: 30 per cent for anybody with no saved choice, raised by
 * the calibration.
 *
 * @param {string|null|undefined} savedGame - the game's own persisted value
 * @param {number|null} [floorScale] - the decoded stored floor, if any
 * @returns {number}
 */
export function seedCharScale(savedGame, floorScale = null) {
  const game = parseFloat(savedGame ?? '');
  // A choice they made reaches CHAR_SCALE_MIN, and passing no floor is what
  // says so: clampCharScale bounds below at CHAR_SCALE_MIN when it has none.
  if (Number.isFinite(game)) return clampCharScale(game);
  const floor = Number.isFinite(floorScale)
    ? Math.max(floorScale, CITY_DEFAULT_CHAR_SCALE)
    : CITY_DEFAULT_CHAR_SCALE;
  return clampCharScale(floor);
}
