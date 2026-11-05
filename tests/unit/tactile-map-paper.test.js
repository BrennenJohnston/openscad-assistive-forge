/**
 * The map paper: the print layer of a plate, every name in place, drawn
 * flat in the editor's colours for a sighted eye under the 3D preview.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { numberNamed } from '../../src/js/tactile-map/map-numbers.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sampleStationPlan } from '../../src/js/tactile-map/plan.js';
import { buildLevelRings } from '../../src/js/tactile-map/levels-svg.js';
import {
  PAPER_LETTER_MM,
  PAPER_TOKENS,
  mapPaperSvg,
  paperChannels,
  paperColors,
  paperTexts,
  paperWords,
  shiftTexts,
} from '../../src/js/tactile-map/map-paper.js';

const TOKENS = {
  '--color-bg-primary': '#101418',
  '--color-text-primary': '#f0f3f6',
  '--color-text-muted': '#9aa4ae',
  '--drawing-editor-base-tint': '#6b7580',
  '--drawing-editor-level-1': '#1f5fa8',
  '--drawing-editor-level-2': '#e07a1f',
  '--drawing-editor-level-3': '#a6c72b',
  '--color-accent': '#4cc2ff',
  'font-family': 'Liberation Sans, sans-serif',
};
const read = (name) => TOKENS[name] || '';

describe('the paper colours', () => {
  it('come from the tokens, one each, and the module carries no colour of its own', () => {
    const colors = paperColors(read);
    expect(colors).toEqual({
      ground: '#101418',
      ink: '#f0f3f6',
      faint: '#9aa4ae',
      base: '#6b7580',
      level1: '#1f5fa8',
      level2: '#e07a1f',
      level3: '#a6c72b',
      channel: '#4cc2ff',
      font: 'Liberation Sans, sans-serif',
    });
    expect(Object.values(PAPER_TOKENS).every((t) => t in TOKENS)).toBe(true);
    const source = readFileSync(
      join(process.cwd(), 'src', 'js', 'tactile-map', 'map-paper.js'),
      'utf8'
    );
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('fall back to currentColor and a plain sans when a token is missing', () => {
    const colors = paperColors(() => '');
    expect(colors.ground).toBe('currentColor');
    expect(colors.level2).toBe('currentColor');
    expect(colors.font).toBe('sans-serif');
  });
});

describe('the names', () => {
  const plan = sampleStationPlan();

  it('stand at every named feature: an area at its centroid, a line at its middle, a point at its place; an unnamed one has none', () => {
    const texts = paperTexts(plan);
    const byId = new Map(texts.map((t) => [t.featureId, t]));
    const area = plan.features.find((f) => f.name === 'the waiting area');
    const waiting = byId.get(area.id);
    expect(waiting.text).toMatch(/the waiting area/);
    const xs = area.ring.map((p) => p[0]);
    const ys = area.ring.map((p) => p[1]);
    expect(waiting.at[0]).toBeGreaterThan(Math.min(...xs));
    expect(waiting.at[0]).toBeLessThan(Math.max(...xs));
    expect(waiting.at[1]).toBeGreaterThan(Math.min(...ys));
    expect(waiting.at[1]).toBeLessThan(Math.max(...ys));
    const edge = plan.features.find((f) => f.name === 'the platform edge');
    const platform = byId.get(edge.id);
    expect(platform.text).toMatch(/the platform edge/);
    expect(platform.kind).toBe('line');
    expect(byId.has('stairs-1')).toBe(false);
    for (const t of texts) expect(t.text).not.toMatch(/ near /);
  });

  it('say a named thing with its number first, once the plan is numbered; a street stays as it is', () => {
    const numbered = numberNamed(plan);
    const byId = new Map(paperTexts(numbered).map((t) => [t.featureId, t]));
    const area = numbered.features.find((f) => f.name === 'the waiting area');
    expect(area.number).toBeGreaterThan(0);
    expect(byId.get(area.id).text).toMatch(
      new RegExp(`^${area.number} .*the waiting area`)
    );
    const edge = numbered.features.find((f) => f.name === 'the platform edge');
    expect(byId.get(edge.id).text).toMatch(/^the platform edge/);
  });

  it('move with a plate and stay only where they fall inside it', () => {
    const texts = [
      { featureId: 'a', text: 'A', at: [10, 20], kind: 'point' },
      { featureId: 'b', text: 'B', at: [300, 20], kind: 'point' },
    ];
    const moved = shiftTexts(texts, { x: 240, y: 0, w: 240, h: 180 });
    expect(moved).toEqual([
      { featureId: 'b', text: 'B', at: [60, 20], kind: 'point' },
    ]);
  });
});

describe('the paper of a plate', () => {
  const plan = sampleStationPlan();
  const { rings } = buildLevelRings(plan);
  const colors = paperColors(read);

  it('is drawn in millimetres with the levels in their colours, the names, and the channels with their text', () => {
    const svg = mapPaperSvg({
      rings,
      size: plan.size,
      texts: paperTexts(plan),
      channels: paperChannels(plan.features, 13.1, () => 'Pine'),
      colors,
    });
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="480mm" height="360mm" viewBox="0 0 480 360"/
    );
    expect(svg).toMatch(/font-family="Liberation Sans, sans-serif"/);
    expect(svg).toMatch(/<rect[^>]*width="480"[^>]*fill="#101418"/);
    expect(svg).toMatch(/<g id="paper-level1" fill="#1f5fa8"><path d="/);
    expect(svg).toMatch(/<g id="paper-level2" fill="#e07a1f"><path d="/);
    expect(svg).toMatch(/<g id="paper-level3" fill="#a6c72b"><path d="/);
    expect(svg).toMatch(/<g id="paper-names"[^>]*fill="#f0f3f6"/);
    expect(svg).toMatch(/<text[^>]*>[^<]*the waiting area<\/text>/);
    const channelRects = svg.match(/<g id="paper-channels">[^]*?<\/g>/)[0];
    expect(channelRects.match(/<rect /g)).toHaveLength(2);
    expect(channelRects.match(/>Pine<\/text>/g)).toHaveLength(2);
    expect(svg).toMatch(new RegExp(`font-size="${PAPER_LETTER_MM / 0.72}"`));
    expect(channelRects).not.toContain('stroke-dasharray');
  });

  it('draws a channel cut through the plate with a dashed edge', () => {
    const svg = mapPaperSvg({
      rings,
      size: plan.size,
      channels: paperChannels(plan.features, 13.1, () => 'Pine'),
      channelsThrough: true,
      colors,
    });
    const channelRects = svg.match(/<g id="paper-channels">[^]*?<\/g>/)[0];
    expect(channelRects.match(/<rect /g)).toHaveLength(2);
    expect(
      channelRects.match(/<rect [^>]*stroke-dasharray="2 1\.5"/g)
    ).toHaveLength(2);
    expect(channelRects.match(/>Pine<\/text>/g)).toHaveLength(2);
  });

  it('writes the title where the raised one stands, the plate name, the key words, and escapes a name', () => {
    const svg = mapPaperSvg({
      rings,
      size: { w: 240, h: 180 },
      texts: [
        { featureId: 'x', text: 'Café & <Bar>', at: [50, 50], kind: 'point' },
      ],
      words: paperWords('95:1000:160:0:KEY', 16, 180),
      title: 'Station',
      plateId: 'A1',
      colors,
    });
    expect(svg).toMatch(/Caf&#233; &amp; &lt;Bar&gt;/);
    expect(svg).toMatch(/<g id="paper-title"[^>]*><text x="9.525" y="25.525"/);
    expect(svg).toMatch(/>STATION<\/text>/);
    expect(svg).toMatch(/<g id="paper-plate"[^>]*><text[^>]*>A1<\/text>/);
    expect(svg).toMatch(
      /<g id="paper-words"[^>]*><text x="9.5" y="80"[^>]*>KEY<\/text>/
    );
  });
});
