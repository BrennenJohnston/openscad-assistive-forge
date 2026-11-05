/**
 * The map paper: the print layer of a plate, drawn flat for a sighted eye.
 *
 * The raised map says nothing to an eye: the levels file is black shapes,
 * and the braille is on tape not yet made. The paper draws the same plate
 * in the editor's colors with every name in print at its thing, the
 * channels with the text their tape will carry, the title where the raised
 * one stands and the plate's name, so a person can check the map under the
 * 3D preview before printing it, and a sighted helper can read it beside a
 * reader. It is the print layer of a tactile map (Gardiner and Perkins
 * 2003; BANA 2022 8.5.1), never printed raised.
 *
 * The paper is an SVG in millimeters, the plate's size, so the preview's
 * overlay lays it on the plate at scale. Every color is a design token's
 * value read when the paper is built, never a color of this file's own.
 *
 * No DOM here: the panel reads the tokens and hands them in.
 *
 * @license GPL-3.0-or-later
 */

import { ringsToPathData } from '../ring-geometry.js';
import { featureNames } from './feature-names.js';

/** The capitals' height of a name on the paper (mm). */
export const PAPER_LETTER_MM = 3.5;
/** Liberation Sans' capital stands about 0.72 of the font size. */
const CAP_OF_SIZE = 0.72;
/** The title's capitals: the raised title's 16 mm, where the raised one stands. */
const TITLE_LETTER_MM = 16;
/** Letters keep 9.525 mm (3/8 in) from the edge, as the raised ones do. */
const EDGE_CLEARANCE_MM = 9.525;
/** The widest a letter runs, as a share of the font size, for fitting. */
const LETTER_ADVANCE = 0.6;
const CHANNEL_END_MM = 2;

/** The tokens each paper color comes from. */
export const PAPER_TOKENS = Object.freeze({
  ground: '--color-bg-primary',
  ink: '--color-text-primary',
  faint: '--color-text-muted',
  base: '--drawing-editor-base-tint',
  level1: '--drawing-editor-level-1',
  level2: '--drawing-editor-level-2',
  level3: '--drawing-editor-level-3',
  channel: '--color-accent',
  font: 'font-family',
});

/**
 * The paper's colors, each read from its token.
 *
 * @param {(name: string) => string} read - A token's computed value
 * @returns {Record<keyof typeof PAPER_TOKENS, string>}
 */
export function paperColors(read) {
  const colors = {};
  for (const [key, token] of Object.entries(PAPER_TOKENS)) {
    const value = String(read(token) || '').trim();
    colors[key] = value || (key === 'font' ? 'sans-serif' : 'currentColor');
  }
  return colors;
}

function say(v) {
  return String(Math.round(v * 1000) / 1000);
}

function escapeXml(text) {
  return String(text).replace(/[&<>"']|[^\x20-\x7e]/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&apos;';
      default:
        return `&#${ch.codePointAt(0)};`;
    }
  });
}

function polygonCenter(ring) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const [px, py] = ring[i];
    const [qx, qy] = ring[(i + 1) % n];
    const cross = px * qy - qx * py;
    a += cross;
    cx += (px + qx) * cross;
    cy += (py + qy) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    return [
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
    ];
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}

function polylineMiddle(points) {
  let total = 0;
  const runs = [];
  for (let i = 1; i < points.length; i += 1) {
    const d = Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1]
    );
    runs.push(d);
    total += d;
  }
  if (!runs.length) return points[0] ? [...points[0]] : null;
  let left = total / 2;
  for (let i = 0; i < runs.length; i += 1) {
    if (left <= runs[i] || i === runs.length - 1) {
      const t = runs[i] ? left / runs[i] : 0;
      const a = points[i];
      const b = points[i + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= runs[i];
  }
  return null;
}

function placeOf(f) {
  if (f.kind === 'point' && Array.isArray(f.at)) return [...f.at];
  if (f.kind === 'area' && Array.isArray(f.ring) && f.ring.length)
    return polygonCenter(f.ring);
  if (f.kind === 'line' && Array.isArray(f.points) && f.points.length)
    return polylineMiddle(f.points);
  return null;
}

/**
 * The names to print: every feature that is on and carries a name of its
 * own, said as the editor says it, at the thing (an area at its centroid,
 * a line at its middle, a point at its place).
 *
 * @param {object} plan
 * @returns {Array<{featureId: string, text: string, at: number[], kind: string}>}
 */
export function paperTexts(plan) {
  const list = plan.features || [];
  const names = featureNames(list);
  const out = [];
  list.forEach((f, i) => {
    if (f.on === false || !f.name) return;
    const at = placeOf(f);
    if (!at) return;
    out.push({ featureId: f.id, text: names[i], at, kind: f.kind });
  });
  return out;
}

/**
 * The texts that fall on a plate, moved to the plate's corner.
 *
 * @param {Array<{at: number[]}>} items
 * @param {{x: number, y: number, w: number, h: number}} plate
 */
export function shiftTexts(items, plate) {
  const out = [];
  for (const item of items) {
    const [x, y] = item.at;
    if (x < plate.x || x >= plate.x + plate.w) continue;
    if (y < plate.y || y >= plate.y + plate.h) continue;
    out.push({ ...item, at: [x - plate.x, y - plate.y] });
  }
  return out;
}

/**
 * The texts moved by an offset: the face's into the sheet's frame.
 *
 * @param {Array<{at: number[]}>} items
 * @param {[number, number]} offset
 */
export function moveTexts(items, [dx, dy]) {
  return items.map((item) => ({
    ...item,
    at: [item.at[0] + dx, item.at[1] + dy],
  }));
}

/**
 * The channels to draw, each with the text its tape will carry.
 *
 * @param {Array<object>} features
 * @param {number} across - The channel's width (mm)
 * @param {(f: object, index: number) => string} textFor
 * @returns {Array<{at: number[], length: number, across: number, vertical: boolean, text: string}>}
 */
export function paperChannels(features, across, textFor) {
  const out = [];
  let index = 0;
  for (const f of features || []) {
    if (f.kind !== 'channel' || f.on === false || !Array.isArray(f.at))
      continue;
    out.push({
      at: [...f.at],
      length: Number(f.length) || 0,
      across,
      vertical: Boolean(f.vertical),
      text: textFor(f, index) || '',
    });
    index += 1;
  }
  return out;
}

/**
 * The raised words of a plate as the model draws them: rows of
 * `x:y:h:z:TEXT` in tenths of a millimeter from the plate's bottom left,
 * the capital's height in the row (the title's lines, a key plate's words).
 *
 * @param {string} print
 * @param {number} letterMm - The capitals' height when a row names none
 * @param {number} plateH
 * @returns {Array<{x: number, y: number, h: number, text: string}>}
 */
export function paperWords(print, letterMm, plateH) {
  const out = [];
  for (const row of String(print || '').split('|')) {
    const m = /^(\d+):(\d+):(\d+):(\d+):(.*)$/.exec(row);
    if (!m) continue;
    out.push({
      x: Number(m[1]) / 10,
      y: plateH - Number(m[2]) / 10,
      h: Number(m[3]) / 10 || letterMm,
      text: m[5],
    });
  }
  return out;
}

/**
 * The paper of one plate, or of the whole map.
 *
 * @param {object} input
 * @param {Record<string, Array<Array<{x: number, y: number}>>>} input.rings - The plate's rings by level
 * @param {{w: number, h: number}} input.size
 * @param {Array<{text: string, at: number[]}>} [input.texts]
 * @param {ReturnType<typeof paperChannels>} [input.channels]
 * @param {ReturnType<typeof paperWords>} [input.words]
 * @param {string} [input.title]
 * @param {string} [input.plateId]
 * @param {ReturnType<typeof paperColors>} input.colors
 * @returns {string} SVG
 */
export function mapPaperSvg({
  rings,
  size,
  texts = [],
  channels = [],
  words = [],
  title = '',
  plateId = '',
  colors,
}) {
  const c = colors || paperColors(() => '');
  const { w, h } = size;
  const fontSize = PAPER_LETTER_MM / CAP_OF_SIZE;
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" font-family="${escapeXml(c.font)}">`
  );
  parts.push(
    `<rect x="0" y="0" width="${w}" height="${h}" fill="${c.ground}"/>`
  );
  for (const [key, fill] of [
    ['level1', c.level1],
    ['level2', c.level2],
    ['level3', c.level3],
    ['here', c.ink],
  ]) {
    const list = rings?.[key] || [];
    const body = list.length ? `<path d="${ringsToPathData(list, 3)}"/>` : '';
    parts.push(`<g id="paper-${key}" fill="${fill}">${body}</g>`);
  }
  const channelParts = [];
  for (const ch of channels) {
    const [cx, cy] = ch.at;
    const rw = ch.vertical ? ch.across : ch.length;
    const rh = ch.vertical ? ch.length : ch.across;
    channelParts.push(
      `<rect x="${say(cx - rw / 2)}" y="${say(cy - rh / 2)}" width="${say(rw)}" height="${say(rh)}" fill="${c.ground}" stroke="${c.channel}" stroke-width="0.4"/>`
    );
    if (ch.text) {
      const room = Math.max(1, ch.length - 2 * CHANNEL_END_MM);
      const fit = Math.min(fontSize, room / (LETTER_ADVANCE * ch.text.length));
      const turn = ch.vertical
        ? ` transform="rotate(-90 ${say(cx)} ${say(cy)})"`
        : '';
      channelParts.push(
        `<text x="${say(cx)}" y="${say(cy)}" font-size="${say(fit)}" fill="${c.ink}" text-anchor="middle" dominant-baseline="middle"${turn}>${escapeXml(ch.text)}</text>`
      );
    }
  }
  parts.push(`<g id="paper-channels">${channelParts.join('')}</g>`);
  parts.push(
    `<g id="paper-names" font-size="${fontSize}" fill="${c.ink}" stroke="${c.ground}" stroke-width="0.6" paint-order="stroke" text-anchor="middle">` +
      texts
        .map(
          (t) =>
            `<text x="${say(t.at[0])}" y="${say(t.at[1] + PAPER_LETTER_MM / 2)}">${escapeXml(t.text)}</text>`
        )
        .join('') +
      '</g>'
  );
  parts.push(
    `<g id="paper-words" fill="${c.ink}">` +
      words
        .map(
          (r) =>
            `<text x="${say(r.x)}" y="${say(r.y)}" font-size="${say(r.h / CAP_OF_SIZE)}">${escapeXml(r.text)}</text>`
        )
        .join('') +
      '</g>'
  );
  if (title) {
    parts.push(
      `<g id="paper-title" fill="${c.ink}"><text x="${say(EDGE_CLEARANCE_MM)}" y="${say(EDGE_CLEARANCE_MM + TITLE_LETTER_MM)}" font-size="${say(TITLE_LETTER_MM / CAP_OF_SIZE)}">${escapeXml(String(title).toUpperCase())}</text></g>`
    );
  }
  if (plateId) {
    parts.push(
      `<g id="paper-plate" fill="${c.faint}"><text x="${say(EDGE_CLEARANCE_MM)}" y="${say(h - PAPER_LETTER_MM)}" font-size="${fontSize}">${escapeXml(plateId)}</text></g>`
    );
  }
  parts.push('</svg>');
  return parts.join('\n') + '\n';
}
