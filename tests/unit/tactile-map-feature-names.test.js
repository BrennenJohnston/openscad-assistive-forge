/**
 * What a map's features are called in the editor's rows and in the
 * warnings: a feature's own name, else its class near the nearest named
 * feature, else its class; repeats numbered so every row reads apart.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import { featureNames } from '../../src/js/tactile-map/feature-names.js';
import { drawingFromPlan } from '../../src/js/tactile-map/plan-drawing.js';
import { buildLevelRings } from '../../src/js/tactile-map/levels-svg.js';
import { describeElement } from '../../src/js/svg-preparer-workspace.js';

const PLAN = {
  size: { w: 200, h: 100 },
  origin: [0, 0],
  meta: {},
  features: [
    {
      id: 'osm-way-1',
      class: 'area',
      kind: 'area',
      name: 'Husky Union Building',
      ring: [
        [10, 10],
        [60, 10],
        [60, 40],
        [10, 40],
      ],
      on: true,
    },
    {
      id: 'osm-way-2-left',
      class: 'curb',
      kind: 'line',
      name: 'East Stevens Way Northeast',
      points: [
        [10, 80],
        [190, 80],
      ],
      on: true,
    },
    {
      id: 'osm-way-2-right',
      class: 'curb',
      kind: 'line',
      name: 'East Stevens Way Northeast',
      points: [
        [10, 90],
        [190, 90],
      ],
      on: true,
    },
    {
      id: 'osm-way-3-stairs',
      class: 'stairs',
      kind: 'point',
      at: [62, 30],
      on: true,
    },
    {
      id: 'you-are-here',
      class: 'you-are-here',
      kind: 'point',
      name: 'You are here',
      at: [62, 30.5],
      on: true,
    },
  ],
};

describe('feature names', () => {
  it('names a feature by its own name, numbers repeats, and an unnamed one by its class near the nearest named feature', () => {
    expect(featureNames(PLAN.features)).toEqual([
      'Husky Union Building',
      'East Stevens Way Northeast',
      'East Stevens Way Northeast (2)',
      'Stairs near Husky Union Building',
      'You are here',
    ]);
  });

  it('names an unnamed feature by its class alone when nothing named is on the map', () => {
    expect(
      featureNames([
        { id: 'a', class: 'stairs', kind: 'point', at: [0, 0], on: true },
        { id: 'b', class: 'stairs', kind: 'point', at: [9, 9], on: true },
      ])
    ).toEqual(['Stairs', 'Stairs (2)']);
  });

  it('writes each name onto its path in the drawing the editor opens', () => {
    const svg = drawingFromPlan(PLAN);
    expect(svg).toContain('data-name="Husky Union Building"');
    expect(svg).toContain('data-name="East Stevens Way Northeast (2)"');
    expect(svg).toContain('data-name="Stairs near Husky Union Building"');
  });

  it("gives a row its shape's name when the drawing names it, and the shape's kind and number otherwise", () => {
    const doc = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" data-name="Husky Union Building"/><path d="M0 0"/></svg>',
      'image/svg+xml'
    );
    const [named, plain] = doc.querySelectorAll('path');
    expect(describeElement(named, 0)).toBe('Husky Union Building');
    expect(describeElement(plain, 1)).toBe('Path 2');
  });

  it('names features in the warnings the same way, never by an OpenStreetMap code', () => {
    const { warnings } = buildLevelRings(PLAN);
    const close = warnings.find((w) => w.code === 'too-close');
    expect(close.text).toBe(
      'Stairs near Husky Union Building and You are here are 0 mm apart, closer than the 3 mm minimum. Move one or turn one off.'
    );
    for (const w of warnings) expect(w.text).not.toMatch(/osm-(way|node)-/);
  });
});
