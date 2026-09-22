/**
 * The ink panel takes its settings back (DP-81, D-175 b).
 *
 * A file control rebuilt with a traced drawing (a preset, an undo, a reset)
 * puts the settings the drawing was traced with back on the panel: every
 * control agrees with the trace on the charm, nothing is announced, and
 * nothing re-runs.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createInkControls } from '../../src/js/ink-controls.js';

describe('createInkControls: setSettings (DP-81)', () => {
  let announce;
  let onChange;
  let panel;

  beforeEach(() => {
    announce = vi.fn();
    onChange = vi.fn();
    panel = createInkControls({
      idPrefix: 'ink-test',
      announce,
      onChange,
      purpose: 'relief',
      runsBySelf: () => false,
      startLabel: () => 'Convert again',
    });
    document.body.appendChild(panel.element);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const radio = (value) =>
    panel.element.querySelector(`input[type="radio"][value="${value}"]`);
  const range = (key) => panel.element.querySelector(`#ink-test-${key}`);

  it('★ puts a whole trace back: the mode, the thresholds, the colors, the wall, the switches, and says nothing', () => {
    panel.setSettings({
      mode: 'colours',
      lightnessMax: 40,
      chromaMax: 30,
      colourCount: 4,
      wallColour: 'auto',
      smooth: true,
      speckFloor: false,
    });
    expect(panel.getSettings()).toMatchObject({
      mode: 'colours',
      lightnessMax: 40,
      chromaMax: 30,
      colourCount: 4,
      wallColour: 'auto',
      smooth: true,
      speckFloor: false,
    });
    expect(radio('colours').checked).toBe(true);
    expect(radio('lineart').checked).toBe(false);
    expect(range('lightness').value).toBe('40');
    expect(range('chroma').value).toBe('30');
    expect(range('colours').value).toBe('4');
    expect(panel.element.querySelector('#ink-test-smooth').checked).toBe(true);
    expect(panel.element.querySelector('#ink-test-specks').checked).toBe(false);
    // The controls a mode uses are the ones a person can move: in Colors the
    // count and the wall are live, the thresholds are not.
    expect(range('colours').disabled).toBe(false);
    expect(panel.element.querySelector('#ink-test-wall').disabled).toBe(false);
    expect(range('lightness').disabled).toBe(true);
    expect(range('chroma').disabled).toBe(true);
    expect(announce).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves what it is not told alone, and refuses a mode it does not know', () => {
    const before = panel.getSettings();
    panel.setSettings({ mode: 'nonsense', lightnessMax: 'wide', smooth: 'yes' });
    expect(panel.getSettings()).toEqual(before);
    panel.setSettings({ speckFloor: true });
    expect(panel.getSettings()).toEqual({ ...before, speckFloor: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a change by hand after a restore still runs the panel as before', () => {
    panel.setSettings({ mode: 'silhouette', lightnessMax: 60 });
    radio('lineart').checked = true;
    radio('lineart').dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      mode: 'lineart',
      lightnessMax: 60,
    });
  });
});
