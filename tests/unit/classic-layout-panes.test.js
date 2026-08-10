import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const announceImmediate = vi.fn();
let density = 'standard';

vi.mock('../../src/js/ui-mode-controller.js', () => ({
  getUIModeController: () => ({
    subscribe: vi.fn(),
    getMode: () => 'standard',
    getClassicDensity: () => density,
  }),
}));

vi.mock('../../src/js/announcer.js', () => ({
  announceImmediate: (...args) => announceImmediate(...args),
}));

const { ClassicLayoutController } =
  await import('../../src/js/classic-layout-controller.js');

const PANES_KEY = 'openscad-forge-classic-panes';

describe('ClassicLayoutController pane visibility (B3)', () => {
  beforeEach(() => {
    density = 'standard';
    announceImmediate.mockClear();
    localStorage.clear();
    for (const attr of Array.from(document.body.attributes)) {
      if (attr.name.startsWith('data-classic')) {
        document.body.removeAttribute(attr.name);
      }
    }
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts every optional pane hidden, like the desktop', () => {
    const controller = new ClassicLayoutController();

    expect(controller.isAnimateVisible()).toBe(false);
    expect(controller.isFontListVisible()).toBe(false);
    expect(controller.isViewportControlVisible()).toBe(false);

    // The panes that already existed keep their defaults
    expect(controller.isEditorVisible()).toBe(true);
    expect(controller.isCustomizerVisible()).toBe(true);
  });

  it('toggleViewportControl occupies the right-bottom field and announces it', () => {
    const controller = new ClassicLayoutController();

    expect(controller.toggleViewportControl()).toBe(true);

    expect(document.body.dataset.classicViewportControlVisible).toBe('true');
    expect(document.body.dataset.classicFieldRightBottom).toBe('occupied');
    expect(announceImmediate).toHaveBeenCalledWith('Viewport-Control shown');

    expect(controller.toggleViewportControl()).toBe(false);
    expect(document.body.dataset.classicFieldRightBottom).toBe('empty');
    expect(announceImmediate).toHaveBeenCalledWith('Viewport-Control hidden');
  });

  it('announces Animate and Font List by their upstream names', () => {
    const controller = new ClassicLayoutController();

    controller.toggleAnimate();
    expect(announceImmediate).toHaveBeenCalledWith('Animate shown');
    expect(document.body.dataset.classicAnimateVisible).toBe('true');

    controller.toggleFontList();
    expect(announceImmediate).toHaveBeenCalledWith('Font List shown');
    expect(document.body.dataset.classicFontListVisible).toBe('true');

    controller.toggleAnimate();
    expect(announceImmediate).toHaveBeenCalledWith('Animate hidden');
  });

  it('persists the choice and hydrates it into a fresh controller', () => {
    const first = new ClassicLayoutController();
    first.toggleFontList();

    expect(JSON.parse(localStorage.getItem(PANES_KEY)).fontListVisible).toBe(
      true
    );

    const second = new ClassicLayoutController();
    expect(second.isFontListVisible()).toBe(true);
    expect(second.isAnimateVisible()).toBe(false);
  });

  it('hydrates a preference written before the optional panes existed', () => {
    // Exactly what R2a inherits from an existing user's browser
    localStorage.setItem(
      PANES_KEY,
      JSON.stringify({
        editorVisible: false,
        customizerVisible: true,
        consoleCollapsed: true,
      })
    );

    const controller = new ClassicLayoutController();

    expect(controller.isEditorVisible()).toBe(false);
    expect(controller.isConsoleCollapsed()).toBe(true);
    expect(controller.isAnimateVisible()).toBe(false);
    expect(controller.isViewportControlVisible()).toBe(false);
  });

  it('falls back to defaults on a corrupt stored value rather than half-restoring', () => {
    localStorage.setItem(PANES_KEY, '{not json');

    const controller = new ClassicLayoutController();

    expect(controller.isEditorVisible()).toBe(true);
    expect(controller.isCustomizerVisible()).toBe(true);
    expect(controller.isViewportControlVisible()).toBe(false);
  });

  it('treats Viewport-Control as hidden in Simplified without clearing the preference (D-7)', () => {
    const controller = new ClassicLayoutController();
    controller.toggleViewportControl();
    expect(document.body.dataset.classicFieldRightBottom).toBe('occupied');

    density = 'simplified';
    controller.toggleAnimate(); // any toggle re-stamps the attributes
    controller.toggleAnimate();

    expect(document.body.dataset.classicFieldRightBottom).toBe('empty');
    expect(document.body.dataset.classicViewportControlVisible).toBe('false');
    // The preference itself survives, so Standard brings the pane back
    expect(controller.isViewportControlVisible()).toBe(true);

    density = 'standard';
    controller.toggleAnimate();
    controller.toggleAnimate();
    expect(document.body.dataset.classicFieldRightBottom).toBe('occupied');
  });

  it('Simplified empties the left and bottom fields', () => {
    const controller = new ClassicLayoutController();
    controller.toggleAnimate();
    expect(document.body.dataset.classicFieldLeft).toBe('occupied');
    expect(document.body.dataset.classicFieldBottom).toBe('occupied');

    density = 'simplified';
    controller.toggleAnimate();

    expect(document.body.dataset.classicFieldLeft).toBe('empty');
    expect(document.body.dataset.classicFieldBottom).toBe('empty');
    expect(document.body.dataset.classicFieldRightTop).toBe('occupied');
  });
});

describe('ClassicLayoutController field stow (UF-2a, U-6/Q-20)', () => {
  beforeEach(() => {
    density = 'standard';
    announceImmediate.mockClear();
    localStorage.clear();
    for (const attr of Array.from(document.body.attributes)) {
      if (attr.name.startsWith('data-classic')) {
        document.body.removeAttribute(attr.name);
      }
    }
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts every field un-stowed', () => {
    const controller = new ClassicLayoutController();

    expect(controller.isFieldStowed('left')).toBe(false);
    expect(controller.isFieldStowed('right-top')).toBe(false);
    expect(controller.isFieldStowed('right-bottom')).toBe(false);
  });

  it('stowing a field reports it empty to the grid and announces once', () => {
    const controller = new ClassicLayoutController();
    controller.toggleAnimate(); // any toggle stamps the attributes
    expect(document.body.dataset.classicFieldLeft).toBe('occupied');

    expect(controller.toggleFieldStowed('left')).toBe(true);

    // 'empty' hands the field's tracks to the 3D view and display:nones its
    // container — the R-III keyboard-trap fix comes with it.
    expect(document.body.dataset.classicFieldLeft).toBe('empty');
    expect(document.body.dataset.classicStowLeft).toBe('true');
    expect(announceImmediate).toHaveBeenCalledWith('Left column stowed');
    expect(
      announceImmediate.mock.calls.filter(([m]) => m === 'Left column stowed')
    ).toHaveLength(1);

    expect(controller.toggleFieldStowed('left')).toBe(false);
    expect(document.body.dataset.classicFieldLeft).toBe('occupied');
    expect(document.body.dataset.classicStowLeft).toBe('false');
    expect(announceImmediate).toHaveBeenCalledWith('Left column restored');
  });

  it('persists stow state and hydrates it into a fresh controller', () => {
    const first = new ClassicLayoutController();
    first.toggleFieldStowed('right-top');

    expect(JSON.parse(localStorage.getItem(PANES_KEY)).stowRightTop).toBe(true);

    const second = new ClassicLayoutController();
    expect(second.isFieldStowed('right-top')).toBe(true);
    expect(second.isFieldStowed('left')).toBe(false);
  });

  it('hydrates a preference written before the stow keys existed', () => {
    localStorage.setItem(
      PANES_KEY,
      JSON.stringify({
        editorVisible: true,
        customizerVisible: true,
        consoleCollapsed: false,
      })
    );

    const controller = new ClassicLayoutController();

    expect(controller.isFieldStowed('left')).toBe(false);
    expect(controller.isFieldStowed('right-top')).toBe(false);
    expect(controller.isFieldStowed('right-bottom')).toBe(false);
    expect(controller.isEditorVisible()).toBe(true);
  });

  it('refuses an unknown field name rather than inventing state', () => {
    const controller = new ClassicLayoutController();

    expect(controller.toggleFieldStowed('bottom')).toBe(false);
    expect(controller.isFieldStowed('bottom')).toBe(false);
    expect(localStorage.getItem(PANES_KEY)).toBeNull();
  });
});
