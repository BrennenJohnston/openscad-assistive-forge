/**
 * Labels on the map: a recess for braille label tape beside each named
 * place that is on, its full name where the name fits a label and its
 * 2-cell key otherwise (BANA 2022 8.5.10), 3 mm clear of every symbol,
 * line, area and other label (BANA 2022 8.5.3); where nothing fits, the
 * place is in the key and a warning says so.
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

describe('labelPlan', () => {
  it('gives a short name its own label and a long one a 2-cell label with its key', () => {
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
    const byId = Object.fromEntries(labels.map((l) => [l.featureId, l]));
    expect([byId.pine.text, byId.pine.cells]).toEqual(['Pine', 5]);
    expect([byId.cafe.text, byId.cafe.cells]).toEqual(['pc', 2]);
    expect(key.abbreviations.map((a) => a.key)).toEqual(['pc']);
    const channels = labeled.features.filter((f) => f.kind === 'channel');
    expect(channels).toHaveLength(2);
    expect(channels.map((c) => c.length).sort((a, b) => a - b)).toEqual([
      channelLengthMm(2),
      channelLengthMm(5),
    ]);
    // The plan handed in is not changed.
    expect(plan.features.some((f) => f.kind === 'channel')).toBe(false);
    // The levels builder finds every channel 3 mm clear.
    const built = buildLevelRings(labeled);
    expect(
      built.warnings.filter((w) => w.code === 'channel-too-close')
    ).toEqual([]);
  });

  it('says a place whose label has no room is in the key, and keys it even when its name is short', () => {
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
    expect(key.abbreviations.map((a) => [a.key, a.featureId])).toEqual([
      ['pi', 'pine'],
    ]);
    expect(warnings.map((w) => w.text)).toEqual([
      "No room for Cafe: Pine's label; it is in the key as pi.",
    ]);
    expect(warnings[0].code).toBe('no-room-for-label');
  });

  it('leaves unnamed points, street furniture without a name and You are here unlabeled', () => {
    const plan = emptyPlan(300, 200);
    plan.features.push(
      pt('bench', 'furniture', [80, 100], { what: 'Bench' }),
      pt('stairs', 'stairs', [150, 100]),
      pt('you-are-here', 'you-are-here', [220, 100], { name: 'You are here' })
    );
    expect(labelPlan(plan).labels).toEqual([]);
  });
});
