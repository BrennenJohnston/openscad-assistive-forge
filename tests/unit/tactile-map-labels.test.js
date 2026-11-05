/**
 * Labels on the map: the name of a named thing on braille label tape at the
 * thing, when it fits. A point's stands beside its symbol and takes at most
 * six cells; an area's stands inside the area and covers at most half of it.
 * Each keeps 3 mm clear of every symbol, line, area and other label (BANA
 * 2022 8.5.3). A thing with no room for its name carries only its number,
 * and the key names it, so nothing is said to be wrong.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  labelPlan,
  channelLengthMm,
} from '../../src/js/tactile-map/map-labels.js';
import { buildLevelRings } from '../../src/js/tactile-map/levels-svg.js';
import { emptyPlan } from '../../src/js/tactile-map/plan.js';

const pt = (id, cls, at, extra = {}) => ({
  id,
  class: cls,
  kind: 'point',
  at,
  on: true,
  ...extra,
});
const area = (id, x0, y0, x1, y1, extra = {}) => ({
  id,
  class: 'area',
  kind: 'area',
  ring: [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
  on: true,
  ...extra,
});
/** The default tape, 12.7 mm, in a channel 0.4 mm wider. */
const ACROSS = 13.1;

describe('labelPlan, at a point', () => {
  it('gives a short name a channel beside its symbol, and a name over six cells only its number', () => {
    const plan = emptyPlan(300, 200);
    plan.features.push(
      pt('pine', 'landmark', [80, 100], { name: 'Pine', what: 'Cafe' }),
      pt('cafe', 'landmark', [200, 100], {
        name: 'Plaza Cafe',
        what: 'Restaurant',
      })
    );
    const { plan: labeled, labels, key, warnings } = labelPlan(plan);
    expect(warnings).toEqual([]);
    expect(labels.map((l) => [l.featureId, l.text, l.cells, l.number])).toEqual(
      [['pine', 'Pine', 5, 1]]
    );
    expect(labels[0].name).toBe('1 Cafe: Pine');
    expect(labels[0].inside).toBe(false);
    expect(key.numbers.map((n) => [n.number, n.featureId, n.name])).toEqual([
      [1, 'pine', 'Cafe: Pine'],
      [2, 'cafe', 'Restaurant: Plaza Cafe'],
    ]);
    const channels = labeled.features.filter((f) => f.kind === 'channel');
    expect(channels.map((c) => c.length)).toEqual([channelLengthMm(5)]);
    // The numbers travel on the plan's features.
    expect(labeled.features.find((f) => f.id === 'cafe').number).toBe(2);
    // The plan handed in is not changed.
    expect(plan.features.some((f) => f.kind === 'channel')).toBe(false);
    expect(plan.features.some((f) => 'number' in f)).toBe(false);
    // The levels builder finds every channel 3 mm clear.
    const built = buildLevelRings(labeled);
    expect(
      built.warnings.filter((w) => w.code === 'channel-too-close')
    ).toEqual([]);
  });

  it('takes the cells from the tape measure when the settings carry one: a measured name fits where the estimate would not, and the labels carry the braille and the grade', () => {
    const plan = emptyPlan(300, 200);
    plan.features.push(
      pt('pine', 'landmark', [80, 100], { name: 'Pine', what: 'Cafe' }),
      pt('cafe', 'landmark', [200, 100], {
        name: 'Plaza Cafe',
        what: 'Restaurant',
      })
    );
    // A stand-in measure: Plaza Cafe contracts to six cells, so its name
    // fits a label; Pine to three.
    const braille = { 'plaza cafe': '⠏⠇⠵⠁⠀⠉', pine: '⠏⠔⠑' };
    const tape = {
      grade: 'g2',
      measured: true,
      of: (text) => {
        const b = braille[String(text).trim().toLowerCase()];
        return b
          ? { cells: [...b].length, braille: b, measured: true, grade: 'g2' }
          : { cells: 99, braille: '', measured: false, grade: 'g2' };
      },
    };
    const { labels } = labelPlan(plan, { tape });
    const byId = Object.fromEntries(labels.map((l) => [l.featureId, l]));
    expect([byId.cafe.text, byId.cafe.cells, byId.cafe.braille]).toEqual([
      'Plaza Cafe',
      6,
      '⠏⠇⠵⠁⠀⠉',
    ]);
    expect([byId.pine.text, byId.pine.cells, byId.pine.braille]).toEqual([
      'Pine',
      3,
      '⠏⠔⠑',
    ]);
    expect(byId.pine.grade).toBe('g2');
    expect(byId.pine.measured).toBe(true);
  });

  it('leaves a short name with no room to its number, and says nothing is wrong', () => {
    const plan = emptyPlan(120, 90);
    // A named place boxed in by walls on every side, 6 mm out.
    const wall = (id, points) => ({
      id,
      class: 'wall',
      kind: 'line',
      points,
      on: true,
    });
    plan.features.push(
      pt('pine', 'landmark', [60, 45], { name: 'Pine', what: 'Cafe' }),
      wall('n', [
        [40, 34],
        [80, 34],
      ]),
      wall('s', [
        [40, 56],
        [80, 56],
      ]),
      wall('w', [
        [49, 30],
        [49, 60],
      ]),
      wall('e', [
        [71, 30],
        [71, 60],
      ])
    );
    const { labels, key, warnings } = labelPlan(plan);
    expect(labels).toEqual([]);
    expect(key.numbers.map((n) => [n.number, n.featureId])).toEqual([
      [1, 'pine'],
    ]);
    expect(warnings).toEqual([]);
  });

  it('leaves unnamed points, street furniture without a name and You are here unlabeled', () => {
    const plan = emptyPlan(300, 200);
    plan.features.push(
      pt('bench', 'furniture', [80, 100], { what: 'Bench' }),
      pt('stairs', 'stairs', [150, 100]),
      pt('you-are-here', 'you-are-here', [220, 100], { name: 'You are here' })
    );
    const { labels, key } = labelPlan(plan);
    expect(labels).toEqual([]);
    expect(key.numbers).toEqual([]);
  });
});

describe('labelPlan, on an area', () => {
  it("puts a name of any length inside the area, centered, 3 mm clear of its edges, when it covers at most half", () => {
    const plan = emptyPlan(300, 200);
    plan.features.push(area('hall', 40, 40, 240, 120, { name: 'Oceanography Building' }));
    const { plan: labeled, labels } = labelPlan(plan);
    expect(labels.map((l) => [l.featureId, l.text, l.inside])).toEqual([
      ['hall', 'Oceanography Building', true],
    ]);
    const [channel] = labeled.features.filter((f) => f.kind === 'channel');
    expect(channel.id).toBe('label-hall');
    expect(channel.at).toEqual([140, 80]);
    expect(channel.length).toBe(channelLengthMm(labels[0].cells));
    expect(channel.length).toBeGreaterThan(channelLengthMm(6));
    // The levels builder finds it 3 mm clear of its own area.
    expect(
      buildLevelRings(labeled).warnings.filter(
        (w) => w.code === 'channel-too-close'
      )
    ).toEqual([]);
  });

  it('refuses a channel that would cover more than half of the area, and one the area cannot hold 3 mm clear', () => {
    const cells = 'Pine'.length + 1;
    const length = channelLengthMm(cells);
    // Wide and tall enough to hold it clear, the channel over half of it:
    // 3 mm each way leaves the area at most twice the channel.
    const tight = emptyPlan(300, 200);
    tight.features.push(
      area('tight', 50, 50, 50 + length + 6.5, 50 + ACROSS + 6.5, {
        name: 'Pine',
      })
    );
    expect(labelPlan(tight).labels).toEqual([]);
    // Just over twice the channel: 52 x 20 mm holds it, 3 mm clear each way.
    const roomy = emptyPlan(300, 200);
    expect(52 * 20).toBeGreaterThan(2 * length * ACROSS);
    roomy.features.push(area('roomy', 50, 50, 102, 70, { name: 'Pine' }));
    expect(labelPlan(roomy).labels.map((l) => l.featureId)).toEqual(['roomy']);
    // Too narrow for the tape.
    const thin = emptyPlan(300, 200);
    thin.features.push(area('thin', 50, 50, 250, 60, { name: 'Pine' }));
    expect(labelPlan(thin).labels).toEqual([]);
  });

  it('moves off the centroid to clear what stands inside, and keeps out of a hole', () => {
    const plan = emptyPlan(300, 200);
    const hall = area('hall', 40, 40, 240, 160, { name: 'Pine' });
    plan.features.push(
      hall,
      pt('stairs', 'stairs', [140, 100])
    );
    const { plan: labeled } = labelPlan(plan);
    const channel = labeled.features.find((f) => f.id === 'label-hall');
    expect(channel).toBeTruthy();
    expect(channel.at).not.toEqual([140, 100]);
    const withHole = emptyPlan(300, 200);
    withHole.features.push(
      area('hall', 40, 40, 240, 160, {
        name: 'Pine',
        holes: [
          [
            [120, 80],
            [160, 80],
            [160, 120],
            [120, 120],
          ],
        ],
      })
    );
    const out = labelPlan(withHole).plan.features.find(
      (f) => f.id === 'label-hall'
    );
    expect(out).toBeTruthy();
    const [x, y] = out.at;
    const half = out.length / 2;
    const overlaps =
      x - half < 160 && x + half > 120 && y - ACROSS / 2 < 120 && y + ACROSS / 2 > 80;
    expect(overlaps).toBe(false);
  });

  it('is not stopped by a larger area the thing stands in', () => {
    const plan = emptyPlan(400, 300);
    plan.features.push(
      area('campus', 10, 10, 390, 290, { name: 'Campus' }),
      area('hall', 100, 100, 300, 200, { name: 'Pine' })
    );
    const { labels } = labelPlan(plan);
    expect(labels.map((l) => l.featureId)).toContain('hall');
  });

  it('gives the room to the lower numbers first', () => {
    const plan = emptyPlan(300, 200);
    plan.features.push(
      pt('destination', 'destination', [100, 100], {
        name: '3600 Ferry Pl',
        size: 4.9,
      }),
      // Two points that would both take the one clear spot between walls.
      pt('near', 'landmark', [120, 100], { name: 'Near' }),
      pt('far', 'landmark', [160, 100], { name: 'Far' })
    );
    const { labels } = labelPlan(plan);
    expect(labels[0].featureId).toBe('near');
    expect(labels[0].number).toBe(1);
  });
});
