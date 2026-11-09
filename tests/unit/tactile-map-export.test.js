/**
 * The plate export's pure parts: which plate carries the title and the
 * north cue, the parameter set each plate renders with, the picture of the
 * plate grid, and the archive with its README.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import {
  EMPTY_RINGS,
  ENGINE_ESTIMATE_SENTENCE,
  archiveEntries,
  coneRows,
  plateGridSvg,
  plateParameterSets,
  plateRoles,
  readmeText,
  tapeSentence,
  titlePlateSets,
} from '../../src/js/tactile-map/plate-export.js';
import {
  BED_PRESETS,
  planPlates,
} from '../../src/js/tactile-map/plate-tiling.js';
import { buildLevelRings } from '../../src/js/tactile-map/levels-svg.js';
import { sampleStationPlan } from '../../src/js/tactile-map/plan.js';
import { sheetOf, titleRows } from '../../src/js/tactile-map/sheet.js';

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

  // STATION on one 16 mm line is a 41 mm band (16 x 1.35 and 9.525 clear
  // above and below, rounded up). On a 480 x 360 face the 500 x 421 sheet
  // still cuts into two rows, so the band rides in row A: its row goes to
  // A1 and, starting 240 mm left of its edge, to A2; the model's own title
  // stays off every plate.
  it("writes the title band's rows to the plates of the top row that its letters reach, and turns the model's title off", () => {
    const { rings } = buildLevelRings(sampleStationPlan());
    const sheet = sheetOf({ face: { w: 480, h: 360 }, title: 'Station' });
    const rows = titleRows(sheet, 16);
    const banded = planPlates({
      w: sheet.w,
      h: sheet.h,
      bed: x1c,
      titleBandMm: sheet.titleBand.h,
    });
    expect(banded.titlePlates).toEqual([]);
    const sets = plateParameterSets({
      rings,
      rows,
      sheetH: sheet.h,
      titleInside: false,
      layout: banded,
      idStyle: 'notches',
      northCue: 'Arrow with N',
      config: { ...CONFIG, raisedWordsParam: 'raised_words' },
      parameters: {},
    });
    expect(
      sets.map((s) => [
        s.id,
        s.parameters.raised_words,
        s.parameters.plate_shows_title,
      ])
    ).toEqual([
      ['A1', '100:1750:160:0:STATION', 'no'],
      // STATION ends at 132 mm, before A2: A2 carries none of it.
      ['A2', '', 'no'],
      ['B1', '', 'no'],
      ['B2', '', 'no'],
    ]);
  });
});

describe('titlePlateSets', () => {
  // A 480 x 480 face: two rows of plates alone, three with the band, so
  // the band takes a row of its own above A, 75 mm tall (the model's
  // smallest plate), the title's row on it and on no map plate.
  it('gives each title plate an empty levels file of its size, the rows it holds, no cone and neither flag', () => {
    const sheet = sheetOf({ face: { w: 480, h: 480 }, title: 'Station' });
    const rows = titleRows(sheet, 16);
    const split = planPlates({
      w: sheet.w,
      h: sheet.h,
      bed: x1c,
      titleBandMm: sheet.titleBand.h,
    });
    expect(split.titlePlates.map((p) => [p.id, p.w, p.h])).toEqual([
      ['title-1', 250, 75],
      ['title-2', 250, 75],
    ]);
    const config = {
      ...CONFIG,
      raisedWordsParam: 'raised_words',
      coneMarksParam: 'cone_marks',
    };
    const titles = titlePlateSets({
      titlePlates: split.titlePlates,
      rows,
      sheetH: sheet.h,
      config,
      parameters: { title_text: 'Station' },
    });
    // STATION ends at 132 mm: the second plate has no letters, and says so.
    expect(titles.map((t) => [t.id, t.parameters.raised_words])).toEqual([
      ['title-1', '100:395:160:0:STATION'],
      ['title-2', ''],
    ]);
    expect(titles.map((t) => t.blank)).toEqual([false, true]);
    const first = titles[0];
    expect(first.size).toEqual({ w: 250, h: 75 });
    expect(first.fileName).toBe('levels_title-1.svg');
    expect(first.svg).toMatch(/viewBox="0 0 250 75"/);
    expect(first.parameters.map_width_mm).toBe(250);
    expect(first.parameters.map_height_mm).toBe(75);
    expect(first.parameters.cone_marks).toBe('');
    expect(first.parameters.plate_shows_title).toBe('no');
    expect(first.parameters.plate_shows_north).toBe('no');
    expect(first.parameters.plate_id).toBe('');
    expect(first.parameters.title_text).toBe('Station');
    expect(first.roles).toEqual({ title: false, north: false });
    expect(EMPTY_RINGS()).toEqual({
      level1: [],
      level2: [],
      level3: [],
      here: [],
      channels: [],
      cutouts: [],
      leads: [],
    });
    // The map plates below hold none of the title.
    const { rings } = buildLevelRings(sampleStationPlan());
    const maps = plateParameterSets({
      rings,
      rows,
      sheetH: sheet.h,
      titleInside: false,
      layout: split,
      idStyle: 'notches',
      northCue: 'None',
      config,
      parameters: {},
    });
    expect(maps.every((s) => s.parameters.raised_words === '')).toBe(true);
    expect(maps[0].parameters.map_height_mm).toBe(250);
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

  it('draws the label channels dashed in blue whether they are a recess or cut through', () => {
    const plan = sampleStationPlan();
    const drawn = (settings) =>
      plateGridSvg({
        rings: buildLevelRings(plan, settings).rings,
        layout,
        size: { w: 480, h: 360 },
        bedName: x1c.name,
      }).match(/<path [^>]*stroke-dasharray="4 3"\/>/g);
    expect(drawn({})).toHaveLength(1);
    expect(drawn({ channelsThrough: true })).toEqual(drawn({}));
  });

  it('draws the title plates above row A with their names, and says so in the caption', () => {
    const split = planPlates({
      w: 500,
      h: 540.65,
      bed: x1c,
      titleBandMm: 40.65,
    });
    const svg = plateGridSvg({
      rings: EMPTY_RINGS(),
      layout: split,
      size: { w: 500, h: 540.65 },
      bedName: x1c.name,
    });
    expect(svg.match(/<rect [^>]*stroke="#c81e1e"/g)).toHaveLength(6);
    expect(svg).toContain('>Title 1</text>');
    expect(svg).toContain('>Title 2</text>');
    expect(svg).toContain(
      '2 x 2 plates of 250 x 250 mm, and 2 title plates of 250 x 75 mm above'
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

  it('says the labels’ tape in one sentence: the grade, the labels, the cells, the length, and what the other grade would need', () => {
    const measured = {
      grade: 'g2',
      labels: 7,
      cells: 23,
      lengthMm: 198.6,
      measured: true,
      tapeWidthMm: 12.7,
      otherLabels: 5,
      otherLengthMm: 241.2,
    };
    expect(tapeSentence(measured)).toBe(
      'Label tape: contracted braille (UEB Grade 2). 7 labels, 23 cells, about 199 mm of 12.7 mm tape; uncontracted would take 5 labels, about 241 mm.'
    );
    expect(
      tapeSentence({
        ...measured,
        grade: 'g1',
        otherLabels: 1,
        otherLengthMm: 160,
      })
    ).toBe(
      'Label tape: uncontracted braille (Grade 1). 7 labels, 23 cells, about 199 mm of 12.7 mm tape; contracted would take 1 label, about 160 mm.'
    );
    // A grade in which no name fits its channel takes no tape at all.
    expect(
      tapeSentence({ ...measured, otherLabels: 0, otherLengthMm: 0 })
    ).toBe(
      'Label tape: contracted braille (UEB Grade 2). 7 labels, 23 cells, about 199 mm of 12.7 mm tape; uncontracted would take no labels.'
    );
    expect(
      tapeSentence({ ...measured, labels: 1, cells: 1, otherLengthMm: null })
    ).toBe(
      'Label tape: contracted braille (UEB Grade 2). 1 label, 1 cell, about 199 mm of 12.7 mm tape.'
    );
    expect(tapeSentence({ ...measured, measured: false })).toMatch(
      /^Label tape: contracted braille \(UEB Grade 2\), sized by an estimate\. 7 labels/
    );
    expect(tapeSentence({ ...measured, labels: 0 })).toBe(
      'Label tape: contracted braille (UEB Grade 2). No labels on the map.'
    );
    const readme = readmeText({
      ...base,
      about: { type: 'drawing' },
      tape: { ...measured, measured: false, failed: true },
    });
    expect(readme).toContain(
      'Label channels take 12.7 mm tape, a recess with a floor under the tape so it sits nearly flush. Label tape: contracted braille (UEB Grade 2), sized by an estimate. 7 labels, 23 cells, about 199 mm of 12.7 mm tape; uncontracted would take 5 labels, about 241 mm. The braille engine did not load; the channels are sized by an estimate. The picture'
    );
    expect(ENGINE_ESTIMATE_SENTENCE).toBe(
      'The braille engine did not load; the channels are sized by an estimate.'
    );
  });

  it('says the channels are a recess with a floor, or cut through for the backing board', () => {
    const drawing = { ...base, about: { type: 'drawing' } };
    expect(readmeText(drawing)).toContain(
      'Label channels take 12.7 mm tape, a recess with a floor under the tape so it sits nearly flush. The picture'
    );
    expect(readmeText({ ...drawing, channelsThrough: true })).toContain(
      'Label channels take 12.7 mm tape, cut right through the plate so the tape lies on the backing board. The picture'
    );
    expect(readmeText({ ...drawing, tapeWidthMm: 9.5 })).toContain(
      'Label channels take 9.5 mm tape, a recess'
    );
  });

  it('says the plates are trimmed to the shapes, with the margin, when the trim is on', () => {
    const readme = readmeText({
      ...base,
      about: { type: 'drawing' },
      trimMm: 10,
    });
    expect(readme).toContain(
      'each 240 x 180 mm, trimmed to the shapes with a 10 mm margin. Print one of each'
    );
    expect(readmeText({ ...base, about: { type: 'drawing' } })).not.toContain(
      'trimmed'
    );
    expect(
      readmeText({
        ...base,
        about: { type: 'drawing' },
        trimMm: 10,
        numbersInMargin: true,
      })
    ).toContain(
      'trimmed to the shapes with a 10 mm margin, wider at the sides that hold numbers. Print one of each'
    );
  });

  it('says where the title plates go when the title has plates of its own', () => {
    const split = planPlates({
      w: 500,
      h: 540.65,
      bed: x1c,
      titleBandMm: 40.65,
    });
    const readme = readmeText({
      ...base,
      layout: split,
      size: { w: 500, h: 540.65 },
      about: { type: 'drawing' },
    });
    expect(readme).toContain(
      'Print one of each: A1, A2, B1, B2. The title prints on 2 plates of its own, Title 1, Title 2, 250 x 75 mm, above row A. Lay them out'
    );
    expect(readme).toContain('backing board of 500 x 540.65 mm');
    expect(readme).not.toContain('no letters');
    const blank = readmeText({
      ...base,
      layout: split,
      size: { w: 500, h: 540.65 },
      about: { type: 'drawing' },
      blankTitles: ['title-2'],
    });
    expect(blank).toContain(
      'above row A. Title 2 carries no letters: print it to keep the band level, or leave it off. Lay them out'
    );
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
      /Label channels take 12\.7 mm tape, a recess with a floor under the tape so it sits nearly flush\. The picture plate_grid\.svg shows the layout\.\n$/
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
