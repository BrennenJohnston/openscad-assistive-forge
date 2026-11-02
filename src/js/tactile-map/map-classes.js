/**
 * The map's class table: what a feature of a tactile map can be, and what
 * that decides. A class names a level, a line width and style, or a symbol,
 * so a person picks a class and never a height. The table is data, and the
 * one copy: the levels builder reads its levels, widths, styles and symbols
 * from it, and the drawing editor's map purpose offers its names.
 *
 * Every row says where its shape or figure comes from. The sizes are the
 * ones my printed station maps settled on where the published guidelines
 * leave room, and the guidelines' figures where they do not.
 *
 * No DOM here: a worker may import this file.
 *
 * @license GPL-3.0-or-later
 */

/**
 * @typedef {object} MapClass
 * @property {string} key - The class as a plan writes it
 * @property {string} name - The class as a person reads it
 * @property {'line'|'area'|'point'|'ignore'} kind
 * @property {number} [level] - 1 to 3; the level the feature rises to
 * @property {number} [widthMm] - A line's width in millimeters
 * @property {'solid'|'dotted'|'dashed'|'double'|'ticks'|'chevrons'} [style] - A line's style
 * @property {string} [symbolKey] - A point's symbol in the symbol library
 * @property {string} source - Where the shape or the figure comes from
 * @property {Array<{tag: string, values?: string[], kind: 'way'|'closed'|'node'}>} [osm]
 *   - The OpenStreetMap tags that read as this class (plan-from-osm.js);
 *   `kind` is the element: an open way, a closed way, or a node
 */

/**
 * A road's width when its way carries no `width` tag, in meters: typical
 * figures I inferred for the draft (a curb line each side of the
 * centerline), not a survey. A tagged width always wins.
 */
export const ROAD_WIDTHS_M = Object.freeze({
  motorway: 14,
  trunk: 12,
  primary: 10,
  secondary: 9,
  tertiary: 8,
  unclassified: 7,
  residential: 6,
  living_street: 5,
  service: 4,
});

/** The classes, in the order a menu offers them: lines, the area, the points, then Ignore. */
export const MAP_CLASSES = Object.freeze([
  {
    key: 'wall',
    name: 'Wall',
    kind: 'line',
    level: 3,
    widthMm: 2.0,
    style: 'solid',
    source: 'my printed station maps: a thick solid line on the top level',
  },
  {
    key: 'curb',
    name: 'Curb or edge',
    kind: 'line',
    level: 1,
    widthMm: 1.0,
    style: 'solid',
    source: 'BANA 2022 line styles: a thin solid line',
    // A road: its centerline offset half its width each side (ROAD_WIDTHS_M).
    osm: [{ tag: 'highway', values: Object.keys(ROAD_WIDTHS_M), kind: 'way' }],
  },
  {
    key: 'walkway',
    name: 'Walkway',
    kind: 'line',
    level: 1,
    widthMm: 1.5,
    style: 'solid',
    source: 'BANA 2022 8.6.7: a path a finger traces comfortably',
    osm: [
      { tag: 'footway', values: ['sidewalk'], kind: 'way' },
      {
        tag: 'highway',
        values: ['footway', 'pedestrian', 'steps'],
        kind: 'way',
      },
      { tag: 'highway', values: ['path'], kind: 'way' },
    ],
  },
  {
    key: 'route',
    name: 'Route',
    kind: 'line',
    level: 2,
    widthMm: 1.5,
    style: 'dotted',
    source:
      'BANA 2022 dashed primary lines; the dotted route of my printed maps',
  },
  {
    key: 'crossing',
    name: 'Crossing',
    kind: 'line',
    level: 2,
    widthMm: 1.5,
    style: 'ticks',
    source: 'BANA 2022 line styles: short cross-ticks',
    osm: [
      { tag: 'footway', values: ['crossing'], kind: 'way' },
      { tag: 'highway', values: ['crossing'], kind: 'node' },
    ],
  },
  {
    key: 'track',
    name: 'Track',
    kind: 'line',
    level: 1,
    widthMm: 1.0,
    style: 'double',
    source: 'Jehoel 2006: a double line reads as two with a gap over 1.3 mm',
    osm: [
      {
        tag: 'railway',
        values: ['rail', 'light_rail', 'tram', 'subway'],
        kind: 'way',
      },
    ],
  },
  {
    key: 'steep',
    name: 'Steep sidewalk',
    kind: 'line',
    level: 2,
    widthMm: 1.5,
    style: 'chevrons',
    symbolKey: 'chevron-uphill',
    source:
      'Ungar 2005 (arrows read by their point); OpenSidewalks incline as rise over run',
  },
  {
    key: 'traffic-island',
    name: 'Traffic island',
    kind: 'line',
    level: 2,
    widthMm: 1.5,
    style: 'solid',
    source:
      "OpenSidewalks: the part of a crossing on a traffic island, mapped as a line; drawn plain on the crossing's level, so the ticks pause where the island stands",
    osm: [{ tag: 'footway', values: ['traffic_island'], kind: 'way' }],
  },
  {
    key: 'area',
    name: 'Area',
    kind: 'area',
    level: 1,
    source: 'BANA 2022 3.4.3.1: a plain raised area; textures only on request',
    osm: [
      { tag: 'building', kind: 'closed' },
      { tag: 'leisure', values: ['park', 'garden', 'pitch'], kind: 'closed' },
    ],
  },
  {
    key: 'stairs',
    name: 'Stairs',
    kind: 'point',
    level: 2,
    symbolKey: 'stairs',
    source: 'Ungar 2005 (three bars); BANA 2022',
    // A steps way: a stairs point at its middle and a walkway line.
    osm: [{ tag: 'highway', values: ['steps'], kind: 'way' }],
  },
  {
    key: 'elevator-up',
    name: 'Elevator up',
    kind: 'point',
    level: 2,
    symbolKey: 'elevator-up',
    source: 'Ungar 2005 arrows; Gual 2012: a filled triangle reads best',
  },
  {
    key: 'elevator-down',
    name: 'Elevator down',
    kind: 'point',
    level: 2,
    symbolKey: 'elevator-down',
    source: 'Ungar 2005 arrows; Gual 2012',
  },
  {
    key: 'entrance',
    name: 'Entrance',
    kind: 'point',
    level: 2,
    symbolKey: 'entrance',
    source: 'ISO 19028: a half-circle for a way in and its direction',
    osm: [{ tag: 'entrance', kind: 'node' }],
  },
  {
    key: 'landmark',
    name: 'Landmark',
    kind: 'point',
    level: 2,
    symbolKey: 'landmark-circle',
    source: 'BANA 2022 8.6.5; Jehoel 2009: 5.0 to 6.4 mm identifies a symbol',
    // Shops and benches when their box is ticked; other amenities with a name.
    osm: [
      { tag: 'shop', kind: 'node' },
      { tag: 'amenity', kind: 'node' },
    ],
  },
  {
    key: 'you-are-here',
    name: 'You are here',
    kind: 'point',
    level: 2,
    symbolKey: 'you-are-here',
    source: 'BANA 2022 8.5.6 and ISO 19028: the most prominent symbol',
  },
  {
    key: 'transit-stop',
    name: 'Transit stop',
    kind: 'point',
    level: 2,
    symbolKey: 'transit-stop',
    source: 'BANA 2022 8.5.4: a filled square with a notch',
    osm: [
      {
        tag: 'public_transport',
        values: ['platform', 'stop_position'],
        kind: 'node',
      },
      { tag: 'highway', values: ['bus_stop'], kind: 'node' },
      {
        tag: 'railway',
        values: ['tram_stop', 'station', 'halt'],
        kind: 'node',
      },
    ],
  },
  {
    key: 'curb-ramp',
    name: 'Curb ramp',
    kind: 'point',
    level: 2,
    symbolKey: 'landmark-triangle',
    source:
      'OpenSidewalks curb ramps (barrier=kerb, kerb=lowered); the library triangle, a wedge for a slope (Jehoel 2009: identified at 6.4 mm)',
    osm: [{ tag: 'kerb', values: ['lowered'], kind: 'node' }],
  },
  {
    key: 'raised-curb',
    name: 'Raised curb',
    kind: 'point',
    level: 2,
    symbolKey: 'landmark-square',
    source:
      'OpenSidewalks raised curbs (barrier=kerb, kerb=raised), a step a wheel cannot take; the library square (Jehoel 2009: identified at 5.0 mm)',
    osm: [{ tag: 'kerb', values: ['raised'], kind: 'node' }],
  },
  {
    key: 'text',
    name: 'Text',
    kind: 'area',
    level: 2,
    source:
      'ADA 703.2: raised characters at least 0.8 mm above their surface; my printed station maps raise their words one symbol step above the floor they stand on, the symbol level',
  },
  {
    key: 'ignore',
    name: 'Ignore',
    kind: 'ignore',
    source: 'the drawing keeps the shape; the map leaves it out',
  },
]);

/** The keys, in the same order. */
export const MAP_CLASS_KEYS = Object.freeze(MAP_CLASSES.map((c) => c.key));

/**
 * One class by its key, or null.
 * @param {string} key
 * @returns {MapClass|null}
 */
export function mapClass(key) {
  return MAP_CLASSES.find((c) => c.key === key) || null;
}

/**
 * The table in the shape the levels builder reads: one entry per class
 * with its kind, level, width, style and symbol, plus the one kind of
 * feature a plan carries that is not a class a shape takes (a label
 * channel). A drawn word is the Text class: an area on the symbol level,
 * its counters the holes the plan keeps; a typed word (the plan's text
 * kind) is drawn by the tile itself and reads no class.
 *
 * @returns {Record<string, {kind: string, level?: number, width?: number, style?: string, symbol?: string}>}
 */
export function levelsByClass() {
  const out = {};
  for (const c of MAP_CLASSES) {
    const row = { kind: c.kind };
    if (c.level !== undefined) row.level = c.level;
    if (c.widthMm !== undefined) row.width = c.widthMm;
    if (c.style !== undefined) row.style = c.style;
    if (c.symbolKey !== undefined) row.symbol = c.symbolKey;
    out[c.key] = row;
  }
  out.channel = { kind: 'channel' };
  return out;
}
