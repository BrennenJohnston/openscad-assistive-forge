/**
 * The drawing editor's map purpose: every shape of a drawing gets a class
 * from the map's class table, in a menu on its row, so a hand-drawn line
 * map becomes a plan.
 *
 * What is pinned: the Class column stands where the role switches stood;
 * the class travels with the shape's ORIGINAL index, so a deleted row
 * never shifts a neighbor's class; a class change is a command Undo takes
 * back and names; Apply hands the host every surviving shape with its
 * class and its rings; the relief purpose is untouched.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/js/focus-trap.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createDocumentFocusTrap: vi.fn(() => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
    isActive: vi.fn(() => false),
  })),
}));
vi.mock('../../src/js/announcer.js', () => ({
  announce: vi.fn(),
  POLITENESS: { POLITE: 'polite', ASSERTIVE: 'assertive' },
}));
vi.mock('../../src/js/feature-flags.js', () => ({
  isEnabled: vi.fn(() => false),
}));

import { createDrawingEditor } from '../../src/js/drawing-editor/surface.js';
import { EDITOR_STRINGS as S } from '../../src/js/drawing-editor/strings.js';
import { analyzeSvg } from '../../src/js/svg-preparer.js';
import {
  MAP_CLASSES,
  MAP_CLASS_KEYS,
} from '../../src/js/tactile-map/map-classes.js';

/** Three circles in a row: enough rows to delete one and keep the rest. */
const THREE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' +
  '<circle cx="50" cy="50" r="10" fill="black"/>' +
  '<circle cx="90" cy="50" r="10" fill="black"/>' +
  '<circle cx="130" cy="50" r="10" fill="black"/>' +
  '</svg>';

let surface;
let announce;
let editor;
let onApply;

const rows = () => [...surface.querySelectorAll('.svg-prep-object')];
const selectOf = (i) => rows()[i].querySelector('.drawing-editor-class-select');
const choose = (i, value) => {
  const select = selectOf(i);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
};
const status = () =>
  surface.querySelector('.drawing-editor-status').textContent;
const applyButton = () => surface.querySelector('.drawing-editor-apply');

function openMap(extra = {}) {
  onApply = vi.fn();
  editor.open(THREE, analyzeSvg(THREE), {
    purpose: 'map',
    onApply,
    onKeepOriginal: vi.fn(),
    ...extra,
  });
}

beforeEach(() => {
  surface = document.createElement('div');
  surface.id = 'drawingEditorSurface';
  surface.hidden = true;
  document.body.appendChild(surface);
  announce = vi.fn();
  editor = createDrawingEditor({ surfaceEl: surface, announce });
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the class table', () => {
  it('lists the sixteen classes and Ignore last, each with a kind, a name and a source', () => {
    expect(MAP_CLASS_KEYS).toEqual([
      'wall',
      'curb',
      'walkway',
      'route',
      'crossing',
      'track',
      'steep',
      'area',
      'stairs',
      'elevator-up',
      'elevator-down',
      'entrance',
      'landmark',
      'you-are-here',
      'transit-stop',
      'text',
      'ignore',
    ]);
    for (const row of MAP_CLASSES) {
      expect(row.name).toBeTruthy();
      expect(['line', 'area', 'point', 'ignore']).toContain(row.kind);
      expect(row.source).toBeTruthy();
      if (row.kind === 'line') {
        expect(row.widthMm).toBeGreaterThan(0);
        expect([
          'solid',
          'dotted',
          'dashed',
          'double',
          'ticks',
          'chevrons',
        ]).toContain(row.style);
      }
      if (row.kind === 'point') expect(row.symbolKey).toBeTruthy();
    }
    expect(MAP_CLASSES.map((c) => c.name)).toEqual([
      'Wall',
      'Curb or edge',
      'Walkway',
      'Route',
      'Crossing',
      'Track',
      'Steep sidewalk',
      'Area',
      'Stairs',
      'Elevator up',
      'Elevator down',
      'Entrance',
      'Landmark',
      'You are here',
      'Transit stop',
      'Text',
      'Ignore',
    ]);
    // Drawn words are areas one symbol step above the floor they sit on:
    // the title's own raise with the defaults, the symbol level.
    const text = MAP_CLASSES.find((c) => c.key === 'text');
    expect(text.kind).toBe('area');
    expect(text.level).toBe(2);
  });
});

describe('the map purpose', () => {
  it('shows a Class menu on every row, headed Class, with no role switches, and starts at Ignore', () => {
    openMap();
    expect(surface.querySelector('.drawing-editor').dataset.purpose).toBe(
      'map'
    );
    expect(
      surface.querySelector('.drawing-editor-class-heading').textContent
    ).toBe(S.colClass);
    expect(surface.querySelector('.drawing-editor-class-heading').hidden).toBe(
      false
    );
    expect(rows()).toHaveLength(3);
    for (const row of rows()) {
      expect(row.querySelector('.svg-prep-role-group').hidden).toBe(true);
      const select = row.querySelector('.drawing-editor-class-select');
      expect(select).not.toBeNull();
      expect([...select.options].map((o) => o.value)).toEqual(MAP_CLASS_KEYS);
      expect(select.options[select.options.length - 1].textContent).toBe(
        'Ignore'
      );
      expect(select.value).toBe('ignore');
    }
    expect(selectOf(0).getAttribute('aria-label')).toBe(
      S.classFor('Circle 1 (r=10)')
    );
    // The stencil's furniture stays away, and the workspace's Apply (the
    // flatten) gives way to the map's own.
    expect(
      surface.querySelector('details[data-section="colours"]').hidden
    ).toBe(true);
    expect(surface.querySelector('.drawing-editor-regions').hidden).toBe(true);
    expect(surface.querySelector('.drawing-editor-shapes').hidden).toBe(false);
    expect(applyButton().hidden).toBe(false);
    expect(applyButton().textContent).toBe(S.applyClasses);
    expect(
      surface.querySelector('.svg-prep-footer [data-action="apply"]').hidden
    ).toBe(true);
    expect(editor.getMapClasses()).toEqual({});
  });

  // The picture: the region canvas, one region per shape, the relief panes
  // and tools away (the owner found the map purpose showing the relief
  // purpose's empty result pane).
  const regionPaths = () => [
    ...surface.querySelectorAll(
      '.drawing-editor-canvas-svg [data-layer="regions"] path'
    ),
  ];
  // A shape's region by its key: the canvas stacks the regions by level, so
  // their order on the page is not the drawing's.
  const regionAt = (i) =>
    surface.querySelector(
      `.drawing-editor-canvas-svg [data-layer="regions"] [data-region="${i}"]`
    );

  it('shows the drawing on the region canvas, one region per shape in order, with the relief panes and bulk tools hidden and the zoom buttons shown', async () => {
    openMap();
    const canvas = surface.querySelector('.drawing-editor-canvas');
    expect(canvas.hidden).toBe(false);
    expect(surface.querySelector('.svg-prep-previews').hidden).toBe(true);
    expect(surface.querySelector('.svg-prep-bulk-bar').hidden).toBe(true);
    expect(surface.querySelector('.drawing-editor-zoom').hidden).toBe(false);
    await vi.waitFor(() => expect(regionPaths()).toHaveLength(3));
    expect(regionPaths().map((p) => p.dataset.region)).toEqual(['0', '1', '2']);
    const svg = surface.querySelector('.drawing-editor-canvas-svg');
    expect(
      document.getElementById(svg.getAttribute('aria-labelledby')).textContent
    ).toBe(S.mapCanvasLabel);
    expect(
      document.getElementById(svg.getAttribute('aria-describedby')).textContent
    ).toBe(S.mapCanvasHelp);
  });

  it('tints a classed shape, names shapes under the arrow keys, and Enter on a shape focuses its Class menu', async () => {
    openMap();
    await vi.waitFor(() => expect(regionPaths()).toHaveLength(3));
    choose(0, 'wall');
    expect(regionAt(0).style.getPropertyValue('--region-fill')).not.toBe('');
    // A shape with no class yet is hatched, there and not on the map.
    expect(regionAt(1).dataset.look).toBe('off-area');
    const svg = surface.querySelector('.drawing-editor-canvas-svg');
    svg.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
    );
    expect(status()).toBe(S.mapHighlighting('Circle 1 (r=10)', 'Wall'));
    svg.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );
    expect(status()).toBe(S.mapHighlightingUnclassed('Circle 2 (r=10)'));
    svg.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    expect(document.activeElement).toBe(selectOf(1));
  });

  it("paints each class by its level in the charm customizer's layer colors, a line class as a line, a shape with no class hatched, and names the four looks in a legend", async () => {
    openMap();
    await vi.waitFor(() => expect(regionPaths()).toHaveLength(3));
    choose(0, 'wall');
    choose(1, 'area');
    const [a, b, c] = [0, 1, 2].map(regionAt);
    expect(a.dataset.look).toBe('level-3-line');
    expect(a.style.getPropertyValue('--region-fill')).toBe(
      'var(--drawing-editor-level-3)'
    );
    expect(b.dataset.look).toBe('level-1-area');
    expect(b.style.getPropertyValue('--region-fill')).toBe(
      'var(--drawing-editor-level-1)'
    );
    expect(c.dataset.look).toBe('off-area');
    choose(1, 'landmark');
    expect(b.dataset.look).toBe('level-2-area');
    expect(b.style.getPropertyValue('--region-fill')).toBe(
      'var(--drawing-editor-level-2)'
    );
    // Off on a row is the hatch again.
    choose(1, 'ignore');
    expect(b.dataset.look).toBe('off-area');

    const legend = surface.querySelector('.drawing-editor-map-legend');
    expect(legend.hidden).toBe(false);
    expect(legend.getAttribute('aria-label')).toBe(S.mapLegendLabel);
    expect(
      [...legend.querySelectorAll('li')].map((li) => [
        li.dataset.kind,
        li.textContent,
      ])
    ).toEqual([
      ['level-1', S.mapLegendFloor],
      ['level-2', S.mapLegendSymbol],
      ['level-3', S.mapLegendTop],
      ['off', S.mapLegendOff],
    ]);
    // The stencil's legend stays away.
    expect(surface.querySelector('.drawing-editor-legend').hidden).toBe(true);
  });

  it('offers the Select, Hand and Walk this tools and no paint tools; Hand pans the canvas, V comes back to Select', async () => {
    openMap();
    await vi.waitFor(() => expect(regionPaths()).toHaveLength(3));
    const tools = surface.querySelector('.drawing-editor-tools');
    expect(tools.hidden).toBe(false);
    expect(surface.querySelector('.drawing-editor-stencil-tools').hidden).toBe(
      false
    );
    expect(surface.querySelector('.drawing-editor-paint').hidden).toBe(true);
    const shown = [...tools.querySelectorAll('.drawing-editor-tool')]
      .filter((b) => !b.hidden)
      .map((b) => b.dataset.tool);
    expect(shown).toEqual(['select', 'hand', 'route']);
    const svg = surface.querySelector('.drawing-editor-canvas-svg');
    expect(svg.dataset.tool).toBe('select');
    tools.querySelector('[data-tool="hand"]').click();
    expect(svg.dataset.tool).toBe('hand');
    expect(
      tools.querySelector('[data-tool="hand"]').getAttribute('aria-pressed')
    ).toBe('true');
    svg.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'v', bubbles: true })
    );
    expect(svg.dataset.tool).toBe('select');
  });

  it('choosing Wall on a row and applying hands back that shape with class wall and its rings, and says the plan', async () => {
    openMap();
    choose(0, 'wall');
    expect(editor.getMapClasses()).toEqual({ 0: 'wall' });
    applyButton().click();
    await vi.waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const plan = onApply.mock.calls[0][0];
    expect(plan.regions).toHaveLength(3);
    expect(plan.regions.map((r) => [r.key, r.class])).toEqual([
      ['shape-0', 'wall'],
      ['shape-1', 'ignore'],
      ['shape-2', 'ignore'],
    ]);
    expect(plan.regions[0].name).toBe('Circle 1 (r=10)');
    expect(plan.regions[0].rings.length).toBeGreaterThanOrEqual(1);
    expect(plan.regions[0].rings[0].length).toBeGreaterThan(8);
    expect(plan.regions[0].rings[0][0]).toEqual(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
    );
    // Said by the host's announcer as the editor goes, under a source of its
    // own, so the preview's sentence on the close is said beside it rather
    // than in its place.
    expect(announce).toHaveBeenCalledWith(
      S.mapApplied(1, 2),
      expect.objectContaining({ source: 'drawing-editor' })
    );
    expect(S.mapApplied(1, 2)).toBe('Map plan updated: 1 feature, 2 ignored.');
    expect(S.mapApplied(2, 0)).toBe('Map plan updated: 2 features, 0 ignored.');
    expect(surface.hidden).toBe(true);
  });

  it('a class change is undoable: Undo puts Ignore back and says so, Redo says what came back', () => {
    openMap();
    choose(1, 'route');
    expect(selectOf(1).value).toBe('route');
    const undo = surface.querySelector(
      '.drawing-editor-history [data-action="undo"]'
    );
    expect(undo.disabled).toBe(false);
    undo.click();
    expect(selectOf(1).value).toBe('ignore');
    expect(editor.getMapClasses()).toEqual({});
    expect(status()).toBe(S.classReverted('Circle 2 (r=10)', 'Ignore'));
    expect(S.classReverted('Circle 2 (r=10)', 'Ignore')).toBe(
      'Class of Circle 2 (r=10) back to Ignore.'
    );
    surface
      .querySelector('.drawing-editor-history [data-action="redo"]')
      .click();
    expect(selectOf(1).value).toBe('route');
    expect(status()).toBe(
      S.redone(S.labelSetClass('Circle 2 (r=10)', 'Route'))
    );
  });

  it('Ctrl+Z inside the editor undoes a class and never reaches the page', () => {
    openMap();
    choose(2, 'area');
    const heardOutside = vi.fn();
    document.addEventListener('keydown', heardOutside);
    selectOf(2).dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    expect(selectOf(2).value).toBe('ignore');
    expect(heardOutside).not.toHaveBeenCalled();
    document.removeEventListener('keydown', heardOutside);
  });

  it('a deleted row shifts nothing: the classes travel with the original index', async () => {
    openMap();
    choose(1, 'route');
    choose(2, 'stairs');
    rows()[0].querySelector('[data-delete-index="0"]').click();
    await vi.waitFor(() => expect(rows()).toHaveLength(2));
    expect(selectOf(0).value).toBe('route');
    expect(selectOf(1).value).toBe('stairs');
    expect(editor.getMapClasses()).toEqual({ 1: 'route', 2: 'stairs' });
    applyButton().click();
    await vi.waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(
      onApply.mock.calls[0][0].regions.map((r) => [r.key, r.class])
    ).toEqual([
      ['shape-1', 'route'],
      ['shape-2', 'stairs'],
    ]);
  });

  it('a saved set of classes comes back onto the rows', () => {
    openMap({ initialClasses: { 2: 'entrance' } });
    expect(selectOf(2).value).toBe('entrance');
    expect(selectOf(0).value).toBe('ignore');
  });

  it('leaves the relief purpose as it was: role switches, no class menus', () => {
    openMap();
    editor.dismiss();
    editor.open(THREE, analyzeSvg(THREE), {
      purpose: 'relief',
      onApply: vi.fn(),
      onKeepOriginal: vi.fn(),
    });
    expect(surface.querySelector('.drawing-editor').dataset.purpose).toBe(
      'relief'
    );
    expect(
      surface.querySelectorAll('.drawing-editor-class-select')
    ).toHaveLength(0);
    expect(surface.querySelector('.drawing-editor-class-heading').hidden).toBe(
      true
    );
    for (const row of rows()) {
      expect(row.querySelector('.svg-prep-role-group').hidden).toBe(false);
    }
    expect(applyButton().hidden).toBe(true);
    expect(editor.getMapClasses()).toBeNull();
    expect(surface.querySelector('.drawing-editor-map-legend').hidden).toBe(
      true
    );
  });
});

describe('the route tool', () => {
  /** Three line features at the three rows: 0 meets 1, 2 stands apart. */
  const FEATURES = [
    {
      id: 'a',
      class: 'walkway',
      kind: 'line',
      points: [
        [0, 0],
        [10, 0],
      ],
      on: true,
    },
    {
      id: 'b',
      class: 'walkway',
      kind: 'line',
      points: [
        [20, 0],
        [10, 0],
      ],
      on: false,
    },
    {
      id: 'c',
      class: 'walkway',
      kind: 'line',
      points: [
        [40, 0],
        [50, 0],
      ],
      on: false,
    },
  ];
  const routeBtn = () =>
    surface.querySelector('.drawing-editor-tool[data-tool="route"]');
  const clearBtn = () => surface.querySelector('.drawing-editor-clear-route');
  const svgEl = () => surface.querySelector('.drawing-editor-canvas-svg');
  const key = (k) =>
    svgEl().dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true })
    );
  const undoButton = () =>
    surface.querySelector('.drawing-editor-history [data-action="undo"]');
  const regionPaths = () => [
    ...surface.querySelectorAll(
      '.drawing-editor-canvas-svg [data-layer="regions"] path'
    ),
  ];

  async function openDraft() {
    openMap({
      draft: true,
      initialClasses: { 0: 'walkway' },
      features: FEATURES,
      mmPerM: 0.5,
    });
    await vi.waitFor(() => expect(regionPaths()).toHaveLength(3));
  }

  it('offers Walk this and Clear route in the map purpose only, pressed when picked, with its help sentence', async () => {
    await openDraft();
    expect(routeBtn().hidden).toBe(false);
    expect(clearBtn().hidden).toBe(false);
    expect(routeBtn().textContent).toBe('Walk this');
    expect(clearBtn().textContent).toBe('Clear route');
    expect(routeBtn().getAttribute('aria-pressed')).toBe('false');
    routeBtn().click();
    expect(routeBtn().getAttribute('aria-pressed')).toBe('true');
    expect(svgEl().dataset.tool).toBe('route');
    expect(status()).toBe(
      'Click the sidewalks in the order you walk them. Each one joins the route.'
    );
    key('v');
    expect(routeBtn().getAttribute('aria-pressed')).toBe('false');
    key('w');
    expect(svgEl().dataset.tool).toBe('route');
    editor.close();
    editor.open(THREE, analyzeSvg(THREE), {
      purpose: 'relief',
      onApply: vi.fn(),
      onKeepOriginal: vi.fn(),
    });
    expect(routeBtn().hidden).toBe(true);
    expect(clearBtn().hidden).toBe(true);
  });

  it('picks two touching shapes onto the route, undoably, says the length, and refuses one that touches neither', async () => {
    await openDraft();
    routeBtn().click();
    key('Home');
    key('Enter');
    expect(selectOf(0).value).toBe('route');
    expect(status()).toBe('1 segments on the route, 20 m long.');
    key('ArrowRight');
    key('Enter');
    expect(selectOf(1).value).toBe('route');
    expect(status()).toBe('2 segments on the route, 40 m long.');
    key('ArrowRight');
    key('Enter');
    expect(selectOf(2).value).toBe('ignore');
    expect(status()).toBe(
      'That segment does not touch the route yet. Pick the one between them first.'
    );
    expect(undoButton().disabled).toBe(false);
    undoButton().click();
    expect(selectOf(1).value).toBe('ignore');
    expect(selectOf(0).value).toBe('route');
  });

  it('Clear route puts every picked shape back to its class and says so', async () => {
    await openDraft();
    routeBtn().click();
    key('Home');
    key('Enter');
    key('ArrowRight');
    key('Enter');
    clearBtn().click();
    expect(selectOf(0).value).toBe('walkway');
    expect(selectOf(1).value).toBe('ignore');
    expect(status()).toBe('Route cleared.');
  });

  it('only classes a shape of a plain drawing, which has no points', async () => {
    openMap();
    await vi.waitFor(() => expect(regionPaths()).toHaveLength(3));
    routeBtn().click();
    key('Home');
    key('Enter');
    expect(selectOf(0).value).toBe('route');
    expect(status()).toBe('1 segments on the route, 0 m long.');
  });
});
