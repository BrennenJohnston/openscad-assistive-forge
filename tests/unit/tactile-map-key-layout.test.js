/**
 * The key plate's layout: the key's entries as rows on plates of the map's
 * plate size, each row a sample of the symbol, line or area at the left at
 * its printed size, the words in raised capitals and the braille under
 * them, wrapped to the plate and carried onto a second key plate when the
 * first is full; a 1 mm frame; the rows written as the model reads them.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { keyFor } from '../../src/js/tactile-map/map-key.js';
import {
  keyPlates,
  keyTexts,
  KEY_MARGIN_MM,
} from '../../src/js/tactile-map/key-layout.js';
import { signRowWidthMm } from '../../src/js/sign-letter-metrics.js';
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

// A stand-in braille: one cell per character (the real one is liblouis's).
const fakeBraille = (text) =>
  [...text.toLowerCase()].map((c) => (c === ' ' ? '⠀' : '⠁')).join('');

const rowsOf = (s) =>
  s
    ? s.split('|').map((r) => {
        const [x, y, ...rest] = r.split(':');
        return { x: Number(x) / 10, y: Number(y) / 10, text: rest.join(':') };
      })
    : [];

describe('keyTexts', () => {
  it('names every text the key will need in braille, once', () => {
    const texts = keyTexts(keyFor(plan()), 'Ferry Place');
    expect(texts).toContain('key: ferry place');
    expect(texts).toContain('you are here');
    expect(texts).toContain('pc restaurant: plaza cafe');
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe('keyPlates', () => {
  const PLATE = { plateW: 240, plateH: 180 };

  it('lays the key in rows, the title first, words in capitals, braille under them, inside the margins', () => {
    const pages = keyPlates(keyFor(plan()), {
      ...PLATE,
      title: 'Ferry Place',
      brailleOf: fakeBraille,
    });
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages[0].id).toBe(pages.length === 1 ? 'key' : 'key-1');
    const print = rowsOf(pages[0].print);
    expect(print[0].text).toBe('KEY: FERRY PLACE');
    expect(print.map((r) => r.text)).toContain('YOU ARE HERE');
    for (const page of pages) {
      expect(page.size).toEqual({ w: 240, h: 180 });
      for (const r of rowsOf(page.print)) {
        expect(r.text).toBe(r.text.toUpperCase());
        expect(r.x).toBeGreaterThanOrEqual(KEY_MARGIN_MM);
        expect(
          r.x + signRowWidthMm(r.text, { charHeightMm: 8, letterSpacing: 1.21 })
        ).toBeLessThanOrEqual(240 - KEY_MARGIN_MM + 0.01);
        expect(r.y).toBeGreaterThanOrEqual(KEY_MARGIN_MM);
        expect(r.y).toBeLessThanOrEqual(180 - KEY_MARGIN_MM);
      }
      for (const r of rowsOf(page.braille)) {
        expect(r.x + [...r.text].length * 7).toBeLessThanOrEqual(
          240 - KEY_MARGIN_MM + 0.01
        );
        expect(r.y).toBeGreaterThanOrEqual(KEY_MARGIN_MM);
      }
    }
  });

  it('wraps a long name over lines and carries the rows onto a second key plate when the first is full', () => {
    const small = keyPlates(keyFor(plan()), {
      plateW: 160,
      plateH: 100,
      title: 'Ferry Place',
      brailleOf: fakeBraille,
    });
    expect(small.length).toBeGreaterThan(1);
    expect(small.map((p) => p.id)).toEqual(
      small.map((_, i) => `key-${i + 1}`)
    );
    const all = small.flatMap((p) => rowsOf(p.print).map((r) => r.text));
    expect(all.some((t) => t.startsWith('UW CLINIC'))).toBe(true);
    expect(all.some((t) => /MONTLAKE$/.test(t))).toBe(true);
  });

  it('draws the samples on their own levels, You are here with its raised dot, and a 1 mm frame', () => {
    const [page] = keyPlates(keyFor(plan()), {
      ...PLATE,
      title: 'Ferry Place',
      brailleOf: fakeBraille,
    });
    expect(page.svg).toMatch(/<g id="here"><path d="[^"]+"\/><\/g>/);
    expect(page.svg).toMatch(/<g id="level2"><path d="[^"]+"\/><\/g>/);
    expect(page.svg).toMatch(/<g id="level1"><path d="[^"]+"\/><\/g>/);
    const frame = page.plan.features.find((f) => f.id === 'key-frame');
    expect([frame.class, frame.width]).toEqual(['curb', 1]);
  });

  it('never sets a line off the plate: a row taller than the plate goes on, line by line, on the next', () => {
    const pages = keyPlates(keyFor(plan()), {
      plateW: 200,
      plateH: 75,
      title: 'Ferry Place',
      brailleOf: fakeBraille,
      letterHeightMm: 16,
    });
    for (const page of pages) {
      for (const r of rowsOf(page.print)) {
        expect(r.y).toBeGreaterThanOrEqual(KEY_MARGIN_MM - 0.06);
        expect(r.y + 16).toBeLessThanOrEqual(75 - KEY_MARGIN_MM + 0.06);
      }
      for (const r of rowsOf(page.braille)) {
        expect(r.y - 3.3).toBeGreaterThanOrEqual(KEY_MARGIN_MM - 0.06);
        expect(r.y + 3.3).toBeLessThanOrEqual(75 - KEY_MARGIN_MM + 0.06);
      }
    }
  });

  it('carries print only when there is no braille', () => {
    const [page] = keyPlates(keyFor(plan()), {
      ...PLATE,
      title: 'Ferry Place',
      brailleOf: null,
    });
    expect(page.braille).toBe('');
    expect(rowsOf(page.print).length).toBeGreaterThan(3);
  });
});
