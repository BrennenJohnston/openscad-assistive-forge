/**
 * The PDF for the transcriber: a small writer of our own (pages in
 * millimeters, the standard fonts, lines, boxes, dots and text), and the
 * map's pages built from the same data as the map paper.
 *
 * The bytes are read back by a parser of this test's own: the header, the
 * cross-reference offsets, the page tree, the page sizes and the strings.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  PdfWriter,
  PT_PER_MM,
  encodeWinAnsi,
  textWidthMm,
} from '../../src/js/tactile-map/pdf-writer.js';
import {
  PAPER_SIZES,
  PDF_MARGIN_MM,
  mapPdf,
} from '../../src/js/tactile-map/map-pdf.js';
import { sampleStationPlan } from '../../src/js/tactile-map/plan.js';
import { buildLevelRings } from '../../src/js/tactile-map/levels-svg.js';
import {
  BED_PRESETS,
  planPlates,
  plateLevelsSvg,
} from '../../src/js/tactile-map/plate-tiling.js';
import {
  paperChannels,
  paperTexts,
  shiftTexts,
} from '../../src/js/tactile-map/map-paper.js';

/** The bytes as one character per byte, so an index is a byte offset. */
function latin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return s;
}

/** The cross-reference table checked against where each object really starts. */
function parsePdf(bytes) {
  const s = latin1(bytes);
  expect(s.startsWith('%PDF-1.4\n')).toBe(true);
  const start = /startxref\n(\d+)\n%%EOF\n?$/.exec(s);
  expect(start).not.toBeNull();
  const xrefAt = Number(start[1]);
  expect(s.slice(xrefAt, xrefAt + 5)).toBe('xref\n');
  const head = /^xref\n0 (\d+)\n/.exec(s.slice(xrefAt));
  const count = Number(head[1]);
  const table = s.slice(
    xrefAt + head[0].length,
    xrefAt + head[0].length + count * 20
  );
  const offsets = [];
  for (let i = 0; i < count; i += 1) {
    const row = table.slice(i * 20, i * 20 + 20);
    expect(row).toMatch(/^\d{10} \d{5} [nf] \r?\n$/);
    offsets.push({ at: Number(row.slice(0, 10)), use: row[17] });
  }
  expect(offsets[0].use).toBe('f');
  for (let i = 1; i < count; i += 1) {
    expect(offsets[i].use).toBe('n');
    expect(s.slice(offsets[i].at, offsets[i].at + `${i} 0 obj`.length)).toBe(
      `${i} 0 obj`
    );
  }
  const pages = s.match(/\/Type \/Page\b(?!s)/g) || [];
  const countM = /\/Type \/Pages[^>]*\/Count (\d+)/.exec(s);
  expect(Number(countM[1])).toBe(pages.length);
  const boxes = [...s.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(
    (m) => [Number(m[1]), Number(m[2])]
  );
  return { text: s, pages: pages.length, boxes, objects: count - 1 };
}

describe('the PDF writer', () => {
  it('spells WinAnsi and reports what it cannot', () => {
    expect(encodeWinAnsi('Plaza Cafe')).toEqual({
      bytes: [...'Plaza Cafe'].map((c) => c.charCodeAt(0)),
      lost: false,
    });
    const e = encodeWinAnsi('Café – “x” €');
    expect(e.lost).toBe(false);
    expect(e.bytes).toContain(0xe9);
    expect(e.bytes).toContain(0x96);
    expect(e.bytes).toContain(0x80);
    const l = encodeWinAnsi('Łódź');
    expect(l.lost).toBe(true);
    expect(l.bytes[0]).toBe('?'.charCodeAt(0));
  });

  it('writes a page in millimeters with a correct cross-reference table, both fonts, a box, a dot and text', () => {
    const w = new PdfWriter();
    w.page(279.4, 215.9);
    w.text(10, 20, 12, 'Station', { bold: true });
    w.text(10, 30, 10, 'Café (Bar)', { align: 'left' });
    w.rect(10, 40, 60, 13.1, { stroke: [0, 0, 1], widthMm: 0.4 });
    w.circle(15, 60, 0.75, { fill: [0, 0, 0] });
    w.line(0, 100, 50, 100, {
      stroke: [0.5, 0.5, 0.5],
      widthMm: 0.3,
      dash: [2, 1],
    });
    w.polygons(
      [
        [
          { x: 100, y: 100 },
          { x: 150, y: 100 },
          { x: 150, y: 130 },
        ],
      ],
      {
        fill: [0.12, 0.37, 0.66],
      }
    );
    w.page(297, 210);
    w.text(10, 10, 10, 'Łódź');
    const bytes = w.save();
    expect(bytes).toBeInstanceOf(Uint8Array);
    const pdf = parsePdf(bytes);
    expect(pdf.pages).toBe(2);
    expect(pdf.boxes).toEqual([
      [792, 612],
      [841.89, 595.28],
    ]);
    expect(pdf.text).toMatch(/\/BaseFont \/Helvetica\b/);
    expect(pdf.text).toMatch(/\/BaseFont \/Helvetica-Bold\b/);
    expect(pdf.text).toMatch(/\/Encoding \/WinAnsiEncoding/);
    expect(pdf.text).toMatch(/\(Station\) Tj/);
    expect(pdf.text).toMatch(/\(Caf\xe9 \\\(Bar\\\)\) Tj/);
    // The box's width in points, and a dot drawn with curves.
    expect(pdf.text).toMatch(
      new RegExp(
        `${(60 * PT_PER_MM).toFixed(2)} ${(13.1 * PT_PER_MM).toFixed(2)} re`
      )
    );
    expect(pdf.text).toMatch(/ c\n/);
    expect(pdf.text).toMatch(/\[5\.67 2\.83\] 0 d/);
    expect(w.unspelled()).toEqual(['Łódź']);
    expect(textWidthMm('Station', 12)).toBeGreaterThan(10);
    expect(textWidthMm('Station', 12)).toBeLessThan(20);
  });
});

describe("the map's PDF", () => {
  const plan = sampleStationPlan();
  const built = buildLevelRings(plan);
  const layout = planPlates({ w: 480, h: 360, bed: BED_PRESETS[0] });
  const texts = paperTexts(plan);
  const channels = paperChannels(plan.features, 13.1, () => 'Pine');
  const plates = layout.plates.map((p) => {
    const out = plateLevelsSvg(built.rings, p);
    return {
      id: p.id,
      size: out.size,
      rings: out.rings,
      texts: shiftTexts(texts, p),
      channels: shiftTexts(channels, p),
      words: [],
      title: p.id === 'A1' ? 'Station' : '',
      plateId: p.id,
    };
  });
  const input = {
    mapName: 'Station',
    lead: 'A map from a drawing.',
    paper: 'letter',
    whole: {
      rings: built.rings,
      size: plan.size,
      texts,
      channels,
      title: 'Station',
    },
    plates,
    layout,
    keyLines: ['Key', 'Symbols, You are here first:', '- Stairs: a triangle'],
    labels: [
      {
        featureId: 'label-1',
        text: 'Pine',
        cells: 4,
        name: 'Pine Street',
        lengthMm: 32.8,
      },
    ],
    tapeWidthMm: 12.7,
    colors: {
      level1: '#1f5fa8',
      level2: '#e07a1f',
      level3: '#a6c72b',
      channel: '#4cc2ff',
    },
  };

  it('lists the two paper sizes sideways, Letter first', () => {
    expect(PAPER_SIZES.map((p) => [p.key, p.name, p.w, p.h])).toEqual([
      ['letter', 'Letter', 279.4, 215.9],
      ['a4', 'A4', 297, 210],
    ]);
    expect(PDF_MARGIN_MM).toBe(10);
  });

  it('writes the map with its plates, one page per plate at 1:1, the labels and the key', () => {
    const { bytes, pages, unspelled } = mapPdf(input);
    const pdf = parsePdf(bytes);
    expect(pages).toBe(1 + 4 + 2);
    expect(pdf.pages).toBe(pages);
    expect(pdf.boxes.every(([w, h]) => w === 792 && h === 612)).toBe(true);
    expect(unspelled).toEqual([]);
    expect(pdf.text).toMatch(/\(Station\) Tj/);
    expect(pdf.text).toMatch(/\(the waiting area\) Tj/);
    expect(pdf.text).toMatch(/\(Pine\) Tj/);
    expect(pdf.text).toMatch(/\(Plate A1, 240 x 180 mm, at full size\) Tj/);
    expect(pdf.text).toMatch(/\(Labels\) Tj/);
    expect(pdf.text).toMatch(/\(- Stairs: a triangle\) Tj/);
    // A 240 mm plate drawn at 1:1 on the page: its outline is 240 mm in points.
    expect(pdf.text).toMatch(
      new RegExp(
        `${(240 * PT_PER_MM).toFixed(2)} ${(180 * PT_PER_MM).toFixed(2)} re`
      )
    );
    // The plate seams and names on the first page.
    expect(pdf.text).toMatch(/\(A1\) Tj/);
    expect(pdf.text).toMatch(/\(B2\) Tj/);
  });

  it('scales a plate that does not fit the paper, and says so', () => {
    const big = {
      ...input,
      paper: 'a4',
      plates: [
        {
          ...plates[0],
          id: 'A1',
          size: { w: 300, h: 300 },
          plateId: 'A1',
        },
      ],
    };
    const { bytes } = mapPdf(big);
    const pdf = parsePdf(bytes);
    expect(pdf.boxes[0]).toEqual([841.89, 595.28]);
    expect(pdf.text).toMatch(/\(Plate A1, 300 x 300 mm, scaled to 63 %\) Tj/);
  });

  it('reports a name the fonts cannot spell', () => {
    const { unspelled } = mapPdf({
      ...input,
      whole: { ...input.whole, texts: [{ text: 'Łódź', at: [10, 10] }] },
    });
    expect(unspelled).toEqual(['Łódź']);
  });
});
