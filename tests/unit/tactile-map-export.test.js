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
  coneRows,
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

  it("writes each plate's cone rows in tenths of a millimeter from its bottom left, y up; a cone on a seam goes to the plate holding its center", () => {
    const { rings } = buildLevelRings(sampleStationPlan());
    const cones = [
      [100, 50],
      [300, 200],
      [240, 180],
    ];
    const sets = plateParameterSets({
      rings,
      cones,
      layout,
      idStyle: 'notches',
      northCue: 'Arrow with N',
      config: { ...CONFIG, coneMarksParam: 'cone_marks' },
      parameters: {},
    });
    expect(sets.map((s) => [s.id, s.parameters.cone_marks])).toEqual([
      ['A1', '1000:1300'],
      ['A2', ''],
      ['B1', ''],
      ['B2', '600:1600|0:1800'],
    ]);
    expect(coneRows(cones, { x: 0, y: 0, w: 480, h: 360 })).toBe(
      '1000:3100|3000:1600|2400:1800'
    );
    expect(coneRows([], { x: 0, y: 0, w: 480, h: 360 })).toBe('');
    // A model without the parameter gets no row.
    const plain = plateParameterSets({
      rings,
      cones,
      layout,
      idStyle: 'notches',
      northCue: 'None',
      config: CONFIG,
      parameters: {},
    });
    expect('cone_marks' in plain[0].parameters).toBe(false);
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

describe('the README says what the map is', () => {
  const base = {
    mapName: 'Map',
    bedName: x1c.name,
    layout,
    size: { w: 480, h: 360 },
    heights: { base: 0.4, tops: [1, 1.8, 2.4] },
    tapeWidthMm: 12.7,
  };

  it('opens a place map with its place and scale and closes with the map data credit', () => {
    const readme = readmeText({
      ...base,
      about: {
        type: 'place',
        place: 'Bill & Melinda Gates Center',
        ratio: 500,
      },
    });
    const lines = readme.trimEnd().split('\n');
    expect(lines[0]).toBe(
      'A place map of Bill & Melinda Gates Center at 1:500.'
    );
    expect(lines[1]).toMatch(/^Map: 4 plates for a /);
    expect(lines[lines.length - 1]).toBe(
      'Map data from OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright'
    );
  });

  it('opens a route map with its walk, says the journey by bus and train, and credits Transitous too', () => {
    const readme = readmeText({
      ...base,
      about: {
        type: 'route',
        from: 'Husky Union Building',
        to: 'East Stevens Way NE & Benton Ln',
        lengthM: 60,
        journey:
          '22 min, 1 change: the 72 to Stevens Way & Rainier Vista NE, then the 2 Line to Symphony.',
      },
    });
    const lines = readme.trimEnd().split('\n');
    expect(lines[0]).toBe(
      'A route map of a 60 m walk from Husky Union Building to East Stevens Way NE & Benton Ln. The walk is part of a journey by bus and train: 22 min, 1 change: the 72 to Stevens Way & Rainier Vista NE, then the 2 Line to Symphony.'
    );
    expect(lines.slice(-2)).toEqual([
      'Map data from OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright',
      'Routes from Transitous, on OpenStreetMap data: https://transitous.org/sources',
    ]);
  });

  it('opens a map from a drawing plainly, with no map data credit', () => {
    const readme = readmeText({ ...base, about: { type: 'drawing' } });
    expect(readme.split('\n')[0]).toBe('A map from a drawing.');
    expect(readme).not.toMatch(/OpenStreetMap/);
  });

  it("credits a published symbol set's authors last, when the map uses one", () => {
    const readme = readmeText({
      ...base,
      about: {
        type: 'place',
        place: 'Central Library',
        ratio: 1000,
        symbolsCredit:
          'Symbols: Lobben and Lawrence 2012, University of Oregon, GPL-3',
      },
    });
    expect(readme.trim().split('\n').slice(-2)).toEqual([
      'Map data from OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright',
      'Symbols: Lobben and Lawrence 2012, University of Oregon, GPL-3',
    ]);
  });

  it('names the key plates and lists each one’s label tape, top to bottom', () => {
    const readme = readmeText({
      ...base,
      about: { type: 'drawing' },
      keyIds: ['key-1', 'key-2'],
      keyText: 'Key\n\nSymbols, You are here first:\n- You are here: a disc\n',
      keyTape: [
        { id: 'key-1', texts: ['key: station', 'you are here'] },
        { id: 'key-2', texts: ['pc restaurant: plaza cafe'] },
      ],
    });
    expect(readme).toMatch(
      /The key prints on its own plates, key-1, key-2, to read before the map\.\n/
    );
    expect(readme.trimEnd().split('\n').slice(-7)).toEqual([
      '- You are here: a disc',
      '',
      'Key 1 plate, label tape top to bottom:',
      '- key: station',
      '- you are here',
      'Key 2 plate, label tape top to bottom:',
      '- pc restaurant: plaza cafe',
    ]);
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

  it('carries the PDF before the README, which names it first', () => {
    const readme = readmeText({
      mapName: 'Station',
      bedName: x1c.name,
      layout,
      size: { w: 480, h: 360 },
      heights: { base: 0.4, tops: [1, 1.8, 2.4] },
      tapeWidthMm: 12.7,
      pdfName: 'map_print.pdf',
    });
    expect(readme).toMatch(
      /^map_print\.pdf shows where each label goes, with its text, for assembly and labeling\.\n/
    );
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const entries = archiveEntries({
      stem: 'm',
      extension: '.stl',
      rendered: [],
      sets: [],
      plan: {},
      readme,
      grid: '<svg/>',
      pdf,
    });
    expect(entries.map((e) => e.name)).toEqual([
      'map_plan.json',
      'plate_grid.svg',
      'map_print.pdf',
      'README.txt',
    ]);
    expect(entries[2].data).toBe(pdf);
  });
});
