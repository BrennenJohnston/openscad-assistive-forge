/**
 * Render every plate: the parameter set each plate renders with, the
 * README that travels with the plates, and the archive's entries. Pure and
 * DOM-free, as project-zip.js is, so a test can assert an archive's
 * contents without a browser; the zip assembly and the render stay in the
 * panel.
 *
 * @license GPL-3.0-or-later
 */

import { svgToDataUrl } from '../svg-text-encoding.js';
import { plateLevelsSvg } from './plate-tiling.js';

/** The tile's own defaults, used when a parameter is not in the state. */
const TILE_DEFAULTS = {
  base: 0.4,
  step: 0.6,
  symbolStep: 0.8,
  levels: 3,
  minWall: 1.2,
};

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * A millimeter value as a person reads it: one decimal, two when the value
 * has them (1 -> "1.0", 1.05 -> "1.05").
 * @param {number} value
 * @returns {string}
 */
export function mm(value) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(Math.round(rounded * 10 * 1000) / 1000)
    ? rounded.toFixed(1)
    : rounded.toFixed(2);
}

/**
 * The parameter set each plate renders with: the state's parameters, with
 * the plate's size, its id (under the margin style) and its levels file as
 * a file value, the same values the plate radio writes.
 *
 * @param {Object} input
 * @param {Object} input.rings - buildLevelRings(...).rings
 * @param {Array<{id: string}>} input.plates - planPlates(...).plates, in order
 * @param {string} input.idStyle - 'none', 'margin' or 'notches'
 * @param {{ mapFileParam: string, widthParam: string, heightParam: string, plateIdParam?: string }} input.config
 * @param {Object} input.parameters - The state's parameters
 * @returns {Array<{id: string, size: {w: number, h: number}, svg: string, fileName: string, parameters: Object}>}
 */
export function plateParameterSets({
  rings,
  plates,
  idStyle,
  config,
  parameters,
}) {
  return plates.map((plate) => {
    const out = plateLevelsSvg(rings, plate, { id: idStyle });
    const fileName = `levels_${plate.id}.svg`;
    const next = {
      ...parameters,
      [config.widthParam]: out.size.w,
      [config.heightParam]: out.size.h,
      [config.mapFileParam]: {
        name: fileName,
        data: svgToDataUrl(out.svg),
        type: 'image/svg+xml',
      },
    };
    if (config.plateIdParam) {
      next[config.plateIdParam] = idStyle === 'margin' ? plate.id : '';
    }
    return {
      id: plate.id,
      size: out.size,
      svg: out.svg,
      fileName,
      parameters: next,
    };
  });
}

/**
 * The plate's heights from its underside, as the tile computes them: the
 * base, then each level's top.
 *
 * @param {Object} parameters - The state's parameters
 * @returns {{ base: number, tops: number[] }}
 */
export function levelHeights(parameters = {}) {
  const base = num(parameters.base_thickness_mm, TILE_DEFAULTS.base);
  const step = num(parameters.level_step_mm, TILE_DEFAULTS.step);
  const symbolStep = num(parameters.symbol_step_mm, TILE_DEFAULTS.symbolStep);
  const levels = Math.max(
    1,
    Math.min(3, Math.round(num(parameters.levels_used, TILE_DEFAULTS.levels)))
  );
  const baseEff =
    parameters.print_style === 'All printed'
      ? Math.max(base, TILE_DEFAULTS.minWall)
      : base;
  const z1 = baseEff + step;
  const z2 = z1 + symbolStep;
  const z3 = z2 + step;
  return { base: baseEff, tops: [z1, z2, z3].slice(0, levels) };
}

/**
 * The README that travels with the plates.
 *
 * @param {Object} input
 * @param {string} input.mapName
 * @param {string} input.bedName
 * @param {{ plateW: number, plateH: number, plates: Array<{id: string}> }} input.layout
 * @param {{ w: number, h: number }} input.size - The whole map
 * @param {{ base: number, tops: number[] }} input.heights
 * @param {number} input.tapeWidthMm
 * @returns {string}
 */
export function readmeText({
  mapName,
  bedName,
  layout,
  size,
  heights,
  tapeWidthMm,
}) {
  const n = layout.plates.length;
  const ids = layout.plates.map((plate) => plate.id).join(', ');
  return (
    `${mapName}: ${n} ${n === 1 ? 'plate' : 'plates'} for a ${bedName} bed, ` +
    `each ${layout.plateW} x ${layout.plateH} mm. ` +
    `Print one of each: ${ids}. ` +
    'Lay them out as the grid reads, row A at the top, column 1 at the left, ' +
    `and glue them edge to edge onto a backing board of ${size.w} x ${size.h} mm. ` +
    `Levels, measured from the underside: base ${mm(heights.base)} mm, ` +
    `then ${heights.tops.map(mm).join(', ')} mm. ` +
    `Label channels take ${tapeWidthMm} mm tape.\n`
  );
}

/**
 * The archive's entries: a mesh per rendered plate, the plan, a levels file
 * per plate of the layout (rendered or not), and the README.
 *
 * @param {Object} input
 * @param {string} input.stem - The project's file name stem
 * @param {string} input.extension - '.stl' or '.3mf', with the dot
 * @param {Array<{id: string, bytes: ArrayBuffer|Uint8Array}>} input.rendered
 * @param {Array<{id: string, svg: string}>} input.sets - Every plate's set
 * @param {Object} input.plan
 * @param {string} input.readme
 * @returns {Array<{name: string, data: string|ArrayBuffer|Uint8Array}>}
 */
export function archiveEntries({
  stem,
  extension,
  rendered,
  sets,
  plan,
  readme,
}) {
  const entries = rendered.map((plate) => ({
    name: `${stem}_${plate.id}${extension}`,
    data: plate.bytes,
  }));
  entries.push({ name: 'map_plan.json', data: JSON.stringify(plan, null, 2) });
  for (const set of sets) {
    entries.push({ name: `levels_${set.id}.svg`, data: set.svg });
  }
  entries.push({ name: 'README.txt', data: readme });
  return entries;
}
