/**
 * The plate splitter: a map cut into equal plates that fit a print bed,
 * each named by row letter and column number, each with its own levels
 * file clipped from the map's rings.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  BED_PRESETS,
  ID_STYLES,
  planPlates,
  plateLevelsSvg,
} from '../../src/js/tactile-map/plate-tiling.js';
import {
  buildLevelRings,
  strokePolyline,
} from '../../src/js/tactile-map/levels-svg.js';
import { emptyPlan, sampleStationPlan } from '../../src/js/tactile-map/plan.js';
import { ringsFromPathData } from '../../src/js/ring-geometry.js';

const bed = (key) => BED_PRESETS.find((b) => b.key === key);

function groupRings(svg, id) {
  const m = svg.match(new RegExp(`<g id="${id}">(?:<path d="([^"]*)"/>)?</g>`));
  return m && m[1] ? ringsFromPathData(m[1]) : [];
}

function bbox(rings) {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const r of rings)
    for (const p of r) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
    }
  return { minX, maxX };
}

describe('the bed presets', () => {
  it('list the nine beds and a custom size, in the strings order', () => {
    expect(BED_PRESETS.map((b) => b.name)).toEqual([
      'Bambu Lab X1C, P1S or P1P (256 x 256 mm)',
      'Bambu Lab A1 (256 x 256 mm)',
      'Bambu Lab A1 mini (180 x 180 mm)',
      'Prusa MK4S, MK4 or MK3S (250 x 210 mm)',
      'Prusa MINI (180 x 180 mm)',
      'Prusa XL (360 x 360 mm)',
      'Creality Ender 3 family (220 x 220 mm)',
      'Creality K1 Max (300 x 300 mm)',
      'Custom size',
    ]);
    expect(bed('x1c')).toMatchObject({ w: 256, d: 256 });
    expect(ID_STYLES.map((s) => s.name)).toEqual([
      'Raised letters in the margin',
      'Notches on the bottom edge',
    ]);
  });
});

describe('planPlates', () => {
  it('cuts 480 x 360 into four 240 x 180 plates on an X1C, A1 A2 B1 B2', () => {
    const r = planPlates({ w: 480, h: 360, bed: bed('x1c') });
    expect(r).toMatchObject({
      rows: 2,
      cols: 2,
      plateW: 240,
      plateH: 180,
      rotated: false,
    });
    expect(r.plates.map((p) => [p.id, p.x, p.y, p.w, p.h])).toEqual([
      ['A1', 0, 0, 240, 180],
      ['A2', 240, 0, 240, 180],
      ['B1', 0, 180, 240, 180],
      ['B2', 240, 180, 240, 180],
    ]);
  });

  it('cuts the same map into nine 160 x 120 plates on an A1 mini', () => {
    const r = planPlates({ w: 480, h: 360, bed: bed('a1-mini') });
    expect(r).toMatchObject({ rows: 3, cols: 3, plateW: 160, plateH: 120 });
    expect(r.plates.map((p) => p.id)).toEqual([
      'A1',
      'A2',
      'A3',
      'B1',
      'B2',
      'B3',
      'C1',
      'C2',
      'C3',
    ]);
  });

  it('keeps the MK4S bed unrotated: two by two of 240 x 180', () => {
    // Unrotated: 2 x 2 (246 x 206 usable). Rotated (206 x 246): 3 x 2, six
    // plates. Fewer plates win.
    const r = planPlates({ w: 480, h: 360, bed: bed('mk4s') });
    expect(r).toMatchObject({
      rows: 2,
      cols: 2,
      plateW: 240,
      plateH: 180,
      rotated: false,
    });
  });

  it('gives one plate when the map fits the bed', () => {
    const r = planPlates({ w: 250, h: 200, bed: bed('x1c') });
    expect(r).toMatchObject({ rows: 1, cols: 1, plateW: 250, plateH: 200 });
    expect(r.plates).toHaveLength(1);
    expect(r.plates[0].id).toBe('A1');
  });
});

describe('plateLevelsSvg', () => {
  const plan = emptyPlan(480, 360);
  plan.features.push({
    id: 'wall',
    class: 'wall',
    kind: 'line',
    points: [
      [200, 100],
      [280, 100],
    ],
    on: true,
  });
  const { rings } = buildLevelRings(plan);
  const layout = planPlates({ w: 480, h: 360, bed: bed('x1c') });
  const A1 = layout.plates[0];
  const A2 = layout.plates[1];

  it('cuts a wall crossing x = 240 at the shared edge, in both plates', () => {
    const left = plateLevelsSvg(rings, A1);
    const right = plateLevelsSvg(rings, A2);
    expect(left.size).toEqual({ w: 240, h: 180 });
    const l3 = groupRings(left.svg, 'level3');
    const r3 = groupRings(right.svg, 'level3');
    expect(l3).toHaveLength(1);
    expect(r3).toHaveLength(1);
    expect(bbox(l3).maxX).toBeCloseTo(240, 2);
    expect(bbox(l3).minX).toBeCloseTo(199, 2);
    // The right plate's copy starts at its own left edge.
    expect(bbox(r3).minX).toBeCloseTo(0, 2);
    expect(bbox(r3).maxX).toBeCloseTo(41, 2);
    expect(left.dropped).toBe(0);
  });

  it('drops a sliver under 1 mm and counts it', () => {
    const sliver = strokePolyline(
      [
        [239.8, 50],
        [240.4, 50],
      ],
      0.5
    );
    const withSliver = { ...rings, level1: sliver };
    const out = plateLevelsSvg(withSliver, A2);
    expect(groupRings(out.svg, 'level1')).toHaveLength(0);
    expect(out.dropped).toBe(1);
  });

  it('marks plate B3 with two notches and three dots in the channels', () => {
    const nine = planPlates({ w: 480, h: 360, bed: bed('a1-mini') });
    const B3 = nine.plates.find((p) => p.id === 'B3');
    const out = plateLevelsSvg(rings, B3, { id: 'notches' });
    expect(groupRings(out.svg, 'channels')).toHaveLength(5);
    expect(out.size).toEqual({ w: 160, h: 120 });
  });

  it('adds a 10 mm margin strip with the id box when asked for letters', () => {
    const out = plateLevelsSvg(rings, A1, { id: 'margin' });
    expect(out.size).toEqual({ w: 240, h: 190 });
    expect(out.svg).toMatch(/viewBox="0 0 240 190"/);
    expect(out.svg).toMatch(/<g id="letters">[^]*<rect [^>]*height="6"/);
    expect(out.plateId).toBe('A1');
  });

  it('cuts the sample station into four plates whose level counts add up', () => {
    const sample = buildLevelRings(sampleStationPlan());
    const plates = planPlates({ w: 480, h: 360, bed: bed('x1c') }).plates;
    const outs = plates.map((p) => plateLevelsSvg(sample.rings, p));
    const channels = outs.reduce(
      (n, o) => n + groupRings(o.svg, 'channels').length,
      0
    );
    expect(channels).toBe(2);
    for (const o of outs) expect(o.svg).toMatch(/width="240mm" height="180mm"/);
  });
});
