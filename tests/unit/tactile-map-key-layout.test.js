/**
 * The key's layout: a piece for each row, so a row prints on its own and
 * can be kept for another map. A row reads left to right: the place's number
 * in the form the Labels switch chose (a braille wedge, a channel for its
 * braille on tape, a raised numeral) or the kind's sample, then the name in
 * the same form; a long name goes on in lines below.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { keyFor, labelCells } from '../../src/js/tactile-map/map-key.js';
import { channelLengthMm } from '../../src/js/tactile-map/map-labels.js';
import {
  estimateBraille,
  keyLabel,
  keyPieces,
  KEY_CLEARANCE_MM,
  wrapPrint,
} from '../../src/js/tactile-map/key-layout.js';
import { brailleCells } from '../../src/js/tactile-map/identifiers.js';
import { emptyPlan } from '../../src/js/tactile-map/plan.js';

function plan() {
  const p = emptyPlan(480, 360);
  const pt = (id, cls, at, extra = {}) => ({
    id,
    class: cls,
    kind: 'point',
    at,
    on: true,
    ...extra,
  });
  p.features.push(
    {
      id: 'w',
      class: 'walkway',
      kind: 'line',
      points: [
        [10, 10],
        [100, 10],
      ],
      on: true,
    },
    pt('door', 'entrance', [200, 170]),
    pt('cafe', 'landmark', [250, 170], {
      name: 'Plaza Cafe',
      what: 'Restaurant',
    }),
    pt('clinic', 'landmark', [300, 200], {
      name: 'University of Washington Medical Center - Montlake',
      what: 'Clinic',
    }),
    pt('you-are-here', 'you-are-here', [240, 180], { name: 'You are here' })
  );
  return p;
}

/** The raised words of a page: x, the baseline from the top, the capital, the stand, the text. */
const wordsOf = (page) =>
  page.print
    ? page.print.split('|').map((r) => {
        const [x, y, h, z, ...rest] = r.split(':');
        return {
          x: Number(x) / 10,
          baseline: page.size.h - Number(y) / 10,
          h: Number(h) / 10,
          z: Number(z) / 10,
          text: rest.join(':'),
        };
      })
    : [];

const channelsOf = (page) =>
  page.plan.features.filter((f) => f.kind === 'channel');

const samplesOf = (page) =>
  page.plan.features.filter((f) => f.id.startsWith('key-sample-'));

describe('wrapPrint', () => {
  it('breaks a word wider than the line only when it is wider than the room a lone word may take', () => {
    // NORTHEAST in 16 mm capitals is 173.6 mm: past a 172 mm line, within 174.5.
    expect(wrapPrint('FERRY PLACE NORTHEAST', 172, 16)).toEqual([
      'FERRY',
      'PLACE',
      'NORTHEAS',
      'T',
    ]);
    expect(wrapPrint('FERRY PLACE NORTHEAST', 172, 16, 174.5)).toEqual([
      'FERRY',
      'PLACE',
      'NORTHEAST',
    ]);
  });
});

describe('keyLabel', () => {
  it('names a key plate as the plate list does', () => {
    expect(keyLabel('key')).toBe('Key');
    expect(keyLabel('key-2')).toBe('Key 2');
  });
});

describe('keyPieces', () => {
  /** A stand-in for the translator: a cell a letter, a blank cell a space. */
  const braille = (text) => estimateBraille(text);
  const pieces = (style, extra = {}) =>
    keyPieces(keyFor(plan()), {
      title: 'Station',
      style,
      braille,
      ...extra,
    });
  const rowsOf = (text) =>
    text
      ? text.split('|').map((r) => {
          const [x, y, ...rest] = r.split(':');
          return { x: Number(x) / 10, y: Number(y) / 10, rest };
        })
      : [];

  it('lays the key out a row a piece: the title, the kinds, then the numbered places, each its own piece', () => {
    const key = keyFor(plan());
    const all = pieces('wedge');
    expect(all).toHaveLength(1 + key.entries.length + key.numbers.length);
    expect(all.map((p) => p.id)).toEqual(all.map((_, i) => `key-${i + 1}`));
    expect(all[0].name).toBe('Key: Station');
    expect(all.slice(-2).map((p) => p.name)).toEqual(
      key.numbers.map((n) => `${n.number} ${n.name}`)
    );
    // Each piece is as small as its row, and never under the model's floor.
    for (const p of all) {
      expect(p.size.w).toBeGreaterThanOrEqual(20);
      expect(p.size.h).toBeGreaterThanOrEqual(20);
      expect(p.size.h).toBeLessThan(75);
    }
  });

  it("with braille wedges: the number's wedge at the left, the name on wedges in contracted braille to its right, both on one reading line", () => {
    const key = keyFor(plan());
    const last = pieces('wedge').at(-1);
    const n = key.numbers.at(-1);
    const [number] = rowsOf(last.wedges);
    expect(number.rest).toEqual([String(n.number)]);
    const words = rowsOf(last.brailleWedges);
    expect(words.length).toBeGreaterThan(0);
    // The first line of the name stands on the number's reading line.
    expect(words[0].y).toBeCloseTo(number.y, 6);
    expect(words[0].x).toBeGreaterThan(number.x);
    const bits = words.flatMap((w) => w.rest[0].split('.').map(Number));
    const cells = brailleCells(braille(n.name.toLowerCase()));
    const want = cells.map((dots) =>
      dots.reduce((b, d) => b | (1 << (d - 1)), 0)
    );
    // The name's cells in order; a line breaks at a space, which stays out
    // of the wedges.
    const dots = (list) => list.filter((b) => b !== 0);
    expect(dots(bits)).toEqual(dots(want));
    expect(last.print).toBe('');
    expect(last.tape).toEqual([]);
    expect(last.marks.map((m) => Boolean(m.number))).toEqual([
      true,
      ...words.map(() => false),
    ]);
  });

  it('with label tape: a channel for the braille number, then the name on tape to its right, 9.525 mm apart, the texts in that order', () => {
    const key = keyFor(plan());
    const last = pieces('tape').at(-1);
    const n = key.numbers.at(-1);
    const channels = channelsOf(last);
    expect(last.tape[0]).toBe(`#${n.number}`);
    expect(last.tape.slice(1).join(' ')).toBe(n.name.toLowerCase());
    const [num, name] = channels;
    expect(num.length).toBeCloseTo(channelLengthMm(2), 6);
    expect(name.at[1]).toBeCloseTo(num.at[1], 6);
    expect(
      name.at[0] - name.length / 2 - (num.at[0] + num.length / 2)
    ).toBeCloseTo(KEY_CLEARANCE_MM, 6);
    expect(last.wedges).toBe('');
    expect(last.brailleWedges).toBe('');
    expect(last.svg).toMatch(/<g id="channels"><path d="[^"]+"\/><\/g>/);
  });

  it('cuts the channels through the piece when the settings say so', () => {
    const last = pieces('tape', { settings: { channelsThrough: true } }).at(-1);
    expect(last.svg).toMatch(/<g id="channels"><\/g>/);
    expect(last.svg).toMatch(/<g id="cutouts"><path d="[^"]+"\/><\/g>/);
  });

  it('with raised numbers and letters: the 16 mm numeral, then the name in raised capitals on one baseline', () => {
    const key = keyFor(plan());
    const last = pieces('raised').at(-1);
    const n = key.numbers.at(-1);
    const words = wordsOf(last);
    expect(words[0].text).toBe(`#${n.number}`);
    expect(words[0].h).toBe(16);
    expect(words[1].text.startsWith(n.name.toUpperCase().split(' ')[0])).toBe(
      true
    );
    expect(words[1].baseline).toBeCloseTo(words[0].baseline, 1);
    expect(words[1].x).toBeGreaterThan(words[0].x);
    expect(last.tape).toEqual([]);
    expect(last.wedges).toBe('');
  });

  it("gives a kind's row its sample at the left and its name in the form chosen", () => {
    const all = pieces('raised');
    const entry = keyFor(plan()).entries[0];
    const row = all[1];
    expect(row.name).toBe(entry.name);
    expect(samplesOf(row)).toHaveLength(1);
    expect(
      wordsOf(row)
        .map((w) => w.text)
        .join(' ')
    ).toBe(entry.name.toUpperCase());
  });

  it('carries a long name on in lines below, every piece no wider than the bed, every part 9.525 mm inside its edges', () => {
    const narrow = 120;
    for (const style of ['wedge', 'tape', 'raised']) {
      const all = pieces(style, { maxWidthMm: narrow });
      const clinic = all.find((p) => /Montlake/.test(p.name));
      const lines =
        style === 'wedge'
          ? rowsOf(clinic.brailleWedges).length
          : style === 'tape'
            ? clinic.tape.length - 1
            : wordsOf(clinic).length - 1;
      expect(lines, style).toBeGreaterThan(1);
      for (const p of all) {
        expect(p.size.w, `${style} ${p.name}`).toBeLessThanOrEqual(narrow);
        for (const c of channelsOf(p)) {
          expect(c.at[0] - c.length / 2).toBeGreaterThanOrEqual(
            KEY_CLEARANCE_MM - 1e-6
          );
          expect(c.at[0] + c.length / 2).toBeLessThanOrEqual(
            p.size.w - KEY_CLEARANCE_MM + 1e-6
          );
        }
        for (const m of p.marks) {
          expect(m.wedge.x - m.wedge.w / 2).toBeGreaterThanOrEqual(
            KEY_CLEARANCE_MM - 1e-6
          );
          expect(m.wedge.x + m.wedge.w / 2).toBeLessThanOrEqual(
            p.size.w - KEY_CLEARANCE_MM + 1e-6
          );
          expect(m.wedge.y - m.wedge.depth).toBeGreaterThanOrEqual(
            KEY_CLEARANCE_MM - 1e-6
          );
          expect(m.wedge.y).toBeLessThanOrEqual(
            p.size.h - KEY_CLEARANCE_MM + 1e-6
          );
        }
      }
    }
  });

  it("hands the destination's piece the center of its cone sample, and no other piece a cone", () => {
    const p = plan();
    p.features.push({
      id: 'destination',
      class: 'destination',
      kind: 'point',
      name: '3600 Ferry Pl NE',
      size: 4.9,
      at: [240, 180],
      on: true,
    });
    const all = keyPieces(keyFor(p), { title: 'Ferry Place', braille });
    const piece = all.find((pg) =>
      pg.plan.features.some((f) => f.class === 'destination')
    );
    const sample = piece.plan.features.find((f) => f.class === 'destination');
    expect(sample.symbol).toBe('destination-cone');
    expect(piece.cones).toEqual([sample.at]);
    expect(
      all.filter((pg) => pg !== piece).every((pg) => pg.cones.length === 0)
    ).toBe(true);
  });

  it('writes uncontracted letters for a wedge until the translator has measured the words', () => {
    expect(brailleCells(estimateBraille('Ab 12'))).toEqual([
      [1],
      [1, 2],
      [],
      [3, 4, 5, 6],
      [1],
      [1, 2],
    ]);
    // Without a translator's answer the key still lays out its wedges.
    const all = keyPieces(keyFor(plan()), { title: 'Station' });
    expect(all.at(-1).brailleWedges).not.toBe('');
  });
});
