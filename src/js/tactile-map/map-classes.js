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
 * @property {'solid'|'dotted'|'dashed'|'double'|'ticks'} [style] - A line's style
 * @property {string} [symbolKey] - A point's symbol in the symbol library
 * @property {string} source - Where the shape or the figure comes from
 */

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
  },
  {
    key: 'walkway',
    name: 'Walkway',
    kind: 'line',
    level: 1,
    widthMm: 1.5,
    style: 'solid',
    source: 'BANA 2022 8.6.7: a path a finger traces comfortably',
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
  },
  {
    key: 'track',
    name: 'Track',
    kind: 'line',
    level: 1,
    widthMm: 1.0,
    style: 'double',
    source: 'Jehoel 2006: a double line reads as two with a gap over 1.3 mm',
  },
  {
    key: 'area',
    name: 'Area',
    kind: 'area',
    level: 1,
    source: 'BANA 2022 3.4.3.1: a plain raised area; textures only on request',
  },
  {
    key: 'stairs',
    name: 'Stairs',
    kind: 'point',
    level: 2,
    symbolKey: 'stairs',
    source: 'Ungar 2005 (three bars); BANA 2022',
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
  },
  {
    key: 'landmark',
    name: 'Landmark',
    kind: 'point',
    level: 2,
    symbolKey: 'landmark-circle',
    source: 'BANA 2022 8.6.5; Jehoel 2009: 5.0 to 6.4 mm identifies a symbol',
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
