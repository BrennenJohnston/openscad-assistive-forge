import { describe, it, expect, beforeEach } from 'vitest';
import {
  ClassicDockModel,
  DOCK_FIELD_NAMES,
  DOCK_PANEL_IDS,
  MOVE_REJECTED,
  defaultArrangement,
  elementIdFor,
  panelLabel,
  validateArrangement,
} from '../../src/js/classic-dock-model.js';

/** Every panel in the map exactly once, no empty groups. */
function assertIntegrity(model) {
  const map = model.getArrangement();
  expect(Object.keys(map).sort()).toEqual([...DOCK_FIELD_NAMES].sort());

  const seen = [];
  for (const field of DOCK_FIELD_NAMES) {
    for (const group of map[field]) {
      expect(group.length).toBeGreaterThan(0);
      seen.push(...group);
    }
  }
  expect(seen.slice().sort()).toEqual([...DOCK_PANEL_IDS].sort());
}

describe('ClassicDockModel — default arrangement (B6)', () => {
  it('reproduces the desktop screenshots: editor left, customizer and viewport-control right, four panes in the strip', () => {
    const model = new ClassicDockModel();

    expect(model.getArrangement()).toEqual({
      left: [['editor']],
      'right-top': [['customizer']],
      'right-bottom': [['viewportControl']],
      bottom: [['console'], ['errorLog'], ['animate'], ['fontList']],
    });
    assertIntegrity(model);
  });

  it('keeps the bottom strip side by side rather than tabbed', () => {
    const model = new ClassicDockModel();

    // Four separate groups, not one group of four: B7 only draws tabs for a
    // group with more than one member, so the default strip stays as shot 1.
    expect(model.getArrangement().bottom).toHaveLength(4);
    expect(model.getGroupOf('console')).toEqual(['console']);
  });

  it('hands out copies, so callers cannot mutate the map behind movePanel', () => {
    const model = new ClassicDockModel();

    const map = model.getArrangement();
    map.left[0].push('console');
    map.bottom.length = 0;

    expect(model.getArrangement().left).toEqual([['editor']]);
    expect(model.getArrangement().bottom).toHaveLength(4);
  });

  it('names every panel with its upstream dock title and its moving element', () => {
    expect(panelLabel('errorLog')).toBe('Error-Log');
    expect(panelLabel('viewportControl')).toBe('Viewport-Control');
    expect(elementIdFor('customizer')).toBe('paramPanel');
    expect(elementIdFor('console')).toBe('classicConsoleSlot');
  });
});

describe('ClassicDockModel — movePanel (B6)', () => {
  /** @type {ClassicDockModel} */
  let model;

  beforeEach(() => {
    model = new ClassicDockModel();
  });

  it('moves a panel into another field as its own group', () => {
    const result = model.movePanel('fontList', 'right-bottom');

    expect(result).toEqual({
      ok: true,
      reason: null,
      field: 'right-bottom',
      merged: false,
    });
    expect(model.getFieldOf('fontList')).toBe('right-bottom');
    expect(model.getArrangement()['right-bottom']).toEqual([
      ['viewportControl'],
      ['fontList'],
    ]);
    expect(model.getArrangement().bottom).toEqual([
      ['console'],
      ['errorLog'],
      ['animate'],
    ]);
    assertIntegrity(model);
  });

  it('honours the index, so the editor can dock above the customizer (shot 7)', () => {
    expect(model.movePanel('editor', 'right-top', 0).ok).toBe(true);

    expect(model.getArrangement()['right-top']).toEqual([
      ['editor'],
      ['customizer'],
    ]);
    // The left column is now empty, so its track collapses.
    expect(model.getArrangement().left).toEqual([]);
    expect(model.getOccupancy().left).toBe(false);
    assertIntegrity(model);
  });

  it('clamps an out-of-range index instead of tearing a hole in the field', () => {
    expect(model.movePanel('editor', 'bottom', 99).ok).toBe(true);
    expect(model.getArrangement().bottom.at(-1)).toEqual(['editor']);

    expect(model.movePanel('editor', 'bottom', -5).ok).toBe(true);
    expect(model.getArrangement().bottom[0]).toEqual(['editor']);
    assertIntegrity(model);
  });

  it('merges into an occupant group and splits back out again', () => {
    const merge = model.movePanel('errorLog', 'bottom', null, {
      mergeWith: 'console',
    });

    expect(merge).toEqual({
      ok: true,
      reason: null,
      field: 'bottom',
      merged: true,
    });
    expect(model.getGroupOf('console')).toEqual(['console', 'errorLog']);
    expect(model.getArrangement().bottom).toEqual([
      ['console', 'errorLog'],
      ['animate'],
      ['fontList'],
    ]);

    expect(model.movePanel('errorLog', 'bottom', 1).ok).toBe(true);
    expect(model.getGroupOf('console')).toEqual(['console']);
    expect(model.getArrangement().bottom).toEqual([
      ['console'],
      ['errorLog'],
      ['animate'],
      ['fontList'],
    ]);
    assertIntegrity(model);
  });

  it('reorders within a field without duplicating the panel', () => {
    expect(model.movePanel('fontList', 'bottom', 0).ok).toBe(true);

    expect(model.getArrangement().bottom).toEqual([
      ['fontList'],
      ['console'],
      ['errorLog'],
      ['animate'],
    ]);
    assertIntegrity(model);
  });

  it('refuses the centre, unknown fields and unknown panels', () => {
    expect(model.movePanel('editor', 'centre').reason).toBe(
      MOVE_REJECTED.CENTRE
    );
    expect(model.movePanel('editor', 'right-middle').reason).toBe(
      MOVE_REJECTED.UNKNOWN_FIELD
    );
    expect(model.movePanel('preview', 'left').reason).toBe(
      MOVE_REJECTED.UNKNOWN_PANEL
    );

    // A refused move leaves the arrangement untouched.
    expect(model.getArrangement()).toEqual(defaultArrangement());
  });

  it('refuses a merge with a panel that is not in the target field', () => {
    expect(
      model.movePanel('editor', 'bottom', null, { mergeWith: 'customizer' })
        .reason
    ).toBe(MOVE_REJECTED.UNKNOWN_MERGE_TARGET);
    expect(
      model.movePanel('editor', 'left', null, { mergeWith: 'editor' }).reason
    ).toBe(MOVE_REJECTED.UNKNOWN_MERGE_TARGET);

    expect(model.getArrangement()).toEqual(defaultArrangement());
  });

  it('refuses a field that is not rendered, so no panel is stranded', () => {
    const simplified = new ClassicDockModel({
      // Simplified drops every dock but the Customizer (D-7).
      isFieldAvailable: (field) => field === 'right-top',
    });

    expect(simplified.movePanel('customizer', 'bottom').reason).toBe(
      MOVE_REJECTED.FIELD_UNAVAILABLE
    );
    expect(simplified.canMove('customizer', 'bottom')).toBe(false);
    expect(simplified.canMove('editor', 'right-top')).toBe(true);
    expect(simplified.getArrangement()).toEqual(defaultArrangement());
  });

  it('reports a move that changes nothing rather than claiming success', () => {
    const result = model.movePanel('viewportControl', 'right-bottom');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe(MOVE_REJECTED.NO_CHANGE);
    expect(model.getArrangement()).toEqual(defaultArrangement());
  });

  it('resets to the default arrangement', () => {
    model.movePanel('editor', 'right-top', 0);
    model.movePanel('errorLog', 'bottom', null, { mergeWith: 'console' });

    model.reset();

    expect(model.getArrangement()).toEqual(defaultArrangement());
    assertIntegrity(model);
  });
});

describe('ClassicDockModel — occupancy (B6)', () => {
  it('treats a field holding only hidden panels as empty', () => {
    const hidden = new Set(['viewportControl', 'animate', 'fontList']);
    const model = new ClassicDockModel({
      isPanelVisible: (id) => !hidden.has(id),
    });

    expect(model.getOccupancy()).toEqual({
      left: true,
      'right-top': true,
      'right-bottom': false,
      bottom: true,
    });
  });

  it('follows the panel when it moves, not the field it started in', () => {
    const hidden = new Set(['console', 'errorLog', 'animate', 'fontList']);
    const model = new ClassicDockModel({
      isPanelVisible: (id) => !hidden.has(id),
    });

    expect(model.getOccupancy().bottom).toBe(false);

    model.movePanel('editor', 'bottom');

    expect(model.getOccupancy().bottom).toBe(true);
    expect(model.getOccupancy().left).toBe(false);
  });
});

describe('ClassicDockModel — stored arrangements (B6)', () => {
  it('accepts an arrangement that names every panel exactly once', () => {
    const model = new ClassicDockModel();
    const stored = {
      left: [],
      'right-top': [['editor'], ['customizer']],
      'right-bottom': [['viewportControl']],
      bottom: [['console', 'errorLog'], ['animate'], ['fontList']],
    };

    expect(model.setArrangement(stored)).toBe(true);
    expect(model.getFieldOf('editor')).toBe('right-top');
    expect(model.getGroupOf('errorLog')).toEqual(['console', 'errorLog']);
    assertIntegrity(model);
  });

  it('refuses anything malformed whole, never in part', () => {
    const base = defaultArrangement();

    expect(validateArrangement(null)).toBeNull();
    expect(validateArrangement('left')).toBeNull();
    expect(validateArrangement([])).toBeNull();
    // A panel that no longer exists
    expect(
      validateArrangement({ ...base, left: [['editor'], ['inspector']] })
    ).toBeNull();
    // The same panel twice
    expect(
      validateArrangement({ ...base, left: [['editor'], ['console']] })
    ).toBeNull();
    // A missing panel
    expect(validateArrangement({ ...base, 'right-bottom': [] })).toBeNull();
    // A field that is not part of the dock
    expect(validateArrangement({ ...base, floating: [] })).toBeNull();
    // Empty groups would render a cell with nothing in it
    expect(validateArrangement({ ...base, left: [['editor'], []] })).toBeNull();
    // Groups must be arrays of ids, not bare ids
    expect(validateArrangement({ ...base, left: ['editor'] })).toBeNull();
  });

  it('leaves the live arrangement alone when a stored one is refused', () => {
    const model = new ClassicDockModel();
    model.movePanel('fontList', 'right-bottom');
    const live = model.getArrangement();

    expect(model.setArrangement({ left: 'editor' })).toBe(false);

    expect(model.getArrangement()).toEqual(live);
  });
});

describe('ClassicDockModel — applyToDom (B6)', () => {
  let elements;

  beforeEach(() => {
    document.body.innerHTML = '';
    elements = new Map();
    for (const id of [
      'classicFieldLeft',
      'classicFieldRightTop',
      'classicFieldRightBottom',
      'classicBottomStrip',
      'classicEditorSlot',
      'paramPanel',
      'classicViewportControlSlot',
      'classicConsoleSlot',
      'classicErrorLogSlot',
    ]) {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
      elements.set(id, el);
    }
  });

  it('re-parents panels into their field container in arrangement order', () => {
    const model = new ClassicDockModel({
      getElement: (id) => elements.get(id) || null,
    });

    model.applyToDom();
    expect(elements.get('classicEditorSlot').parentElement.id).toBe(
      'classicFieldLeft'
    );
    expect(elements.get('paramPanel').parentElement.id).toBe(
      'classicFieldRightTop'
    );

    model.movePanel('editor', 'right-top', 0);
    model.applyToDom();

    const rightTop = elements.get('classicFieldRightTop');
    expect([...rightTop.children].map((el) => el.id)).toEqual([
      'classicEditorSlot',
      'paramPanel',
    ]);
    expect(elements.get('classicFieldLeft').children).toHaveLength(0);
  });

  it('skips panels whose element does not exist yet', () => {
    const model = new ClassicDockModel({
      getElement: (id) => elements.get(id) || null,
    });

    // Animate and Font List are reserved slots until sub-plan F builds them.
    expect(() => model.applyToDom()).not.toThrow();
    expect(
      [...elements.get('classicBottomStrip').children].map((e) => e.id)
    ).toEqual(['classicConsoleSlot', 'classicErrorLogSlot']);
  });

  it('keeps the moved element itself, so listeners and live references survive', () => {
    const model = new ClassicDockModel({
      getElement: (id) => elements.get(id) || null,
    });
    const consoleSlot = elements.get('classicConsoleSlot');
    let clicks = 0;
    consoleSlot.addEventListener('click', () => {
      clicks += 1;
    });

    model.movePanel('console', 'right-bottom');
    model.applyToDom();

    expect(consoleSlot.parentElement.id).toBe('classicFieldRightBottom');
    consoleSlot.dispatchEvent(new Event('click'));
    expect(clicks).toBe(1);
  });
});
