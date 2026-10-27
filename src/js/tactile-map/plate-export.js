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
import { ringsToPathData } from '../ring-geometry.js';
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
 * Which of the map's trimmings a plate carries, so each appears once on a
 * split map: the title on the top-left plate; the north arrow on the
 * top-right plate; a north line on every plate of the top row, since it
 * runs along the whole north edge; no cue when the cue is None. A one-plate
 * map carries both.
 *
 * @param {{ row: number, col: number }} plate - From planPlates
 * @param {{ cols: number }} layout - From planPlates
 * @param {string} northCue - 'Arrow with N', 'North line' or 'None'
 * @returns {{ title: boolean, north: boolean }}
 */
export function plateRoles(plate, layout, northCue) {
  const top = plate.row === 0;
  let north = false;
  if (northCue === 'North line') north = top;
  else if (northCue !== 'None') north = top && plate.col === layout.cols - 1;
  return { title: top && plate.col === 0, north };
}

/**
 * The parameter set each plate renders with: the state's parameters, with
 * the plate's size, its id (under the margin style), whether it draws the
 * title and the north cue, and its levels file as a file value, the same
 * values the plate radio writes.
 *
 * @param {Object} input
 * @param {Object} input.rings - buildLevelRings(...).rings
 * @param {{ cols: number, plates: Array<{id: string, row: number, col: number}> }} input.layout - From planPlates
 * @param {string} input.idStyle - 'none', 'margin' or 'notches'
 * @param {string} input.northCue - The tile's north_cue value
 * @param {{ mapFileParam: string, widthParam: string, heightParam: string, plateIdParam?: string, plateShowsTitleParam?: string, plateShowsNorthParam?: string }} input.config
 * @param {Object} input.parameters - The state's parameters
 * @returns {Array<{id: string, size: {w: number, h: number}, svg: string, fileName: string, parameters: Object, roles: {title: boolean, north: boolean}}>}
 */
export function plateParameterSets({
  rings,
  layout,
  idStyle,
  northCue,
  config,
  parameters,
}) {
  return layout.plates.map((plate) => {
    const out = plateLevelsSvg(rings, plate, { id: idStyle });
    const roles = plateRoles(plate, layout, northCue);
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
    if (config.plateShowsTitleParam) {
      next[config.plateShowsTitleParam] = roles.title ? 'yes' : 'no';
    }
    if (config.plateShowsNorthParam) {
      next[config.plateShowsNorthParam] = roles.north ? 'yes' : 'no';
    }
    return {
      id: plate.id,
      size: out.size,
      svg: out.svg,
      fileName,
      parameters: next,
      roles,
    };
  });
}

const GRID_FILLS = { level1: '#cfcfcf', level2: '#8f8f8f', level3: '#3a3a3a' };
const GRID_RED = '#c81e1e';
const GRID_BLUE = '#1b6ac9';
const GRID_FONT = 'Liberation Sans, Arial, sans-serif';

const escapeXml = (text) =>
  String(text).replace(
    /[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]
  );

/**
 * The picture of the plate grid that travels in the zip: the whole map in
 * grays by level, the channels dashed in blue, each plate's rectangle in
 * red with its name, and a caption naming the bed and the layout.
 *
 * @param {Object} input
 * @param {Object} input.rings - buildLevelRings(...).rings
 * @param {{ rows: number, cols: number, plateW: number, plateH: number, plates: Array<{id: string, x: number, y: number, w: number, h: number}> }} input.layout
 * @param {{ w: number, h: number }} input.size - The whole map
 * @param {string} input.bedName
 * @returns {string} SVG text
 */
export function plateGridSvg({ rings, layout, size, bedName }) {
  const { w, h } = size;
  let body = '';
  for (const level of ['level1', 'level2', 'level3']) {
    const list = rings[level] || [];
    if (list.length) {
      body += `<path d="${ringsToPathData(list, 3)}" fill="${GRID_FILLS[level]}" fill-rule="nonzero"/>`;
    }
  }
  const channels = rings.channels || [];
  if (channels.length) {
    body += `<path d="${ringsToPathData(channels, 3)}" fill="none" stroke="${GRID_BLUE}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  }
  for (const p of layout.plates) {
    body += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="none" stroke="${GRID_RED}" stroke-width="2"/>`;
    body += `<text x="${p.x + 8}" y="${p.y + 26}" font-family="${GRID_FONT}" font-size="22" font-weight="700" fill="${GRID_RED}">${p.id}</text>`;
  }
  const caption = `${bedName}: ${layout.rows} x ${layout.cols} plates of ${layout.plateW} x ${layout.plateH} mm`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 40}" height="${h + 70}" viewBox="-20 -20 ${w + 40} ${h + 70}">` +
    `<rect x="-20" y="-20" width="${w + 40}" height="${h + 70}" fill="#ffffff"/>` +
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#f4f1ea" stroke="#777777" stroke-width="1"/>` +
    body +
    `<text x="0" y="${h + 36}" font-family="${GRID_FONT}" font-size="18" fill="#222222">${escapeXml(caption)}</text>` +
    '</svg>\n'
  );
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
    `Label channels take ${tapeWidthMm} mm tape. ` +
    'The picture plate_grid.svg shows the layout.\n'
  );
}

/**
 * The archive's entries: a mesh per rendered plate, the plan, a levels file
 * per plate of the layout (rendered or not), the plate grid picture and
 * the README.
 *
 * @param {Object} input
 * @param {string} input.stem - The project's file name stem
 * @param {string} input.extension - '.stl' or '.3mf', with the dot
 * @param {Array<{id: string, bytes: ArrayBuffer|Uint8Array}>} input.rendered
 * @param {Array<{id: string, svg: string}>} input.sets - Every plate's set
 * @param {Object} input.plan
 * @param {string} input.readme
 * @param {string} input.grid - plateGridSvg(...)
 * @returns {Array<{name: string, data: string|ArrayBuffer|Uint8Array}>}
 */
export function archiveEntries({
  stem,
  extension,
  rendered,
  sets,
  plan,
  readme,
  grid,
}) {
  const entries = rendered.map((plate) => ({
    name: `${stem}_${plate.id}${extension}`,
    data: plate.bytes,
  }));
  entries.push({ name: 'map_plan.json', data: JSON.stringify(plan, null, 2) });
  for (const set of sets) {
    entries.push({ name: `levels_${set.id}.svg`, data: set.svg });
  }
  entries.push({ name: 'plate_grid.svg', data: grid });
  entries.push({ name: 'README.txt', data: readme });
  return entries;
}
