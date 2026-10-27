/**
 * The plate export's pure parts: which plate carries the title and the
 * north cue, the parameter set each plate renders with, the picture of the
 * plate grid, and the archive with its README.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  archiveEntries,
  plateGridSvg,
  plateParameterSets,
  plateRoles,
  readmeText,
} from '../../src/js/tactile-map/plate-export.js';
import {
  BED_PRESETS,
  planPlates,
} from '../../src/js/tactile-map/plate-tiling.js';
import { buildLevelRings } from '../../src/js/tactile-map/levels-svg.js';
import { sampleStationPlan } from '../../src/js/tactile-map/plan.js';

const x1c = BED_PRESETS.find((b) => b.key === 'x1c');
const layout = planPlates({ w: 480, h: 360, bed: x1c });
const CONFIG = {
  mapFileParam: 'map_file',
  widthParam: 'map_width_mm',
  heightParam: 'map_height_mm',
  plateIdParam: 'plate_id',
  plateShowsTitleParam: 'plate_shows_title',
  plateShowsNorthParam: 'plate_shows_north',
};
const roles = (cue) =>
  Object.fromEntries(
    layout.plates.map((p) => [p.id, plateRoles(p, layout, cue)])
  );

describe('plateRoles', () => {
  it('puts the title on the top-left plate and the arrow on the top-right plate, once each', () => {
    expect(roles('Arrow with N')).toEqual({
      A1: { title: true, north: false },
      A2: { title: false, north: true },
      B1: { title: false, north: false },
      B2: { title: false, north: false },
    });
  });

  it('runs a north line along the whole top row, and draws no cue for None', () => {
    expect(roles('North line')).toEqual({
      A1: { title: true, north: true },
      A2: { title: false, north: true },
      B1: { title: false, north: false },
      B2: { title: false, north: false },
    });
    expect(Object.values(roles('None')).every((r) => r.north === false)).toBe(
      true
    );
    expect(roles('None').A1.title).toBe(true);
  });

  it('gives a one-plate map both', () => {
    const one = planPlates({ w: 200, h: 150, bed: x1c });
    expect(plateRoles(one.plates[0], one, 'Arrow with N')).toEqual({
      title: true,
      north: true,
    });
  });
});

describe('plateParameterSets', () => {
  it('writes the two flags per plate as yes or no, with the notches in the cutouts group', () => {
    const { rings } = buildLevelRings(sampleStationPlan());
    const sets = plateParameterSets({
      rings,
      layout,
      idStyle: 'notches',
      northCue: 'Arrow with N',
      config: CONFIG,
      parameters: { title_text: 'Station' },
    });
    expect(
      sets.map((s) => [
        s.id,
        s.parameters.plate_shows_title,
        s.parameters.plate_shows_north,
      ])
    ).toEqual([
      ['A1', 'yes', 'no'],
      ['A2', 'no', 'yes'],
      ['B1', 'no', 'no'],
      ['B2', 'no', 'no'],
    ]);
    expect(sets[0].parameters.plate_id).toBe('');
    expect(sets[0].parameters.title_text).toBe('Station');
    expect(sets[0].svg).toMatch(/<g id="cutouts"><path /);
  });
});

describe('plateGridSvg', () => {
  it('draws the map with a red rectangle and a name per plate, and a caption', () => {
    const { rings } = buildLevelRings(sampleStationPlan());
    const svg = plateGridSvg({
      rings,
      layout,
      size: { w: 480, h: 360 },
      bedName: x1c.name,
    });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg.match(/<rect [^>]*stroke="#c81e1e"/g)).toHaveLength(4);
    for (const id of ['A1', 'A2', 'B1', 'B2']) {
      expect(svg).toContain(`>${id}</text>`);
    }
    expect(svg).toContain(
      'Bambu Lab X1C, P1S or P1P (256 x 256 mm): 2 x 2 plates of 240 x 180 mm'
    );
  });
});

describe('the archive and its README', () => {
  it('puts plate_grid.svg before the README, which points at it', () => {
    const readme = readmeText({
      mapName: 'Station',
      bedName: x1c.name,
      layout,
      size: { w: 480, h: 360 },
      heights: { base: 0.4, tops: [1, 1.8, 2.4] },
      tapeWidthMm: 12.7,
    });
    expect(readme).toMatch(
      /Label channels take 12\.7 mm tape\. The picture plate_grid\.svg shows the layout\.\n$/
    );
    const entries = archiveEntries({
      stem: 'm',
      extension: '.stl',
      rendered: [],
      sets: [],
      plan: {},
      readme,
      grid: '<svg/>',
    });
    expect(entries.map((e) => e.name)).toEqual([
      'map_plan.json',
      'plate_grid.svg',
      'README.txt',
    ]);
  });
});
