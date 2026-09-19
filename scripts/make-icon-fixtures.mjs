#!/usr/bin/env node
/**
 * Draw the icon fixtures the credit-line tests trace.
 *
 * These are stand-ins for a stock icon: a drawing with a printed attribution
 * along its bottom edge. They are drawn here, in code, rather than downloaded,
 * because no stock icon belongs in this repository - not in a test, not in a
 * fixture, not in a commit. What they copy from the real ones is only the
 * SHAPE of the problem, measured across nine of them: a caption of forty-odd
 * letter-sized marks lying in a strip about 7% of the picture's height, along
 * the bottom, under a drawing that is itself only a handful of shapes.
 *
 * Two drawings, because the two failures are different:
 *
 *   outline-ring.png   an outline, which traces to a shape and its counter.
 *                      The question is whether the counter survives.
 *   filled-face.png    a filled shape with three counters. The question is
 *                      whether they stay holes rather than becoming marks.
 *
 * A photo-like picture is built inside the test that needs one and never
 * stored: a noise field that heavy has no business in a repository either.
 *
 *   node scripts/make-icon-fixtures.mjs
 *
 * @license GPL-3.0-or-later
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests', 'fixtures', 'icons');

const SIZE = 700;
const INK = 0;
const PAPER = 255;

/** A blank page. */
function page() {
  const png = new PNG({ width: SIZE, height: SIZE });
  png.data.fill(PAPER);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  return png;
}

const put = (png, x, y, v) => {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  png.data[i] = png.data[i + 1] = png.data[i + 2] = v;
};

/** Filled disc, or a ring when `inner` is given. */
function disc(png, cx, cy, radius, { inner = 0, value = INK } = {}) {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= radius && d >= inner) put(png, Math.round(x), Math.round(y), value);
    }
  }
}

function rect(png, x, y, w, h, value = INK) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(png, i, j, value);
}

/** A rounded slot, for a mouth that is not a rectangle. */
function slot(png, cx, cy, halfWidth, radius, value = INK) {
  rect(png, cx - halfWidth, cy - radius, halfWidth * 2, radius * 2, value);
  disc(png, cx - halfWidth, cy, radius, { value });
  disc(png, cx + halfWidth, cy, radius, { value });
}

/**
 * A line of letter-sized marks: the credit line.
 *
 * Some marks carry a counter, because a real caption is full of o's and a's
 * and a letter with a hole inside it is two closed shapes, not one. A filter
 * that takes the outside of an "o" and leaves the inside would be a defect
 * nobody would think to look for.
 */
function captionLine(png, y, count, { size = 18, gap = 8, holeEvery = 4 } = {}) {
  const width = count * size + (count - 1) * gap;
  let x = Math.round((SIZE - width) / 2);
  for (let i = 0; i < count; i++) {
    rect(png, x, y, size, size);
    if (i % holeEvery === 0) {
      rect(png, x + 5, y + 5, size - 10, size - 10, PAPER);
    }
    x += size + gap;
  }
}

/** Both drawings carry the same two-line attribution. */
function addCaption(png) {
  captionLine(png, 600, 20);
  captionLine(png, 632, 16);
}

function write(name, png) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, PNG.sync.write(png));
  const bytes = fs.statSync(file).size;
  console.log(`${path.relative(ROOT, file)}  ${SIZE}x${SIZE}, ${bytes} bytes`);
}

// ── outline-ring: an outline and its counter, under a caption ───────────────
const ring = page();
disc(ring, 350, 290, 180, { inner: 150 });
addCaption(ring);
write('outline-ring.png', ring);

// ── filled-face: a filled shape with three counters, under a caption ────────
const face = page();
disc(face, 350, 290, 180);
disc(face, 290, 240, 26, { value: PAPER });
disc(face, 410, 240, 26, { value: PAPER });
slot(face, 350, 360, 55, 16, PAPER);
addCaption(face);
write('filled-face.png', face);

console.log('\nBoth drawn here, neither downloaded.');
