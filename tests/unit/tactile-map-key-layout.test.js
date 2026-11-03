/**
 * The key plate's layout: the key's entries as rows on plates of the map's
 * plate size, each row a sample of the symbol, line or area at the left at
 * its printed size, the words in raised capitals built to the Braille
 * Sign's rules, and under the words a channel for the braille on label
 * tape, as the map's own labels are; the rows carried onto a second key
 * plate when the first is full; a 1 mm frame; the words written as the
 * model reads them and the tape texts listed in order.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { keyFor, labelCells } from '../../src/js/tactile-map/map-key.js';
import { channelLengthMm } from '../../src/js/tactile-map/map-labels.js';
import {
  keyLabel,
  keyPlates,
  KEY_CLEARANCE_MM,
  KEY_FRAME_INSET_MM,
  KEY_FRAME_WIDTH_MM,
  KEY_MARGIN_MM,
  KEY_WORDS,
} from '../../src/js/tactile-map/key-layout.js';
import {
  SIGN_LETTER_CAP_FACTOR,
  SIGN_LETTER_METRICS,
  SIGN_LETTER_UNKNOWN,
  signRowWidthMm,
} from '../../src/js/sign-letter-metrics.js';
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

/** The plate, with the words raised beside the tape. */
const PLATE = { plateW: 240, plateH: 180, words: 'both' };
const LETTER = 16;
/** The default tape, 12.7 mm, in a channel 0.4 mm wider. */
const ACROSS = 13.1;

/** The raised words of a page: x, the baseline from the top, the text. */
const wordsOf = (page) =>
  page.print
    ? page.print.split('|').map((r) => {
        const [x, y, ...rest] = r.split(':');
        return {
          x: Number(x) / 10,
          baseline: page.size.h - Number(y) / 10,
          text: rest.join(':'),
        };
      })
    : [];

const channelsOf = (page) =>
  page.plan.features.filter((f) => f.kind === 'channel');

const samplesOf = (page) =>
  page.plan.features.filter((f) => f.id.startsWith('key-sample-'));

/** How far below its baseline a row's ink reaches, as the sign measures it. */
function descentMm(text) {
  const size = LETTER / SIGN_LETTER_CAP_FACTOR;
  let lowest = 0;
  for (const c of text) {
    const m = SIGN_LETTER_METRICS[c] || SIGN_LETTER_UNKNOWN;
    lowest = Math.min(lowest, m[3]);
  }
  return -lowest * size;
}

const CLINIC = 'uw clinic: university of washington medical center - montlake';

describe('keyLabel', () => {
  it('names a key plate as the plate list does', () => {
    expect(keyLabel('key')).toBe('Key');
    expect(keyLabel('key-2')).toBe('Key 2');
  });
});

describe('keyPlates', () => {
  it('offers the words three ways, braille only first', () => {
    expect(KEY_WORDS.map((w) => [w.key, w.name])).toEqual([
      ['braille', 'Braille only'],
      ['both', 'Print and braille'],
      ['print', 'Print only'],
    ]);
  });

  it('starts with braille only: no raised words, a channel per text, the sample beside its row, rows 9.525 mm apart, four plates at most for this key', () => {
    const pages = keyPlates(keyFor(plan()), {
      plateW: 240,
      plateH: 180,
      title: 'Ferry Place',
    });
    expect(pages.length).toBeLessThanOrEqual(2);
    for (const page of pages) {
      expect(page.print).toBe('');
      expect(channelsOf(page).length).toBe(page.tape.length);
    }
    expect(pages.flatMap((p) => p.tape)).toContain('you are here');
    const [page] = pages;
    const channels = channelsOf(page);
    const here = samplesOf(page).find((s) => s.class === 'you-are-here');
    const hereRow = channels.find(
      (c) => Math.abs(c.at[1] - here.at[1]) < here.size
    );
    expect(hereRow).toBeTruthy();
    expect(
      hereRow.at[0] - hereRow.length / 2 - (here.at[0] + here.size / 2)
    ).toBeGreaterThanOrEqual(KEY_CLEARANCE_MM - 0.01);
    const tops = channels
      .map((c) => c.at[1] - ACROSS / 2)
      .sort((a, b) => a - b);
    for (let i = 1; i < tops.length; i += 1) {
      const gap = tops[i] - (tops[i - 1] + ACROSS);
      expect(gap === 3 || gap >= KEY_CLEARANCE_MM - 0.01).toBe(true);
    }
  });

  it('print only: the words raised, no channel and nothing to write', () => {
    const pages = keyPlates(keyFor(plan()), {
      plateW: 240,
      plateH: 180,
      title: 'Ferry Place',
      words: 'print',
    });
    for (const page of pages) {
      expect(channelsOf(page)).toEqual([]);
      expect(page.tape).toEqual([]);
      expect(page.svg).toMatch(/<g id="channels"><\/g>/);
    }
    expect(wordsOf(pages[0])[0].text).toBe('KEY: FERRY');
  });

  it('keeps the words and the tape 9.525 mm inside the raised frame, as the Braille Sign keeps its border', () => {
    expect(KEY_CLEARANCE_MM).toBe(9.525);
    expect(KEY_MARGIN_MM).toBe(
      KEY_FRAME_INSET_MM + KEY_FRAME_WIDTH_MM + KEY_CLEARANCE_MM
    );
  });

  it('lays the key in rows: the title first, words in 16 mm capitals, a tape channel under each, inside the margins', () => {
    const pages = keyPlates(keyFor(plan()), { ...PLATE, title: 'Ferry Place' });
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages[0].id).toBe(pages.length === 1 ? 'key' : 'key-1');
    const words = wordsOf(pages[0]);
    // At 16 mm the title wraps: the plate's words column is 183 mm.
    expect(words[0].text).toBe('KEY: FERRY');
    expect(words[1].text).toBe('PLACE');
    expect(words.map((r) => r.text)).toContain('YOU ARE');
    expect(pages[0].tape[0]).toBe('key: ferry place');
    expect(pages.flatMap((p) => p.tape)).toContain('you are here');
    for (const page of pages) {
      expect(page.size).toEqual({ w: 240, h: 180 });
      expect(page.braille).toBeUndefined();
      for (const r of wordsOf(page)) {
        expect(r.text).toBe(r.text.toUpperCase());
        expect(r.x).toBeGreaterThanOrEqual(KEY_MARGIN_MM);
        expect(
          r.x +
            signRowWidthMm(r.text, {
              charHeightMm: LETTER,
              letterSpacing: 1.21,
            })
        ).toBeLessThanOrEqual(240 - KEY_MARGIN_MM + 0.01);
        expect(r.baseline - LETTER).toBeGreaterThanOrEqual(
          KEY_MARGIN_MM - 0.01
        );
        expect(r.baseline + descentMm(r.text)).toBeLessThanOrEqual(
          180 - KEY_MARGIN_MM + 0.01
        );
      }
      const channels = channelsOf(page);
      expect(channels.length).toBe(page.tape.length);
      for (const c of channels) {
        expect(c.at[0] - c.length / 2).toBeGreaterThanOrEqual(
          KEY_MARGIN_MM - 0.01
        );
        expect(c.at[0] + c.length / 2).toBeLessThanOrEqual(
          240 - KEY_MARGIN_MM + 0.01
        );
        expect(c.at[1] - ACROSS / 2).toBeGreaterThanOrEqual(
          KEY_MARGIN_MM - 0.01
        );
        expect(c.at[1] + ACROSS / 2).toBeLessThanOrEqual(
          180 - KEY_MARGIN_MM + 0.01
        );
      }
    }
  });

  it('keeps every channel 9.525 mm from the raised words above and below it and from the sample beside it (ADA 703.3.2)', () => {
    const pages = keyPlates(keyFor(plan()), { ...PLATE, title: 'Ferry Place' });
    let checked = 0;
    for (const page of pages) {
      const words = wordsOf(page);
      for (const c of channelsOf(page)) {
        const top = c.at[1] - ACROSS / 2;
        const bottom = c.at[1] + ACROSS / 2;
        for (const r of words) {
          const inkBottom = r.baseline + descentMm(r.text);
          const inkTop = r.baseline - LETTER;
          if (inkBottom <= top) {
            expect(top - inkBottom).toBeGreaterThanOrEqual(
              KEY_CLEARANCE_MM - 0.01
            );
          } else {
            expect(inkTop - bottom).toBeGreaterThanOrEqual(
              KEY_CLEARANCE_MM - 0.01
            );
          }
          checked += 1;
        }
        for (const s of samplesOf(page)) {
          const right =
            s.kind === 'line'
              ? Math.max(...s.points.map((p) => p[0]))
              : s.kind === 'area'
                ? Math.max(...s.ring.map((p) => p[0]))
                : s.at[0] + s.size / 2;
          expect(c.at[0] - c.length / 2 - right).toBeGreaterThanOrEqual(
            KEY_CLEARANCE_MM - 0.01
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('cuts each channel to its text’s cells, divides a long text over channels at a space, 3 mm apart, and lists the texts in order', () => {
    const pages = keyPlates(keyFor(plan()), { ...PLATE, title: 'Ferry Place' });
    const texts = pages.flatMap((p) => p.tape);
    const channels = pages.flatMap((p) => channelsOf(p));
    expect(channels.length).toBe(texts.length);
    texts.forEach((text, i) => {
      expect(channels[i].length).toBe(channelLengthMm(labelCells(text)));
    });
    const first = texts.findIndex((t) => CLINIC.startsWith(t));
    expect(first).toBeGreaterThan(0);
    const parts = [];
    for (let i = first; i < texts.length; i += 1) {
      parts.push(texts[i]);
      if (parts.join(' ') === CLINIC) break;
    }
    expect(parts.join(' ')).toBe(CLINIC);
    expect(parts.length).toBeGreaterThan(1);
    for (let i = 1; i < parts.length; i += 1) {
      const a = channels[first + i - 1];
      const b = channels[first + i];
      if (a.at[1] < b.at[1]) {
        expect(b.at[1] - ACROSS / 2 - (a.at[1] + ACROSS / 2)).toBeCloseTo(3, 2);
      }
    }
  });

  it('wraps a long name over lines of words and carries the rows onto a second key plate when the first is full', () => {
    const small = keyPlates(keyFor(plan()), {
      plateW: 240,
      plateH: 100,
      title: 'Ferry Place',
      words: 'both',
    });
    expect(small.length).toBeGreaterThan(1);
    expect(small.map((p) => p.id)).toEqual(small.map((_, i) => `key-${i + 1}`));
    const all = small.flatMap((p) => wordsOf(p).map((r) => r.text));
    expect(all.some((t) => t.startsWith('UW CLINIC'))).toBe(true);
    expect(all.some((t) => /MONTLAKE$/.test(t))).toBe(true);
  });

  it('draws the samples on their own levels, You are here with its raised dot, the channels in their group, and a 1 mm frame', () => {
    const [page] = keyPlates(keyFor(plan()), {
      ...PLATE,
      title: 'Ferry Place',
    });
    expect(page.svg).toMatch(/<g id="here"><path d="[^"]+"\/><\/g>/);
    expect(page.svg).toMatch(/<g id="level2"><path d="[^"]+"\/><\/g>/);
    expect(page.svg).toMatch(/<g id="level1"><path d="[^"]+"\/><\/g>/);
    expect(page.svg).toMatch(/<g id="channels"><path d="[^"]+"\/><\/g>/);
    const frame = page.plan.features.find((f) => f.id === 'key-frame');
    expect([frame.class, frame.width]).toEqual(['curb', 1]);
  });

  it('never sets a line off the plate: a row taller than the plate goes on, line by line, on the next', () => {
    const pages = keyPlates(keyFor(plan()), {
      plateW: 200,
      plateH: 75,
      title: 'Ferry Place',
      words: 'both',
    });
    for (const page of pages) {
      for (const r of wordsOf(page)) {
        expect(r.baseline - LETTER).toBeGreaterThanOrEqual(
          KEY_MARGIN_MM - 0.06
        );
        expect(r.baseline + descentMm(r.text)).toBeLessThanOrEqual(
          75 - KEY_MARGIN_MM + 0.06
        );
      }
      for (const c of channelsOf(page)) {
        expect(c.at[1] - ACROSS / 2).toBeGreaterThanOrEqual(
          KEY_MARGIN_MM - 0.06
        );
        expect(c.at[1] + ACROSS / 2).toBeLessThanOrEqual(
          75 - KEY_MARGIN_MM + 0.06
        );
      }
    }
  });

  it('cuts the channels for the tape the map uses', () => {
    const [narrow] = keyPlates(keyFor(plan()), {
      ...PLATE,
      title: 'Ferry Place',
      settings: { tapeWidthMm: 9.5 },
    });
    const [wide] = keyPlates(keyFor(plan()), {
      ...PLATE,
      title: 'Ferry Place',
    });
    const tall = (page) => {
      const d = page.svg.match(/<g id="channels"><path d="([^"]+)"/)[1];
      const ys = [...d.matchAll(/[ML] [\d.]+ ([\d.]+)/g)].map((m) =>
        Number(m[1])
      );
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(channelsOf(narrow).length).toBeGreaterThan(0);
    expect(tall(wide)).toBeGreaterThan(tall(narrow));
  });
});
