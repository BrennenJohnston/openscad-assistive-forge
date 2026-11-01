/**
 * The scale choices of a place map, each named for the ground it fits, as
 * Touch Mapper names its presets: a ratio, what one millimeter of plate
 * stands for, and what draws at it. The tactile limits decide the drawing
 * rules: two lines closer than the minimum gap (3 mm) read as one, and a
 * 10 mm symbol stands for more ground as the ratio grows, so the larger the
 * ground the fewer kinds of feature a map can carry.
 *
 * @license GPL-3.0-or-later
 */
import { DEFAULT_SETTINGS } from './levels-svg.js';

const RULES = {
  building: Object.freeze({
    streetsAsOneLine: false,
    crossings: true,
    crossingMarkings: true,
    curbRamps: true,
    stubs: true,
    sidePaths: true,
    drawn: 'Every sidewalk, crossing marking and curb ramp draws.',
  }),
  block: Object.freeze({
    streetsAsOneLine: false,
    crossings: true,
    crossingMarkings: false,
    curbRamps: true,
    stubs: true,
    sidePaths: true,
    drawn: 'Sidewalks, crossings and curb ramps draw.',
  }),
  blocks: Object.freeze({
    streetsAsOneLine: 'whereUnder3mm',
    crossings: true,
    crossingMarkings: false,
    curbRamps: false,
    stubs: false,
    sidePaths: true,
    drawn: 'Narrow streets draw as one line; curb ramps leave.',
  }),
  neighborhood: Object.freeze({
    streetsAsOneLine: true,
    crossings: false,
    crossingMarkings: false,
    curbRamps: false,
    stubs: false,
    sidePaths: false,
    drawn: 'Streets draw as one line; crossings and side paths leave.',
  }),
};

/** The ratios a person may type for Custom (1:200 to 1:10000). */
export const CUSTOM_RANGE = Object.freeze({ min: 200, max: 10000 });

export const SCALES = Object.freeze([
  Object.freeze({
    key: 'building',
    name: 'A building and its doors',
    ratio: 500,
    rules: RULES.building,
  }),
  Object.freeze({
    key: 'block',
    name: 'A block',
    ratio: 1000,
    rules: RULES.block,
  }),
  Object.freeze({
    key: 'blocks',
    name: 'A few blocks',
    ratio: 2000,
    rules: RULES.blocks,
  }),
  Object.freeze({
    key: 'neighborhood',
    name: 'A neighborhood',
    ratio: 4000,
    rules: RULES.neighborhood,
  }),
  // The ratio comes from fitting the walk to the plate when it is drafted.
  Object.freeze({ key: 'route', name: 'Fit to the route' }),
  Object.freeze({ key: 'custom', name: 'Custom' }),
]);

/** Sentences of the choices without a ratio of their own. */
const ROUTE_SENTENCE = 'The plate is fitted to the walk and its two buildings.';

/** @returns {object|null} the choice with this key */
export function scaleChoice(key) {
  return SCALES.find((s) => s.key === key) || null;
}

/** Meters of ground across a plate `plateWmm` wide at 1:`ratio`. */
export function groundAcrossM(ratio, plateWmm) {
  return (plateWmm * ratio) / 1000;
}

/** Meters of ground a symbol `symbolMm` across stands for at 1:`ratio`. */
export function symbolMeters(ratio, symbolMm = DEFAULT_SETTINGS.symbolSizeMm) {
  return (symbolMm * ratio) / 1000;
}

/** Millimeters of plate for one meter of ground at 1:`ratio`. */
export function mmPerMeter(ratio) {
  return 1000 / ratio;
}

/**
 * The drawing rules for any ratio: those of the named choice nearest to it,
 * the more detailed one when two are as near.
 */
export function nearestRule(ratio) {
  let best = null;
  for (const choice of SCALES) {
    if (!choice.ratio) continue;
    const d = Math.abs(choice.ratio - ratio);
    if (!best || d < best.d) best = { d, rules: choice.rules };
  }
  return best.rules;
}

/**
 * Whether a street `streetWidthM` wide draws as one line at 1:`ratio`: its
 * two sidewalks fall at the minimum gap or closer on the plate.
 */
export function sidewalksAsOneLine(ratio, streetWidthM) {
  return streetWidthM * mmPerMeter(ratio) <= DEFAULT_SETTINGS.minGapMm;
}

/**
 * The sentence under a choice: the ground across the plate, what a symbol
 * stands for, and what draws. Custom takes its typed ratio.
 *
 * @param {object} choice - an entry of SCALES
 * @param {{ w: number, h: number }} plate - the map's size in millimeters
 * @param {number} [ratio] - Custom's typed ratio
 */
export function sentenceFor(choice, plate, ratio = choice.ratio) {
  if (!ratio) return ROUTE_SENTENCE;
  const rules = choice.rules || nearestRule(ratio);
  const ground = Math.round(groundAcrossM(ratio, plate.w));
  const symbol = Math.round(symbolMeters(ratio) * 10) / 10;
  return `${ground} m across on this plate. A ${DEFAULT_SETTINGS.symbolSizeMm} mm symbol stands for ${symbol} m. ${rules.drawn}`;
}
