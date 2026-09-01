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
 * DXF group code 70 value meaning "millimeters" for $INSUNITS.
 * https://help.autodesk.com/view/ACD/2024/ENU/?guid=GUID-A68542A9-9A4E-4F55-9C3F-1D4C40D5F5A1
 */
export const INSUNITS_MILLIMETERS = 4;

/**
 * Declare the drawing's units, so a laser cutter does not guess.
 *
 * MEASURED on our own export: OpenSCAD writes correct millimetre COORDINATES
 * but no $INSUNITS and no $MEASUREMENT, so the file says nothing at all about
 * what its numbers mean. Software configured for inches reads 50 as fifty
 * INCHES - a 25.4x error that looks perfectly fine on screen and ruins a sheet
 * of material.
 *
 * The header OpenSCAD writes is $ACADVER = AC1006 (R10), which predates both
 * variables. Permissive readers - which is nearly all laser software - honour
 * them anyway, and a strict one is no worse off than it is today. $ACADVER is
 * deliberately left alone: raising it would claim a format whose entities this
 * file does not otherwise use.
 *
 * @param {string} dxfText
 * @returns {string} The same drawing, saying what unit it is in
 */
export function withMetricUnits(dxfText) {
  if (typeof dxfText !== 'string' || !dxfText.includes('HEADER')) {
    return dxfText;
  }
  if (dxfText.includes('$INSUNITS')) return dxfText;

  // DXF is line-oriented - a group code on one line, its value on the next -
  // so this walks lines rather than pattern-matching across them. The line
  // ending the file already uses is kept; OpenSCAD writes CRLF.
  const crlf = dxfText.includes('\r\n');
  const eol = crlf ? '\r\n' : '\n';
  const lines = dxfText.split(/\r?\n/);

  const block = [
    '  9',
    '$INSUNITS',
    ' 70',
    `     ${INSUNITS_MILLIMETERS}`,
    '  9',
    '$MEASUREMENT',
    ' 70',
    '     1',
  ];

  // Straight after $ACADVER's value, which is the first variable in the header
  // OpenSCAD writes. Failing that, at the top of the header.
  let at = -1;
  for (let i = 0; i < lines.length - 2; i++) {
    if (lines[i].trim() === '$ACADVER') {
      at = i + 3;
      break;
    }
  }
  if (at === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === 'HEADER') {
        at = i + 1;
        break;
      }
    }
  }
  if (at === -1) return dxfText;

  lines.splice(at, 0, ...block);
  return lines.join(eol);
}

/** How many polyline samples each spline knot span gets. */
const SPLINE_SAMPLES_PER_SPAN = 8;

/** How many segments a full ellipse becomes. */
const ELLIPSE_SEGMENTS = 72;

/**
 * D-123 (DP-26 P2): evaluate the curve entities OpenSCAD's importer does
 * not read, BEFORE the engine sees the file.
 *
 * MEASURED on the owner's own Fusion sketch (31 SPLINE, 2 ELLIPSE, 1 LINE):
 * the importer reads none of the curved 33, so 31 of the 34 entities
 * vanished SILENTLY - the editor showed two shapes and said nothing was
 * missing. Every SPLINE is evaluated with the NURBS arithmetic (Cox-de
 * Boor basis, rational when weights arrive) and every ELLIPSE
 * parametrically, and each becomes a chain of LINE entities - the one
 * entity this repo's own known-extents fixture PROVES the engine joins
 * back into closed shapes at coincident endpoints.
 *
 * @param {string} dxfText
 * @returns {{text: string, splines: number, ellipses: number}}
 */
export function evaluateDxfCurves(dxfText) {
  if (typeof dxfText !== 'string' || !dxfText.includes('ENTITIES')) {
    return { text: dxfText, splines: 0, ellipses: 0 };
  }
  const crlf = dxfText.includes('\r\n');
  const eol = crlf ? '\r\n' : '\n';
  const lines = dxfText.split(/\r?\n/);

  const out = [];
  let splines = 0;
  let ellipses = 0;
  let inEntities = false;
  let i = 0;
  while (i < lines.length) {
    const code = lines[i].trim();
    const value = (lines[i + 1] || '').trim();
    if (code === '2' && value === 'ENTITIES') inEntities = true;
    if (code === '0' && value === 'ENDSEC') inEntities = false;

    if (
      inEntities &&
      code === '0' &&
      (value === 'SPLINE' || value === 'ELLIPSE')
    ) {
      // Collect this entity's group codes up to the next entity marker.
      let j = i + 2;
      const groups = [];
      while (j < lines.length && lines[j].trim() !== '0') {
        groups.push([lines[j].trim(), (lines[j + 1] || '').trim()]);
        j += 2;
      }
      const points =
        value === 'SPLINE' ? evaluateSpline(groups) : evaluateEllipse(groups);
      if (points && points.length >= 2) {
        if (value === 'SPLINE') splines += 1;
        else ellipses += 1;
        const layer = groups.find(([g]) => g === '8')?.[1] || '0';
        for (let p = 0; p + 1 < points.length; p++) {
          out.push(
            '0',
            'LINE',
            '8',
            layer,
            '10',
            points[p].x.toFixed(6),
            '20',
            points[p].y.toFixed(6),
            '11',
            points[p + 1].x.toFixed(6),
            '21',
            points[p + 1].y.toFixed(6)
          );
        }
        i = j;
        continue;
      }
      // Unreadable curve: left exactly as it was, for the engine to warn on.
    }
    out.push(lines[i]);
    i += 1;
  }
  return { text: out.join(eol), splines, ellipses };
}

/** Numbers for a repeated group code, in file order. */
function numbersFor(groups, code) {
  return groups
    .filter(([g]) => g === code)
    .map(([, v]) => Number(v))
    .filter((n) => Number.isFinite(n));
}

/**
 * A SPLINE entity's points, by the NURBS arithmetic.
 * @param {Array<[string, string]>} groups
 * @returns {Array<{x: number, y: number}>|null}
 */
function evaluateSpline(groups) {
  const degree = Number(groups.find(([g]) => g === '71')?.[1]) || 3;
  const knots = numbersFor(groups, '40');
  const xs = numbersFor(groups, '10');
  const ys = numbersFor(groups, '20');
  const weights = numbersFor(groups, '41');
  const flags = Number(groups.find(([g]) => g === '70')?.[1]) || 0;
  const closed = (flags & 1) === 1;

  if (xs.length < 2 || xs.length !== ys.length) {
    // Fit points only: a polyline through them keeps the drawing honest.
    const fx = numbersFor(groups, '11');
    const fy = numbersFor(groups, '21');
    if (fx.length >= 2 && fx.length === fy.length) {
      const pts = fx.map((x, k) => ({ x, y: fy[k] }));
      if (closed) pts.push({ ...pts[0] });
      return pts;
    }
    return null;
  }
  const ctrl = xs.map((x, k) => ({ x, y: ys[k] }));
  const n = ctrl.length - 1;
  if (knots.length !== n + degree + 2) return null;
  const w = weights.length === ctrl.length ? weights : ctrl.map(() => 1);

  const uMin = knots[degree];
  const uMax = knots[knots.length - 1 - degree];
  const spans = new Set(knots.filter((k) => k >= uMin && k <= uMax));
  const samples = Math.max(16, (spans.size - 1) * SPLINE_SAMPLES_PER_SPAN);

  const points = [];
  for (let s = 0; s <= samples; s++) {
    const u = uMin + ((uMax - uMin) * s) / samples;
    points.push(nurbsPoint(u, degree, knots, ctrl, w, n));
  }
  if (closed) points.push({ ...points[0] });
  return points;
}

/** One point on a NURBS curve: the Cox-de Boor basis, rational. */
function nurbsPoint(u, degree, knots, ctrl, weights, n) {
  // The span that holds u; the last span is closed at its right edge.
  let span = degree;
  while (span < n && u >= knots[span + 1]) span += 1;

  const basis = new Array(degree + 1).fill(0);
  basis[0] = 1;
  const left = new Array(degree + 1).fill(0);
  const right = new Array(degree + 1).fill(0);
  for (let j = 1; j <= degree; j++) {
    left[j] = u - knots[span + 1 - j];
    right[j] = knots[span + j] - u;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const denom = right[r + 1] + left[j - r];
      const temp = denom === 0 ? 0 : basis[r] / denom;
      basis[r] = saved + right[r + 1] * temp;
      saved = left[j - r] * temp;
    }
    basis[j] = saved;
  }

  let x = 0;
  let y = 0;
  let wSum = 0;
  for (let k = 0; k <= degree; k++) {
    const idx = span - degree + k;
    if (idx < 0 || idx >= ctrl.length) continue;
    const wk = basis[k] * weights[idx];
    x += wk * ctrl[idx].x;
    y += wk * ctrl[idx].y;
    wSum += wk;
  }
  if (wSum === 0) return { x: 0, y: 0 };
  return { x: x / wSum, y: y / wSum };
}

/**
 * An ELLIPSE entity's points, parametrically.
 * @param {Array<[string, string]>} groups
 * @returns {Array<{x: number, y: number}>|null}
 */
function evaluateEllipse(groups) {
  const one = (code, fallback) => {
    const v = Number(groups.find(([g]) => g === code)?.[1]);
    return Number.isFinite(v) ? v : fallback;
  };
  const cx = one('10', null);
  const cy = one('20', null);
  const mx = one('11', null);
  const my = one('21', null);
  const ratio = one('40', null);
  if (cx === null || cy === null || mx === null || my === null || !ratio) {
    return null;
  }
  const start = one('41', 0);
  let end = one('42', Math.PI * 2);
  if (end <= start) end += Math.PI * 2;
  const full = Math.abs(end - start - Math.PI * 2) < 1e-9;
  const segments = Math.max(
    8,
    Math.round((ELLIPSE_SEGMENTS * (end - start)) / (Math.PI * 2))
  );
  // The minor axis is the major rotated a quarter turn, scaled by the ratio.
  const points = [];
  for (let s = 0; s <= segments; s++) {
    const t = start + ((end - start) * s) / segments;
    const c = Math.cos(t);
    const si = Math.sin(t);
    points.push({
      x: cx + c * mx - si * ratio * my,
      y: cy + c * my + si * ratio * mx,
    });
  }
  if (full) points[points.length - 1] = { ...points[0] };
  return points;
}

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

  // D-123: splines and ellipses become line chains the importer reads.
  const curves = evaluateDxfCurves(dxfText);

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
          [mounted, curves.text],
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
  // D-123, the other half: the engine's own WARNING lines used to be
  // swallowed here (core rule 13's exact shape). They ride out for the
  // editor's warnings list, deduplicated - the importer repeats itself
  // per entity.
  const warnings = [
    ...new Set(
      (asText(result?.consoleOutput) || '')
        .split(/\r?\n/)
        .filter((line) => /^WARNING:/i.test(line.trim()))
        .map((line) => line.trim())
    ),
  ];
  return { svg, ms: Date.now() - started, warnings };
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
  return { dxf: withMetricUnits(dxf), ms: Date.now() - started };
}
