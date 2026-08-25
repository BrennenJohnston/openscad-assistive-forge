/**
 * DXF in, DXF out, with the engine as the converter.
 *
 * The partner pipelines this round exists to meet emit DXF as well as SVG, and
 * DXF is what a laser cutter's software usually wants back. Forge already ships
 * an OpenSCAD engine that reads DXF and writes it, so no parser is needed here:
 * a one-line wrapper (`import("drawing.dxf");`) rendered to SVG is the way in,
 * and the edited SVG rendered to DXF is the way out.
 *
 * MEASURED at bird scale through the real engine: a DXF import rendered to SVG
 * in 301 ms, and a 2D drawing exported to DXF in 334 ms. The five-minute figure
 * in the ledger (AF-7) is whole-model 3D PROJECTION, which is a different
 * operation entirely; the two must not be confused.
 *
 * WHAT OPENSCAD'S DXF IMPORT DOES NOT READ. Its importer handles 2D geometry
 * entities. Text, dimensions, and other annotation entities are outside that
 * subset and simply do not arrive - so a file made only of those imports as
 * nothing, and this module says so rather than handing back an empty drawing.
 *
 * @license GPL-3.0-or-later
 */

/** The wrapper's own name inside the scratch project. */
export const WRAPPER_MAIN = 'main.scad';

/** Name the edited drawing is mounted under when converting back to DXF. */
export const EDITED_SVG_NAME = 'edited.svg';

/** Generous, because a cold engine has to start before it can convert. */
export const CONVERT_TIMEOUT_MS = 120000;

/**
 * The one-line project that imports a drawing so the engine can re-emit it.
 * @param {string} fileName - Name the drawing is mounted under
 * @returns {string}
 */
export function importWrapper(fileName) {
  // The quoting goes through JSON.stringify rather than being written inline.
  // `scripts/import-check.js` scans source text for the `import("...")` shape
  // and would read this OpenSCAD statement as a JavaScript dynamic import it
  // could not resolve.
  return `import(${JSON.stringify(fileName)});\n`;
}

/**
 * A file name safe to mount in the worker's filesystem, keeping the extension.
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
export function mountName(name, fallback) {
  const base = String(name || '')
    .split(/[\\/]/)
    .pop()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+/, '');
  return base && /\.[a-z0-9]+$/i.test(base) ? base : fallback;
}

/**
 * Read a DXF's declared extents, in millimetres.
 *
 * DXF header pairs are a group code on one line and its value on the next, so
 * `$EXTMIN` is followed by `10`/x then `20`/y. This is the same thing the
 * golden-SVG procedure checks by hand, and it is what makes "the drawing came
 * back the same size" an assertion rather than an impression.
 *
 * @param {string} dxfText
 * @returns {{min: [number, number], max: [number, number]}|null}
 */
export function parseDxfExtents(dxfText) {
  const lines = String(dxfText || '')
    .split(/\r?\n/)
    .map((line) => line.trim());

  const read = (marker) => {
    const at = lines.indexOf(marker);
    if (at === -1) return null;
    let x = null;
    let y = null;
    for (let i = at + 1; i < Math.min(at + 8, lines.length); i += 2) {
      const code = lines[i];
      const value = Number(lines[i + 1]);
      if (!Number.isFinite(value)) break;
      if (code === '10') x = value;
      if (code === '20') y = value;
      if (x !== null && y !== null) break;
    }
    return x === null || y === null ? null : [x, y];
  };

  const min = read('$EXTMIN');
  const max = read('$EXTMAX');
  return min && max ? { min, max } : null;
}

/**
 * Width and height in millimetres, from a DXF's extents.
 * @param {string} dxfText
 * @returns {{width: number, height: number}|null}
 */
export function dxfSize(dxfText) {
  const extents = parseDxfExtents(dxfText);
  if (!extents) return null;
  return {
    width: extents.max[0] - extents.min[0],
    height: extents.max[1] - extents.min[1],
  };
}

/**
 * Whether a render result carries anything at all.
 * @param {*} data
 * @returns {string}
 */
function asText(data) {
  if (typeof data === 'string') return data;
  if (!data) return '';
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (data.buffer) return new TextDecoder().decode(data);
  return String(data);
}

/**
 * Turn an engine failure into a sentence about the file, not about OpenSCAD.
 *
 * The engine's own message for "the import produced nothing" is about
 * projection() and 3D geometry, which is true of a model and meaningless to
 * someone who just chose a drawing.
 *
 * @param {Error} error
 * @param {string} fileName
 * @returns {Error}
 */
export function translateConversionError(error, fileName) {
  const raw = String(error?.message || error || '');
  if (/2D output|projection\(\)|3D geometry/i.test(raw)) {
    return emptyImportError(fileName);
  }
  return new Error(`Forge could not read ${fileName}: ${raw}`);
}

/**
 * The message for a DXF that imported as nothing at all.
 *
 * This is the same outcome whether the engine complained or simply returned an
 * empty drawing, and the cause is nearly always the same: the file's content is
 * outside what OpenSCAD's DXF importer reads.
 *
 * @param {string} fileName
 * @returns {Error}
 */
export function emptyImportError(fileName) {
  return new Error(
    `Forge could not find any shapes in ${fileName}. OpenSCAD reads the ` +
      `drawing entities in a DXF, not text or dimension entities, so a file ` +
      `made only of those arrives empty. Export the drawing again with its ` +
      `outlines as geometry, or send an SVG instead.`
  );
}

/**
 * The message for an edited drawing that has nothing left in it. A different
 * cause from emptyImportError, and it deserves a different sentence: the file
 * was fine, the choices emptied it.
 *
 * @returns {Error}
 */
export function emptyDrawingError() {
  return new Error(
    'There is nothing in the drawing to save. At least one shape has to be ' +
      'set to Foreground.'
  );
}

/**
 * Convert a DXF into the SVG the drawing editor works on.
 *
 * @param {Object} input
 * @param {string} input.dxfText
 * @param {string} input.fileName - The person's own file name, for messages
 * @param {Function} input.render - (scad, params, options) => Promise<result>
 * @returns {Promise<{svg: string, ms: number}>}
 */
export async function dxfToSvg({ dxfText, fileName, render }) {
  const mounted = mountName(fileName, 'drawing.dxf');
  const wrapper = importWrapper(mounted);
  const started = Date.now();

  let result;
  try {
    result = await render(
      wrapper,
      {},
      {
        outputFormat: 'svg',
        timeoutMs: CONVERT_TIMEOUT_MS,
        // Both files, and the wrapper named as the main one: the engine
        // resolves `import("drawing.dxf")` relative to the main file's own
        // directory, so a wrapper living anywhere else cannot find it.
        files: new Map([
          [WRAPPER_MAIN, wrapper],
          [mounted, dxfText],
        ]),
        mainFile: WRAPPER_MAIN,
      }
    );
  } catch (error) {
    throw translateConversionError(error, fileName);
  }

  const svg = asText(result?.data);
  if (!svg || !svg.includes('<svg')) {
    throw emptyImportError(fileName);
  }
  return { svg, ms: Date.now() - started };
}

/**
 * Convert an edited SVG back into DXF.
 *
 * @param {Object} input
 * @param {string} input.svgText
 * @param {string} input.fileName - For messages
 * @param {Function} input.render
 * @returns {Promise<{dxf: string, ms: number}>}
 */
export async function svgToDxf({ svgText, fileName, render }) {
  const wrapper = importWrapper(EDITED_SVG_NAME);
  const started = Date.now();

  let result;
  try {
    result = await render(
      wrapper,
      {},
      {
        outputFormat: 'dxf',
        timeoutMs: CONVERT_TIMEOUT_MS,
        files: new Map([
          [WRAPPER_MAIN, wrapper],
          [EDITED_SVG_NAME, svgText],
        ]),
        mainFile: WRAPPER_MAIN,
      }
    );
  } catch (error) {
    throw translateConversionError(error, fileName);
  }

  const dxf = asText(result?.data);
  if (!dxf || !dxf.includes('SECTION')) {
    throw emptyDrawingError();
  }
  return { dxf, ms: Date.now() - started };
}
