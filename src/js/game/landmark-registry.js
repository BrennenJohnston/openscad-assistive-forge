/**
 * The curated landmark registry (CW-78, CW-Q70).
 *
 * ★★ THE LEGEND STOPS BEING TAG ARITHMETIC. The scorer in city-data.js ranks
 * what the tags happen to reward - Seattle's read eleven hotels and put the
 * Space Needle eleventh of twelve - so each city here carries a SEVEN-ROW
 * table drafted from its own landmark register, cited row by row, and the
 * legend lists those seven in table order. Every row is owner-vetoable at a
 * gate; deleting a row is the whole removal.
 *
 * ★ EVERY ROW IS VALIDATED AGAINST THE EXTRACT, LOUDLY. A row is keyed by OSM
 * way or node id, never by name (CW-62: names are edited upstream), and a row
 * that matches nothing in the shipped extract THROWS - a test failure and a
 * refused city, never a silent drop. The pinned-id law CW-63 wrote for two
 * dressings now covers every registry row, so a rebake that retires an id
 * fails the board instead of quietly shrinking a legend.
 *
 * Rows the registers name that the extracts CANNOT key are recorded here
 * rather than silently absent: Denver's Union Station (1701-1777 Wynkoop,
 * listed 2004) lies outside the extract circle; Burnaby's Swangard Stadium,
 * Central Park Gate, Metropolis at Metrotown and the Sovereign tower are not
 * mapped as named elements inside its circle - Central Park's own row carries
 * the first two, which stand inside it.
 *
 * A city with NO table (a synthetic fixture, a future extract) falls back to
 * the scorer, with `wikidata` presence as the generic tiebreaker (CW-Q70).
 *
 * @license GPL-3.0-or-later
 */

import { extractLandmarks } from './city-data.js';
import { isDrawnRoadway, isPavementWay } from './walk-controls.js';

/**
 * One row: `name` is the display name the legend and the progress store use;
 * `wayId` or `nodeId` keys the extract element; `cite` names the register or
 * published record the row stands on; `reason` is the one-line case for the
 * owner's veto read.
 *
 * `spawnFacesFirstRow`: Seattle spawns facing its first row (the Great Wheel,
 * CW-78's spawn rule); the other cities keep the clear-heading spawn facing.
 */
export const LANDMARK_REGISTRY = {
  seattle: {
    spawnFacesFirstRow: true,
    rows: [
      {
        name: 'Seattle Great Wheel',
        nodeId: 1809238334,
        cite: 'Wikipedia "Seattle Great Wheel": 175 ft / 53.3 m, 42 gondolas, Pier 57, opened 2012; OSM height=53, wikidata Q7442108',
        reason: 'The waterfront icon, and the spawn anchor this round names.',
      },
      {
        name: 'Space Needle',
        wayId: 12903132,
        cite: 'Seattle Landmarks Preservation Board designated landmark; Wikipedia / spaceneedle.com: 605 ft / 184.4 m, top house 138 ft / 42 m at the 520 ft observation level (Q5317)',
        reason: "The city's symbol; the silhouette every visitor knows.",
      },
      {
        name: 'Seattle Central Library',
        wayId: 37056442,
        cite: "OMA / LMN, 2004; Seattle Public Library's own architecture pages; dressed under CW-Q56",
        reason: 'The downtown building people visit for its architecture.',
      },
      {
        name: 'Smith Tower',
        wayId: 52781661,
        cite: "Seattle Landmarks Preservation Board; Wikipedia: 1914, the city's first skyscraper (Q1196348)",
        reason: "Pioneer Square's tower; the oldest piece of the skyline.",
      },
      {
        name: 'Public Market Clock',
        nodeId: 4217400413,
        cite: 'Pike Place Market Historical District (National Register #70000086); the 1927 clock and Public Market Center sign at the market entrance',
        reason: 'The market entrance mark, a short walk from the spawn.',
      },
      {
        name: 'Paramount Theatre',
        wayId: 115042486,
        cite: 'Seattle Landmarks Preservation Board; Wikipedia: 1928 movie palace at 9th and Pine (Q3363536)',
        reason: 'A designated landmark theatre still in nightly use.',
      },
      {
        name: 'Arctic Building',
        wayId: 110176001,
        cite: 'Seattle Landmarks Preservation Board; Wikipedia: 1916, the terra-cotta walrus heads on 3rd Avenue (Q638024)',
        reason: 'A designated landmark a walker can recognise from the kerb.',
      },
    ],
  },
  denver: {
    rows: [
      {
        name: 'Daniels & Fisher Tower',
        wayId: 36729544,
        cite: 'Denver landmark (1968), 1601 Arapahoe St; Wikipedia: 1911, 325 ft, modelled on the Campanile of St Mark’s (Q901770)',
        reason: "The skyline's oldest icon, anchoring the 16th Street Mall.",
      },
      {
        name: 'Brown Palace Hotel',
        wayId: 458038539,
        cite: 'Denver landmark list: 321-401 17th St, listed 1989; opened 1892 (Q991069)',
        reason: 'The triangular grand hotel every Denver register leads with.',
      },
      {
        name: 'Paramount Theatre',
        wayId: 305027510,
        cite: 'Denver landmark register: Paramount Theatre, 1621 Glenarm Pl',
        reason: "Downtown's surviving movie palace.",
      },
      {
        name: 'Trinity United Methodist Church',
        wayId: 52957908,
        cite: 'Denver landmark register: 1820 Broadway; 1888 (Q7842995)',
        reason: 'The sandstone spire holding its corner against the towers.',
      },
      {
        name: 'Equitable Building',
        wayId: 82874458,
        cite: 'Denver landmark register: 730 17th St; 1892 (Q5384616)',
        reason: "Denver's first great office block, still on 17th Street.",
      },
      {
        name: 'Kittredge Building',
        wayId: 37868371,
        cite: 'Denver landmark and National Register: 511 16th St; 1891 (Q49511334)',
        reason: 'The 1891 stone front on the mall itself.',
      },
      {
        name: 'Ellie Caulkins Opera House',
        wayId: 304212732,
        cite: 'Denver landmark register: Denver Municipal Auditorium, 908 14th St, 1908; the opera house is the Auditorium’s hall (Q3051472)',
        reason: "The 1908 Auditorium's surviving face on 14th Street.",
      },
    ],
  },
  albuquerque: {
    rows: [
      {
        name: 'KiMo Theatre',
        wayId: 474070590,
        cite: 'City of Albuquerque Landmarks Commission: KiMo Theatre, 423 Central Ave NW, 1927 Pueblo Deco (Q6403585)',
        reason: "The city's own register leads with it.",
      },
      {
        name: 'Sunshine Building',
        wayId: 119717403,
        cite: 'City landmark register: 120 Central Ave SW, 1924 (Q7641442)',
        reason: "Central Avenue's first tall theatre block.",
      },
      {
        name: 'Rosenwald Building',
        wayId: 707216310,
        cite: 'City landmark register: 320 Central Ave SW, 1910 reinforced-concrete store (Q7368615)',
        reason: 'The 1910 department store the register protects.',
      },
      {
        name: 'Occidental Life Building',
        wayId: 329065341,
        cite: 'City landmark register: 305 Gold Ave SW, 1917; the white Venetian palazzo front (Q7075686)',
        reason: 'The one facade downtown nobody mistakes for another.',
      },
      {
        name: 'Hotel Andaluz',
        wayId: 183521465,
        cite: "City landmark register: La Posada de Albuquerque, 125 Second St NW, 1939, Conrad Hilton's first New Mexico hotel; today the Hotel Andaluz (Q5911177)",
        reason: 'The register row people can still book a room in.',
      },
      {
        name: 'Simms Building',
        wayId: 401654872,
        cite: "National Register of Historic Places: 400 Gold Ave SW, 1954, the city's first curtain-wall tower (Q7518027)",
        reason: 'Downtown modernism’s listed example.',
      },
      {
        name: 'Southwestern Brewery and Ice Company',
        wayId: 437201163,
        cite: 'National Register of Historic Places (Q7571396): the 1900s brewery east of the tracks',
        reason:
          'The listed industrial survivor on the east side of the circle.',
      },
    ],
  },
  burnaby: {
    rows: [
      {
        name: 'Central Park',
        wayId: 23165846,
        cite: 'Heritage Burnaby: the 1891 park at Boundary and Kingsway (Q5061594); Swangard Stadium and the Central Park Gate stand inside it',
        reason: "The city's oldest public ground and its best-known landmark.",
      },
      {
        name: 'Metrotower I',
        wayId: 75718012,
        cite: 'Wikipedia "List of tallest buildings in Burnaby": Metrotower I, 104 m, 1989 (plan §3f)',
        reason: 'The first of the Metrotown twins on the skyline.',
      },
      {
        name: 'Metrotower II',
        wayId: 75718011,
        cite: 'Wikipedia "List of tallest buildings in Burnaby": Metrotower II, 1991 (plan §3f)',
        reason: 'The second twin; together they mark Metrotown from anywhere.',
      },
      {
        name: 'Metrotower III',
        wayId: 105046492,
        cite: 'Wikipedia "List of tallest buildings in Burnaby": Metrotower III, completed 2015 (plan §3f)',
        reason: 'The third tower completing the Kingsway group.',
      },
      {
        name: 'Station Square Tower 5',
        wayId: 962138235,
        cite: 'Plan §3f: the Station Square towers, 35-57 storeys; tower 5 is the tallest in this circle at 172 m in the extract',
        reason: 'The tallest thing the circle contains.',
      },
      {
        name: 'Daniel & Amelia Mowat House',
        wayId: 551738891,
        cite: 'Heritage Burnaby register; mapped historic=house',
        reason: 'A register heritage house scaled to a walker, not a skyline.',
      },
      {
        name: 'Wilson House',
        wayId: 870634459,
        cite: 'Heritage Burnaby register; mapped historic=house',
        reason: 'The second register house inside the circle.',
      },
    ],
  },
};

/** The registry entry for a city, or null when the city carries no table. */
export function registryFor(citySlug) {
  const entry = LANDMARK_REGISTRY[citySlug];
  return entry && Array.isArray(entry.rows) ? entry : null;
}

/** Vertex-average centre of a ring - the same arithmetic the scorer uses, so
 * a registry landmark and a scored one agree about where a building is. */
function ringCentre(ring) {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of ring) {
    cx += x;
    cy += y;
  }
  return [cx / ring.length, cy / ring.length];
}

/**
 * Resolve one table against a parsed extract. Table order is legend order.
 *
 * ★ A ROW THAT MATCHES NOTHING THROWS. The shipped tables are pinned against
 * the shipped extracts by tests/unit/game/landmark-registry.test.js, so this
 * firing at runtime means the data moved under the table - which is exactly
 * the moment to fail loudly rather than draw a shorter legend and say
 * nothing (CW-63's rebake lesson, extended to every row).
 *
 * @param {ReturnType<import('./city-data.js').parseCityExtract>} model
 * @param {Array<Object>} rows
 * @returns {Array<{name: string, x: number, y: number, heightM: number,
 *   score: number, outer: Array<[number, number]>|null, row: Object}>}
 */
export function resolveRegistryRows(model, rows) {
  return rows.map((row) => {
    if (Number.isFinite(row.wayId)) {
      const building = model.buildings.find((b) => b.id === row.wayId);
      if (building) {
        const [x, y] = ringCentre(building.outer);
        return {
          name: row.name,
          x,
          y,
          heightM: building.heightM,
          score: 0,
          outer: building.outer,
          row,
        };
      }
      const green = (model.greens ?? []).find((g) => g.id === row.wayId);
      if (green) {
        const [x, y] = ringCentre(green.outer);
        return {
          name: row.name,
          x,
          y,
          heightM: 0,
          score: 0,
          outer: green.outer,
          row,
        };
      }
    }
    if (Number.isFinite(row.nodeId)) {
      const node = (model.attractions ?? []).find((a) => a.id === row.nodeId);
      if (node) {
        return {
          name: row.name,
          x: node.x,
          y: node.y,
          heightM: node.heightM || 0,
          score: 0,
          outer: null,
          row,
        };
      }
    }
    throw new Error(
      `landmark registry: "${row.name}" (way ${row.wayId ?? '-'} / node ${
        row.nodeId ?? '-'
      }) matches nothing in the extract`
    );
  });
}

/**
 * The landmarks a city walks with: its curated table in table order, or the
 * scorer (wikidata-tiebroken, CW-Q70) where no table exists.
 */
export function cityLandmarks(model, citySlug) {
  const entry = registryFor(citySlug);
  if (!entry) return extractLandmarks(model);
  return resolveRegistryRows(model, entry.rows);
}

// ---------------------------------------------------------------------------
// The waypoint (CW-78, CW-Q71)
// ---------------------------------------------------------------------------

/**
 * The drawn mark: the app's man-in-circle on a tall plinth - a bright ring
 * around an EXACT-BLACK core with the bright figure inside it, which is
 * CW-40's law (a bright outline around exact black is the one footprint no
 * building in any palette has) applied at street level.
 *
 * SIZES ARE SET BY THE CHARACTER GRID, NOT BY TASTE (CW-Q71: at least five
 * character rows at 40 m at the default size). At 40 m the game viewport
 * (756 px over a 60 degree field) gives 16.4 px/m and the 30% cell is
 * 3 x 6 px, so the 2.0 m figure spans 5.5 rows and the 3.2 m ring about
 * nine - above the CW-61 floor that killed the map-marker man ("a standing
 * figure needs five rows").
 */
export const WAYPOINT_MARK = Object.freeze({
  /** Outer radius of the bright ring, in metres. */
  ringOuterM: 1.6,
  /** Inner radius - everything inside is the exact-black core. */
  ringInnerM: 1.25,
  /** The figure standing in the core. */
  manHeightM: 2.0,
  /** Top of the plinth the ring sits on. */
  plinthTopM: 2.4,
  /** Half-width of the square plinth post. */
  plinthHalfM: 0.35,
  /** Thickness of the mark's slab, enough to read edge-on as a post. */
  faceThickM: 0.25,
});

/**
 * Touch = walking into the mark. The walker stops PLAYER_RADIUS_M short of
 * the plinth's blocked cell, so the reachable minimum centre distance is
 * about plinth half (0.35) + player radius (0.3) + one collision hop
 * (0.15); 1.6 m gives the press-against-it margin. The leave radius is the
 * hysteresis that keeps one touch from announcing every frame.
 */
export const WAYPOINT_TOUCH_M = 1.6;
export const WAYPOINT_LEAVE_M = 3.0;

/** How far past the street face the pavement search may wander before the
 * crossing fallback fires (the CW-78 blocker's own number). */
const PAVEMENT_SEARCH_PAST_M = 40;
const SEARCH_STEP_M = 0.5;

function spotClear(collision, x, y) {
  if (collision.isBlocked(x, y)) return false;
  for (const [dx, dy] of [
    [0.6, 0],
    [-0.6, 0],
    [0, 0.6],
    [0, -0.6],
  ]) {
    if (collision.isBlocked(x + dx, y + dy)) return false;
  }
  return true;
}

/** Nearest point on segment a->b to p, clamped to the segment. */
function nearestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: ax, y: ay };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { x: ax + dx * t, y: ay + dy * t };
}

/**
 * Where a landmark's waypoint stands: on public pavement at the landmark's
 * STREET FACE - the point of its outline nearest a drawn roadway, never its
 * centroid (a centroid is indoors). From that face the search walks toward
 * the street and takes the first clear pavement cell; a node landmark (the
 * Great Wheel, on a pier with no public ground of its own) searches from the
 * node to its nearest street the same way, so its mark lands on the city
 * pavement that faces it.
 *
 * Pavement is the surface grid's own answer (heightAt == 0 is the apron or a
 * mapped pavement; open ground and roadway both read below it), so this
 * cannot disagree with what the scene draws underfoot.
 *
 * BLOCKER (named in the release): no clear pavement along the whole face
 * line plus 40 m -> the nearest mapped crossing, and the fallback is COUNTED
 * in the returned spot rather than silent.
 *
 * @returns {{x: number, y: number, facingRad: number, name: string,
 *   placement: 'pavement'|'crossing'|'none'}|null}
 */
export function findWaypointSpot(model, collision, surface, landmark) {
  // A pedestrianised street or a mapped pavement IS a street face too -
  // Denver's Kittredge Building fronts the 16th Street Mall, which no
  // roadway filter would ever reach.
  const roads = (model.roads ?? []).filter(
    (r) => isDrawnRoadway(r) || isPavementWay(r)
  );
  const cx = landmark.x;
  const cy = landmark.y;

  // The street face: nearest (outline point, road point) pair. Roads are
  // prefiltered by a coarse box around the OUTLINE's bounds, not the centre
  // - Burnaby's Central Park is 800 m across and its centre is nowhere near
  // its own street faces.
  const probePoints = landmark.outer ?? [[cx, cy]];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of probePoints) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  // One candidate per outline point: its nearest road point. A SINGLE best
  // face is not enough - Burnaby's Central Park has its geometrically
  // nearest face at a corner outside the collision grid, where every probe
  // reads blocked - so the marches below run nearest-first until one lands.
  const candidates = probePoints.map(([px, py]) => ({
    faceX: px,
    faceY: py,
    d: Infinity,
    roadX: px,
    roadY: py,
  }));
  const NEAR = 160;
  for (const road of roads) {
    const pts = road.points ?? [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      if (
        Math.min(ax, bx) > maxX + NEAR ||
        Math.max(ax, bx) < minX - NEAR ||
        Math.min(ay, by) > maxY + NEAR ||
        Math.max(ay, by) < minY - NEAR
      ) {
        continue;
      }
      for (const c of candidates) {
        const q = nearestOnSegment(c.faceX, c.faceY, ax, ay, bx, by);
        const d = Math.hypot(q.x - c.faceX, q.y - c.faceY);
        if (d < c.d) {
          c.d = d;
          c.roadX = q.x;
          c.roadY = q.y;
        }
      }
    }
  }
  // Outside the collision grid every probe reads blocked (the grid spans
  // the building core plus its 30 m margin), so a face out there can never
  // yield a spot - drop those before ranking rather than spending the
  // attempt budget on them.
  const b = model.boundsM;
  const inGrid = (x, y) =>
    x > b.minX - 29 && x < b.maxX + 29 && y > b.minY - 29 && y < b.maxY + 29;
  // Rank by street distance in 2 m buckets, then by nearness to the
  // landmark's centre: a park's perimeter ties at d = 0 all the way round,
  // and the mark should stand where the map beacon and the 60 m visit ring
  // are, not at whichever corner the outline happens to start.
  const faces = candidates
    .filter((c) => Number.isFinite(c.d) && inGrid(c.faceX, c.faceY))
    .sort(
      (a, b2) =>
        Math.round(a.d / 2) - Math.round(b2.d / 2) ||
        Math.hypot(a.faceX - cx, a.faceY - cy) -
          Math.hypot(b2.faceX - cx, b2.faceY - cy)
    )
    .slice(0, 40);
  if (faces.length === 0) return null;

  for (const { faceX, faceY, roadX, roadY } of faces) {
    const run = Math.hypot(roadX - faceX, roadY - faceY);
    const ux = run > 0 ? (roadX - faceX) / run : 0;
    const uy = run > 0 ? (roadY - faceY) / run : 1;
    const total = run + PAVEMENT_SEARCH_PAST_M;
    for (let t = 0; t <= total; t += SEARCH_STEP_M) {
      const x = faceX + ux * t;
      const y = faceY + uy * t;
      if (surface.heightAt(x, y) !== 0) continue;
      if (!spotClear(collision, x, y)) continue;
      return {
        x,
        y,
        // The face looks at the street it stands beside.
        facingRad: Math.atan2(roadX - x, roadY - y),
        name: landmark.name,
        placement: 'pavement',
      };
    }
  }

  // The counted fallback: the nearest mapped crossing that is clear.
  const { faceX, faceY } = faces[0];
  let crossing = null;
  for (const w of model.wayfinding ?? []) {
    if (w.kind !== 'crossing') continue;
    const d = Math.hypot(w.x - faceX, w.y - faceY);
    if ((!crossing || d < crossing.d) && spotClear(collision, w.x, w.y)) {
      crossing = { d, x: w.x, y: w.y };
    }
  }
  if (crossing) {
    return {
      x: crossing.x,
      y: crossing.y,
      facingRad: Math.atan2(faceX - crossing.x, faceY - crossing.y),
      name: landmark.name,
      placement: 'crossing',
    };
  }
  return null;
}
